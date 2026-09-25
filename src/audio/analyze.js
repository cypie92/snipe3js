// Measurement helpers for rendered AudioBuffers (used by sandbox/audio.html + tools/audio-check.mjs).
// Loudness follows ITU-R BS.1770 (K-weighting, 400 ms blocks, gating for integrated loudness).

const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
const round = (x, d = 1) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : x);

// BS.1770 K-weighting biquads, computed for any sample rate (pre-filter shelf + RLB high-pass)
function kCoeffs(sr) {
  const shelf = (() => {
    const f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
    const K = Math.tan((Math.PI * f0) / sr), Vh = 10 ** (G / 20), Vb = Vh ** 0.4996667741545416;
    const a0 = 1 + K / Q + K * K;
    return { b: [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0], a: [(2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0] };
  })();
  const hp = (() => {
    const f0 = 38.13547087602444, Q = 0.5003270373238773;
    const K = Math.tan((Math.PI * f0) / sr);
    const a0 = 1 + K / Q + K * K;
    return { b: [1, -2, 1], a: [(2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0] };
  })();
  return [shelf, hp];
}

function biquad(x, { b, a }) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

/** Momentary (400 ms) loudness series + gated integrated loudness (+ max over `winSec` windows). */
export function loudness(chs, sr, from = 0, to = chs[0].length, winSec = 0.4, hopSec = 0.1) {
  const [shelf, hp] = kCoeffs(sr);
  const kw = chs.map((c) => biquad(biquad(c.subarray(from, to), shelf), hp));
  const win = Math.round(winSec * sr), hop = Math.round(hopSec * sr);
  const n = to - from;
  const blocks = [];
  // pad short sounds: a single block covering the whole (zero-padded) window
  for (let s = 0; s === 0 || s + win <= n; s += hop) {
    let sum = 0;
    for (const k of kw) {
      let ms = 0;
      const e = Math.min(n, s + win);
      for (let i = s; i < e; i++) ms += k[i] * k[i];
      sum += ms / win;
    }
    blocks.push(sum);
    if (s + win > n) break;
  }
  const L = (ms) => -0.691 + 10 * Math.log10(Math.max(1e-20, ms));
  const mMax = Math.max(...blocks.map(L));
  const abs = blocks.filter((ms) => L(ms) > -70);
  let integrated = -Infinity;
  if (abs.length) {
    const rel = L(abs.reduce((s, x) => s + x, 0) / abs.length) - 10;
    const g = abs.filter((ms) => L(ms) > rel);
    if (g.length) integrated = L(g.reduce((s, x) => s + x, 0) / g.length);
  }
  return { momentaryMax: mMax, integrated, series: blocks.map(L) };
}

/** Full report for one rendered sound. */
export function analyze(buf, { declared } = {}) {
  const sr = buf.sampleRate;
  const chs = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));
  const n = buf.length;
  let peak = 0, nonFinite = 0, clipped = 0;
  let first = -1, last = -1, lastAny = -1;
  const thr = 10 ** (-60 / 20);
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (const c of chs) {
      const x = c[i];
      if (!Number.isFinite(x)) { nonFinite++; continue; }
      const ax = Math.abs(x);
      if (ax > m) m = ax;
    }
    if (m > peak) peak = m;
    if (m >= 0.999) clipped++;
    if (m > thr) { if (first < 0) first = i; last = i; }
    if (m > 1e-5) lastAny = i;
  }
  const silent = first < 0;
  const a = silent ? 0 : first, b = silent ? n : last + 1;
  let sumsq = 0, mean = 0;
  for (const c of chs) for (let i = a; i < b; i++) { sumsq += c[i] * c[i]; mean += c[i]; }
  const cnt = Math.max(1, (b - a) * chs.length);
  const rms = Math.sqrt(sumsq / cnt);
  mean /= cnt;
  // start: largest sample-to-sample jump in the first 0.5 ms after the signal appears, relative
  // to the peak. A clean onset ramps in; an abrupt start (DC step / mid-cycle start) jumps.
  let startJump = 0;
  const on = Math.max(1, first);
  for (const c of chs) for (let i = on; i < Math.min(n, on + Math.round(0.0005 * sr)); i++) startJump = Math.max(startJump, Math.abs(c[i] - c[i - 1]));
  // end: an abrupt cut-off leaves the last 2 ms (before the signal dies) about as loud as the
  // 10-20 ms before it; a fade (release ramp / exponential decay) is far quieter at the very end
  const endAt = Math.max(0, lastAny + 1);
  const winRms = (from, to) => {
    let q = 0;
    const a0 = Math.max(0, from);
    for (const c of chs) for (let i = a0; i < to; i++) q += c[i] * c[i];
    return Math.sqrt(q / Math.max(1, (to - a0) * chs.length));
  };
  const endRms = winRms(endAt - Math.round(0.002 * sr), endAt);
  const beforeRms = winRms(endAt - Math.round(0.02 * sr), endAt - Math.round(0.01 * sr));
  // first audible sample relative to peak: a DC step / abrupt start shows up as a big first sample
  let firstNz = 0;
  for (let i = 0; i < n && !firstNz; i++) for (const c of chs) if (Math.abs(c[i]) > 1e-6) { firstNz = Math.max(firstNz, Math.abs(c[i])); }
  const lu = silent ? { momentaryMax: -Infinity, integrated: -Infinity } : loudness(chs, sr, a, Math.min(n, b + Math.round(0.4 * sr)));
  // 100 ms short-window loudness: better than 400 ms momentary for comparing short SFX
  const l100 = silent ? { momentaryMax: -Infinity } : loudness(chs, sr, a, Math.min(n, b + Math.round(0.1 * sr)), 0.1, 0.025);
  return {
    declared: declared !== undefined ? round(declared, 2) : undefined,
    active: round((b - a) / sr, 2),
    tail: round((endAt - a) / sr, 2),
    peakDb: round(db(peak)),
    rmsDb: round(db(rms)),
    lufsM: round(lu.momentaryMax),
    lufs100: round(l100.momentaryMax),
    lufsI: round(lu.integrated),
    crest: round(db(peak) - db(rms)),
    dc: round(mean, 5),
    startDcDb: round(db(startJump) - db(peak)),
    endDb: round(db(endRms)),
    endDropDb: round(db(endRms) - db(beforeRms)),
    firstSample: round(Math.max(...chs.map((c) => Math.abs(c[0]))), 6),
    firstStepDb: round(db(firstNz) - db(peak)),
    nonFinite,
    clipped,
    silent,
  };
}

