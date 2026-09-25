// Procedural pose library for the bean folk. Every action is a pure function of time + the
// person's personality state, writing named channels (see PersonPose). Right-side channels are
// mirrored (same number = same pose on both sides). Angles in radians.
//   aF* arm swing forward   aO* arm raise outward   aT* arm yaw inward   eB* elbow bend   eS* elbow bend inward
//   wB* wrist bend          wW* wrist wiggle        lF* leg forward      lO* leg outward  lT* toe-out  k* knee
// Arms use Euler 'YZX': aF > ~1.6 flips the meaning of aO, and for raised arms (aO > ~1.4) a NEGATIVE eS
// bends the forearm up/over the head. Stubby arms cannot reach above the head: keep hands beside it.
import { createPoseType, TAU, clamp, noise, hop, smooth, bump, win } from './anim.js';

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
]);

const both = (o, k, v) => { o[k + 'L'] = v; o[k + 'R'] = v; };
const ARM_KEYS = ['aFL', 'aOL', 'aTL', 'eBL', 'eSL', 'wBL', 'wWL', 'aFR', 'aOR', 'aTR', 'eBR', 'eSR', 'wBR', 'wWR'];
const _listen = Object.fromEntries(ARM_KEYS.map((k) => [k, 0]));

// ---- shared building blocks -----------------------------------------------------------------
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

  eat(o, t, s) {
    const T = t * s.tempo + s.phase;
    breathe(o, T, s);
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
};

// Actions that want a held prop (auto-attached if the person has none).
export const ACTION_PROPS = {
  sweep: { type: 'broom' }, fish: { type: 'rod' }, eat: { type: 'icecream' }, paint: { type: 'brush' },
  read: { type: 'newspaper', bone: 'spine' }, photo: { type: 'camera', bone: 'head' },
};
export const ACTION_NAMES = Object.keys(ACTIONS);
export const GAIT_ACTIONS = new Set(['walk', 'run', 'panic']);

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
