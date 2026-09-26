// Procedural pose library for the bean folk. Every action is a pure function of time + the
// person's personality state, writing named channels (see PersonPose). Right-side channels are
// mirrored (same number = same pose on both sides). Angles in radians.
//   aF* arm swing forward   aO* arm raise outward   aT* arm yaw inward   eB* elbow bend   eS* elbow bend inward
//   wB* wrist bend          wW* wrist wiggle        lF* leg forward      lO* leg outward  lT* toe-out  k* knee
// Arms use Euler 'YZX': aF > ~1.6 flips the meaning of aO, and for raised arms (aO > ~1.4) a NEGATIVE eS
// bends the forearm up/over the head. Stubby arms cannot reach above the head: keep hands beside it.
import { createPoseType, TAU, clamp, noise, hop, smooth, bump, win, lerp } from './anim.js';

export const PersonPose = createPoseType([
  'bx', 'by', 'bz', 'brx', 'bry', 'brz', 'bsq',
  'hx', 'hy', 'hrx', 'hry', 'hrz',
  'srx', 'sry', 'srz', 'ssq',
  'nrx', 'nry', 'nrz',
  'aFL', 'aOL', 'aTL', 'eBL', 'eSL', 'wBL', 'wWL',
  'aFR', 'aOR', 'aTR', 'eBR', 'eSR', 'wBR', 'wWR',
  'lFL', 'lOL', 'lTL', 'kL',
  'lFR', 'lOR', 'lTR', 'kR',
  'lid', 'lidT', 'browY', 'browT', 'mouth', 'smile', 'eyeX', 'eyeY',
  'hat', // 0..1: hat tipped forward over the eyes (snoozing, sunbathing)
]);

const both = (o, k, v) => { o[k + 'L'] = v; o[k + 'R'] = v; };
const ARM_KEYS = ['aFL', 'aOL', 'aTL', 'eBL', 'eSL', 'wBL', 'wWL', 'aFR', 'aOR', 'aTR', 'eBR', 'eSR', 'wBR', 'wWR'];
const _listen = Object.fromEntries(ARM_KEYS.map((k) => [k, 0]));

// ---- shared building blocks -----------------------------------------------------------------
/** Smooth keyframe curve: keys = [[t0, v0], [t1, v1], ...] with t ascending in [0, 1]. */
function keys(c, k) {
  if (c <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (c <= k[i][0]) return lerp(k[i - 1][1], k[i][1], smooth((c - k[i - 1][0]) / (k[i][0] - k[i - 1][0])));
  }
  return k[k.length - 1][1];
}
const cyc = (T, period) => ((T / period) % 1 + 1) % 1;

/** Arms folded across the chest (sailor's hornpipe, impatient queuer). */
function foldArms(o) {
  both(o, 'aF', 1.0); both(o, 'aT', 0.95); both(o, 'eB', 1.95); both(o, 'aO', 0.14);
}
function breathe(o, T, s, amt = 1) {
  o.ssq += 0.022 * amt * Math.sin(T * TAU / 3.4);
  o.nrx += 0.012 * amt * Math.sin(T * TAU / 3.4 - 0.6);
}

function armsIdle(o, T, s, style) {
  const sw = Math.sin(T * 0.9) * 0.04;
  switch (style) {
    case 'hips':
      both(o, 'aO', 0.62); both(o, 'aF', -0.12); both(o, 'eS', 1.75); both(o, 'eB', 0.15); both(o, 'wW', 0.3);
      break;
    case 'behind':
      both(o, 'aF', -0.42); both(o, 'aO', 0.06); both(o, 'eB', -0.35); both(o, 'eS', 0.95); both(o, 'aT', -0.1);
      break;
    case 'front':
      both(o, 'aF', 0.42); both(o, 'aT', 0.5); both(o, 'eB', 0.75); both(o, 'eS', 0.35); both(o, 'aO', 0.05);
      o.eBL += Math.sin(T * 1.3) * 0.05; o.eBR += Math.sin(T * 1.3) * 0.05;
      break;
    default:
      o.aFL += sw; o.aFR -= sw; both(o, 'eB', 0.22); o.aOL += 0.03; o.aOR += 0.03;
  }
}

/** Walk / run gait from phase `g` (radians, 2π per stride). k: 0 walk .. 1 run. */
function gait(o, g, s, k = 0) {
  const e = s.energy;
  const sg = Math.sin(g), cg = Math.cos(g);
  const A = (0.5 + 0.38 * k) * (0.85 + 0.15 * e) * (s.stride || 1);
  const L = s.legLen;
  o.lFL = A * sg; o.lFR = -A * sg;
  const lift = 0.55 + 0.9 * k;
  o.kL = Math.max(0, cg) * lift + 0.05 + k * 0.25; o.kR = Math.max(0, -cg) * lift + 0.05 + k * 0.25;
  // hips follow the rigid legs (feet stay planted) plus a cartoon bounce at passing
  o.hy = -L * (1 - Math.cos(A * sg)) + (0.018 + 0.03 * k) * e * (Math.cos(2 * g) + 1) * 0.5 - k * 0.03;
  o.by += k * 0.07 * e * Math.max(0, Math.cos(2 * g));
  o.bsq += (0.035 + 0.03 * k) * e * Math.cos(2 * g);
  const W = (0.075 - 0.03 * k) * e * (s.waddle || 1);
  o.hrz = W * cg; o.hx = -0.012 * cg;
  o.hry = 0.13 * sg; o.sry = -0.16 * sg * (1 + k * 0.5);
  o.srx = 0.05 + 0.24 * k + (s.lean || 0);
  o.nrz = -0.55 * W * cg; o.nrx = 0.035 * Math.cos(2 * g) - 0.12 * k;
  const armA = (0.42 + 0.5 * k) * e;
  o.aFL = -armA * sg; o.aFR = armA * sg;
  o.eBL = 0.3 + 1.2 * k + 0.25 * Math.max(0, -sg); o.eBR = 0.3 + 1.2 * k + 0.25 * Math.max(0, sg);
  o.aOL = 0.04 + 0.1 * k; o.aOR = 0.04 + 0.1 * k;
  o.mouth = k * (0.25 + 0.1 * Math.sin(g * 2));
  o.smile = k * -0.3;
}

function sitBase(o, T, s, opt) {
  const seat = opt.height ?? s.seat ?? 0.45;
  o.by = seat / s.scale - s.bodyBottom + 0.01;
  o.srx = -0.07; o.hrx = -0.05;
  both(o, 'lF', 1.5); both(o, 'lO', 0.1);
  const kick = s.kid ? 0.35 : 0.2;
  o.kL = 1.45 + kick * Math.sin(T * (s.kid ? 3.2 : 2.1));
  o.kR = 1.45 + kick * Math.sin(T * (s.kid ? 3.2 : 2.1) + 2.2);
  both(o, 'aF', 0.55); both(o, 'aT', 0.22); both(o, 'eB', 0.35); both(o, 'aO', 0.1);
}

