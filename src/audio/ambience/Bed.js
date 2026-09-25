// Ambience player: continuous layers (looping noise through slowly wandering filters/gains,
// so there is no audible loop point) + randomly timed one-shot events (birds, barks, bells...).
// Driven by scheduleUntil(t) from the engine tick (or once, up front, for offline renders).
import { noiseBuffer } from '../dsp.js';
import { Voice } from '../Voice.js';

export class Bed {
  constructor(ctx, dest, def, { t0 = ctx.currentTime, fadeIn = 2.5, rand = Math.random, only } = {}) {
    this.ctx = ctx;
    // debug: only = 'layers' (continuous beds only) or an event id (that event only, no layers)
    if (only) def = { ...def, layers: only === 'layers' ? def.layers : () => {}, events: def.events.filter((e) => e.id === only) };
    this.def = def;
    this.rand = rand;
    this.t0 = t0;
    this.out = ctx.createGain();
    this.out.gain.setValueAtTime(0, t0);
    this.out.gain.linearRampToValueAtTime(def.level ?? 1, t0 + Math.max(0.02, fadeIn));
    this.out.connect(dest);
    this.nodes = [];
    this.sources = [];
    this.wanderers = [];
    this.events = [];
    this.counts = {};
    this.stopAt = Infinity;
    this.next = def.events.map((e) => t0 + (e.first ?? this.rr(0.3, 1) * e.every[1] * 0.6));
    def.layers(this);
  }

  r() { return this.rand(); }
  rr(a, b) { return a + (b - a) * this.rand(); }
  pick(arr) { return arr[Math.floor(this.rand() * arr.length) % arr.length]; }

  // ------------------------------------------------------------ continuous layers
  node(n) { this.nodes.push(n); return n; }
  gain(v, dest) { const g = this.node(this.ctx.createGain()); g.gain.value = v; if (dest) g.connect(dest); return g; }
  filter(type, f, q = 0.7, dest) {
    const n = this.node(this.ctx.createBiquadFilter());
    n.type = type; n.frequency.value = f; n.Q.value = q;
    if (dest) n.connect(dest);
    return n;
  }
  pan(p, dest) { const n = this.node(this.ctx.createStereoPanner()); n.pan.value = p; if (dest) n.connect(dest); return n; }
  loop(kind, dest, rate = 1) {
    const s = this.node(this.ctx.createBufferSource());
    s.buffer = noiseBuffer(this.ctx, kind);
    s.loop = true;
    s.playbackRate.value = rate;
    s.connect(dest);
    s.start(this.t0, this.r() * 3);
    this.sources.push(s);
    return s;
  }
  osc(type, f, dest) {
    const o = this.node(this.ctx.createOscillator());
    o.type = type; o.frequency.value = f;
    o.connect(dest);
    o.start(this.t0);
    this.sources.push(o);
    return o;
  }
  // Param drifts to a new random value in [min, max] every `every` seconds (aperiodic, smooth).
  wander(param, min, max, every = [2, 5], tau = 1.2, exp = false) {
    const w = { param, min, max, every, tau, exp, next: this.t0 };
    param.setValueAtTime(this._wv(w), this.t0);
    this.wanderers.push(w);
    return w;
  }
  _wv(w) {
    return w.exp ? w.min * Math.pow(w.max / w.min, this.r()) : this.rr(w.min, w.max);
  }
  // A filtered noise bed: kind -> filters -> gain (wandering) -> out (optional pan)
  noiseLayer({ kind = 'pink', type = 'lowpass', f = 600, q = 0.7, f2, gain = [0.04, 0.1], fw, every = [2, 5], tau = 1.5, pan = 0, rate = 1 }) {
    const p = this.pan(pan, this.out);
    const g = this.gain(gain[0], p);
    const fl = this.filter(type, f, q, g);
    let head = fl;
    if (f2) head = this.filter(f2.type, f2.f, f2.q ?? 0.7, fl);
    this.loop(kind, head, rate);
    this.wander(g.gain, gain[0], gain[1], every, tau);
    if (fw) this.wander(fl.frequency, fw[0], fw[1], every, tau, true);
    return { gain: g, filter: fl };
  }

  // ------------------------------------------------------------ events
  // Play a one-shot recipe `fn(voice)` at absolute time t through a distance chain.
  play(fn, t, { pan = this.rr(-0.8, 0.8), gain = 0.3, lp = 7000, pitch = 1 } = {}) {
    const v = new Voice(this.ctx, null, t, { pitch, rand: this.rand });
    const pn = v.pan(pan, this.out);
    const f = v.filter('lowpass', lp, 0.5, pn);
    v.out = v.gain(gain, f);
    fn(v);
    this.events.push({ v, end: v.finish + 0.1 });
    return v;
  }

  scheduleUntil(t) {
    const until = Math.min(t, this.stopAt);
    for (const w of this.wanderers) {
      while (w.next < until) {
        w.param.setTargetAtTime(this._wv(w), w.next, w.tau);
        w.next += this.rr(w.every[0], w.every[1]);
      }
    }
    this.def.events.forEach((e, i) => {
      while (this.next[i] < until) {
        const at = this.next[i];
        if (!e.chance || this.r() < e.chance) {
          e.fn(this, at);
          this.counts[e.id] = (this.counts[e.id] || 0) + 1;
        }
        this.next[i] += this.rr(e.every[0], e.every[1]);
      }
    });
    const now = this.ctx.currentTime;
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].end < now) { this.events[i].v.dispose(); this.events.splice(i, 1); }
    }
  }

  stop(t, fade = 2) {
    const g = this.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + Math.max(0.02, fade));
    this.stopAt = t + fade;
  }
  finished(now) { return now > this.stopAt + 0.2; }

  dispose() {
    for (const s of this.sources) { try { s.stop(); } catch { /* not started */ } }
    for (const n of this.nodes) { try { n.disconnect(); } catch { /* ignore */ } }
    for (const e of this.events) e.v.dispose();
    this.events.length = 0;
    try { this.out.disconnect(); } catch { /* ignore */ }
  }

  stats() { return { events: this.events.length, counts: { ...this.counts } }; }
}
