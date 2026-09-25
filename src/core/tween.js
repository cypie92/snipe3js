// Minimal tween/timer manager driven by game time (so slow-mo affects it).
export const Ease = {
  linear: (t) => t,
  quadIn: (t) => t * t,
  quadOut: (t) => t * (2 - t),
  quadInOut: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  cubicOut: (t) => 1 - Math.pow(1 - t, 3),
  cubicInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  sineInOut: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  expoOut: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  backOut: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  backIn: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return c3 * t * t * t - c1 * t * t;
  },
  elasticOut: (t) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
  bounceOut: (t) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

export class Tweens {
  constructor() {
    this.list = [];
  }

  /** Tween numeric props of target. Returns a handle { cancel(), promise }. */
  to(target, props, { duration = 0.5, ease = 'quadOut', delay = 0, onUpdate, onComplete } = {}) {
    const from = {};
    const t = {
      target, props, from, duration: Math.max(1e-4, duration), delay, elapsed: 0,
      ease: typeof ease === 'function' ? ease : Ease[ease] || Ease.quadOut,
      onUpdate, onComplete, started: false, dead: false,
    };
    t.promise = new Promise((res) => (t.resolve = res));
    t.cancel = () => {
      t.dead = true;
      t.resolve();
    };
    this.list.push(t);
    return t;
  }

  /** Run fn(k, eased) every frame for `duration` seconds. */
  run(duration, fn, { ease = 'linear', delay = 0, onComplete } = {}) {
    return this.to({}, {}, { duration, ease, delay, onUpdate: fn, onComplete });
  }

  delay(seconds, fn) {
    return this.to({}, {}, { duration: seconds, onComplete: fn });
  }

  wait(seconds) {
    return this.delay(seconds).promise;
  }

  update(dt) {
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (t.dead) continue;
      if (t.delay > 0) {
        t.delay -= dt;
        if (t.delay > 0) continue;
      }
      if (!t.started) {
        t.started = true;
        for (const k in t.props) t.from[k] = t.target[k];
      }
      t.elapsed += dt;
      const k = Math.min(1, t.elapsed / t.duration);
      const e = t.ease(k);
      for (const p in t.props) t.target[p] = t.from[p] + (t.props[p] - t.from[p]) * e;
      t.onUpdate?.(k, e);
      if (k >= 1) {
        t.dead = true;
        t.onComplete?.();
        t.resolve();
      }
    }
    if (list.length > 64) this.list = list.filter((t) => !t.dead);
    else for (let i = list.length - 1; i >= 0; i--) if (list[i].dead) list.splice(i, 1);
  }

  clear() {
    for (const t of this.list) t.resolve();
    this.list = [];
  }
}