/** RMS (dBFS) per slice (e.g. per bar) — used to check musical structure/levels over time. */
export function sliceRms(buf, sliceSec) {
  const chs = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));
  const len = Math.round(sliceSec * buf.sampleRate);
  const out = [];
  for (let s = 0; s + len <= buf.length; s += len) {
    let sq = 0;
    for (const c of chs) for (let i = s; i < s + len; i++) sq += c[i] * c[i];
    out.push(round(db(Math.sqrt(sq / (len * chs.length)))));
  }
  return out;
}

/** In-place radix-2 FFT (re/im Float64Arrays, length power of two). */
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
        const a = i + k, b = a + len / 2;
        const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
      }
    }
  }
}

/** Spectral centroid (Hz) of the loudest 8192-sample window (Hann) — a brightness sanity check. */
export function centroid(buf) {
  const c = buf.getChannelData(0);
  const N = 8192;
  let best = 0, bestE = -1;
  for (let s = 0; s + N <= c.length; s += N / 4) {
    let e = 0;
    for (let i = s; i < s + N; i += 4) e += c[i] * c[i];
    if (e > bestE) { bestE = e; best = s; }
  }
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = (c[best + i] || 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  fft(re, im);
  let num = 0, den = 0;
  for (let k = 1; k < N / 2; k++) {
    const mag = Math.hypot(re[k], im[k]);
    num += mag * ((k * buf.sampleRate) / N);
    den += mag;
  }
  return den ? Math.round(num / den) : 0;
}
