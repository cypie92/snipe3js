// SFX registry. Per sound:
//   cat   sandbox grouping          gain  loudness trim (calibrated with tools/audio-check.mjs)
//   send  reverb send               poly  max overlapping instances of this name
//   vary  default pitch variance    duck  [amount, seconds] music duck when played
//   guard same-name retrigger window in s (0 = off)   stagger  offset simultaneous calls
//   crowd each extra overlapping instance plays progressively quieter
import rifle from './rifle.js';
import impacts from './impacts.js';
import feedback from './feedback.js';
import vocal from './vocal.js';
import voices from './babble.js';
import tells from './tells.js';

const R = (fn, cat, o = {}) => ({ fn, cat, gain: 1, send: 0.08, poly: 4, vary: 0.04, ...o });

export const SFX = {
  // rifle & scope
  shot: R(rifle.shot, 'rifle', { gain: 0.75, send: 0.14, vary: 0.025, duck: [0.5, 0.4] }),
  bolt: R(rifle.bolt, 'rifle', { gain: 1.16, vary: 0.02 }),
  reload: R(rifle.reload, 'rifle', { gain: 2.06, vary: 0.02, poly: 2 }),
  dryfire: R(rifle.dryfire, 'rifle', { gain: 1.06 }),
  scopeIn: R(rifle.scopeIn, 'rifle', { gain: 1.58, send: 0.03, poly: 2 }),
  scopeOut: R(rifle.scopeOut, 'rifle', { gain: 1.12, send: 0.03, poly: 2 }),
  zoom: R(rifle.zoom, 'rifle', { gain: 0.92, send: 0.02, poly: 3 }),
  breathIn: R(rifle.breathIn, 'rifle', { gain: 1.02, send: 0, poly: 1, vary: 0.03 }),
  breathOut: R(rifle.breathOut, 'rifle', { gain: 1.13, send: 0, poly: 1, vary: 0.03 }),
  heartbeat: R(rifle.heartbeat, 'rifle', { gain: 0.56, send: 0, poly: 2, vary: 0.02 }),
  // impacts & props
  hitWood: R(impacts.hitWood, 'impact', { gain: 1.3, vary: 0.08 }),
  hitMetal: R(impacts.hitMetal, 'impact', { gain: 0.78, vary: 0.06 }),
  hitStone: R(impacts.hitStone, 'impact', { gain: 1.07, vary: 0.08 }),
  hitSoft: R(impacts.hitSoft, 'impact', { gain: 1.08, vary: 0.08 }),
  hitGlass: R(impacts.hitGlass, 'impact', { gain: 1.19, vary: 0.05 }),
  hitWater: R(impacts.hitWater, 'impact', { gain: 1.33, vary: 0.08 }),
  hitGround: R(impacts.hitGround, 'impact', { gain: 0.94, vary: 0.08 }),
  pop: R(impacts.pop, 'impact', { gain: 1.2, send: 0.16, vary: 0.08 }),
  bell: R(impacts.bell, 'impact', { gain: 1.81, send: 0.2, poly: 3, vary: 0.01 }),
  clang: R(impacts.clang, 'impact', { gain: 1.19, send: 0.14 }),
  spring: R(impacts.spring, 'impact', { gain: 1.26, vary: 0.06 }),
  splash: R(impacts.splash, 'impact', { gain: 1.32, send: 0.1 }),
  whoosh: R(impacts.whoosh, 'impact', { gain: 3.26, vary: 0.1 }),
  firework: R(impacts.firework, 'impact', { gain: 0.92, send: 0.22, poly: 3, vary: 0.05 }),
  honk: R(impacts.honk, 'impact', { gain: 1, vary: 0.05 }),
  creak: R(impacts.creak, 'impact', { gain: 6.23, vary: 0.08 }),
  ding: R(impacts.ding, 'impact', { gain: 0.86, send: 0.12, vary: 0.01 }),
  // feedback & UI
  jobDone: R(feedback.jobDone, 'feedback', { gain: 2.68, send: 0.12, poly: 2, vary: 0, duck: [0.35, 0.8] }),
  cash: R(feedback.cash, 'feedback', { gain: 1.29, send: 0.1, vary: 0.01 }),
  badHit: R(feedback.badHit, 'feedback', { gain: 1.31, send: 0.08, poly: 2, vary: 0.03, duck: [0.35, 0.6] }),
  fail: R(feedback.fail, 'feedback', { gain: 1.12, send: 0.1, poly: 1, vary: 0, duck: [0.5, 1.4] }),
  collect: R(feedback.collect, 'feedback', { gain: 3.5, send: 0.14, poly: 2, vary: 0, duck: [0.4, 1.0] }),
  uiHover: R(feedback.uiHover, 'ui', { gain: 0.36, send: 0, poly: 2, vary: 0.03 }),
  uiClick: R(feedback.uiClick, 'ui', { gain: 0.55, send: 0.02, poly: 3, vary: 0.03 }),
  stamp: R(feedback.stamp, 'feedback', { gain: 0.91, send: 0.08, poly: 2, vary: 0.03 }),
  tick: R(feedback.tick, 'ui', { gain: 0.78, send: 0, poly: 6, vary: 0.04 }),
  fanfare: R(feedback.fanfare, 'feedback', { gain: 1.42, send: 0.15, poly: 1, vary: 0, duck: [0.6, 2.2] }),
  whistle: R(feedback.whistle, 'feedback', { gain: 1.24, send: 0.1, poly: 2, vary: 0.02 }),
  // voices & animals
  crowdCheer: R(vocal.crowdCheer, 'voice', { gain: 2.29, send: 0.14, poly: 2, vary: 0.03 }),
  gasp: R(vocal.gasp, 'voice', { gain: 2.75, vary: 0.06 }),
  hey: R(voices.hey, 'voice', { gain: 0.79, vary: 0.03, guard: 0 }),
  babble: R(voices.babble, 'voice', { gain: 2.16, send: 0.05, poly: 4, vary: 0.02, guard: 0, stagger: true, crowd: true }),
  oi: R(voices.oi, 'voice', { gain: 0.93, vary: 0.03, poly: 3, guard: 0 }),
  yay: R(voices.yay, 'voice', { vary: 0.03, poly: 4, guard: 0, stagger: true, crowd: true }),
  boo: R(voices.boo, 'voice', { gain: 0.56, vary: 0.03, poly: 4, guard: 0, stagger: true, crowd: true }),
  aww: R(voices.aww, 'voice', { gain: 0.76, vary: 0.03, poly: 4, guard: 0, stagger: true, crowd: true }),
  pigeonFlap: R(vocal.pigeonFlap, 'animal', { gain: 8.23, vary: 0.08 }),
  coo: R(vocal.coo, 'animal', { gain: 0.44, vary: 0.06 }),
  quack: R(vocal.quack, 'animal', { gain: 2.19, vary: 0.06 }),
  woof: R(vocal.woof, 'animal', { gain: 0.93, vary: 0.08 }),
  meow: R(vocal.meow, 'animal', { gain: 0.72, vary: 0.06 }),
  moo: R(vocal.moo, 'animal', { gain: 0.78, vary: 0.06 }),
  baa: R(vocal.baa, 'animal', { gain: 2.12, vary: 0.06 }),
  cluck: R(vocal.cluck, 'animal', { gain: 1.55, vary: 0.06 }),
  gull: R(vocal.gull, 'animal', { gain: 1.24, vary: 0.06 }),
  chirp: R(vocal.chirp, 'animal', { gain: 0.72, vary: 0.08 }),
  // tells (one-shots; audio.loop() repeats them with natural timing)
  drip: R(tells.drip, 'tell', { gain: 1.2, send: 0.12, poly: 6, vary: 0.06 }),
  snore: R(tells.snore, 'tell', { gain: 0.68, send: 0.05, poly: 2, vary: 0.03 }),
  signCreak: R(tells.signCreak, 'tell', { gain: 1.14, send: 0.1, poly: 3, vary: 0.04 }),
  iceCream: R(tells.iceCream, 'tell', { gain: 0.67, send: 0.12, poly: 2, vary: 0 }),
  alarm: R(tells.alarm, 'tell', { gain: 3.51, send: 0.1, poly: 2, vary: 0.02 }),
};

