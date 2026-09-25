// A Voice is one playing sound: it creates and tracks its nodes, schedules everything relative
// to its start time `t0`, and disconnects all of them in dispose(). Recipes build sounds from
// the high-level blocks below (tone, burst, modal, pluck, fm, echo). All times passed to the
// blocks are RELATIVE to t0; all frequencies are multiplied by the voice pitch `pm`.
import { noiseBuffer, wave, ksPluck, perc, ahr, sweep, driveCurve } from './dsp.js';

const NAMED_WAVES = new Set(['glottal', 'reed', 'brass', 'whistle', 'organ', 'ocarina']);

export class Voice {
  constructor(ctx, out, t0, { pitch = 1, rand = Math.random } = {}) {
    this.ctx = ctx;
    this.out = out;
    this.t0 = t0;
    this.pm = pitch;
    this.rand = rand;
    this.nodes = [];
    this.end = t0;
    this.tailSec = 0;
  }

  // ------------------------------------------------------------ randomness
  r() { return this.rand(); }
  rr(a, b) { return a + (b - a) * this.rand(); }
  vary(x, amt) { return x * (1 + (this.rand() * 2 - 1) * amt); }
  pick(arr) { return arr[Math.floor(this.rand() * arr.length) % arr.length]; }
  chance(p) { return this.rand() < p; }

  // ------------------------------------------------------------ node factories
  track(n) { this.nodes.push(n); return n; }
  at(t) { return this.t0 + t; }
  until(tAbs) { if (tAbs > this.end) this.end = tAbs; }
  tail(sec) { this.tailSec = Math.max(this.tailSec, sec); }
  get finish() { return this.end + this.tailSec; }

  gain(v = 1, dest) {
    const g = this.track(this.ctx.createGain());
    g.gain.value = v;
    if (dest) g.connect(dest);
    return g;
  }
  filter(type, freq, Q = 0.707, dest, gainDb = 0) {
    const f = this.track(this.ctx.createBiquadFilter());
    f.type = type;
    f.frequency.value = Math.min(freq, this.ctx.sampleRate * 0.45);
    f.Q.value = Q;
    if (gainDb) f.gain.value = gainDb;
    if (dest) f.connect(dest);
    return f;
  }
  delay(time, maxTime = 2, dest) {
    const d = this.track(this.ctx.createDelay(maxTime));
    d.delayTime.value = time;
    if (dest) d.connect(dest);
    return d;
  }
  shaper(amount, dest) {
    const s = this.track(this.ctx.createWaveShaper());
    s.curve = driveCurve(this.ctx, amount);
    s.oversample = '2x';
    if (dest) s.connect(dest);
    return s;
  }
  // Route everything built after this call through a tanh drive: lowers the crest factor of
  // sharp transients (more perceived punch at the same peak level).
  punch(amount = 2) {
    this.out = this.shaper(amount, this.out);
    return this.out;
  }
  pan(value, dest) {
    const p = this.track(this.ctx.createStereoPanner());
    p.pan.value = value;
    if (dest) p.connect(dest);
    return p;
  }
  // Oscillator started at relative time t and stopped at relative time t + dur.
  osc(type, freq, t, dur, dest) {
    const o = this.track(this.ctx.createOscillator());
    if (NAMED_WAVES.has(type)) o.setPeriodicWave(wave(this.ctx, type));
    else o.type = type;
    o.frequency.value = freq;
    if (dest) o.connect(dest);
    o.start(this.at(t));
    o.stop(this.at(t + dur));
    this.until(this.at(t + dur));
    return o;
  }
  noise(kind, t, dur, dest, rate = 1) {
    const s = this.track(this.ctx.createBufferSource());
    s.buffer = noiseBuffer(this.ctx, kind);
    s.loop = true;
    s.playbackRate.value = rate;
    if (dest) s.connect(dest);
    s.start(this.at(t), this.rand() * (s.buffer.duration - 0.1));
    s.stop(this.at(t + dur));
    this.until(this.at(t + dur));
    return s;
  }
  buffer(buf, t, dest, rate = 1, dur = buf.duration / rate) {
    const s = this.track(this.ctx.createBufferSource());
    s.buffer = buf;
    s.playbackRate.value = rate;
    if (dest) s.connect(dest);
    s.start(this.at(t));
    s.stop(this.at(t + dur));
    this.until(this.at(t + dur));
    return s;
  }
  // LFO: oscillator -> depth gain -> param. Returns the depth gain (automate .gain for depth envelopes).
  lfo(param, rate, depth, t, dur, type = 'sine') {
    const g = this.gain(depth);
    g.connect(param);
    this.osc(type, rate, t, dur, g);
    return g;
  }

