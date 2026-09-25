// Game feedback & UI stingers: bright, cheerful, short.
import { mtof, ahr } from '../dsp.js';

// glockenspiel-ish bar: fundamental + the 2.76x and 5.4x bar modes
export function glock(v, t, m, peak, d = 0.8, dest) {
  v.modal({ t, f: mtof(m), peak, dest, partials: [[1, 1, d], [2.76, 0.32, d * 0.4], [5.4, 0.12, d * 0.25]] });
  v.burst({ t, a: 0.0003, d: 0.006, peak: peak * 0.5, filters: [{ type: 'highpass', f: 5000 }], dest });
}

// tiny high glints scattered in time
function sparkle(v, n, t0, spread, peak) {
  for (let i = 0; i < n; i++) {
    const t = t0 + v.r() * spread;
    v.tone({ t, f: v.rr(4000, 8500), a: 0.002, d: v.rr(0.05, 0.12), peak: peak * v.rr(0.4, 1) * (1 - (t - t0) / (spread * 1.4)) });
  }
}

// brassy note: two detuned saws, filter "blat" envelope and a small pitch scoop
export function brass(v, t, m, dur, peak, dest) {
  const f = mtof(m) * v.pm;
  const g = v.gain(0, dest || v.out);
  ahr(g.gain, v.at(t), peak, 0.025, Math.max(0.02, dur - 0.1), 0.08);
  const lp = v.filter('lowpass', 500, 1.1, g);
  lp.frequency.setValueAtTime(500, v.at(t));
  lp.frequency.exponentialRampToValueAtTime(3400, v.at(t + 0.045));
  lp.frequency.exponentialRampToValueAtTime(1700, v.at(t + 0.25));
  for (const det of [-8, 7]) {
    const o = v.osc('sawtooth', f, t, dur + 0.03, lp);
    o.detune.value = det;
    o.frequency.setValueAtTime(f * 0.97, v.at(t));
    o.frequency.exponentialRampToValueAtTime(f, v.at(t + 0.035));
  }
}