// ---- actions ---------------------------------------------------------------------------------
export const ACTIONS = {
  idle(o, t, s, opt) {
    const T = t * s.tempo + s.phase;
    breathe(o, T, s);
    o.hrz = 0.022 * noise(T * 0.35, s.seed); o.hx = 0.012 * noise(T * 0.3, s.seed + 3);
    o.nry = (s.idle === 'look' ? 0.55 : 0.22) * noise(T * 0.22, s.seed + 1);
    o.nrx += 0.05 * noise(T * 0.27, s.seed + 2); o.nrz = 0.07 * noise(T * 0.19, s.seed + 5);
    armsIdle(o, T, s, s.idle);
    if (s.idle === 'fidget') { // periodic toe-tap and hand wring
      const tap = Math.max(0, Math.sin(T * 5.5)) * win(T % 7, 1, 3.5);
      o.lFR = 0.18 * tap; o.kR = 0.3 * tap;
      o.aFL += 0.3 * win(T % 9, 4, 6.5); o.aFR += 0.3 * win(T % 9, 4, 6.5);
      o.aTL += 0.4 * win(T % 9, 4, 6.5); o.aTR += 0.4 * win(T % 9, 4, 6.5);
    }
    o.lOL = 0.03; o.lOR = 0.03; o.lTL = 0.12; o.lTR = 0.12;
  },

  walk(o, t, s) {
    gait(o, s.gait, s, 0);
    breathe(o, t, s, 0.5);
    o.nry = 0.08 * noise(t * 0.4, s.seed);
  },

  run(o, t, s) {
    gait(o, s.gait, s, 1);
    o.lid = 0.1; o.browT = 0.2;
  },

  wave(o, t, s, opt) {
    const T = t * s.tempo;
    breathe(o, T + s.phase, s);
    armsIdle(o, T, s, 'relaxed');
    const up = smooth(t / 0.3);
    const w = Math.sin(T * 8.5);
    // straight arm up-and-out sweeping side to side (stubby arms can't reach above the head)
    o.aOR = (2.05 + 0.3 * w) * up; o.aFR = 0.3 * up; o.eBR = 0.1 * up; o.eSR = -0.15 * up;
    o.wWR = -0.5 * w * up;
    o.srz = -0.1 * up; o.hrz = 0.03 * Math.sin(T * 4.25);
    o.nrz = 0.14 * up + 0.04 * Math.sin(T * 4.25); o.nry = 0.08;
    o.by = 0.025 * s.energy * Math.abs(Math.sin(T * 4.25));
    o.smile = 0.35; o.mouth = 0.35 + 0.15 * Math.sin(T * 3); o.browY = 0.5; o.lid = 0.12;
    o.lTL = 0.12; o.lTR = 0.12;
  },

  talk(o, t, s, opt) {
    const T = t * s.tempo + s.phase;
    breathe(o, T, s);
    const per = opt.period || 5.5;
    const role = opt.role === 'speak' ? 1 : opt.role === 'listen' ? -1 : Math.sin((T / per) * TAU + (s.talkPhase || 0));
    const speak = smooth((role + 0.15) / 0.3);
    const listen = 1 - speak;
    // speaker: beat gestures, head bobs, flapping mouth, eyebrow pops
    const beat = Math.abs(Math.sin(T * 3.1));
    const alt = Math.sin(T * 0.9 + s.seed) > 0 ? 1 : 0.35;
    const gL = speak * (0.55 + 0.45 * beat * alt), gR = speak * (0.55 + 0.45 * Math.abs(Math.sin(T * 3.1 + 1.2)) * (1.35 - alt));
    o.aFL = 0.25 + 0.45 * gL; o.eBL = 0.3 + 1.1 * gL; o.aOL = 0.15 + 0.25 * gL; o.wBL = -0.4 * gL; o.eSL = 0.25 * gL;
    o.aFR = 0.25 + 0.45 * gR; o.eBR = 0.3 + 1.1 * gR; o.aOR = 0.15 + 0.25 * gR; o.wBR = -0.4 * gR; o.eSR = 0.25 * gR;
    const flap = Math.max(0, Math.sin(T * 13.5)) * (0.5 + 0.5 * Math.sin(T * 2.3 + s.seed));
    o.mouth = speak * (0.1 + 0.55 * flap);
    o.browY = speak * 0.45 * Math.max(0, Math.sin(T * 2.2));
    o.nrx += speak * 0.07 * Math.sin(T * 6.2) - 0.04 * speak;
    o.nrz = speak * 0.08 * Math.sin(T * 1.7);
    o.srx = speak * 0.05;
    // listener: hands behind/front, slow nods, bigger smile, occasional chuckle
    if (listen > 0) {
      const q = _listen;
      for (const k of ARM_KEYS) q[k] = 0;
      armsIdle(q, T, s, s.idle === 'hips' || s.idle === 'behind' ? s.idle : 'front');
      for (const k of ARM_KEYS) o[k] = o[k] * speak + q[k] * listen;
      const nod = Math.max(0, Math.sin(T * 2.6)) * win(T % 4.5, 0.4, 2.4);
      o.nrx += listen * (0.13 * nod + 0.04);
      o.smile += listen * 0.35;
      const laugh = win(T % 11, 7, 8.4);
      o.ssq += listen * laugh * 0.04 * Math.sin(T * 22);
      o.mouth += listen * laugh * 0.5; o.lid += listen * laugh * 0.45;
    }
    o.nry = 0.1 * noise(T * 0.3, s.seed);
    o.lTL = 0.12; o.lTR = 0.12;
  },

  cheer(o, t, s) {
    const T = t * s.tempo;
    const per = 0.62 / (0.8 + 0.2 * s.energy);
    const h = hop(T, per);
    o.by = 0.2 * s.energy * h;
    o.bsq = 0.12 * (h - 0.35) * s.energy;
    o.kL = o.kR = 0.35 * h; o.lFL = o.lFR = 0.18 * h;
    const pump = Math.sin((T / per) * TAU);
    o.aOL = 2.05 + 0.15 * pump; o.aOR = 2.05 + 0.15 * pump; o.aFL = o.aFR = 0.45;
    o.eBL = o.eBR = 0.25 + 0.25 * pump; o.wWL = o.wWR = 0.3 * pump;
    o.nrx = -0.18; o.nrz = 0.06 * Math.sin(T * 5);
    o.mouth = 0.85; o.smile = 0.6; o.lid = 0.4; o.browY = 0.8;
  },

  sit(o, t, s, opt) {
    const T = t * s.tempo + s.phase;
    sitBase(o, T, s, opt);
    breathe(o, T, s);
    o.nry = 0.3 * noise(T * 0.2, s.seed); o.nrx += 0.05 * noise(T * 0.3, s.seed + 1);
    o.smile = 0.15;
  },

  sleep(o, t, s, opt) {
    const T = t + s.phase;
    const br = Math.sin(T * TAU / 4.2);
    if (opt.stand) {
      breathe(o, T, s, 1.6);
      o.srx = 0.1; o.hrz = 0.03 * Math.sin(T * 0.5);
      both(o, 'aO', 0.04); both(o, 'eB', 0.1);
    } else {
      sitBase(o, 0, s, opt);
      o.kL = 1.5; o.kR = 1.4;
      o.srx = 0.14; o.srz = 0.12;
      both(o, 'aF', 0.38); both(o, 'aT', 0.3); both(o, 'eB', 0.25); both(o, 'aO', 0.12);
      o.ssq = 0.04 * br;
    }
    // head drooped, bobbing with breath; every ~9s it jerks awake for a moment
    const jerk = win(T % 9.3, 7.6, 8.3, 0.08, 0.4);
    o.hat = 0.55 * (1 - jerk);
    o.nrx = 0.42 + 0.06 * br - 0.35 * jerk; o.nrz = 0.28 * (1 - jerk);
    o.lid = 1 - 0.55 * jerk; o.mouth = (0.22 + 0.14 * Math.max(0, br)) * (1 - jerk);
    o.smile = -0.2; o.browY = -0.2 + jerk * 0.6;
  },

  point(o, t, s, opt) {
    const T = t * s.tempo + s.phase;
    breathe(o, T, s);
    const yaw = clamp(s.pointYaw ?? 0.35, -1.4, 1.4), pitch = clamp(s.pointPitch ?? 0.25, -0.6, 1.2);
    const up = smooth(t / 0.25);
    const jab = 0.12 * Math.max(0, Math.sin(T * 6.5)) * win(T % 3, 0.3, 1.4);
    o.sry = yaw * 0.35; o.srx = 0.05;
    o.aFR = (Math.PI / 2 + pitch * 0.9 + jab) * up; o.aTR = yaw * 0.65 * up; o.aOR = 0.12; o.eBR = 0.05; o.wBR = -0.2;
    o.aOL = 0.62; o.aFL = -0.12; o.eSL = 1.75; o.eBL = 0.15; // other hand on hip
    o.nry = yaw * 0.65; o.nrx = -pitch * 0.6;
    o.mouth = 0.4 + 0.2 * Math.max(0, Math.sin(T * 5)); o.browY = 0.7; o.smile = 0.1;
    o.by = 0.015 * Math.abs(Math.sin(T * 6.5));
  },

  sweep(o, t, s) {
    const T = t * s.tempo + s.phase;
    const sw = Math.sin(T * TAU * 0.85);
    breathe(o, T, s, 0.7);
    o.srx = 0.24; o.sry = 0.3 * sw; o.hry = -0.08 * sw;
    o.aFL = 0.95 + 0.1 * sw; o.aTL = 0.55 - 0.18 * sw; o.eBL = 0.45; o.aOL = 0.05;
    o.aFR = 0.55 - 0.1 * sw; o.aTR = 0.3 + 0.18 * sw; o.eBR = 0.35; o.aOR = 0.1;
    o.nrx = 0.1; o.nry = -0.15 * sw;
    const step = Math.max(0, Math.sin(T * TAU * 0.425)) * 0.5;
    o.lFL = 0.1 * step; o.kL = 0.2 * step;
    o.lOL = o.lOR = 0.06; o.kL += 0.12; o.kR = 0.12; o.hy = -0.012;
    o.mouth = 0.08 + 0.1 * Math.max(0, Math.sin(T * 1.7)); o.smile = 0.2;
  },

  fish(o, t, s, opt) {
    const T = t * s.tempo + s.phase;
    if (opt.sit) sitBase(o, T, s, opt);
    breathe(o, T, s);
    const bite = win(T % 8.5, 6.2, 7.2, 0.12, 0.5);
    const twitch = bite * Math.sin(T * 30) * 0.08;
    o.aFR = 0.62 + 0.45 * bite + twitch; o.aTR = 0.2; o.eBR = 0.75 - 0.2 * bite; o.aOR = 0.05; o.wBR = -0.2;
    o.aFL = 0.72 + 0.4 * bite + twitch; o.aTL = 0.55; o.eBL = 0.95; o.aOL = 0.02;
    o.srx = (opt.sit ? 0 : 0.05) - 0.1 * bite; o.nrx = 0.12 - 0.15 * bite; o.nry = 0.08 * noise(T * 0.2, s.seed);
    o.lid = 0.3 - 0.45 * bite; o.browY = 0.9 * bite; o.mouth = 0.5 * bite; o.smile = 0.25;
    if (!opt.sit) { o.lOL = o.lOR = 0.08; o.lTL = o.lTR = 0.15; }
  },

  dance(o, t, s) {
    const T = t * s.tempo;
    const b = T * TAU * 1.9;
    const style = s.seed % 3;
    const bob = (1 + Math.sin(2 * b)) * 0.5; // knees dip twice per bar
    o.by = 0.05 * s.energy * Math.abs(Math.sin(b));
    o.hy = -0.04 * bob;
    both(o, 'lF', 0.2 * bob); both(o, 'k', 0.42 * bob);
    o.hrz = 0.16 * Math.sin(b); o.hx = 0.035 * Math.sin(b); o.srz = -0.12 * Math.sin(b);
    o.nrx = 0.1 * Math.sin(2 * b); o.nrz = 0.16 * Math.sin(b);
    o.bsq = 0.05 * Math.sin(2 * b);
    if (style === 0) { // disco: point up-diagonal / down-diagonal
      const up = Math.sin(b * 0.5) > 0;
      o.aOR = up ? 2.1 : 0.55; o.aFR = up ? 0.4 : 0.75; o.eBR = 0.05;
      o.aOL = 0.62; o.aFL = -0.12; o.eSL = 1.75; o.eBL = 0.15;
      o.sry = up ? 0.25 : -0.2; o.nry = up ? 0.3 : -0.2;
    } else if (style === 1) { // hands in the air, swaying
      o.aOL = o.aOR = 2.0; o.aFL = o.aFR = 0.45;
      o.eBL = o.eBR = 0.3; o.eSL = 0.6 * Math.sin(b); o.eSR = -0.6 * Math.sin(b);
      o.wWL = o.wWR = 0.5 * Math.sin(b);
    } else { // the twist
      o.hry = 0.45 * Math.sin(b); o.sry = -0.55 * Math.sin(b);
      o.aOL = o.aOR = 0.55; o.aFL = o.aFR = 0.55; o.eBL = o.eBR = 1.45;
      o.aTL = 0.25 + 0.3 * Math.sin(b); o.aTR = 0.25 - 0.3 * Math.sin(b);
      both(o, 'lT', -0.35 * Math.sin(b));
    }
    o.lid = 0.35; o.smile = 0.6; o.mouth = 0.35 + 0.25 * Math.max(0, Math.sin(b)); o.browY = 0.4;
  },

  panic(o, t, s) {
    const T = t * s.tempo * 1.1;
    gait(o, s.gait, s, 1);
    o.srx = -0.05; o.by += 0.02;
    o.aOL = 1.95 + 0.5 * Math.sin(T * 13); o.aOR = 1.95 + 0.5 * Math.sin(T * 13 + 1.7);
    o.aFL = 0.35 + 0.35 * Math.sin(T * 11); o.aFR = 0.35 + 0.35 * Math.sin(T * 11 + 2);
    o.eBL = 0.5 + 0.4 * Math.sin(T * 15); o.eBR = 0.5 + 0.4 * Math.sin(T * 15 + 1);
    o.wWL = 0.5 * Math.sin(T * 17); o.wWR = 0.5 * Math.sin(T * 17 + 1);
    o.nry = 0.4 * Math.sin(T * 8.5); o.nrx = -0.12; o.bx = 0.015 * Math.sin(T * 23);
    o.mouth = 0.95; o.smile = -0.9; o.lid = -0.2; o.browY = 1; o.browT = -0.6; o.eyeY = 0.2;
  },

  lookUp(o, t, s) {
    const T = t * s.tempo + s.phase;
    breathe(o, T, s);
    const up = smooth(t / 0.4);
    o.nrx = -0.62 * up + 0.04 * noise(T * 0.5, s.seed); o.nry = 0.15 * noise(T * 0.25, s.seed);
    o.srx = -0.14 * up; o.hy = -0.005;
    // "up there!": right arm points skyward with little jabs, left hand on the tummy
    const jab = 0.12 * Math.max(0, Math.sin(T * 6)) * win(T % 3.5, 0.5, 1.6);
    o.aOR = (2.35 + jab) * up; o.aFR = 0.45 * up; o.eBR = 0.05; o.wBR = -0.3;
    o.aFL = 0.55; o.aTL = 0.45; o.eBL = 0.9; o.aOL = 0.05;
    o.eyeY = 0.9 * up; o.mouth = 0.4; o.browY = 0.8; o.smile = -0.1;
  },

  clap(o, t, s) {
    const T = t * s.tempo;
    const c = Math.sin(T * TAU * 2.4);
    const k = Math.pow(0.5 + 0.5 * c, 3);
    breathe(o, T + s.phase, s);
    o.aFL = o.aFR = 1.0; o.aOL = o.aOR = 0.0;
    o.aTL = o.aTR = 0.3 + 0.4 * k; o.eBL = o.eBR = 0.75; o.eSL = o.eSR = 0.15 + 0.35 * k;
    o.by = 0.02 * s.energy * Math.abs(Math.sin(T * TAU * 1.2));
    o.nrx = -0.05 + 0.05 * c; o.lid = 0.3; o.smile = 0.6; o.mouth = 0.45; o.browY = 0.4;
  },

  // ---- extras (prop / job tells) ----
  read(o, t, s) {
    const T = t * s.tempo + s.phase;
    breathe(o, T, s);
    // newspaper hangs in front of the chest/face (attached to the spine); hands hold its lower corners
    o.aFL = o.aFR = 1.2; o.aTL = o.aTR = 0.12; o.eBL = o.eBR = 0.9; o.aOL = o.aOR = 0.3; o.eSL = o.eSR = 0.35;
    o.wBL = o.wBR = -0.3;
    o.srx = -0.04; o.nrx = 0.16; o.nry = 0.08 * Math.sin(T * 0.6); o.eyeY = -0.45; o.eyeX = 0.6 * Math.sin(T * 0.9);
    o.lid = 0.3; o.browY = 0.2 * Math.sin(T * 0.4); o.smile = 0.1;
    const flick = win(T % 7, 5.2, 5.8, 0.1, 0.2); // turning the page
    o.aOR += 0.4 * flick; o.eSR -= 0.6 * flick;
  },

  photo(o, t, s) {
    const T = t * s.tempo + s.phase;
    breathe(o, T, s, 0.6);
    // camera sits at the right eye (attached to the head); both hands up holding it
    o.aFR = 1.35; o.aOR = 0.3; o.aTR = 0.45; o.eBR = 1.35; o.eSR = 0.25;
    o.aFL = 1.3; o.aOL = 0.1; o.aTL = 0.7; o.eBL = 1.3; o.eSL = 0.3;
    const click = win(T % 3.6, 1.6, 1.8, 0.03, 0.12);
    o.eBR += 0.12 * click; o.bsq -= 0.03 * click;
    o.srx = -0.05; o.nrx = -0.06; o.nry = 0.25 * noise(T * 0.18, s.seed); o.sry = 0.2 * noise(T * 0.18, s.seed);
    o.lid = 0.15; o.smile = 0.6; o.lidT = -0.2;
  },

  eat(o, t, s, opt) {
    const T = t * s.tempo + s.phase;
    breathe(o, T, s);
    if ((opt.food || s.food) === 'chips') { // chip cone at the chest (left), fork chips to the mouth (right)
      const c = cyc(T, 2.3);
      const dip = win(c, 0.02, 0.3, 0.08, 0.1), up = win(c, 0.3, 0.62, 0.1, 0.12);
      const chew = Math.max(0, Math.sin(T * 14)) * win(c, 0.52, 0.98, 0.05, 0.1);
      o.aFL = 1.0; o.aTL = 0.55; o.eBL = 1.2; o.aOL = 0.12;
      o.aFR = 0.55 + 0.35 * dip + 0.8 * up; o.aTR = 0.3 + 0.3 * dip + 0.35 * up; o.eBR = 0.85 + 0.45 * dip + 1.05 * up; o.aOR = 0.1;
      o.nrx = 0.12 + 0.18 * dip - 0.08 * up; o.eyeY = -0.5 * dip;
      o.mouth = 0.55 * win(c, 0.42, 0.6, 0.05, 0.05) + 0.25 * chew; o.smile = 0.65; o.lid = 0.15 + 0.35 * chew;
      const glance = win(T % 7.3, 4.6, 5.8, 0.15, 0.2); // keeping an eye out for gulls...
      o.nry = 0.55 * glance * (Math.sin(T * 0.37 + s.seed) > 0 ? 1 : -1); o.eyeX = 0.7 * o.nry; o.browT = -0.35 * glance;
      return;
    }
    const lick = win(T % 3.2, 0.5, 1.6, 0.25, 0.35);
    o.aFR = 0.55 + 0.75 * lick; o.aTR = 0.3 + 0.25 * lick; o.eBR = 1.2 + 0.5 * lick; o.wBR = -(0.55 + 0.75 * lick) - (1.2 + 0.5 * lick) + 0.4;
    armsIdle(o, T, s, 'relaxed');
    o.aFR = 0.55 + 0.75 * lick; o.aTR = 0.3 + 0.25 * lick; o.eBR = 1.2 + 0.5 * lick;
    o.nrx = 0.12 * lick; o.lid = 0.25 + 0.4 * lick; o.smile = 0.7; o.mouth = 0.35 * lick;
  },

  paint(o, t, s) {
    const T = t * s.tempo + s.phase;
    breathe(o, T, s);
    const stroke = Math.sin(T * 5.5);
    o.aFL = 0.7; o.aOL = 0.35; o.eBL = 1.0; o.aTL = 0.1; o.wBL = -0.9;
    o.aFR = 1.25 + 0.25 * stroke; o.aOR = 0.2 + 0.15 * Math.sin(T * 2.75); o.eBR = 0.45; o.aTR = 0.1;
    o.srx = 0.04; o.nrz = 0.12 + 0.08 * Math.sin(T * 0.7); o.nrx = 0.02;
    o.lid = 0.3; o.browY = 0.3 * Math.max(0, Math.sin(T * 0.9)); o.smile = 0.3;
    o.mouth = 0.1 * Math.max(0, Math.sin(T * 0.6));
  },

  scratch(o, t, s) { // puzzled scratch behind the ear (a handy "something's wrong" tell)
    const T = t * s.tempo + s.phase;
    breathe(o, T, s);
    const up = smooth(t / 0.3);
    const sc = Math.sin(T * 15);
    o.aOR = 1.9 * up; o.aFR = 0.25 * up; o.eSR = -(1.5 + 0.12 * sc) * up; o.eBR = 0.2 * up; o.wWR = 0.3 * sc * up;
    o.aOL = 0.62; o.aFL = -0.12; o.eSL = 1.75; o.eBL = 0.15;
    o.nrz = -0.22 * up; o.nrx = -0.08; o.nry = 0.15 * noise(T * 0.3, s.seed);
    o.eyeY = 0.5; o.eyeX = -0.3; o.browT = -0.5; o.browY = 0.4; o.smile = -0.4; o.mouth = 0.05;
  },

  shrug(o, t, s) {
    const T = t * s.tempo + s.phase;
    breathe(o, T, s);
    const k = win(T % 3, 0.3, 1.5, 0.2, 0.3);
    o.aOL = o.aOR = 0.35 + 0.3 * k; o.aFL = o.aFR = 0.3 * k; o.eBL = o.eBR = 1.3 * k + 0.2; o.eSL = o.eSR = -0.6 * k;
    o.wBL = o.wBR = -0.6 * k; o.ssq = 0.05 * k; o.nrz = 0.18 * k; o.browY = 0.8 * k; o.smile = -0.3 * k; o.mouth = 0.1 * k;
  },

  angry(o, t, s) {
    const T = t * s.tempo + s.phase;
    const stomp = Math.max(0, Math.sin(T * 7));
    o.lFR = 0.25 * stomp * win(T % 4, 0, 2); o.kR = 0.5 * stomp * win(T % 4, 0, 2);
    o.lFL = 0.25 * Math.max(0, -Math.sin(T * 7)) * win(T % 4, 2, 4); o.kL = 0.5 * Math.max(0, -Math.sin(T * 7)) * win(T % 4, 2, 4);
    o.aOL = o.aOR = 0.62; o.aFL = o.aFR = -0.12; o.eSL = o.eSR = 1.75; o.eBL = o.eBR = 0.15;
    o.srx = 0.08; o.nrx = 0.06; o.nry = 0.15 * Math.sin(T * 1.3);
    o.lid = 0.3; o.lidT = 0.55; o.browT = 0.9; o.browY = -0.3; o.smile = -0.9; o.mouth = 0.25 * Math.max(0, Math.sin(T * 9));
  },

  // ---- harbour & beach -------------------------------------------------------------------------
  // Water actions (swim, tread) expect the root ON the water surface: the body sinks so only the head
  // and shoulders are above it, and the Person switches to the wet material (everything below the root
  // is discarded), so the water shader never has to hide the legs.
  tread(o, t, s, opt) {
    const T = t * s.tempo + s.phase;
    const d = s.d;
    o.by = -(d.shY - 0.03) + 0.03 * Math.sin(T * 2.4);
    const sc = Math.sin(T * 3.1);
    both(o, 'aO', 0.95); both(o, 'aF', 0.4); both(o, 'eB', 0.55);
    o.aTL = 0.25 + 0.4 * sc; o.aTR = 0.25 - 0.4 * sc; o.wWL = 0.4 * sc; o.wWR = -0.4 * sc;
    o.lFL = 0.55 + 0.45 * Math.sin(T * 3.1); o.lFR = 0.55 - 0.45 * Math.sin(T * 3.1); o.kL = o.kR = 1.0;
    o.nry = 0.45 * noise(T * 0.25, s.seed); o.nrx = -0.05 + 0.04 * Math.sin(T * 2.4); o.nrz = 0.07 * Math.sin(T * 1.2);
    o.smile = 0.55; o.mouth = 0.12;
    if (opt.wave !== false) { // now and then a cheery wave to the shore
      const w = win(T % 9.5, 5.5, 7.6, 0.3, 0.35);
      o.by += 0.07 * w;
      o.aOR = lerp(o.aOR, 2.05 + 0.3 * Math.sin(T * 8.5), w); o.aFR = lerp(o.aFR, 0.3, w); o.eBR = lerp(o.eBR, 0.1, w);
      o.aTR = lerp(o.aTR, 0, w); o.wWR = lerp(o.wWR, -0.5 * Math.sin(T * 8.5), w);
      o.mouth += 0.35 * w; o.browY = 0.5 * w; o.nrz += 0.12 * w;
    }
  },

  swim(o, t, s, opt) { // breaststroke (kids: doggy paddle); use with a Walker(action: 'swim') to move
    const T = t * s.tempo + s.phase;
    const d = s.d;
    const lean = 0.75;
    o.brx = lean;
    o.bz = -d.shY * Math.sin(lean) * 0.75;
    o.by = -(d.shY * Math.cos(lean) - 0.04);
    o.nrx = -lean * 0.95 - 0.1;
    if (s.kid || opt.style === 'doggy') {
      const a = Math.sin(T * 6.5);
      o.aFL = 0.95 + 0.45 * a; o.aFR = 0.95 - 0.45 * a; o.eBL = 0.9 - 0.5 * a; o.eBR = 0.9 + 0.5 * a;
      both(o, 'aT', 0.22); both(o, 'aO', 0.12);
      o.by += 0.02 * Math.abs(a); o.nrz = 0.08 * a;
      o.lFL = 0.3 * a; o.lFR = -0.3 * a;
      o.mouth = 0.3; o.smile = 0.3; o.browY = 0.4;
      return;
    }
    const c = cyc(T, 1.55);
    const aF = keys(c, [[0, 0.95], [0.3, 0.75], [0.55, 0.35], [0.7, 0.4], [1, 0.95]]);
    const aO = keys(c, [[0, 0.08], [0.3, 0.9], [0.55, 0.35], [0.75, 0.1], [1, 0.08]]);
    const aT = keys(c, [[0, 0.35], [0.3, -0.1], [0.55, 0.55], [0.75, 0.45], [1, 0.35]]);
    const eB = keys(c, [[0, 0.08], [0.3, 0.35], [0.55, 1.7], [0.72, 1.2], [1, 0.08]]);
    both(o, 'aF', aF); both(o, 'aO', aO); both(o, 'aT', aT); both(o, 'eB', eB);
    const lift = keys(c, [[0, 0], [0.35, 0.3], [0.55, 1], [0.8, 0.2], [1, 0]]);
    o.by += 0.07 * lift; o.nrx -= 0.1 * lift;
    const kick = keys(c, [[0, 0], [0.45, 0.2], [0.65, 1], [0.85, 0.1], [1, 0]]);
    both(o, 'lF', -0.2 + 0.9 * kick); both(o, 'k', 0.2 + 1.5 * kick); both(o, 'lO', 0.35 * kick);
    o.mouth = 0.35 * lift; o.smile = 0.35; o.lid = 0.15;
  },

  row(o, t, s, opt) { // seated rowing; Person adds oars pivoting in rowlocks unless opts.oars === false
    const T = t * s.tempo + s.phase;
    sitBase(o, 0, s, { height: opt.height ?? 0.34 });
    both(o, 'lF', 1.25); both(o, 'lO', 0.15);
    const c = cyc(T, opt.period || 2.1);
    const lean = keys(c, [[0, 0.38], [0.45, -0.34], [0.55, -0.32], [1, 0.38]]);
    const reach = keys(c, [[0, 1], [0.1, 0.95], [0.45, 0], [0.55, 0], [0.85, 0.8], [1, 1]]);
    const high = keys(c, [[0, 0.2], [0.08, 1], [0.45, 1], [0.56, 0], [0.95, 0], [1, 0.2]]);
    o.srx = lean; o.nrx = -lean * 0.85 + 0.04;
    o.kL = o.kR = 0.75 + 0.55 * reach;
    const bias = clamp(opt.bias || 0, -1, 1); // one arm lazier -> the boat goes round in circles
    for (const [S, k] of [['L', 1 - bias * 0.7], ['R', 1 + bias * 0.7]]) {
      const r = 1 - (1 - reach) * clamp(k, 0.1, 1.3);
      o['aF' + S] = 0.3 + 0.9 * r + 0.15 * high;
      o['eB' + S] = 0.15 + 1.55 * (1 - r);
      o['aO' + S] = 0.22; o['aT' + S] = 0.1;
    }
    o.mouth = 0.3 * high * (1 - reach); o.lid = 0.25 * high; o.browT = 0.25 * high; o.smile = 0.2 - 0.4 * high;
    if (opt.lost) { // "which way's the harbour?"
      const look = win(T % 6, 3.8, 5.8, 0.3, 0.3);
      o.nry = 0.9 * Math.sin(T * 1.7) * look; o.browT = -0.5 * look; o.browY = 0.5 * look; o.smile = -0.5 * look;
    }
  },

  paddle(o, t, s, opt) { // sitting in a dinghy, paddling over the side with one hand
    const T = t * s.tempo * 1.15 + s.phase;
    sitBase(o, 0, s, { height: opt.height ?? 0.3 });
    both(o, 'lF', 1.35); o.kL = o.kR = 1.05;
    const side = clamp(Math.sin(T * 0.42) * 3, -1, 1);
    const st = Math.sin(T * 4.6);
    o.srz = -0.32 * side; o.srx = 0.3; o.sry = 0.15 * side; o.hrz = -0.08 * side;
    for (const [S, k] of [['R', Math.max(0, side)], ['L', Math.max(0, -side)]]) {
      o['aO' + S] = 0.3 + 0.75 * k; o['aF' + S] = 0.5 + k * (0.3 + 0.6 * st); o['eB' + S] = 0.55 - 0.3 * k; o['wW' + S] = 0.6 * k * st;
    }
    o.nrz = 0.18 * side; o.nrx = 0.1; o.mouth = 0.3; o.smile = 0.1; o.browT = 0.35; o.lid = 0.15;
  },

  lie(o, t, s, opt) { // sunbathing: opts.pose 'back' (default) | 'front' | 'deckchair' (opts.height = seat)
    const T = t * s.tempo + s.phase;
    const d = s.d;
    const pose = opt.pose || 'back';
    if (pose === 'deckchair') {
      sitBase(o, 0, s, { height: opt.height ?? 0.28 });
      o.srx = -0.72; o.hrx = -0.12; o.nrx = 0.52 + 0.03 * Math.sin(T * 0.4);
      both(o, 'lF', 1.2); o.kL = 0.45; o.kR = 0.62 + 0.1 * Math.max(0, Math.sin(T * 1.8)); o.lTR = 0.2 * Math.sin(T * 2.2);
      both(o, 'aO', 2.0); both(o, 'aF', 0.4); both(o, 'eS', -1.55); both(o, 'eB', 0.3);
    } else if (pose === 'front') {
      o.brx = Math.PI / 2; o.by = d.bodyR * d.bodyD * (1 + 0.17 * (s.belly || 0)) + 0.02; o.bz = -d.top * 0.45;
      o.nrx = -1.05 + 0.04 * Math.sin(T * 0.7); o.nry = 0.2 * noise(T * 0.2, s.seed);
      both(o, 'aO', 2.45); both(o, 'aF', 0.3); both(o, 'eS', -1.35); both(o, 'eB', 0.4);
      o.kL = 1.5 + 0.45 * Math.sin(T * 2.4); o.kR = 1.5 - 0.45 * Math.sin(T * 2.4); both(o, 'lO', 0.08); both(o, 'lF', -0.05);
      o.lid = 0.2; o.smile = 0.75; o.mouth = 0.1;
      return;
    } else {
      o.brx = -Math.PI / 2; o.by = 0.2; o.bz = d.top * 0.45;
      o.nrx = 0.5; o.nry = 0.15 * noise(T * 0.15, s.seed);
      o.hat = opt.hatOverFace === false ? 0 : 1;
      both(o, 'aO', 2.3); both(o, 'aF', 0.25); both(o, 'eS', -1.5); both(o, 'eB', 0.25);
      const knee = win(T % 14, 2, 9, 0.8, 0.8);
      o.lFL = -0.22 + 0.9 * knee; o.kL = 0.1 + 1.35 * knee; o.lFR = -0.22; o.kR = 0.08;
      o.lTR = 0.25 * Math.sin(T * 2.6); o.lTL = 0.1;
    }
    o.lid = opt.awake ? 0.2 : 0.88; o.smile = 0.85; o.mouth = 0.05; o.ssq = 0.03 * Math.sin(T * 1.5);
  },

  jig(o, t, s) { // happy sailor's hornpipe: hop-hop-kick with folded arms
    const T = t * s.tempo;
    const rate = 1.75;
    const h = hop(T, 1 / rate);
    const side = Math.floor(T * rate) % 2 ? 1 : -1;
    o.by = 0.13 * h * s.energy; o.bsq = 0.1 * (h - 0.4);
    const kick = h, stand = 0.25 * h;
    o.lFL = side > 0 ? 0.75 * kick : 0.05; o.kL = side > 0 ? 0.1 : 0.2 + stand;
    o.lFR = side < 0 ? 0.75 * kick : 0.05; o.kR = side < 0 ? 0.1 : 0.2 + stand;
    o.hrz = 0.1 * side * h; o.srz = -0.08 * side * h;
    if (s.seed % 2) foldArms(o);
    else { both(o, 'aO', 0.62); both(o, 'aF', -0.12); both(o, 'eS', 1.75); both(o, 'eB', 0.15); }
    o.nrz = 0.16 * Math.sin(T * rate * Math.PI); o.nrx = -0.1 + 0.06 * h;
    o.lid = 0.5; o.smile = 0.9; o.mouth = 0.45 + 0.2 * h; o.browY = 0.5;
  },

  shakeFist(o, t, s, opt) { // cross, fist in the air (Person pops a grumpy cloud now and then)
    const T = t * s.tempo + s.phase;
    const up = smooth(t / 0.2);
    const shake = Math.sin(T * 22);
    o.aOR = 1.7 * up; o.aFR = 0.5 * up; o.eSR = -(1.25 + 0.35 * shake) * up; o.eBR = 0.3 * up; o.wWR = 0.3 * shake;
    if (opt.both) { o.aOL = 1.7 * up; o.aFL = 0.5 * up; o.eSL = -(1.25 - 0.35 * shake) * up; o.eBL = 0.3 * up; }
    else { o.aOL = 0.62; o.aFL = -0.12; o.eSL = 1.75; o.eBL = 0.15; }
    const stomp = Math.max(0, Math.sin(T * 6.5)) * win(T % 3.1, 0.2, 1.7);
    o.lFL = 0.22 * stomp; o.kL = 0.45 * stomp; o.by = 0.02 * stomp;
    o.srx = 0.12; o.nrx = 0.05 + 0.04 * Math.sin(T * 11); o.nry = 0.1 * Math.sin(T * 3);
    o.lid = 0.3; o.lidT = 0.6; o.browT = 0.9; o.browY = -0.35; o.smile = -0.9; o.mouth = 0.35 + 0.3 * Math.max(0, Math.sin(T * 9));
  },

  pull(o, t, s, opt) { // tugging a rope / stuck door with both hands (opts.height = hand height in m)
    const T = t * s.tempo + s.phase;
    const d = s.d;
    const c = cyc(T, opt.period || 1.4);
    const heave = keys(c, [[0, 0], [0.16, 1], [0.35, 0.8], [1, 0]]);
    const lean = -0.3 - 0.28 * heave;
    o.srx = lean; o.hy = -0.06 - 0.03 * heave; o.hrx = -0.12;
    o.lFL = 0.5; o.kL = 0.6; o.lFR = -0.32; o.kR = 0.08; both(o, 'lO', 0.08);
    const hgt = (opt.height ?? 0.95) / s.scale;
    const phi = Math.atan2(d.shY - 0.1 - hgt, 0.5);
    const aF = Math.PI / 2 - phi - lean - 0.1;
    both(o, 'aF', aF); both(o, 'aT', 0.4); both(o, 'eB', 0.1 + 0.15 * (1 - heave)); both(o, 'aO', 0.02);
    o.bx = 0.012 * Math.sin(T * 38) * heave; o.bsq = -0.04 * heave;
    o.nrx = -lean * 0.6; o.lid = 0.5 + 0.35 * heave; o.browT = 0.7; o.browY = -0.2; o.mouth = 0.12 + 0.18 * heave; o.smile = -0.7;
  },

  impatient(o, t, s) { // arms folded, toe tapping, sighing (the chip-shop queue)
    const T = t * s.tempo + s.phase;
    breathe(o, T, s);
    foldArms(o);
    const tap = Math.max(0, Math.sin(T * 7.5));
    o.lFR = 0.1 * tap; o.kR = 0.14 * tap; o.lTR = 0.1;
    const sigh = bump(T % 6.5, 3.2, 4.2);
    o.ssq += 0.07 * sigh; o.nrx = -0.25 * sigh + 0.03; o.eyeY = 0.8 * sigh; o.lid = 0.3 + 0.2 * sigh;
    o.nry = 0.35 * noise(T * 0.3, s.seed) * (1 - sigh);
    o.browT = 0.35; o.smile = -0.4; o.mouth = 0.2 * sigh;
  },

  checkWatch(o, t, s) { // lifts the wrist, peers at the watch, taps it
    const T = t * s.tempo + s.phase;
    breathe(o, T, s);
    const look = win(T % 5.2, 0.3, 3.3, 0.3, 0.35);
    armsIdle(o, T, s, 'relaxed');
    o.aFL = lerp(o.aFL, 1.3, look); o.aTL = 0.75 * look; o.eBL = lerp(o.eBL, 1.6, look); o.aOL = lerp(o.aOL, 0.3, look); o.wBL = -0.3 * look;
    const tap = Math.max(0, Math.sin(T * 9)) * win(T % 5.2, 1.4, 2.6);
    o.aFR = lerp(o.aFR, 1.05, look); o.aTR = 0.72 * look; o.eBR = lerp(o.eBR, 1.7 + 0.15 * tap, look);
    o.nrx = 0.32 * look; o.nry = 0.28 * look + 0.4 * noise(T * 0.3, s.seed) * (1 - look); o.eyeY = -0.5 * look;
    o.lFR = 0.1 * Math.max(0, Math.sin(T * 7)) * (1 - look);
    o.browT = 0.4; o.smile = -0.35; o.mouth = 0.1 * tap;
  },

  lookout(o, t, s, opt) { // binoculars (auto-attached), slowly scanning the sea; opts.sit/height for a lifeguard chair
    const T = t * s.tempo + s.phase;
    if (opt.sit || opt.height) sitBase(o, T, s, opt);
    breathe(o, T, s, 0.5);
    const scan = 0.75 * Math.sin(T * 0.33) + 0.15 * Math.sin(T * 0.9);
    o.sry += 0.45 * scan; o.nry = 0.45 * scan; o.nrx = -0.06;
    both(o, 'aF', 2.05); both(o, 'aT', 0.5); both(o, 'eB', 0.4); both(o, 'aO', 0.08); both(o, 'wB', 0.3);
    o.lid = 0.05; o.smile = 0.1; o.browY = 0.2;
  },

  hawk(o, t, s) { // market trader holding up the catch: "Fresh fiiish!" (hand cupped to the mouth)
    const T = t * s.tempo + s.phase;
    breathe(o, T, s);
    const shout = win(T % 3.6, 0.4, 2.1, 0.15, 0.3);
    const jig = Math.sin(T * 7) * 0.12;
    o.aFR = 0.8 + jig; o.aOR = 0.85; o.aTR = -0.1; o.eBR = 0.35; o.wBR = 0.2;
    o.aFL = lerp(0.2, 1.25, shout); o.aTL = lerp(0.1, 0.68, shout); o.eBL = lerp(0.3, 2.0, shout); o.aOL = lerp(0.1, 0.3, shout);
    o.srx = -0.06 * shout; o.nrx = -0.12 * shout; o.nry = 0.2 * noise(T * 0.3, s.seed) * (1 - shout) - 0.15 * shout;
    o.mouth = shout * (0.55 + 0.35 * Math.max(0, Math.sin(T * 9))) + 0.1; o.browY = 0.6 * shout; o.smile = 0.5;
    o.by = 0.02 * Math.abs(Math.sin(T * 3.5)) * shout;
  },

  whistle(o, t, s) { // lifeguard blowing the whistle, other arm waving swimmers in
    const T = t * s.tempo + s.phase;
    const blow = win(T % 2.2, 0.15, 1.3, 0.06, 0.12);
    o.aFR = 1.25; o.aTR = 0.7; o.eBR = 2.05; o.aOR = 0.25;
    o.aOL = 1.9 + 0.35 * Math.sin(T * 7); o.aFL = 0.35; o.eBL = 0.1; o.eSL = 0.3 * Math.sin(T * 7 + 1);
    o.srx = 0.1 * blow; o.by = 0.03 * blow; o.bsq = 0.04 * blow; o.nrx = -0.05;
    o.lid = -0.2; o.browY = 0.85; o.browT = 0.2; o.smile = -0.2;
  },

  dig(o, t, s) { // kneeling in the sand with a spade (sandcastle builders)
    const T = t * s.tempo + s.phase;
    const d = s.d;
    o.by = -(d.kneeY - d.legR * 0.9); both(o, 'lF', 0.05); o.kL = o.kR = Math.PI / 2 + 0.05; both(o, 'lO', 0.12);
    o.srx = 0.45; o.nrx = 0.3;
    const c = cyc(T, 1.3);
    const scoop = keys(c, [[0, 0], [0.35, 1], [0.55, 0.9], [1, 0]]);
    o.aFR = 0.55 + 0.7 * scoop; o.eBR = 0.5 - 0.2 * scoop; o.aTR = 0.2; o.aOR = 0.15;
    o.aFL = 0.85 + 0.15 * Math.max(0, Math.sin(T * 9)); o.eBL = 0.45; o.aTL = 0.3; o.aOL = 0.1;
    o.smile = 0.6; o.mouth = 0.15; o.lid = 0.15; o.eyeY = -0.4;
  },

  alarm(o, t, s) { // "Over here! Help!": both arms waving overhead, hopping on the spot
    const T = t * s.tempo;
    const w = Math.sin(T * 9);
    const h = hop(T, 0.5);
    o.by = 0.09 * h * s.energy; o.bsq = 0.08 * (h - 0.4); o.kL = o.kR = 0.3 * h; o.lFL = o.lFR = 0.15 * h;
    o.aOL = 2.05 + 0.3 * w; o.aOR = 2.05 - 0.3 * w; o.aFL = o.aFR = 0.35; o.eBL = o.eBR = 0.15;
    o.wWL = 0.5 * w; o.wWR = -0.5 * w; o.srz = 0.08 * w; o.nrz = 0.1 * w; o.nrx = -0.12;
    o.mouth = 0.6 + 0.3 * Math.max(0, Math.sin(T * 11)); o.browY = 0.9; o.lid = -0.2; o.smile = -0.2;
  },

  chase(o, t, s) { // running after something, arms outstretched ("come back, deckchair!")
    const T = t * s.tempo;
    gait(o, s.gait, s, 1);
    both(o, 'aF', 1.35); o.aFL += 0.15 * Math.sin(T * 9); o.aFR += 0.15 * Math.sin(T * 9 + 2);
    both(o, 'eB', 0.2); both(o, 'aO', 0.15); both(o, 'aT', 0.12);
    o.srx = 0.3; o.mouth = 0.85; o.browY = 0.9; o.smile = -0.6; o.lid = -0.2;
  },
};

