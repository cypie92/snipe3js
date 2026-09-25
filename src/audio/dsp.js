// Low-level DSP helpers shared by SFX, ambience and music. Everything here works on any
// BaseAudioContext (realtime or offline). Buffers/curves are cached per context.
import { mulberry32 } from '../core/rng.js';

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dbToGain = (db) => Math.pow(10, db / 20);
export const gainToDb = (g) => 20 * Math.log10(Math.max(1e-12, g));
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

const caches = new WeakMap();
function cache(ctx) {
  let c = caches.get(ctx);
  if (!c) caches.set(ctx, (c = { noise: {}, curves: {}, waves: {}, ks: new Map(), ir: null }));
  return c;
}

// ---------------------------------------------------------------- noise
// Seamlessly looping noise buffers (ends crossfaded), zero-mean, peak-normalised to 0.95.
export function noiseBuffer(ctx, kind = 'white', seconds = 4) {
  const c = cache(ctx);
  const key = `${kind}:${seconds}`;
  if (c.noise[key]) return c.noise[key];
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * seconds);
  const fade = Math.floor(sr * 0.25);
  const rnd = mulberry32(kind.length * 7919 + seconds * 104729);
  const raw = new Float32Array(n + fade);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0, hp = 0, hpPrev = 0;
  for (let i = 0; i < raw.length; i++) {
    const w = rnd() * 2 - 1;
    if (kind === 'white') raw[i] = w;
    else if (kind === 'pink') {
      // Paul Kellet's refined pink filter
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      raw[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
    } else {
      // brown: leaky integrator + DC-blocking high-pass
      br = (br + 0.02 * w) / 1.02;
      hp = 0.9995 * (hp + br - hpPrev); hpPrev = br;
      raw[i] = hp;
    }
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = raw[i];
  // equal-power crossfade of the overflow tail into the head -> seamless loop point
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    out[i] = raw[n + i] * Math.cos(t * Math.PI * 0.5) + raw[i] * Math.sin(t * Math.PI * 0.5);
  }
  let mean = 0;
  for (let i = 0; i < n; i++) mean += out[i];
  mean /= n;
  let pk = 1e-9;
  for (let i = 0; i < n; i++) { out[i] -= mean; pk = Math.max(pk, Math.abs(out[i])); }
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (out[i] / pk) * 0.95;
  c.noise[key] = buf;
  return buf;
}

// ---------------------------------------------------------------- curves
// Master soft clipper: linear below `knee`, tanh into `ceiling`. Input is pre-scaled by 0.5
// so the curve covers +-2.0 (+6 dBFS) before hard clamping at the ceiling.
export function softClipCurve(ctx, ceiling = 0.891, knee = 0.72) {
  const c = cache(ctx);
  const key = `sc:${ceiling}:${knee}`;
  if (c.curves[key]) return c.curves[key];
  const n = 4096;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * 2 - 1) * 2;
    const ax = Math.abs(x);
    const y = ax < knee ? ax : knee + (ceiling - knee) * Math.tanh((ax - knee) / (ceiling - knee));
    curve[i] = Math.sign(x) * y;
  }
  c.curves[key] = curve;
  return curve;
}

// Gentle tanh saturation for "punch" on thumps and horns (unity slope near zero).
export function driveCurve(ctx, amount = 2) {
  const c = cache(ctx);
  const key = `drv:${amount}`;
  if (c.curves[key]) return c.curves[key];
  const n = 2048;
  const curve = new Float32Array(n);
  const norm = Math.tanh(amount);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / norm;
  }
  c.curves[key] = curve;
  return curve;
}

// ---------------------------------------------------------------- periodic waves
const WAVE_DEFS = {
  // glottal-ish pulse: steeper roll-off than a saw, good vocal/animal source
  glottal: (n) => 1 / Math.pow(n, 1.35),
  // clarinet/reed: odd harmonics strong
  reed: (n) => (n % 2 ? 1 / n : 0.12 / n),
  // brass: bright saw-like with a slight hump on 2-4
  brass: (n) => (n <= 4 ? 1 / Math.pow(n, 0.6) : 1 / Math.pow(n, 1.1)),
  // whistle: nearly pure sine with a whiff of 2nd/3rd
  whistle: (n) => (n === 1 ? 1 : n === 2 ? 0.07 : n === 3 ? 0.025 : 0),
  // soft organ / accordion reed
  organ: (n) => [0, 1, 0.55, 0.35, 0.28, 0.16, 0.12, 0.08, 0.06][n] || 0,
  // hollow ocarina-ish
  ocarina: (n) => (n === 1 ? 1 : n === 3 ? 0.12 : n === 2 ? 0.05 : 0),
};
export function wave(ctx, name) {
  const c = cache(ctx);
  if (c.waves[name]) return c.waves[name];
  const H = 48;
  const real = new Float32Array(H + 1);
  const imag = new Float32Array(H + 1);
  const f = WAVE_DEFS[name] || WAVE_DEFS.glottal;
  for (let n = 1; n <= H; n++) imag[n] = f(n);
  c.waves[name] = ctx.createPeriodicWave(real, imag);
  return c.waves[name];
}

