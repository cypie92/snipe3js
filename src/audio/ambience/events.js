// One-shot recipes used by the ambience beds (all take a Voice, times relative).
import { formantVoice } from '../sfx/vocal.js';
import { glock } from '../sfx/feedback.js';
import { ahr } from '../dsp.js';

const VOW = ['a', 'e', 'i', 'o', 'u', 'ae', 'er'];

export const EV = {
  // robin-ish warble: rapid high notes, some trilled
  robin(v) {
    const n = 6 + Math.floor(v.r() * 7);
    let t = 0;
    for (let i = 0; i < n; i++) {
      const f = v.rr(2600, 6000);
      const d = v.rr(0.03, 0.08);
      const trill = v.chance(0.35);
      v.tone({ t, f, pts: [[0, f], [d, f * v.rr(0.75, 1.3)]], a: 0.004, h: Math.max(0.01, d - 0.012), r: 0.008, peak: 0.2,
        vib: trill ? { rate: v.rr(40, 70), depth: 0.06, delay: 0, fade: 0.01 } : undefined });
      t += d + v.rr(0.01, 0.05);
    }
  },
  // blackbird: slower, fluty, lower glides, ends with a squeaky twitter
  blackbird(v) {
    const n = 3 + Math.floor(v.r() * 4);
    let t = 0;
    for (let i = 0; i < n; i++) {
      const f = v.rr(1500, 2900);
      const d = v.rr(0.1, 0.24);
      v.tone({ t, type: 'whistle', f, pts: [[0, f * 0.92], [d * 0.3, f * 1.08], [d, f * v.rr(0.8, 1.15)]], a: 0.02, h: d - 0.04, r: 0.03, peak: 0.24, vib: { rate: 7, depth: 0.01 } });
      t += d + v.rr(0.03, 0.09);
    }
    for (let i = 0; i < 4; i++) v.tone({ t: t + i * 0.035, f: v.rr(4500, 7000), a: 0.002, d: 0.03, peak: 0.08 });
  },
  sparrow(v) {
    const n = 2 + Math.floor(v.r() * 4);
    let t = 0;
    const base = v.rr(3000, 4200);
    for (let i = 0; i < n; i++) {
      const f = base * v.rr(0.9, 1.1);
      v.tone({ t, f, pts: [[0, f * 1.2], [0.05, f * 0.8]], a: 0.003, h: 0.035, r: 0.01, peak: 0.2 });
      t += v.rr(0.12, 0.2);
    }
  },
  // "coo-COO-coo, coo-coo"
  woodpigeon(v) {
    const pat = [[0, 0.32, 1], [0.42, 0.45, 1.12], [0.95, 0.22, 1], [1.3, 0.24, 1.02], [1.64, 0.3, 0.97]];
    const f = v.rr(300, 340);
    for (const [t, dur, k] of pat) {
      formantVoice(v, { t, dur, a: 0.05, r: 0.1, peak: 0.45, body: 1, breath: 0.03,
        f0: [[0, f * k * 0.95], [dur * 0.4, f * k * 1.05], [dur, f * k * 0.9]], vowels: [[0, 'u'], [dur, 'u']] });
    }
  },
  skylark(v) {
    let t = 0;
    const len = v.rr(1.8, 3.2);
    while (t < len) {
      const f = v.rr(3200, 6500);
      const d = v.rr(0.025, 0.06);
      v.tone({ t, f, pts: [[0, f], [d, f * v.rr(0.8, 1.25)]], a: 0.003, h: Math.max(0.008, d - 0.01), r: 0.006, peak: 0.13 });
      t += d + v.rr(0.005, 0.03);
    }
  },
  // distant speech-like mumble (syllables of random vowels)
  babble(v, { hi = false } = {}) {
    const n = 2 + Math.floor(v.r() * 6);
    const f = hi ? v.rr(260, 420) : v.rr(110, 240);
    let t = 0;
    for (let i = 0; i < n; i++) {
      const d = v.rr(0.09, 0.22);
      const k = v.rr(0.85, 1.2);
      formantVoice(v, { t, dur: d, a: 0.02, r: 0.05, peak: 0.4, body: 0.5, scale: hi ? 1.2 : 1, formants: 2, steps: true,
        f0: [[0, f * k], [d, f * k * v.rr(0.85, 1.1)]], vowels: [[0, v.pick(VOW)], [d, v.pick(VOW)]] });
      t += d + v.rr(0.02, 0.12);
    }
  },
  laugh(v) {
    const n = 3 + Math.floor(v.r() * 3);
    const f = v.rr(160, 300);
    for (let i = 0; i < n; i++) {
      formantVoice(v, { t: i * 0.16, dur: 0.12, a: 0.015, r: 0.05, peak: 0.4 * (1 - i * 0.1), breath: 0.5,
        f0: [[0, f * (1.15 - i * 0.04)], [0.12, f * (1 - i * 0.04)]], vowels: [[0, 'h'], [0.03, 'a'], [0.12, 'a']] });
    }
  },
  wheee(v) {
    const f = v.rr(380, 520);
    formantVoice(v, { dur: 0.7, a: 0.05, r: 0.2, peak: 0.35, breath: 0.1, scale: 1.25,
      f0: [[0, f], [0.4, f * 1.5], [0.7, f * 1.2]], vowels: [[0, 'u'], [0.08, 'i'], [0.7, 'i']], vib: { rate: 6, depth: 0.02 } });
  },
  rooster(v) {
    const syl = [[0, 0.09, 1, 'a'], [0.13, 0.1, 1.1, 'a'], [0.28, 0.14, 1.25, 'u'], [0.46, 0.1, 1.2, 'er'], [0.6, 0.65, 1.3, 'u']];
    const f = v.rr(480, 560);
    for (const [t, d, k, vw] of syl) {
      formantVoice(v, { t, dur: d, a: 0.015, r: Math.min(0.2, d * 0.4), peak: 0.4, wave: 'sawtooth', breath: 0.15, scale: 1.3,
        f0: [[0, f * k * 0.9], [d * 0.3, f * k * 1.08], [d, f * k * 0.85]], vowels: [[0, vw], [d, vw]], vib: { rate: 18, depth: 0.02 } });
    }
  },
  // harbour foghorn: two-tone diaphone
  foghorn(v) {
    const g = v.gain(0, v.out);
    ahr(g.gain, v.at(0), 0.35, 0.3, 2.0, 0.8);
    const lp = v.filter('lowpass', 520, 1.5, g);
    for (const [f, det] of [[92, 0], [92, 9]]) {
      const o = v.osc('sawtooth', f, 0, 3.2, lp);
      o.detune.value = det;
      o.frequency.setValueAtTime(f, v.at(0));
      o.frequency.setValueAtTime(f, v.at(1.4));
      o.frequency.exponentialRampToValueAtTime(f * 0.8, v.at(1.7));
    }
  },
  // halyards tinkling against masts
  rigging(v) {
    const n = 1 + Math.floor(v.r() * 3);
    const f = v.rr(1800, 3200);
    for (let i = 0; i < n; i++) {
      v.modal({ t: i * v.rr(0.18, 0.4), f: f * v.rr(0.97, 1.03), peak: 0.16, partials: [[1, 1, 0.6], [2.76, 0.4, 0.3], [5.4, 0.15, 0.15]] });
    }
  },
  // water slapping a hull / quay
  lap(v) {
    const d = v.rr(0.12, 0.3);
    v.burst({ kind: 'pink', a: d * 0.3, d, peak: 0.5, filters: [{ type: 'bandpass', f: v.rr(350, 750), q: 1.2 }] });
    if (v.chance(0.5)) v.tone({ t: d * 0.4, f: v.rr(500, 900), pts: [[0, 600], [0.04, 1000]], a: 0.002, d: 0.05, peak: 0.08 });
  },
  carPass(v) {
    const dur = v.rr(3.5, 5);
    const p = v.pan(0, v.out);
    const side = v.chance(0.5) ? 1 : -1;
    p.pan.setValueAtTime(-0.9 * side, v.at(0));
    p.pan.linearRampToValueAtTime(0.9 * side, v.at(dur));
    const g = v.gain(0, p);
    ahr(g.gain, v.at(0), 0.4, dur * 0.5, 0.1, dur * 0.5 - 0.1);
    v.burst({ kind: 'pink', a: 0.01, h: dur, r: 0.05, peak: 0.6, filters: [{ type: 'lowpass', f: 900 }], dest: g });
    const eg = v.gain(0.25, g);
    const lp = v.filter('lowpass', 400, 1, eg);
    const o = v.osc('sawtooth', 58, 0, dur + 0.05, lp);
    o.frequency.setValueAtTime(62, v.at(0));
    o.frequency.setValueAtTime(62, v.at(dur * 0.45));
    o.frequency.exponentialRampToValueAtTime(52, v.at(dur * 0.6));
  },
  tractor(v) {
    const dur = v.rr(7, 10);
    const g = v.gain(0, v.out);
    ahr(g.gain, v.at(0), 0.45, dur * 0.4, dur * 0.2, dur * 0.4);
    const bp = v.filter('lowpass', 260, 2.5, g);
    const o = v.osc('sawtooth', v.rr(10, 13), 0, dur + 0.05, bp);
    v.lfo(o.frequency, 0.3, 0.6, 0, dur);
    const hum = v.gain(0.2, g);
    v.osc('triangle', 48, 0, dur + 0.05, v.filter('lowpass', 150, 0.7, hum));
  },
  beeBy(v) {
    const dur = v.rr(1.4, 2.4);
    const p = v.pan(0, v.out);
    const side = v.chance(0.5) ? 1 : -1;
    p.pan.setValueAtTime(-0.8 * side, v.at(0));
    p.pan.linearRampToValueAtTime(0.8 * side, v.at(dur));
    const g = v.gain(0, p);
    ahr(g.gain, v.at(0), 0.12, dur * 0.45, 0.05, dur * 0.5);
    const bp = v.filter('bandpass', 900, 1.2, g);
    const o = v.osc('sawtooth', 215, 0, dur + 0.05, bp);
    o.frequency.setValueAtTime(230, v.at(0));
    o.frequency.linearRampToValueAtTime(205, v.at(dur));
    v.lfo(o.frequency, 7, 6, 0, dur);
  },
  // tinny, far-away ice-cream van chime (original tune), with speaker warble
  iceCream(v) {
    const tune = [79, 81, 83, 79, 76, 79, 81, 79, 74, 76, 79, 84];
    const bp = v.filter('bandpass', 1800, 0.6, v.out);
    tune.forEach((m, i) => glock(v, i * 0.2, m, 0.35, 0.5, bp));
  },
  clock(v, tock) {
    v.modal({ f: tock ? 1600 : 2100, peak: 0.3, partials: [[1, 1, 0.05], [2.3, 0.5, 0.03], [3.7, 0.2, 0.02]] });
    v.burst({ a: 0.0002, d: 0.006, peak: 0.25, filters: [{ type: 'bandpass', f: tock ? 2500 : 3200, q: 2 }] });
  },
};
