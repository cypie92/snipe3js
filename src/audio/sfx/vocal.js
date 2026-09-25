// Voices & animals: a glottal-ish oscillator through three moving formant filters
// (source-filter vowel synthesis), plus breath noise, vibrato and tremolo.
import { ahr, sweep } from '../dsp.js';

// [F1, F2, F3] in Hz (cartoon-average adult); `scale` shifts them for kids/animals.
export const VOWELS = {
  a: [800, 1150, 2800], e: [480, 1900, 2600], i: [300, 2300, 3000], o: [480, 850, 2500],
  u: [330, 750, 2300], ae: [700, 1750, 2600], er: [500, 1350, 2100], m: [260, 1100, 2300],
  w: [300, 650, 2200], h: [700, 1300, 2600],
};
const FGAIN = [1, 0.6, 0.32];
const FQ = [5, 8, 11];

function ramp(param, t0, pts, steps) {
  param.setValueAtTime(pts[0][1], t0 + pts[0][0]);
  // steps: cheap stepped changes (automated biquads cost a coefficient update per sample)
  for (let i = 1; i < pts.length; i++) {
    if (steps) param.setValueAtTime(pts[i][1], t0 + (pts[i - 1][0] + pts[i][0]) / 2);
    else param.linearRampToValueAtTime(pts[i][1], t0 + pts[i][0]);
  }
}

// o: { t, dur, f0:[[dt,hz]...], vowels:[[dt,name]...], scale, peak, a, r, wave, breath, breathOnly,
//      vib:{rate,depth}, trem:{rate,depth,delay}, body, dest, formants (1-3), steps }
export function formantVoice(v, o) {
  const t = o.t || 0;
  const dur = o.dur;
  const a = o.a ?? 0.02;
  const r = o.r ?? 0.06;
  const env = v.gain(0, o.dest || v.out);
  ahr(env.gain, v.at(t), o.peak ?? 0.3, a, Math.max(0, dur - a - r), r);
  let into = env;
  if (o.trem) {
    const tg = v.gain(1, env);
    const depth = v.lfo(tg.gain, o.trem.rate, 0, t, dur);
    depth.gain.setValueAtTime(0, v.at(t));
    depth.gain.linearRampToValueAtTime(0, v.at(t + (o.trem.delay ?? 0)));
    depth.gain.linearRampToValueAtTime(o.trem.depth * 0.5, v.at(t + (o.trem.delay ?? 0) + 0.08));
    into = tg;
  }
  const sc = (o.scale || 1) * (o.raw ? 1 : Math.sqrt(v.pm));
  const src = v.gain(1);
  for (let k = 0; k < (o.formants || 3); k++) {
    const bp = v.filter('bandpass', VOWELS[o.vowels[0][1]][k] * sc, FQ[k]);
    bp.connect(v.gain(FGAIN[k], into));
    src.connect(bp);
    if (o.vowels.length > 1) ramp(bp.frequency, v.at(t), o.vowels.map(([dt, n]) => [dt, VOWELS[n][k] * sc]), o.steps);
  }
  if (o.body) {
    const lp = v.filter('lowpass', VOWELS[o.vowels[0][1]][0] * sc * 1.2, 0.7);
    lp.connect(v.gain(o.body, into));
    src.connect(lp);
  }
  if (!o.breathOnly) {
    const f0 = o.f0.map(([dt, hz]) => [dt, hz * v.pm]);
    const osc = v.osc(o.wave || 'glottal', f0[0][1], t, dur + 0.02, src);
    sweep(osc.frequency, v.at(t), f0);
    if (o.vib) v.lfo(osc.frequency, o.vib.rate, f0[0][1] * o.vib.depth, t, dur);
  }
  if (o.breath) {
    const ng = v.gain(o.breath, src);
    v.noise('white', t, dur + 0.02, ng);
  }
  return t + dur;
}