export default {
  jobDone(v) {
    [72, 76, 79, 84].forEach((m, i) => {
      v.fm({ t: i * 0.07, f: mtof(m), ratio: 3.5, index: 1.1, index1: 0.05, idxTime: 0.3, a: 0.002, d: 1.0 - i * 0.12, peak: 0.13 });
      glock(v, i * 0.07, m + 12, 0.05, 0.7);
    });
    for (const m of [60, 64, 67, 72]) v.tone({ t: 0.21, f: mtof(m), a: 0.03, d: 0.9, peak: 0.05 });
    sparkle(v, 12, 0.12, 0.8, 0.03);
    v.burst({ t: 0.05, a: 0.15, h: 0.1, r: 0.5, peak: 0.025, filters: [{ type: 'bandpass', f: 8000, q: 0.8 }] });
  },

  // cha-ching: drawer "ka-chunk" + a bright two-bell ching + a few coins
  cash(v) {
    v.burst({ a: 0.001, d: 0.08, peak: 0.4, filters: [{ type: 'bandpass', f: 4500, q: 1.5 }] });
    v.burst({ t: 0.035, a: 0.001, d: 0.05, peak: 0.35, filters: [{ type: 'bandpass', f: 2400, q: 2 }] });
    v.tone({ t: 0.035, f: 210, f1: 120, glide: 0.04, d: 0.06, peak: 0.3 });
    for (const [f, pk] of [[2637, 0.14], [3951, 0.1]]) {
      v.modal({ t: 0.11, f, peak: pk, partials: [[1, 1, 1.0, 3], [2.4, 0.35, 0.5], [4.1, 0.15, 0.3]] });
    }
    for (let i = 0; i < 5; i++) {
      v.modal({ t: 0.14 + v.r() * 0.25, f: v.rr(3000, 6000), peak: 0.05, partials: [[1, 1, 0.15], [1.6, 0.5, 0.1]] });
    }
  },

  // comedic hollow bonk + slide whistle down
  badHit(v) {
    v.modal({ f: 520, peak: 0.32, bend: 0.25, partials: [[1, 1, 0.2], [1.58, 0.5, 0.14], [2.8, 0.3, 0.09]] });
    v.tone({ f: 330, f1: 185, glide: 0.08, a: 0.001, d: 0.16, peak: 0.45 });
    v.burst({ a: 0.0005, d: 0.02, peak: 0.35, filters: [{ type: 'bandpass', f: 1500, q: 1.5 }] });
    v.tone({ t: 0.15, type: 'whistle', pts: [[0, 1650], [0.07, 1720], [0.62, 400]], a: 0.03, h: 0.5, r: 0.1, peak: 0.22, vib: { rate: 6, depth: 0.012 } });
    v.burst({ t: 0.15, a: 0.03, h: 0.5, r: 0.1, peak: 0.03, filters: [{ type: 'bandpass', pts: [[0, 1650], [0.62, 400]], q: 4 }] });
  },

  // tiny sad trombone: four falling notes with a plunger "wah", last one wobbles and droops
  fail(v) {
    const notes = [[0, 0.22, 62], [0.25, 0.22, 61], [0.5, 0.22, 60], [0.75, 0.8, 59]];
    for (const [t, dur, m] of notes) {
      const f = mtof(m) * v.pm;
      const g = v.gain(0, v.out);
      ahr(g.gain, v.at(t), 0.34, 0.03, dur - 0.09, 0.06);
      const lp = v.filter('lowpass', 350, 3, g);
      lp.frequency.setValueAtTime(350, v.at(t));
      lp.frequency.exponentialRampToValueAtTime(1500, v.at(t + Math.min(0.12, dur * 0.5)));
      lp.frequency.exponentialRampToValueAtTime(600, v.at(t + dur));
      const o = v.osc('brass', f, t, dur + 0.02, lp);
      if (dur > 0.5) {
        const vib = v.lfo(o.frequency, 5.5, 0, t, dur);
        vib.gain.setValueAtTime(0, v.at(t));
        vib.gain.linearRampToValueAtTime(f * 0.025, v.at(t + 0.3));
        o.frequency.setValueAtTime(f, v.at(t + 0.45));
        o.frequency.exponentialRampToValueAtTime(f * 0.94, v.at(t + dur));
      }
    }
  },

  // Golden Spanner: magical ascending pentatonic run + shimmering chord
  collect(v) {
    const steps = [0, 2, 4, 7, 9];
    for (let i = 0; i < 11; i++) {
      const m = 72 + 12 * Math.floor(i / 5) + steps[i % 5];
      glock(v, i * 0.045, m, 0.085, 0.6);
      v.tone({ t: i * 0.045, f: mtof(m + 12), a: 0.002, d: 0.25, peak: 0.025 });
    }
    const tc = 11 * 0.045;
    for (const m of [84, 88, 91, 96]) {
      v.tone({ t: tc, f: mtof(m), a: 0.02, d: 1.0, peak: 0.045, vib: { rate: 6.5, depth: 0.006 } });
    }
    sparkle(v, 16, 0.1, 1.0, 0.04);
    v.burst({ a: 0.35, h: 0.1, r: 0.4, peak: 0.05, filters: [{ type: 'bandpass', f: 2000, f1: 9000, glide: 0.5, q: 1.2 }] });
  },

  uiHover(v) {
    v.tone({ f: 1900, f1: 2300, glide: 0.02, a: 0.002, d: 0.06, peak: 0.6 });
  },

  uiClick(v) {
    v.tone({ f: 1250, f1: 620, glide: 0.035, a: 0.001, d: 0.08, peak: 0.9 });
    v.burst({ a: 0.0003, d: 0.01, peak: 0.5, filters: [{ type: 'bandpass', f: 3500, q: 1 }] });
  },

  // rubber stamp slammed on the clipboard
  stamp(v) {
    v.punch(2);
    v.tone({ f: 95, f1: 45, glide: 0.1, a: 0.002, d: 0.24, peak: 0.85 });
    v.burst({ kind: 'pink', a: 0.001, d: 0.1, peak: 0.75, filters: [{ type: 'lowpass', f: 1400, q: 0.7 }] });
    v.burst({ a: 0.0008, d: 0.045, peak: 0.25, filters: [{ type: 'bandpass', f: 2600, q: 1.2 }] });
    v.modal({ t: 0.01, f: 180, peak: 0.1, partials: [[1, 1, 0.22], [2.4, 0.5, 0.13]] });
  },

  // tally counter
  tick(v) {
    v.burst({ a: 0.0002, d: 0.014, peak: 1, filters: [{ type: 'bandpass', f: 3200, q: 2 }] });
    v.modal({ f: 1150, peak: 0.45, partials: [[1, 1, 0.05], [2.7, 0.4, 0.03]] });
    v.tone({ f: 700, f1: 500, glide: 0.02, a: 0.001, d: 0.03, peak: 0.3 });
  },

  // S-rank fanfare: brass rising figure into a held chord, timpani, cymbal, glock sparkle
  fanfare(v) {
    const lead = [[0, 0.12, 72], [0.13, 0.12, 76], [0.26, 0.12, 79], [0.39, 0.42, 84], [0.84, 0.12, 83], [0.97, 1.1, 84]];
    for (const [t, d, m] of lead) {
      brass(v, t, m, d, 0.1);
      glock(v, t, m + 12, 0.04, 0.5);
    }
    for (const m of [64, 67, 72]) brass(v, 0.97, m, 1.1, 0.06);
    brass(v, 0.39, 67, 0.42, 0.05);
    brass(v, 0.39, 64, 0.42, 0.045);
    for (const t of [0, 0.97]) {
      v.tone({ t, f: 98, f1: 92, glide: 0.3, a: 0.003, d: 1.0, peak: 0.45 });
      v.burst({ t, kind: 'brown', a: 0.002, d: 0.3, peak: 0.35, filters: [{ type: 'lowpass', f: 300 }] });
    }
    v.burst({ t: 0.97, a: 0.001, d: 1.6, peak: 0.07, filters: [{ type: 'bandpass', f: 6000, q: 0.6 }] });
    v.burst({ t: 0.97, a: 0.002, d: 1.0, peak: 0.025, filters: [{ type: 'bandpass', f: 9000, q: 2 }] });
    sparkle(v, 10, 1.0, 0.9, 0.035);
  },

  // referee-style "pip-pheeep" with the pea trill
  whistle(v) {
    for (const [t, dur] of [[0, 0.1], [0.17, 0.42]]) {
      const g = v.gain(0, v.out);
      ahr(g.gain, v.at(t), 0.2, 0.015, dur - 0.04, 0.03);
      const am = v.gain(0.75, g);
      v.lfo(am.gain, 36, 0.25, t, dur + 0.02);
      const o = v.osc('whistle', 2750 * v.pm, t, dur + 0.02, am);
      v.lfo(o.frequency, 36, 90 * v.pm, t, dur + 0.02);
      v.burst({ t, a: 0.015, h: dur - 0.04, r: 0.03, peak: 0.06, filters: [{ type: 'bandpass', f: 2750, q: 3 }] });
    }
  },
};
