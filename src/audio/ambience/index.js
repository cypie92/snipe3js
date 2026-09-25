// Ambience beds: layered noise textures that never loop audibly + randomised events.
import { Bed } from './Bed.js';
import { EV } from './events.js';
import vocal from '../sfx/vocal.js';
import impacts from '../sfx/impacts.js';

// play a recipe n times in a row (barks, quacks...)
const rep = (fn, n, gap) => (v) => {
  const t0 = v.t0;
  for (let i = 0; i < n; i++) { v.t0 = t0 + i * gap * (1 + 0.15 * (v.r() - 0.5)); fn(v); }
  v.t0 = t0;
};
const far = (b, t, fn, gain, lp = 3000, o = {}) => b.play(fn, t, { gain: gain * b.rr(0.7, 1.15), lp, ...o });

// shared layers
const breeze = (b, lo = 0.05, hi = 0.13) => b.noiseLayer({ kind: 'pink', f: 600, fw: [320, 950], gain: [lo, hi], every: [2, 6], tau: 1.8 });
const leaves = (b, hi = 0.022) => b.noiseLayer({ kind: 'white', type: 'highpass', f: 3500, f2: { type: 'lowpass', f: 9000 }, gain: [0.002, hi], every: [1, 4], tau: 0.7 });
const air = (b, g = 0.05) => b.noiseLayer({ kind: 'brown', f: 170, gain: [g * 0.7, g], every: [3, 7] });
const murmur = (b, lo = 0.012, hi = 0.03, f = 480) => b.noiseLayer({ kind: 'pink', type: 'bandpass', f, q: 1.3, gain: [lo, hi], every: [2, 4] });

const birds = (scale = 1) => [
  { id: 'robin', every: [4 / scale, 10 / scale], fn: (b, t) => far(b, t, EV.robin, 0.11, 9000) },
  { id: 'sparrow', every: [2.5 / scale, 7 / scale], fn: (b, t) => far(b, t, EV.sparrow, 0.15, 9000) },
  { id: 'blackbird', every: [9 / scale, 20 / scale], fn: (b, t) => far(b, t, EV.blackbird, 0.1, 8000) },
];

