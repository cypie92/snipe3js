// Villager gibberish ("babble") and short vocal reactions. One babble line is a single glottal
// source through three formant filters whose vowel targets step per syllable (cheap: ~16 nodes
// whatever the length), with per-syllable envelopes, consonant ticks and a pentatonic,
// mood-shaped intonation so it sings a little instead of droning.
import { VOICES, MOODS, quantize } from './voices.js';
import { VOWELS, formantVoice } from './vocal.js';
import { mulberry32, hashString } from '../../core/rng.js';

const FQ = [6, 9, 12];
const FG = [1, 0.75, 0.45];
// consonant noise ticks: [centre Hz, Q, level] roughly s / t / k / p / h
const CONS = [[5200, 1.2, 0.5], [3600, 1.5, 0.7], [2300, 1.8, 0.8], [1200, 1.2, 0.8], [1800, 0.6, 0.45]];
const BRIGHT = ['i', 'e', 'ae'];
const DARK = ['o', 'u', 'er'];
// voice mix when a speaker has no explicit voice (weighted towards adults)
const DEFAULT_MIX = ['man', 'woman', 'man', 'woman', 'old', 'kid', 'posh', 'woman', 'man'];

function xz(p) {
  if (!p) return null;
  if (Array.isArray(p)) return [p[0], p[2]];
  if (p.isObject3D) { const e = p.matrixWorld.elements; return [e[12], e[14]]; }
  return Number.isFinite(p.x) ? [p.x, p.z] : null;
}

/**
 * A speaker's stable "personality": voice type plus personal pitch/speed/formant offsets, derived
 * from opts.seed, or else from a coarse hash of the position (so the same villager keeps sounding
 * the same), or else random.
 */
export function speaker(v, o = {}) {
  let r = v.rand;
  if (o.seed !== undefined) r = mulberry32(hashString(String(o.seed)));
  else {
    const q = xz(o.position);
    if (q) r = mulberry32(hashString(`${Math.round(q[0] / 5)}:${Math.round(q[1] / 5)}`));
  }
  const type = VOICES[o.voice] ? o.voice : DEFAULT_MIX[Math.floor(r() * DEFAULT_MIX.length)];
  const b = VOICES[type];
  return { type, ...b, f0: b.f0 * (0.88 + 0.24 * r()), rate: b.rate * (0.9 + 0.2 * r()), scale: b.scale * (0.96 + 0.08 * r()) };
}

export function babble(v, o = {}) {
  const sp = speaker(v, o);
  const mood = MOODS[o.mood] || MOODS.neutral;
  const n = Math.max(1, Math.min(14, Math.round(o.syllables ?? v.rr(3, 7))));
  const f0 = sp.f0 * v.pm * 2 ** (mood.base / 12);
  const sc = sp.scale;
  const vowelPool = mood.bright > 0 ? [...sp.vowels, ...BRIGHT] : mood.bright < 0 ? [...sp.vowels, ...DARK] : sp.vowels;

  // ---- plan the syllables: words of 1-3 syllables, the first of each word stressed
  const syl = [];
  let t = 0.012;
  let left = 0;
  let prev = null;
  for (let i = 0; i < n; i++) {
    const start = left === 0;
    if (start) left = 1 + Math.floor(v.r() * 3);
    const x = n > 1 ? i / (n - 1) : 0;
    let st = mood.from + (mood.to - mood.from) * x + (v.r() * 2 - 1) * mood.step * sp.swing;
    if (mood.bounce) st += (i % 2 ? -1.5 : 1.5) * sp.swing;
    if (mood.jump && i === 0) st += 3;
    if (mood.rise && i >= n - 2) st += i === n - 1 ? 7 : 3;
    if (start) st += 1;
    const last = i === n - 1;
    const dur = ((0.062 + v.r() * 0.035) / (sp.rate * mood.rate)) * (last ? 1.45 : 1);
    let vowel = v.pick(vowelPool);
    if (vowel === prev) vowel = v.pick(vowelPool);
    prev = vowel;
    left--;
    syl.push({ t, dur, st: quantize(st), vowel, cons: v.chance(start ? 0.8 : 0.45) ? v.pick(CONS) : null,
      amp: start ? 1 : v.rr(0.7, 0.88), brk: left === 0 && !last, last });
    t += dur + (left === 0 && !last ? v.rr(0.05, 0.1) : v.rr(0.012, 0.03));
  }
  const end = t + 0.04;

  // ---- graph: glottal source (+breath) -> 3 formants + body -> envelope -> soft top end
  const out = v.filter('lowpass', 4200, 0.7, v.out);
  const env = v.gain(0, out);
  const src = v.gain(1);
  let into = src;
  if (mood.growl) {
    // grumpy: a little subharmonic roughness
    const rough = v.gain(0.8);
    v.lfo(rough.gain, v.rr(26, 34), 0.25, 0, end, 'square');
    src.connect(rough);
    into = rough;
  }
  const bps = [0, 1, 2].map((k) => {
    const bp = v.filter('bandpass', VOWELS[syl[0].vowel][k] * sc, FQ[k]);
    bp.connect(v.gain(FG[k], env));
    into.connect(bp);
    return bp;
  });
  const body = v.filter('lowpass', 650 * sc, 0.7);
  body.connect(v.gain(0.22, env));
  into.connect(body);
  const osc = v.osc('glottal', f0, 0, end, src);
  if (sp.vib) v.lfo(osc.frequency, sp.vib.rate, f0 * sp.vib.depth, 0, end);
  const noise = v.noise('white', 0, end);
  noise.connect(v.gain(sp.breath, src));
  const cbp = v.filter('bandpass', 3000, 1.2);
  const cg = v.gain(0, env);
  noise.connect(cbp).connect(cg);

  // ---- automation (all events strictly increasing in time per param)
  const pf = osc.frequency;
  const g = env.gain;
  g.setValueAtTime(0, v.at(0));
  syl.forEach((s, i) => {
    const T = v.at(s.t);
    const f = f0 * 2 ** (s.st / 12);
    if (i === 0) pf.setValueAtTime(f, T);
    else pf.exponentialRampToValueAtTime(f, T + Math.min(0.028, s.dur * 0.35));
    pf.exponentialRampToValueAtTime(f * (mood.rise && s.last ? 1.1 : 0.965), T + s.dur);
    for (let k = 0; k < 3; k++) bps[k].frequency.setValueAtTime(VOWELS[s.vowel][k] * sc, T);
    const pk = 0.55 * s.amp * sp.level * (mood.level ?? 1);
    // hold the previous syllable's floor through the gap, then blip: attack, decay, floor
    const floor = i === 0 || syl[i - 1].brk ? 0 : 0.55 * syl[i - 1].amp * sp.level * (mood.level ?? 1) * 0.04;
    g.setValueAtTime(floor, T);
    g.linearRampToValueAtTime(pk, T + 0.01);
    g.linearRampToValueAtTime(pk * 0.55, T + s.dur * 0.55);
    g.linearRampToValueAtTime(s.brk || s.last ? 0 : pk * 0.04, T + s.dur * 0.9);
    if (s.cons) {
      const [cf, q, cl] = s.cons;
      const Tc = Math.max(v.at(0), T - 0.004);
      cbp.frequency.setValueAtTime(cf * sc, Tc);
      cbp.Q.setValueAtTime(q, Tc);
      cg.gain.setValueAtTime(0, Tc);
      cg.gain.linearRampToValueAtTime(0.22 * cl * s.amp, Tc + 0.003);
      cg.gain.linearRampToValueAtTime(0, Tc + 0.026);
    }
  });
  g.linearRampToValueAtTime(0, v.at(end - 0.02));
  return end;
}