// Actions that want held props (auto-attached if the person has none). fn(s, opts) -> list, or a list.
export const ACTION_PROPS = {
  sweep: [{ type: 'broom' }], fish: [{ type: 'rod' }], paint: [{ type: 'brush' }], dig: [{ type: 'spade' }],
  read: [{ type: 'newspaper', bone: 'spine' }], photo: [{ type: 'camera', bone: 'head' }], lookout: [{ type: 'binoculars', bone: 'head' }],
  eat: (s, opt) => ((opt.food || s.food) === 'chips' ? [{ type: 'chips' }, { type: 'chipfork' }] : [{ type: 'icecream' }]),
};
/** Actions played in water (root on the surface; body below it is hidden). */
export const WATER_ACTIONS = new Set(['swim', 'tread']);
/** Actions sitting/lying on something: a bad hit keeps the character on it. */
export const SEATED_ACTIONS = new Set(['sit', 'sleep', 'row', 'paddle']);
/**
 * Automatic tell stickers: action -> [icon, period s, duration s, size factor, first delay s].
 * They read unscoped from the perch (see icons.js TELL). Pass { icon: false } in the action options
 * (Crowd does for its background extras) or set person.autoIcons = false to keep someone quiet.
 */
export const ACTION_ICONS = {
  scratch: ['question', 3.2, 1.5, 1, 0.3], shrug: ['question', 3.0, 1.3, 1, 0.4], lookUp: ['question', 3.4, 1.5, 1, 0.5],
  point: ['bang', 3.0, 1.3, 1, 0.3], panic: ['bang', 1.7, 1.0, 1, 0.1], alarm: ['bang', 1.5, 1.0, 1.05, 0.1],
  whistle: ['bang', 2.2, 0.9, 0.9, 0.2], dance: ['note', 1.8, 1.0, 0.9, 0.3], jig: ['note', 1.9, 1.0, 0.9, 0.3],
  shakeFist: ['anger', 3.4, 1.3, 0.9, 0.3], angry: ['anger', 3.6, 1.3, 0.9, 0.4],
};
export const ACTION_NAMES = Object.keys(ACTIONS);
export const GAIT_ACTIONS = new Set(['walk', 'run', 'panic', 'chase']);

