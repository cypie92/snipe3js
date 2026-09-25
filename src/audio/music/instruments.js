// Music instruments. Each is fn(voice, note) where note = { f, midi, dur (s), vel, notes, dir, mute, slide }.
// Everything is scheduled at the voice start (t = 0).
import { mtof, ahr } from '../dsp.js';
import { glock as glockBar, brass as brassNote } from '../sfx/feedback.js';

function delayedVibrato(v, osc, f, dur, { rate = 5.5, depth = 0.005, delay = 0.18 } = {}) {
  if (dur <= delay + 0.1) return;
  const d = v.lfo(osc.frequency, rate, 0, 0, dur + 0.02);
  d.gain.setValueAtTime(0, v.at(delay));
  d.gain.linearRampToValueAtTime(f * depth, v.at(Math.min(dur, delay + 0.25)));
}

export const INST = {
  // whistled lead: near-sine with breath noise, scoops/slides and delayed vibrato
  whistle(v, n) {
    const a = n.slide ? 0.012 : 0.035;
    const g = v.gain(0, v.out);
    ahr(g.gain, v.at(0), 0.26 * n.vel, a, Math.max(0.01, n.dur - a - 0.05), 0.05);
    const o = v.osc('whistle', n.f, 0, n.dur + 0.03, g);
    o.frequency.setValueAtTime(n.slide || n.f * 0.975, v.at(0));
    o.frequency.exponentialRampToValueAtTime(n.f, v.at(n.slide ? 0.055 : 0.03));
    delayedVibrato(v, o, n.f, n.dur);
    const bp = v.filter('bandpass', n.f, 5, v.gain(0.5, g));
    v.noise('white', 0, n.dur + 0.03, bp);
  },

  // soft reed (clarinet-ish) for counter-lines and the level track
  clarinet(v, n) {
    const g = v.gain(0, v.out);
    ahr(g.gain, v.at(0), 0.14 * n.vel, 0.05, Math.max(0.01, n.dur - 0.11), 0.06);
    const o = v.osc('reed', n.f, 0, n.dur + 0.03, g); // bus: lowpass 2 kHz
    delayedVibrato(v, o, n.f, n.dur, { rate: 5, depth: 0.004, delay: 0.3 });
  },

  // GCEA ukulele strum (Karplus-Strong strings, ~11 ms between strings); bus adds the body resonance
  uke(v, n) {
    const body = v.out;
    const order = n.dir < 0 ? [...n.notes].reverse() : n.notes;
    order.forEach((m, i) => {
      v.pluck({ t: i * 0.011, f: mtof(m), raw: true, dur: n.mute ? 0.25 : 1.6, decay: n.mute ? 0.95 : 0.9965,
        bright: 0.6, pick: 0.23, peak: 0.15 * n.vel, len: n.mute ? 0.07 : Math.min(1.6, n.dur + 0.08), rel: 0.05, dest: body, seed: m });
    });
    if (n.mute) v.burst({ a: 0.001, d: 0.03, peak: 0.14 * n.vel, filters: [{ type: 'bandpass', f: 2200, q: 1 }], dest: body });
  },

  pizz(v, n) {
    const lp = v.out; // bus: lowpass 2.6 kHz
    v.pluck({ f: n.f, raw: true, dur: 0.9, decay: 0.986, bright: 0.35, pick: 0.15, peak: 0.4 * n.vel,
      len: Math.min(0.9, Math.max(0.3, n.dur * 1.5)), rel: 0.08, seed: 7, dest: lp });
    v.tone({ f: n.f, raw: true, a: 0.003, d: 0.35, peak: 0.1 * n.vel, dest: lp });
  },

  // upright bass: low KS pluck + sine body (bus: lowpass 750 Hz)
  bass(v, n) {
    const lp = v.out;
    v.pluck({ f: n.f, raw: true, dur: 1.4, decay: 0.994, bright: 0.3, pick: 0.2, peak: 0.34 * n.vel,
      len: Math.max(0.2, n.dur * 0.92), rel: 0.06, seed: 3, dest: lp });
    v.tone({ f: n.f, raw: true, a: 0.008, h: Math.max(0.05, n.dur * 0.75), r: 0.08, peak: 0.2 * n.vel, dest: lp });
  },

  // brush on snare: tap + swish
  brush(v, n) {
    v.burst({ a: 0.003, d: 0.14, peak: 0.5 * n.vel, filters: [{ type: 'bandpass', f: 3800, q: 0.6 }] });
    v.burst({ kind: 'pink', a: 0.012, d: 0.2, peak: 0.3 * n.vel, filters: [{ type: 'bandpass', f: 1800, q: 0.8 }] });
  },
  // circular brush sweep
  sweep(v, n) {
    v.burst({ kind: 'pink', a: n.dur * 0.5, h: 0, r: n.dur * 0.5, peak: 0.14 * n.vel, filters: [{ type: 'bandpass', f: 2800, q: 0.5 }] });
  },
  // brush-tip taps (ride pattern)
  ride(v, n) {
    v.burst({ a: 0.001, d: 0.07, peak: 0.33 * n.vel, filters: [{ type: 'bandpass', f: 5200, q: 0.8 }] });
  },
  kick(v, n) {
    v.tone({ f: 88, f1: 46, glide: 0.08, a: 0.002, d: 0.22, peak: 0.36 * n.vel });
  },
  shaker(v, n) {
    v.burst({ a: 0.012, d: 0.05, peak: 0.4 * n.vel, filters: [{ type: 'highpass', f: 6000, q: 0.7 }] });
  },

  glock(v, n) { glockBar(v, 0, n.midi, 0.25 * n.vel, 0.9); },

  celesta(v, n) {
    v.fm({ f: n.f, raw: true, ratio: 1, index: 0.9, index1: 0.05, idxTime: 0.25, a: 0.002, d: 1.3, peak: 0.3 * n.vel });
    v.tone({ f: n.f * 4, raw: true, a: 0.001, d: 0.15, peak: 0.036 * n.vel });
  },

  // musette accordion chord (two reeds per note, slightly detuned) with bellows swell
  accordion(v, n) {
    const g = v.gain(0, v.out);
    ahr(g.gain, v.at(0), 0.026 * n.vel, 0.07, Math.max(0.01, n.dur - 0.15), 0.08);
    const lp = v.filter('lowpass', 2300, 0.7, g);
    for (const m of n.notes) {
      for (const det of [-7, 7]) {
        const o = v.osc('organ', mtof(m), 0, n.dur + 0.03, lp);
        o.detune.value = det;
      }
    }
  },

  // soft pad for the level track
  pad(v, n) {
    const g = v.gain(0, v.out);
    ahr(g.gain, v.at(0), 0.028 * n.vel, Math.min(0.6, n.dur * 0.3), Math.max(0.01, n.dur * 0.55), Math.min(1.2, n.dur * 0.5));
    const lp = v.filter('lowpass', 1400, 0.6, g);
    for (const m of n.notes) {
      for (const det of [-6, 6]) {
        const o = v.osc('triangle', mtof(m), 0, n.dur * 1.3 + 0.05, lp);
        o.detune.value = det;
      }
    }
  },

  tuba(v, n) {
    const g = v.gain(0, v.out);
    ahr(g.gain, v.at(0), 0.2 * n.vel, 0.02, Math.max(0.01, n.dur * 0.6), 0.08);
    v.osc('brass', n.f, 0, n.dur + 0.05, v.filter('lowpass', 650, 0.8, g));
  },

  brass(v, n) { brassNote(v, 0, n.midi, n.dur, 0.085 * n.vel); },

  timpani(v, n) {
    v.tone({ f: n.f, raw: true, f1: n.f * 0.97, glide: 0.3, a: 0.003, d: 1.1, peak: 0.3 * n.vel });
    v.tone({ f: n.f * 1.5, raw: true, a: 0.003, d: 0.5, peak: 0.08 * n.vel });
    v.burst({ kind: 'brown', a: 0.002, d: 0.15, peak: 0.2 * n.vel, filters: [{ type: 'lowpass', f: 400 }] });
  },

  cymbal(v, n) {
    v.burst({ a: 0.001, d: 1.8, peak: 0.4 * n.vel, filters: [{ type: 'highpass', f: 5000, q: 0.5 }] });
    v.burst({ a: 0.002, d: 1.2, peak: 0.16 * n.vel, filters: [{ type: 'bandpass', f: 8000, q: 2 }] });
  },
};