// ---------------------------------------------------------------- short reactions
// Each takes the same { voice, seed, position } options as babble, so a villager's "oi!" and their
// babble come from the same throat.
const react = (v, o, spec) => {
  const sp = speaker(v, o);
  const f = sp.f0 * (spec.k || 1);
  formantVoice(v, {
    t: spec.t || 0, dur: spec.dur, a: spec.a ?? 0.02, r: spec.r ?? 0.08, peak: spec.peak ?? 0.6, breath: sp.breath + (spec.breath || 0),
    body: spec.body ?? 0.5, scale: sp.scale, vib: spec.vib ?? sp.vib,
    f0: spec.f0.map(([t, k]) => [t, f * k]), vowels: spec.vowels,
  });
};

export default {
  babble,

  // indignant "OI!" — lands just after the badHit bonk it is paired with
  oi(v, o) {
    react(v, o, { t: 0.09, dur: 0.36, k: 1.05, a: 0.012, breath: 0.05,
      f0: [[0, 1], [0.05, 1.55], [0.16, 1.45], [0.36, 0.92]], vowels: [[0, 'o'], [0.12, 'o'], [0.22, 'e'], [0.34, 'i']] });
    v.burst({ t: 0.09, a: 0.002, d: 0.02, peak: 0.12, filters: [{ type: 'bandpass', f: 1400, q: 1 }] });
  },

  // "hey!": aspirated h, e -> i diphthong, pitch hop up then down
  hey(v, o) {
    react(v, o, { dur: 0.34, k: 1.2, a: 0.03, r: 0.09, breath: 0.25,
      f0: [[0, 1], [0.07, 1.28], [0.34, 0.86]], vowels: [[0, 'h'], [0.05, 'e'], [0.17, 'e'], [0.32, 'i']] });
  },

  // "yaaay!" — cheering villager (job complete)
  yay(v, o) {
    react(v, o, { dur: 0.6, k: 1.25, a: 0.03, r: 0.14,
      f0: [[0, 1], [0.08, 1.3], [0.34, 1.48], [0.6, 1.12]], vowels: [[0, 'i'], [0.07, 'ae'], [0.3, 'a'], [0.46, 'e'], [0.6, 'i']],
      vib: { rate: 6, depth: 0.018, delay: 0.25 } });
  },

  // "booo" — disappointed / booing
  boo(v, o) {
    react(v, o, { dur: 0.85, k: 0.95, a: 0.06, r: 0.2, body: 0.8,
      f0: [[0, 1], [0.12, 1.02], [0.85, 0.78]], vowels: [[0, 'm'], [0.05, 'u'], [0.85, 'u']], vib: { rate: 5, depth: 0.015 } });
  },

  // "awww" — sympathetic
  aww(v, o) {
    react(v, o, { dur: 0.8, k: 1.2, a: 0.05, r: 0.2,
      f0: [[0, 1], [0.16, 1.26], [0.8, 0.84]], vowels: [[0, 'a'], [0.22, 'a'], [0.6, 'o'], [0.8, 'u']], vib: { rate: 5.5, depth: 0.012 } });
  },
};