// Loudness targets: max 100 ms K-weighted loudness (LUFS) through the master bus at volume 1.
// Consistent within a family; the shot is the loudest thing in the game, UI the quietest.
const TARGETS = {
  shot: -10, bolt: -19.5, reload: -19.5, dryfire: -21, scopeIn: -21, scopeOut: -22, zoom: -26, breathIn: -24, breathOut: -24, heartbeat: -20,
  hitWood: -15, hitMetal: -13.5, hitStone: -15, hitSoft: -14.5, hitGlass: -13.5, hitWater: -15, hitGround: -14.5, pop: -15, bell: -12,
  clang: -12, spring: -14, splash: -13, whoosh: -16, firework: -10, honk: -13, creak: -16, ding: -14,
  jobDone: -12, cash: -13, badHit: -12, fail: -13, collect: -12, uiHover: -28, uiClick: -22, stamp: -12, tick: -25, fanfare: -11,
  whistle: -14, crowdCheer: -13, gasp: -16, hey: -14, babble: -17, oi: -13, yay: -14, boo: -15, aww: -15, pigeonFlap: -17, coo: -17, quack: -15, woof: -14, meow: -15, moo: -15,
  baa: -15, cluck: -15, gull: -15, chirp: -17, drip: -19, snore: -19, signCreak: -18, iceCream: -15, alarm: -13,
};
for (const [k, t] of Object.entries(TARGETS)) SFX[k].target = t;

export const SFX_NAMES = Object.keys(SFX);
export const SFX_CATEGORIES = ['rifle', 'impact', 'feedback', 'ui', 'voice', 'animal', 'tell'];
