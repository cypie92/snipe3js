// Bullet impacts & world props (bells, pops, splashes, fireworks...).
import { perc, ahr } from '../dsp.js';

// scattered tiny grains (splinters, grit, crumbs)
function grains(v, n, t0, spread, fLo, fHi, peak, d = 0.015) {
  for (let i = 0; i < n; i++) {
    const t = t0 + Math.pow(v.r(), 1.4) * spread;
    const fall = 1 - (t - t0) / (spread * 1.3);
    v.burst({ t, a: 0.0003, d: d * v.rr(0.6, 1.4), peak: peak * fall * v.rr(0.5, 1), filters: [{ type: 'bandpass', f: v.rr(fLo, fHi), q: 2.5 }] });
  }
}

// rising sine chirp = a bubble/droplet "plip"
function droplet(v, t, f, peak) {
  v.tone({ t, f, pts: [[0, f], [0.035, f * 1.9]], a: 0.001, d: 0.045, peak });
}

export default {
  hitWood(v) {
    v.punch(2);
    v.burst({ a: 0.0004, d: 0.07, peak: 0.9, filters: [{ type: 'bandpass', f: v.rr(640, 780), q: 5 }] });
    v.burst({ a: 0.0004, d: 0.045, peak: 0.55, filters: [{ type: 'bandpass', f: v.rr(1700, 2100), q: 6 }] });
    v.modal({ f: v.rr(330, 400), peak: 0.3, partials: [[1, 1, 0.14], [2.31, 0.5, 0.09], [3.93, 0.3, 0.06]] });
    v.tone({ f: 210, f1: 130, glide: 0.04, a: 0.001, d: 0.08, peak: 0.3 });
    grains(v, 4, 0.015, 0.13, 2500, 5000, 0.14);
  },

  // bright ping, often followed by a cartoon ricochet whine
  hitMetal(v) {
    const f = v.rr(1500, 2000);
    v.burst({ a: 0.0003, d: 0.016, peak: 0.55, filters: [{ type: 'highpass', f: 3000, q: 0.7 }] });
    v.modal({ f, peak: 0.26, partials: [[1, 1, 0.9, 1.4], [2.756, 0.6, 0.6], [5.404, 0.35, 0.4], [8.933, 0.18, 0.25]] });
    if (v.chance(0.7)) {
      const f0 = v.rr(3000, 3700);
      v.tone({ t: 0.03, type: 'sine', pts: [[0, f0], [0.07, f0 * 0.85], [0.42, f0 * 0.3]], a: 0.015, d: 0.42, peak: 0.13, vib: { rate: 31, depth: 0.025, delay: 0.02, fade: 0.05 } });
      v.burst({ t: 0.03, a: 0.02, d: 0.3, peak: 0.07, filters: [{ type: 'bandpass', pts: [[0, f0], [0.4, f0 * 0.35]], q: 5 }] });
    }
  },

  hitStone(v) {
    v.punch(2.5);
    v.burst({ a: 0.0003, d: 0.05, peak: 0.8, filters: [{ type: 'highpass', f: 900, q: 0.7 }, { type: 'lowpass', f: 6500 }] });
    v.tone({ f: 150, f1: 70, glide: 0.05, a: 0.001, d: 0.1, peak: 0.45 });
    v.burst({ a: 0.001, d: 0.08, peak: 0.35, filters: [{ type: 'bandpass', f: v.rr(1100, 1400), q: 2 }] });
    grains(v, 8, 0.03, 0.22, 1500, 4500, 0.2, 0.02);
  },

  hitSoft(v) {
    v.punch(1.8);
    v.burst({ kind: 'pink', a: 0.002, d: 0.13, peak: 0.95, filters: [{ type: 'lowpass', f: 900, f1: 280, glide: 0.08, q: 0.8 }] });
    v.tone({ f: 110, f1: 55, glide: 0.08, a: 0.002, d: 0.15, peak: 0.6 });
    v.burst({ a: 0.001, d: 0.05, peak: 0.12, filters: [{ type: 'bandpass', f: 2000, q: 1 }] });
  },

  hitGlass(v) {
    v.modal({ f: v.rr(2800, 3300), peak: 0.22, partials: [[1, 1, 0.55], [1.46, 0.7, 0.42], [2.13, 0.55, 0.32], [2.87, 0.4, 0.22], [3.61, 0.3, 0.15]] });
    v.burst({ a: 0.0005, d: 0.12, peak: 0.45, filters: [{ type: 'highpass', f: 2500, q: 0.7 }] });
    const n = 12 + Math.floor(v.r() * 6);
    for (let i = 0; i < n; i++) {
      const t = 0.02 + Math.pow(v.r(), 1.7) * 0.65;
      v.modal({ t, f: v.rr(3500, 8000), peak: 0.07 * (1 - t), partials: [[1, 1, 0.14], [1.53, 0.5, 0.09]] });
    }
  },

  hitWater(v) {
    v.punch(2);
    v.tone({ f: 340, pts: [[0, 340], [0.06, 1100]], a: 0.002, d: 0.08, peak: 0.45 });
    v.burst({ a: 0.002, d: 0.2, peak: 0.45, filters: [{ type: 'bandpass', f: 1900, f1: 900, glide: 0.16, q: 0.9 }] });
    const n = 3 + Math.floor(v.r() * 3);
    for (let i = 0; i < n; i++) droplet(v, 0.07 + v.r() * 0.28, v.rr(900, 1700), 0.12 * v.rr(0.5, 1));
  },

  hitGround(v) {
    v.punch(1.8);
    v.tone({ f: 120, f1: 50, glide: 0.07, a: 0.002, d: 0.15, peak: 0.7 });
    v.burst({ kind: 'pink', a: 0.002, d: 0.24, peak: 0.6, filters: [{ type: 'lowpass', f: 1300, f1: 380, glide: 0.2, q: 0.7 }] });
    grains(v, 5, 0.02, 0.18, 2000, 4200, 0.12);
  },

  // balloon pop: sharp broadband bang, a little body and a rubbery flap
  pop(v) {
    v.punch(2.5);
    v.burst({ a: 0.0002, d: 0.035, peak: 1, filters: [{ type: 'highpass', f: 450, q: 0.7 }, { type: 'lowpass', f: 7000, q: 0.5 }] });
    v.burst({ kind: 'pink', a: 0.001, d: 0.1, peak: 0.55, filters: [{ type: 'lowpass', f: 1500, q: 0.7 }] });
    v.tone({ f: 210, f1: 90, glide: 0.03, a: 0.0005, d: 0.05, peak: 0.4 });
    v.burst({ t: 0.025, a: 0.005, d: 0.06, peak: 0.1, filters: [{ type: 'bandpass', f: 900, q: 3 }] });
  },

  // church bell: inharmonic partials (hum, prime, tierce, quint, nominal...), beating doublets
  bell(v) {
    v.modal({
      f: 294, peak: 0.13, a: 0.002,
      partials: [
        [0.5, 0.45, 7.5, 0.6], [1, 0.45, 5.5, 1.1], [1.183, 0.5, 4.6, 0.8], [1.506, 0.22, 3.4],
        [2, 0.7, 3.8, 1.3], [2.514, 0.2, 2.4], [2.662, 0.18, 2.2], [3.011, 0.15, 1.8],
        [4.166, 0.11, 1.3], [5.433, 0.07, 0.9], [6.796, 0.045, 0.6], [8.215, 0.03, 0.45],
      ],
    });
    v.burst({ a: 0.0005, d: 0.05, peak: 0.22, filters: [{ type: 'bandpass', f: 2300, q: 1.2 }] });
    v.tone({ f: 147, a: 0.002, d: 0.15, peak: 0.15 });
  },

  clang(v) {
    v.fm({ f: v.rr(300, 350), ratio: 2.41, index: 6, index1: 0.3, idxTime: 0.45, a: 0.0008, d: 0.95, peak: 0.25 });
    v.modal({ f: v.rr(520, 600), peak: 0.18, partials: [[1, 1, 1.1, 2], [2.32, 0.6, 0.8], [3.85, 0.4, 0.5], [5.6, 0.25, 0.3]] });
    v.burst({ a: 0.0003, d: 0.045, peak: 0.5, filters: [{ type: 'bandpass', f: 3000, q: 1 }] });
  },

  // cartoon "boing": resonant saw with a decaying pitch/filter wobble
  spring(v) {
    const g = v.gain(0, v.out);
    perc(g.gain, v.at(0), 0.45, 0.004, 0.95);
    const lp = v.filter('lowpass', 1300 * v.pm, 7, g);
    const o = v.osc('sawtooth', 170 * v.pm, 0, 1.0, lp);
    o.frequency.setValueAtTime(165 * v.pm, v.at(0));
    o.frequency.linearRampToValueAtTime(215 * v.pm, v.at(0.9));
    const d1 = v.lfo(o.frequency, 11, 0, 0, 1.0);
    d1.gain.setValueAtTime(75 * v.pm, v.at(0));
    d1.gain.exponentialRampToValueAtTime(2, v.at(0.9));
    const d2 = v.lfo(lp.frequency, 11, 0, 0, 1.0);
    d2.gain.setValueAtTime(800, v.at(0));
    d2.gain.exponentialRampToValueAtTime(20, v.at(0.9));
    v.tone({ f: 120, f1: 70, glide: 0.04, a: 0.001, d: 0.06, peak: 0.3 });
  },

  splash(v) {
    v.punch(1.8);
    v.burst({ a: 0.004, d: 0.55, peak: 0.55, filters: [{ type: 'bandpass', pts: [[0, 700], [0.05, 2600], [0.5, 1100]], q: 0.7 }] });
    v.burst({ kind: 'brown', a: 0.005, d: 0.38, peak: 0.7, filters: [{ type: 'lowpass', f: 420, q: 0.7 }] });
    v.tone({ f: 240, pts: [[0, 240], [0.08, 700]], a: 0.003, d: 0.12, peak: 0.3 });
    const n = 10 + Math.floor(v.r() * 5);
    for (let i = 0; i < n; i++) droplet(v, 0.1 + Math.pow(v.r(), 1.3) * 0.9, v.rr(700, 2000), 0.1 * v.rr(0.4, 1));
  },

  whoosh(v) {
    v.burst({ kind: 'pink', a: 0.18, h: 0.03, r: 0.26, peak: 0.6, filters: [{ type: 'bandpass', pts: [[0, 300], [0.2, 1800], [0.47, 450]], q: 1.4 }] });
  },

  // whistle up, bang (+ echo), crackle
  firework(v) {
    v.tone({ type: 'whistle', pts: [[0, 700], [1.1, 2600]], a: 0.15, h: 0.8, r: 0.12, peak: 0.1, vib: { rate: 9, depth: 0.012 } });
    v.burst({ a: 0.2, h: 0.75, r: 0.12, peak: 0.06, filters: [{ type: 'bandpass', pts: [[0, 1200], [1.1, 4000]], q: 3 }] });
    const tb = 1.12;
    const mix = v.gain(1, v.out);
    mix.connect(v.echo({ time: 0.24, feedback: 0.35, lp: 1500, wet: 0.35, dur: 1.6 }));
    v.burst({ t: tb, a: 0.0003, d: 0.25, peak: 0.85, filters: [{ type: 'lowpass', f: 5000, q: 0.5 }], dest: mix });
    v.tone({ t: tb, f: 90, f1: 38, glide: 0.2, a: 0.002, d: 0.6, peak: 0.8, dest: mix });
    v.burst({ t: tb, kind: 'brown', a: 0.003, d: 1.1, peak: 0.7, filters: [{ type: 'lowpass', f: 500, q: 0.6 }], dest: mix });
    const pans = [-0.7, -0.25, 0.25, 0.7].map((p) => v.pan(p, v.out));
    for (let i = 0; i < 45; i++) {
      const t = tb + 0.18 + Math.pow(v.r(), 1.2) * 1.6;
      v.burst({ t, a: 0.0002, d: v.rr(0.006, 0.02), peak: 0.22 * (1 - (t - tb) / 2.2), filters: [{ type: 'highpass', f: v.rr(1500, 4000), q: 0.8 }], dest: v.pick(pans) });
    }
  },

  // dual-tone bulb horn (major third), a little driven
  honk(v) {
    const g = v.gain(0, v.out);
    ahr(g.gain, v.at(0), 0.28, 0.015, 0.24, 0.06);
    const lp = v.filter('lowpass', 2600, 0.7, v.filter('highpass', 120, 0.7, g));
    const drv = v.shaper(3, lp);
    const bp = v.filter('bandpass', 850, 0.9, drv);
    for (const f of [370, 466]) {
      const o = v.osc('sawtooth', f * v.pm, 0, 0.34, bp);
      o.frequency.setValueAtTime(f * v.pm * 0.9, v.at(0));
      o.frequency.exponentialRampToValueAtTime(f * v.pm, v.at(0.04));
    }
  },

  // stick-slip creak: irregular low pulse train through wooden resonances
  creak(v) {
    const dur = v.rr(0.7, 0.95);
    const g = v.gain(0, v.out);
    ahr(g.gain, v.at(0), 0.55, 0.06, dur - 0.26, 0.2);
    const bank = [[520, 12, 1], [1150, 14, 0.7], [2300, 10, 0.35]].map(([f, q, a]) => {
      const bp = v.filter('bandpass', f * v.rr(0.9, 1.1), q);
      bp.connect(v.gain(a, g));
      return bp;
    });
    const src = v.gain(1);
    bank.forEach((b) => src.connect(b));
    const o = v.osc('sawtooth', 25, 0, dur + 0.02, src);
    const curve = new Float32Array(12);
    for (let i = 0; i < curve.length; i++) curve[i] = v.rr(16, 46) * (1 + i / 20);
    o.frequency.setValueCurveAtTime(curve, v.at(0), dur);
  },

  ding(v) {
    v.modal({ f: v.rr(1750, 1850), peak: 0.22, partials: [[1, 1, 1.3, 2], [2.76, 0.45, 0.7], [5.4, 0.22, 0.4], [8.93, 0.1, 0.2]] });
    v.burst({ a: 0.0003, d: 0.01, peak: 0.3, filters: [{ type: 'highpass', f: 3500 }] });
  },
};