  // ------------------------------------------------------------ building blocks
  // Pitched tone with optional pitch glide, vibrato and percussive (d) or sustained (h/r) envelope.
  // { t, type, f, f1, glide, pts:[[dt,f],...], a, d, h, r, peak, dest, detune, vib:{rate,depth,delay} }
  tone(o) {
    const t = o.t || 0;
    const a = o.a ?? 0.003;
    const g = this.gain(0, o.dest || this.out);
    let end;
    if (o.h !== undefined) end = ahr(g.gain, this.at(t), o.peak ?? 0.5, a, o.h, o.r ?? 0.05);
    else end = perc(g.gain, this.at(t), o.peak ?? 0.5, a, o.d ?? 0.3);
    const dur = end - this.at(t) + 0.01;
    const f0 = (o.f || (o.pts ? o.pts[0][1] : 440)) * (o.raw ? 1 : this.pm);
    const osc = this.osc(o.type || 'sine', f0, t, dur, g);
    if (o.detune) osc.detune.value = o.detune;
    if (o.pts) sweep(osc.frequency, this.at(t), o.pts.map(([dt, f]) => [dt, f * (o.raw ? 1 : this.pm)]));
    else if (o.f1) sweep(osc.frequency, this.at(t), [[0, f0], [o.glide ?? dur * 0.8, o.f1 * (o.raw ? 1 : this.pm)]]);
    if (o.vib) {
      const depth = this.gain(0);
      depth.connect(osc.frequency);
      const dl = o.vib.delay ?? 0;
      depth.gain.setValueAtTime(0, this.at(t));
      depth.gain.linearRampToValueAtTime(0, this.at(t + dl));
      depth.gain.linearRampToValueAtTime(f0 * o.vib.depth, this.at(t + dl + (o.vib.fade ?? 0.12)));
      this.osc('sine', o.vib.rate, t, dur, depth);
    }
    return { osc, gain: g, end: end - this.t0 };
  }

  // Filtered noise burst. filters: [{ type, f, f1, q, glide, pts }] applied in series.
  burst(o) {
    const t = o.t || 0;
    const g = this.gain(0, o.dest || this.out);
    let end;
    if (o.h !== undefined) end = ahr(g.gain, this.at(t), o.peak ?? 0.5, o.a ?? 0.002, o.h, o.r ?? 0.05);
    else end = perc(g.gain, this.at(t), o.peak ?? 0.5, o.a ?? 0.001, o.d ?? 0.1);
    const dur = end - this.at(t) + 0.01;
    let head = g;
    const fs = o.filters || [];
    for (let i = fs.length - 1; i >= 0; i--) {
      const fd = fs[i];
      const s = o.raw ? 1 : this.pm;
      const fl = this.filter(fd.type || 'bandpass', (fd.f ?? fd.pts[0][1]) * s, fd.q ?? 0.9, head, fd.gain);
      if (fd.pts) sweep(fl.frequency, this.at(t), fd.pts.map(([dt, f]) => [dt, f * s]));
      else if (fd.f1) sweep(fl.frequency, this.at(t), [[0, fd.f * s], [fd.glide ?? dur * 0.7, fd.f1 * s]]);
      head = fl;
    }
    this.noise(o.kind || 'white', t, dur, head, o.rate || 1);
    return { gain: g, end: end - this.t0 };
  }