// ---- one-shot overlays ------------------------------------------------------------------------
/** Bad-hit reaction timeline. Returns overlay weight. */
export function reactPose(o, t, s) {
  const e = s.energy;
  const anticip = win(t, 0, 0.12, 0.03, 0.05);
  const air = clamp((t - 0.1) / 0.52, 0, 1);
  const jump = 4 * air * (1 - air) * (air > 0 && air < 1 ? 1 : 0);
  o.by = 0.5 * jump * (0.8 + 0.2 * e);
  o.bsq = -0.28 * anticip + 0.12 * jump * (air < 0.5 ? 1 : 0) - 0.22 * bump(t, 0.6, 0.78);
  o.bry = TAU * smooth(air) * s.reactSpin;
  const flail = win(t, 0.08, 0.72, 0.06, 0.1);
  o.aOL = 2.0 * flail + 0.3 * anticip; o.aOR = 2.0 * flail + 0.3 * anticip;
  o.aFL = (0.35 + 0.35 * Math.sin(t * 30)) * flail; o.aFR = (0.35 + 0.35 * Math.sin(t * 30 + 1)) * flail;
  o.eBL = o.eBR = 0.5 * flail;
  o.kL = o.kR = 1.1 * jump; o.lFL = o.lFR = 0.5 * jump;
  // angry fist shake
  const fist = win(t, 0.78, 2.05, 0.18, 0.3);
  o.bry += s.reactFace * fist;
  const shake = Math.sin(t * 24);
  o.aOR += 1.7 * fist; o.aFR += 0.5 * fist; o.eSR = -(1.25 + 0.35 * shake) * fist; o.eBR += 0.3 * fist; o.wWR = 0.3 * shake * fist;
  o.aOL += 0.62 * fist; o.aFL += -0.12 * fist; o.eSL = 1.75 * fist; o.eBL += 0.15 * fist;
  o.srx = 0.13 * fist; o.nrx = 0.05 * fist - 0.12 * flail; o.nry = 0.12 * Math.sin(t * 7) * fist;
  const stomp = Math.max(0, Math.sin(t * 13)) * fist;
  o.lFL += 0.2 * stomp; o.kL += 0.45 * stomp;
  // face: shocked then cross
  const shock = win(t, 0, 0.9, 0.04, 0.2);
  o.lid = -0.2 * shock + 0.3 * fist; o.lidT = 0.6 * fist;
  o.browY = 1.0 * shock - 0.35 * fist; o.browT = 0.9 * fist;
  o.mouth = 0.85 * shock + (0.35 + 0.3 * Math.max(0, Math.sin(t * 17))) * fist;
  o.smile = -0.9 * Math.max(shock, fist);
  o.eyeY = 0.3 * shock;
  return win(t, 0, 2.6, 0.05, 0.45);
}
export const REACT_DURATION = 2.6;

/** Job-complete celebration: two happy hops, arms up. */
export function celebratePose(o, t, s) {
  const per = 0.55;
  const h = t < per * 2 ? hop(t, per) : 0;
  o.by = 0.28 * h * s.energy;
  o.bsq = 0.14 * (h - 0.3);
  o.kL = o.kR = 0.5 * h; o.lFL = o.lFR = 0.25 * h;
  o.aOL = o.aOR = 2.05; o.aFL = o.aFR = 0.45; o.eBL = o.eBR = 0.3 + 0.3 * Math.sin(t * 12);
  o.wWL = o.wWR = 0.4 * Math.sin(t * 12);
  o.nrx = -0.2; o.lid = 0.45; o.smile = 0.8; o.mouth = 0.8; o.browY = 0.8;
  o.bry = t > per * 2 ? 0 : 0;
  return win(t, 0, 1.6, 0.08, 0.35);
}
export const CELEBRATE_DURATION = 1.6;