export const AMBIENCES = {
  // Puddleby Green: birdsong, breeze, distant chatter, the odd dog and church bell
  village: {
    level: 1.33,
    layers(b) { breeze(b); leaves(b); air(b); murmur(b); },
    events: [
      ...birds(1),
      { id: 'woodpigeon', every: [22, 45], fn: (b, t) => far(b, t, EV.woodpigeon, 0.057, 2500) },
      { id: 'babble', every: [0.7, 2.0], fn: (b, t) => far(b, t, (v) => EV.babble(v), 0.045, 1500) },
      { id: 'laugh', every: [18, 40], fn: (b, t) => far(b, t, EV.laugh, 0.21, 1800) },
      { id: 'dog', every: [30, 70], fn: (b, t) => far(b, t, rep(vocal.woof, b.r() < 0.5 ? 1 : 2, 0.35), 0.1, 2200) },
      { id: 'bell', every: [55, 110], first: 12, fn: (b, t) => far(b, t, impacts.bell, 0.18, 2400, { pitch: 0.85 }) },
      { id: 'pigeons', every: [25, 55], fn: (b, t) => far(b, t, vocal.pigeonFlap, 0.8, 3500) },
      { id: 'bike', every: [40, 90], fn: (b, t) => far(b, t, rep(impacts.ding, 2, 0.14), 0.08, 5000, { pitch: 1.3 }) },
    ],
  },

  // Barnacle Bay: waves, lapping, gulls, rigging, creaks, a far foghorn
  harbour: {
    level: 1,
    layers(b) {
      b.swell = b.gain(0.5, b.out);
      const lp = b.filter('lowpass', 500, 0.7, b.gain(0.12, b.swell));
      b.loop('brown', lp);
      b.wander(lp.frequency, 280, 750, [3, 6], 1.5, true);
      b.noiseLayer({ kind: 'pink', type: 'bandpass', f: 900, fw: [500, 1600], q: 0.8, gain: [0.015, 0.05], every: [1.5, 4], tau: 1 });
      breeze(b, 0.06, 0.15);
      air(b, 0.06);
    },
    events: [
      { id: 'swell', every: [5, 9], fn: (b, t) => {
        if (!b.swell) return;
        b.swell.gain.setTargetAtTime(b.rr(0.8, 1.2), t, 0.9);
        b.swell.gain.setTargetAtTime(b.rr(0.3, 0.45), t + b.rr(2, 3), 1.3);
      } },
      { id: 'lap', every: [0.6, 2.2], fn: (b, t) => far(b, t, EV.lap, 0.5, 2500) },
      { id: 'gull', every: [5, 13], fn: (b, t) => far(b, t, vocal.gull, 0.12, 5000, { pitch: b.rr(0.85, 1.15) }) },
      { id: 'rigging', every: [2, 6], fn: (b, t) => far(b, t, EV.rigging, 0.09, 7000) },
      { id: 'creak', every: [7, 18], fn: (b, t) => far(b, t, impacts.creak, 0.32, 2500, { pitch: b.rr(0.7, 1) }) },
      { id: 'babble', every: [2, 5], fn: (b, t) => far(b, t, (v) => EV.babble(v), 0.04, 1300) },
      { id: 'foghorn', every: [70, 140], first: 25, fn: (b, t) => far(b, t, EV.foghorn, 0.085, 700) },
      { id: 'buoy', every: [25, 50], fn: (b, t) => far(b, t, impacts.ding, 0.07, 3000, { pitch: 0.55 }) },
    ],
  },

  // Wobbleton Farm: hens, cows, sheep, a rooster, bees, a tractor far off
  farm: {
    level: 1.4,
    layers(b) { breeze(b, 0.05, 0.12); leaves(b, 0.018); air(b, 0.04); },
    events: [
      ...birds(0.7),
      { id: 'skylark', every: [12, 25], fn: (b, t) => far(b, t, EV.skylark, 0.12, 9000) },
      { id: 'hens', every: [2.5, 7], fn: (b, t) => far(b, t, vocal.cluck, 0.12, 4000, { pitch: b.rr(0.9, 1.15) }) },
      { id: 'cow', every: [16, 35], fn: (b, t) => far(b, t, vocal.moo, 0.095, 1800, { pitch: b.rr(0.9, 1.1) }) },
      { id: 'sheep', every: [10, 25], fn: (b, t) => far(b, t, vocal.baa, 0.21, 2500, { pitch: b.rr(0.85, 1.2) }) },
      { id: 'rooster', every: [80, 150], first: 20, fn: (b, t) => far(b, t, EV.rooster, 0.2, 3000) },
      { id: 'bee', every: [14, 30], fn: (b, t) => far(b, t, EV.beeBy, 0.42, 6000) },
      { id: 'tractor', every: [60, 120], first: 40, fn: (b, t) => far(b, t, EV.tractor, 0.14, 900) },
      { id: 'dog', every: [40, 90], fn: (b, t) => far(b, t, rep(vocal.woof, 2, 0.32), 0.09, 2000) },
    ],
  },

  // Pickle Park: lots of birds, ducks, kids at play, a far-off ice-cream van
  park: {
    level: 1.33,
    layers(b) {
      breeze(b, 0.04, 0.11); leaves(b, 0.028); air(b, 0.035);
      murmur(b, 0.01, 0.022, 560);
      // fountain trickle: bright noise with fast random flutter
      const tr = b.noiseLayer({ kind: 'white', type: 'bandpass', f: 2600, q: 0.6, gain: [0.008, 0.016], every: [0.1, 0.3], tau: 0.04 });
      b.wander(tr.filter.frequency, 1800, 4200, [0.08, 0.25], 0.05, true);
    },
    events: [
      ...birds(1.3),
      { id: 'woodpigeon', every: [25, 50], fn: (b, t) => far(b, t, EV.woodpigeon, 0.073, 2500) },
      { id: 'duck', every: [6, 15], fn: (b, t) => far(b, t, rep(vocal.quack, 1 + Math.floor(b.r() * 3), 0.28), 0.2, 3500) },
      { id: 'kids', every: [2, 5], fn: (b, t) => far(b, t, (v) => EV.babble(v, { hi: true }), 0.055, 1800) },
      { id: 'wheee', every: [12, 28], fn: (b, t) => far(b, t, b.r() < 0.5 ? EV.wheee : EV.laugh, 0.18, 2500, { pitch: 1.2 }) },
      { id: 'ball', every: [15, 35], fn: (b, t) => far(b, t, impacts.hitSoft, 0.125, 2500) },
      { id: 'dog', every: [30, 60], fn: (b, t) => far(b, t, rep(vocal.woof, 1 + Math.floor(b.r() * 2), 0.33), 0.08, 2200) },
      { id: 'iceCream', every: [90, 180], first: 30, fn: (b, t) => far(b, t, EV.iceCream, 0.125, 2400) },
      { id: 'bike', every: [30, 70], fn: (b, t) => far(b, t, rep(impacts.ding, 2, 0.14), 0.075, 5000, { pitch: 1.3 }) },
    ],
  },

  // Jack's office: clock tick-tock, room tone, muffled birds & street, pigeons at the window
  office: {
    level: 1.75,
    layers(b) {
      b.noiseLayer({ kind: 'brown', f: 140, gain: [0.05, 0.07], every: [4, 8] });
      b.noiseLayer({ kind: 'pink', type: 'bandpass', f: 320, q: 0.8, gain: [0.006, 0.012], every: [3, 6] });
    },
    events: [
      { id: 'clock', every: [1, 1], first: 0.5, fn: (b, t) => { b.tock = !b.tock; b.play((v) => EV.clock(v, b.tock), t, { gain: 0.125, pan: -0.35, lp: 6000 }); } },
      { id: 'birds', every: [4, 11], fn: (b, t) => far(b, t, b.r() < 0.5 ? EV.sparrow : EV.robin, 0.05, 2500) },
      { id: 'coo', every: [25, 55], fn: (b, t) => far(b, t, vocal.coo, 0.04, 2200, { pan: 0.6 }) },
      { id: 'car', every: [30, 60], fn: (b, t) => far(b, t, EV.carPass, 0.16, 700) },
      { id: 'creak', every: [30, 70], fn: (b, t) => far(b, t, impacts.creak, 0.3, 2000, { pitch: 0.6 }) },
    ],
  },
};

export class AmbiencePlayer extends Bed {
  constructor(ctx, dest, name, opts) {
    super(ctx, dest, AMBIENCES[name], opts);
    this.name = name;
  }
}
