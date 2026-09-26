// "Tell" sounds that draw the player's ear to a job: each is a one-shot that the loop player
// (../loops.js) repeats with natural timing. Times are relative seconds (see ../Voice.js).
import { ahr, mtof } from '../dsp.js';
import { formantVoice } from './vocal.js';

// The village's own ice-cream tune (semitones above root, note lengths in steps), as a default.
export const JINGLE = { tune: [0, 4, 7, 12, 11, 7, 9, 5, 7, 4, 2, 0, 0, 0], beats: [1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2], step: 0.17, root: 82 };
export const jingleLength = (o = {}) => (o.beats || JINGLE.beats).reduce((s, b) => s + b, 0) * (o.step || JINGLE.step);

export default {
  // one water drop: tick + rising bubble "plip", sometimes a little secondary droplet
  drip(v) {
    const f = v.rr(1100, 1900);
    v.burst({ a: 0.0004, d: 0.008, peak: 0.25, filters: [{ type: 'bandpass', f: 4000, q: 1.2 }] });
    v.tone({ t: 0.004, f, pts: [[0, f * 0.7], [0.01, f], [0.06, f * 1.9]], a: 0.002, d: 0.07, peak: 0.55 });
    if (v.chance(0.35)) {
      const g = f * 1.5;
      v.tone({ t: v.rr(0.06, 0.1), f: g, pts: [[0, g * 0.9], [0.03, g * 1.6]], a: 0.002, d: 0.035, peak: 0.12 });
    }
  },

  // one snore cycle: rattly in-breath (soft-palate flutter) then a whistle or a lip-flap out-breath
  snore(v, o = {}) {
    const k = o.voice === 'kid' ? 1.6 : o.voice === 'woman' ? 1.25 : 1;
    const inDur = v.rr(1.0, 1.25);
    formantVoice(v, { dur: inDur, a: inDur * 0.75, r: 0.1, peak: 0.5, wave: 'sawtooth', breath: 0.5, body: 1, scale: 0.9 * Math.sqrt(k),
      f0: [[0, 27 * k], [inDur * 0.6, 34 * k], [inDur, 31 * k]], vowels: [[0, 'h'], [inDur * 0.4, 'o'], [inDur, 'a']] });
    const t2 = inDur + v.rr(0.3, 0.5);
    if (v.chance(0.5)) {
      v.tone({ t: t2, type: 'whistle', pts: [[0, 900 * k], [0.35, 1450 * k], [0.9, 780 * k]], a: 0.12, h: 0.6, r: 0.25, peak: 0.1, vib: { rate: 7, depth: 0.01 } });
      v.burst({ t: t2, kind: 'pink', a: 0.15, h: 0.6, r: 0.25, peak: 0.06, filters: [{ type: 'bandpass', f: 1100, q: 1.5 }] });
    } else {
      formantVoice(v, { t: t2, dur: 0.8, a: 0.1, r: 0.3, peak: 0.35, wave: 'sawtooth', breath: 1.2, body: 0.6,
        f0: [[0, 18 * k], [0.8, 14 * k]], vowels: [[0, 'u'], [0.8, 'u']] });
    }
  },

  // rusty hinge of a swinging sign: stick-slip pulses ringing a tonal squeal ("eee" up, "urr" down)
  signCreak(v, o = {}) {
    const up = o.up ?? v.chance(0.5);
    const dur = v.rr(0.45, 0.7);
    const g = v.gain(0, v.out);
    ahr(g.gain, v.at(0), 3, dur * 0.3, dur * 0.3, dur * 0.4); // narrow resonances pass little energy
    const src = v.gain(1);
    for (const [f, q, a] of [[up ? 1250 : 850, 22, 1], [up ? 2100 : 1500, 18, 0.45], [up ? 3300 : 2500, 14, 0.2]]) {
      const bp = v.filter('bandpass', f * v.rr(0.94, 1.06) * v.pm, q);
      bp.connect(v.gain(a, g));
      src.connect(bp);
    }
    const o1 = v.osc('sawtooth', 90, 0, dur + 0.02, src);
    const curve = new Float32Array(10);
    for (let i = 0; i < curve.length; i++) {
      const x = i / (curve.length - 1);
      curve[i] = (up ? 70 + 80 * Math.sin(x * Math.PI * 0.8) : 125 - 60 * x) * v.rr(0.85, 1.15);
    }
    o1.frequency.setValueCurveAtTime(curve, v.at(0), dur);
  },

  // ice-cream van chime through a tinny speaker with a slow wow; options: tune, beats, step, root
  iceCream(v, o = {}) {
    const tune = o.tune || JINGLE.tune;
    const beats = o.beats || JINGLE.beats;
    const step = o.step || JINGLE.step;
    const root = o.root ?? JINGLE.root;
    const spk = v.filter('bandpass', 1700, 0.55, v.out);
    const drv = v.shaper(1.8, spk);
    let t = 0;
    tune.forEach((n, i) => {
      const f = mtof(root + n) * (1 + 0.007 * Math.sin(t * 5));
      v.tone({ t, f, a: 0.002, d: 0.55, peak: 0.3, dest: drv });
      v.tone({ t, f: f * 4.2, a: 0.001, d: 0.12, peak: 0.06, dest: drv });
      t += beats[i % beats.length] * step;
    });
  },

  // wind-up alarm clock: hammer strikes (~18/s) on a small bell; options: duration
  alarm(v, o = {}) {
    const dur = o.duration ?? 1.4;
    const f = v.rr(1650, 1800) * v.pm;
    const g = v.gain(0, v.out);
    ahr(g.gain, v.at(0), 0.4, 0.005, Math.max(0.05, dur - 0.1), 0.25);
    const am = v.gain(0.5, g);
    v.lfo(am.gain, 18, -0.5, 0, dur + 0.25, 'sawtooth'); // strike, decay, strike...
    for (const [r, a] of [[1, 1], [2.32, 0.5], [3.9, 0.3], [5.4, 0.15]]) v.osc('sine', f * r, 0, dur + 0.25, v.gain(a * 0.25, am));
    v.burst({ a: 0.01, h: Math.max(0.05, dur - 0.1), r: 0.1, peak: 0.04, filters: [{ type: 'bandpass', f: 3600, q: 2 }] });
  },
};