export default {
  // "hey!" — aspirated h, e -> i diphthong, pitch hop up then down
  hey(v) {
    const f = v.rr(170, 280);
    formantVoice(v, { dur: 0.34, a: 0.03, r: 0.09, peak: 0.55, breath: 0.35, body: 0.4,
      f0: [[0, f], [0.07, f * 1.28], [0.34, f * 0.86]],
      vowels: [[0, 'h'], [0.05, 'e'], [0.17, 'e'], [0.32, 'i']], vib: { rate: 6, depth: 0.012 } });
  },

  // sharp breathy intake "hh-ah!" from a couple of startled folk
  gasp(v) {
    for (let i = 0; i < 3; i++) {
      const t = i * v.rr(0.015, 0.04);
      const sc = v.rr(0.9, 1.2);
      formantVoice(v, { t, dur: v.rr(0.28, 0.36), a: 0.025, r: 0.08, peak: 0.5, breathOnly: true, breath: 1, scale: sc,
        vowels: [[0, 'h'], [0.08, 'a'], [0.3, 'o']] });
      formantVoice(v, { t: t + 0.05, dur: 0.2, a: 0.03, r: 0.08, peak: 0.1, scale: sc,
        f0: [[0, v.rr(220, 330)], [0.2, v.rr(330, 420)]], vowels: [[0, 'a'], [0.2, 'o']] });
    }
  },

  crowdCheer(v) {
    for (let i = 0; i < 9; i++) {
      const t = v.rr(0, 0.25);
      const dur = v.rr(1.1, 1.7);
      const f = v.rr(170, 420);
      formantVoice(v, { t, dur, a: 0.07, r: 0.45, peak: 0.12, breath: 0.25, scale: v.rr(1, 1.25),
        f0: [[0, f * 0.9], [0.15, f * 1.22], [dur * 0.6, f * 1.1], [dur, f * 0.78]],
        vowels: [[0, 'e'], [0.2, 'ae'], [dur * 0.7, 'e'], [dur, 'i']], vib: { rate: v.rr(5, 7), depth: 0.02 } });
    }
    for (let i = 0; i < 28; i++) {
      const t = 0.15 + v.r() * 1.7;
      v.burst({ t, a: 0.0005, d: v.rr(0.02, 0.04), peak: 0.16 * (1 - t / 2.4), filters: [{ type: 'bandpass', f: v.rr(1100, 2600), q: 1.3 }] });
    }
    v.burst({ kind: 'pink', a: 0.12, h: 1.1, r: 0.7, peak: 0.1, filters: [{ type: 'bandpass', f: 1000, q: 0.7 }] });
    v.tone({ t: 0.35, type: 'whistle', pts: [[0, 1500], [0.25, 2600], [0.4, 2300]], a: 0.03, h: 0.3, r: 0.1, peak: 0.07 });
  },

  quack(v) {
    const f = v.rr(240, 290);
    formantVoice(v, { dur: 0.24, a: 0.012, r: 0.07, peak: 0.6, wave: 'sawtooth', breath: 0.12, scale: 1.1,
      f0: [[0, f * 1.1], [0.05, f], [0.24, f * 0.82]], vowels: [[0, 'ae'], [0.12, 'a'], [0.24, 'er']] });
  },

  woof(v) {
    const f = v.rr(260, 330);
    formantVoice(v, { dur: 0.2, a: 0.008, r: 0.08, peak: 0.7, breath: 0.5, body: 0.6,
      f0: [[0, f], [0.04, f * 1.4], [0.2, f * 0.85]], vowels: [[0, 'u'], [0.04, 'a'], [0.14, 'o'], [0.2, 'u']] });
  },

  meow(v) {
    const f = v.rr(460, 560);
    formantVoice(v, { dur: 0.72, a: 0.04, r: 0.16, peak: 0.45, breath: 0.08, scale: 1.3,
      f0: [[0, f * 0.95], [0.14, f * 1.45], [0.45, f * 1.3], [0.72, f * 0.9]],
      vowels: [[0, 'm'], [0.1, 'i'], [0.3, 'ae'], [0.55, 'o'], [0.72, 'u']], vib: { rate: 7, depth: 0.02 } });
  },

  moo(v) {
    const f = v.rr(105, 125);
    formantVoice(v, { dur: 1.35, a: 0.12, r: 0.3, peak: 0.55, wave: 'sawtooth', breath: 0.05, body: 0.8,
      f0: [[0, f], [0.25, f * 1.22], [0.9, f * 1.1], [1.35, f * 0.8]],
      vowels: [[0, 'm'], [0.25, 'm'], [0.45, 'o'], [1.1, 'u'], [1.35, 'u']], vib: { rate: 4.5, depth: 0.012 } });
  },

  baa(v) {
    const f = v.rr(280, 320);
    formantVoice(v, { dur: 0.8, a: 0.03, r: 0.18, peak: 0.5, wave: 'sawtooth', breath: 0.12, scale: 1.1,
      f0: [[0, f * 0.95], [0.1, f * 1.1], [0.8, f * 0.98]], vowels: [[0, 'm'], [0.05, 'a'], [0.5, 'ae'], [0.8, 'e']],
      trem: { rate: v.rr(7, 9), depth: 0.85, delay: 0.1 } });
  },

  cluck(v) {
    const n = v.chance(0.5) ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const t = i * v.rr(0.11, 0.14);
      const f = v.rr(650, 800);
      formantVoice(v, { t, dur: 0.075, a: 0.006, r: 0.03, peak: 0.55, breath: 0.2, scale: 1.3,
        f0: [[0, f * 1.2], [0.075, f * 0.7]], vowels: [[0, 'u'], [0.03, 'a'], [0.075, 'o']] });
    }
  },

  gull(v) {
    const calls = [[0, 0.34, 1], [0.4, 0.2, 0.8], [0.64, 0.18, 0.7]];
    for (const [t, dur, pk] of calls) {
      const f = v.rr(1000, 1200);
      formantVoice(v, { t, dur, a: 0.02, r: 0.08, peak: 0.4 * pk, wave: 'sawtooth', breath: 0.1, scale: 1.6,
        f0: [[0, f], [dur * 0.3, f * 1.35], [dur, f * 0.9]], vowels: [[0, 'i'], [dur * 0.3, 'ae'], [dur, 'a']], vib: { rate: 22, depth: 0.03 } });
    }
  },

  // soft pigeon "coo-OO-oo"
  coo(v) {
    const f = v.rr(260, 300);
    formantVoice(v, { dur: 0.75, a: 0.08, r: 0.2, peak: 0.5, breath: 0.05, body: 1,
      f0: [[0, f], [0.2, f * 1.12], [0.45, f * 1.2], [0.75, f * 0.92]], vowels: [[0, 'u'], [0.4, 'o'], [0.75, 'u']],
      trem: { rate: 5, depth: 0.5, delay: 0.15 } });
  },

  // wing flaps: a quick train of filtered-noise "fwup"s
  pigeonFlap(v) {
    const n = 6 + Math.floor(v.r() * 4);
    let t = 0;
    for (let i = 0; i < n; i++) {
      const pk = 0.5 * (1 - i / (n + 2));
      v.burst({ t, kind: 'pink', a: 0.006, d: 0.05, peak: pk, filters: [{ type: 'bandpass', f: v.rr(700, 1300), q: 1.1 }] });
      v.burst({ t, kind: 'brown', a: 0.004, d: 0.04, peak: pk * 0.6, filters: [{ type: 'lowpass', f: 380 }] });
      t += v.rr(0.05, 0.075) * (1 + i * 0.04);
    }
    v.burst({ t: 0.02, a: 0.1, h: t * 0.5, r: 0.12, peak: 0.03, filters: [{ type: 'bandpass', f: 3500, q: 0.8 }] });
  },

  // little songbird phrase (used by ambience too)
  chirp(v) {
    const n = 2 + Math.floor(v.r() * 4);
    const base = v.rr(2600, 4200);
    let t = 0;
    for (let i = 0; i < n; i++) {
      const f = base * v.rr(0.85, 1.2);
      const d = v.rr(0.04, 0.09);
      v.tone({ t, f, pts: [[0, f], [d * 0.5, f * v.rr(1.1, 1.35)], [d, f * v.rr(0.8, 1)]], a: 0.004, h: d - 0.01, r: 0.008, peak: 0.22, vib: { rate: v.rr(30, 60), depth: 0.04 } });
      t += d + v.rr(0.02, 0.07);
    }
  },
};