  // Modal resonator bank (bells, pings, clinks): partials [[ratio, amp, t80, detuneHz?], ...]
  modal(o) {
    const t = o.t || 0;
    const f = (o.f || 1000) * (o.raw ? 1 : this.pm);
    const bus = this.gain(o.peak ?? 0.3, o.dest || this.out);
    let last = 0;
    const nyq = this.ctx.sampleRate * 0.45;
    for (const [ratio, amp, t80, beat] of o.partials) {
      const fr = f * ratio;
      if (fr >= nyq) continue;
      const g = this.gain(0, bus);
      const end = perc(g.gain, this.at(t), amp, o.a ?? 0.0015, t80);
      const osc = this.osc('sine', fr, t, end - this.at(t) + 0.01, g);
      if (beat) {
        // a second, slightly detuned copy gives the slow "warble" of real bells
        const g2 = this.gain(0, bus);
        perc(g2.gain, this.at(t), amp * 0.6, o.a ?? 0.0015, t80 * 0.9);
        this.osc('sine', fr + beat, t, end - this.at(t) + 0.01, g2);
      }
      if (o.bend) sweep(osc.frequency, this.at(t), [[0, fr * (1 + o.bend)], [0.08, fr]]);
      last = Math.max(last, end - this.t0);
    }
    return { gain: bus, end: last };
  }

  // Karplus-Strong pluck. { t, f, dur, decay, bright, pick, peak, dest, seed }
  pluck(o) {
    const t = o.t || 0;
    const f = o.f * (o.raw ? 1 : this.pm);
    const dur = o.dur ?? 1.2;
    const { buffer, rate } = ksPluck(this.ctx, f, dur, {
      decay: o.decay ?? 0.996, bright: o.bright ?? 0.5, pick: o.pick ?? 0.2, seed: o.seed ?? 1,
    });
    const g = this.gain(0, o.dest || this.out);
    const peak = o.peak ?? 0.3;
    g.gain.setValueAtTime(peak, this.at(t));
    const len = buffer.duration / rate;
    const stop = Math.min(len, o.len ?? len);
    // optional damping (note-off): quick release before the natural end
    if (o.len !== undefined && o.len < len) {
      g.gain.setValueAtTime(peak, this.at(t + stop - (o.rel ?? 0.04)));
      g.gain.linearRampToValueAtTime(0, this.at(t + stop));
    }
    this.buffer(buffer, t, g, rate, stop);
    return { gain: g, end: t + stop };
  }

  // Two-operator FM: modulator (ratio * f) with decaying index -> carrier f.
  // { t, f, ratio, index, index1, idxTime, a, d, h, r, peak, dest, type }
  fm(o) {
    const t = o.t || 0;
    const f = o.f * (o.raw ? 1 : this.pm);
    const car = this.tone({ t, f: o.f, raw: o.raw, type: o.type || 'sine', a: o.a, d: o.d, h: o.h, r: o.r, peak: o.peak, dest: o.dest, f1: o.f1, glide: o.glide });
    const dur = car.end - t + 0.01;
    const idx = this.gain(0);
    idx.connect(car.osc.frequency);
    const mf = f * (o.ratio ?? 1.4);
    idx.gain.setValueAtTime(mf * (o.index ?? 3), this.at(t));
    idx.gain.exponentialRampToValueAtTime(Math.max(0.01, mf * (o.index1 ?? 0.2)), this.at(t + (o.idxTime ?? dur * 0.7)));
    this.osc('sine', mf, t, dur, idx);
    return car;
  }

  // Feedback delay (echo) into dest. Returns the input node to feed.
  echo({ time = 0.15, feedback = 0.3, lp = 2500, hp = 200, wet = 0.4, dest, dur = 1.2 }) {
    const input = this.gain(1);
    const d = this.delay(time, 2);
    const fb = this.gain(feedback);
    const lpf = this.filter('lowpass', lp, 0.5);
    const hpf = this.filter('highpass', hp, 0.5);
    const w = this.gain(wet, dest || this.out);
    input.connect(d);
    d.connect(lpf).connect(hpf);
    hpf.connect(fb).connect(d);
    hpf.connect(w);
    this.tail(dur);
    return input;
  }

  dispose() {
    for (const n of this.nodes) {
      try { n.disconnect(); } catch { /* already gone */ }
    }
    this.nodes.length = 0;
  }
}
