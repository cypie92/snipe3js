// Small animation math kit shared by people and animals.
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const smoother = (t) => { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
/** 0 -> 1 -> 0 bump over [a, b]. */
export const bump = (t, a, b) => (t <= a || t >= b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI));
/** Ramp window: rises over [a, a+fi], holds, falls over [b-fo, b]. */
export const win = (t, a, b, fi = 0.15, fo = 0.2) => Math.min(smooth((t - a) / fi), smooth((b - t) / fo));
export const easeOutBack = (t, s = 1.7) => { t = clamp(t, 0, 1) - 1; return 1 + t * t * ((s + 1) * t + s); };
export const easeOutCubic = (t) => 1 - (1 - clamp(t, 0, 1)) ** 3;
export const easeInOut = (t) => smooth(t);
/** Damped spring-ish settle: 0 -> 1 with overshoot wobble (for boings). */
export const boing = (t, freq = 3, decay = 5) => (t <= 0 ? 0 : 1 - Math.exp(-decay * t) * Math.cos(freq * TAU * t));
/** Frame-rate independent exponential approach. */
export const damp = (cur, target, lambda, dt) => lerp(cur, target, 1 - Math.exp(-lambda * dt));
export function dampAngle(cur, target, lambda, dt) {
  let d = ((target - cur + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return cur + d * (1 - Math.exp(-lambda * dt));
}
export const wrapAngle = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
/** Smooth pseudo-noise in ~[-1, 1] from a few incommensurate sines (cheap, deterministic). */
export const noise = (t, s = 0) =>
  (Math.sin(t * 1.0 + s * 1.7) * 0.5 + Math.sin(t * 2.31 + s * 3.1) * 0.3 + Math.sin(t * 4.13 + s * 5.3) * 0.2);
/** Hop curve: parabola 0..1..0 over one period p, repeating. */
export const hop = (t, p) => { const x = ((t % p) + p) % p / p; return 4 * x * (1 - x); };
/** Hash of an int to [0, 1). */
export function hash1(n) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/**
 * Minimal pose container: named numeric channels with fixed shape so blending is a tight loop.
 * createPoseType(['a','b']) -> class with reset/copy/lerp/blend.
 */
export function createPoseType(keys) {
  const n = keys.length;
  const index = Object.fromEntries(keys.map((k, i) => [k, i]));
  class Pose {
    constructor() { for (const k of keys) this[k] = 0; }
    reset() { for (let i = 0; i < n; i++) this[keys[i]] = 0; return this; }
    copy(o) { for (let i = 0; i < n; i++) this[keys[i]] = o[keys[i]]; return this; }
    /** this = lerp(a, b, t) */
    lerpPoses(a, b, t) { for (let i = 0; i < n; i++) { const k = keys[i]; this[k] = a[k] + (b[k] - a[k]) * t; } return this; }
    /** this = lerp(this, b, t) */
    mixIn(b, t) { if (t <= 0) return this; for (let i = 0; i < n; i++) { const k = keys[i]; this[k] += (b[k] - this[k]) * t; } return this; }
  }
  Pose.keys = keys;
  Pose.index = index;
  return Pose;
}

/**
 * Action blender shared by people & animals: cross-fades from the previous action (kept live)
 * to the new one. A third switch mid-fade freezes the in-between pose as the new source.
 */
export class Blender {
  constructor(PoseType, evalFn) {
    this.P = PoseType;
    this.evalFn = evalFn; // (name, time, outPose, opts) => void
    this.cur = { name: 'idle', t: 0, opts: {} };
    this.prev = null;
    this.frozen = new PoseType();
    this.useFrozen = false;
    this.w = 1;
    this.fade = 0.3;
    this.a = new PoseType();
    this.b = new PoseType();
    this.out = new PoseType();
  }

  set(name, opts = {}, fade = 0.3) {
    if (this.cur.name === name && !opts.restart) { this.cur.opts = { ...this.cur.opts, ...opts }; return false; }
    if (this.w < 1) { this.frozen.copy(this.out); this.useFrozen = true; this.prev = null; }
    else { this.prev = this.cur; this.useFrozen = false; }
    this.cur = { name, t: 0, opts };
    this.w = fade <= 0 ? 1 : 0;
    this.fade = fade;
    return true;
  }

  update(dt) {
    this.cur.t += dt;
    if (this.prev) this.prev.t += dt;
    if (this.w < 1) this.w = Math.min(1, this.w + dt / this.fade);
    const out = this.out;
    this.evalFn(this.cur.name, this.cur.t, this.b.reset(), this.cur.opts);
    if (this.w >= 1) { this.prev = null; this.useFrozen = false; return out.copy(this.b); }
    if (this.useFrozen) this.a.copy(this.frozen);
    else this.evalFn(this.prev.name, this.prev.t, this.a.reset(), this.prev.opts);
    return out.lerpPoses(this.a, this.b, smooth(this.w));
  }
}