// ---------------------------------------------------------------- Karplus-Strong
// Returns { buffer, rate } where rate corrects the integer delay-line pitch error.
export function ksPluck(ctx, freq, dur, { decay = 0.996, bright = 0.5, pick = 0.2, seed = 1 } = {}) {
  const c = cache(ctx);
  const key = `${Math.round(freq * 4)}|${dur}|${decay}|${bright}|${pick}|${seed}`;
  const hit = c.ks.get(key);
  if (hit) return hit;
  const sr = ctx.sampleRate;
  const S = 0.5; // two-point average -> half-sample delay
  const N = Math.max(4, Math.floor(sr / freq - S));
  const len = Math.max(N + 1, Math.floor(dur * sr));
  const out = new Float32Array(len);
  const line = new Float32Array(N);
  const rnd = mulberry32(seed * 7717 + N);
  // excitation: noise, low-passed by `bright`, comb-filtered by pick position
  let lp = 0, mean = 0;
  for (let i = 0; i < N; i++) {
    lp += bright * (rnd() * 2 - 1 - lp);
    line[i] = lp;
    mean += lp;
  }
  mean /= N;
  const pk = Math.max(1, Math.floor(pick * N));
  const exc = new Float32Array(N);
  for (let i = 0; i < N; i++) exc[i] = line[i] - mean - 0.8 * (line[(i - pk + N) % N] - mean);
  let peak = 1e-9;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(exc[i]));
  for (let i = 0; i < N; i++) line[i] = exc[i] / peak;
  let idx = 0;
  let prev = line[N - 1];
  for (let i = 0; i < len; i++) {
    const cur = line[idx];
    out[i] = cur;
    const next = decay * ((1 - S) * cur + S * prev);
    prev = cur;
    line[idx] = next;
    idx = idx + 1 === N ? 0 : idx + 1;
  }
  // short fade-in (no click) and fade-out at buffer end
  const fi = Math.min(len, Math.floor(sr * 0.0015));
  for (let i = 0; i < fi; i++) out[i] *= i / fi;
  const fo = Math.min(len, Math.floor(sr * 0.02));
  for (let i = 0; i < fo; i++) out[len - 1 - i] *= i / fo;
  // normalise to a consistent RMS over the first 50 ms
  let rms = 0;
  const m = Math.min(len, Math.floor(sr * 0.05));
  for (let i = 0; i < m; i++) rms += out[i] * out[i];
  rms = Math.sqrt(rms / m) || 1;
  const g = 0.35 / rms;
  for (let i = 0; i < len; i++) out[i] = clamp(out[i] * g, -1, 1);
  const buffer = ctx.createBuffer(1, len, sr);
  buffer.getChannelData(0).set(out);
  const res = { buffer, rate: (freq * (N + S)) / sr };
  if (c.ks.size > 256) c.ks.delete(c.ks.keys().next().value);
  c.ks.set(key, res);
  return res;
}

// ---------------------------------------------------------------- reverb impulse
// Small outdoor "village square" space: a few early reflections + a darkening diffuse tail.
export function reverbIR(ctx, seconds = 1.6) {
  const c = cache(ctx);
  if (c.ir) return c.ir;
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, len, sr);
  const taps = [[0.011, 0.5, 0], [0.019, 0.42, 1], [0.029, 0.33, 0], [0.041, 0.3, 1], [0.057, 0.22, 0], [0.073, 0.2, 1]];
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const rnd = mulberry32(99 + ch * 31);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const env = Math.exp(-t * 4.2) * Math.min(1, t / 0.012);
      const k = 0.55 - 0.45 * Math.min(1, t / seconds); // tail gets darker
      lp += k * (rnd() * 2 - 1 - lp);
      d[i] = lp * env * 0.55;
    }
    for (const [tt, g, side] of taps) {
      const i = Math.floor(tt * sr);
      if (i < len) d[i] += g * (side === ch ? 1 : 0.35);
    }
    const fo = Math.floor(sr * 0.05);
    for (let i = 0; i < fo; i++) d[len - 1 - i] *= i / fo;
  }
  // unit energy per channel: steady tones come back at ~0 dB, so send gain == reverb level
  let e = 0;
  for (let ch = 0; ch < 2; ch++) for (const x of buf.getChannelData(ch)) e += x * x;
  const k = 1 / Math.sqrt(e / 2);
  for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] *= k; }
  c.ir = buf;
  return buf;
}

// ---------------------------------------------------------------- envelopes
// Percussive envelope: linear attack, true exponential decay to -80 dB, then a 4 ms ramp to 0.
export function perc(param, t, peak, attack, t80) {
  const a = Math.max(0.0005, attack);
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + a);
  if (peak > 0) param.exponentialRampToValueAtTime(peak * 1e-4, t + a + Math.max(0.005, t80));
  param.linearRampToValueAtTime(0, t + a + Math.max(0.005, t80) + 0.004);
  return t + a + Math.max(0.005, t80) + 0.004;
}

// Attack / hold / release with linear segments (sustained tones, swells).
export function ahr(param, t, peak, attack, hold, release) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + Math.max(0.0005, attack));
  param.setValueAtTime(peak, t + attack + hold);
  param.linearRampToValueAtTime(0, t + attack + hold + Math.max(0.003, release));
  return t + attack + hold + release;
}

// Piecewise-linear envelope from [[time, value], ...] (times relative to t).
export function points(param, t, pts, start = 0) {
  param.setValueAtTime(start, t);
  for (const [dt, v] of pts) param.linearRampToValueAtTime(v, t + dt);
  return t + pts[pts.length - 1][0];
}

// Exponential sweep for frequency-like params ([[time, value], ...], values > 0).
export function sweep(param, t, pts) {
  param.setValueAtTime(pts[0][1], t + pts[0][0]);
  for (let i = 1; i < pts.length; i++) param.exponentialRampToValueAtTime(Math.max(1e-3, pts[i][1]), t + pts[i][0]);
}
