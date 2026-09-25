// Chunky toy quadrupeds: Dog, Cat, Cow, Sheep. Shared rig:
// base -> body -> head -> jaw/eyes/earL/earR, body -> tail(-> tail2), body -> legFL/legFR/legBL/legBR.
import * as THREE from 'three';
import { RigBuilder, G, tf, shade, mix } from '../rig.js';
import { P } from '../../../gfx/palette.js';
import { hash3 } from '../../../core/rng.js';
import { Animal, beadEye, cartoonEye } from './Animal.js';
import { TAU, clamp, noise, win, hop, smooth, bump } from '../anim.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Point + outward normal on an ellipsoid (centre c, radii r) in direction yaw/elev (0,0 = +Z). */
function onHead(c, r, yaw, elev, inset = 0) {
  const dir = V(Math.sin(yaw) * Math.cos(elev), Math.sin(elev), Math.cos(yaw) * Math.cos(elev));
  const k = 1 / Math.sqrt((dir.x / r.x) ** 2 + (dir.y / r.y) ** 2 + (dir.z / r.z) ** 2);
  const p = dir.clone().multiplyScalar(k);
  const n = V(p.x / (r.x * r.x), p.y / (r.y * r.y), p.z / (r.z * r.z)).normalize();
  return { p: p.add(c).addScaledVector(n, -inset), n };
}
const blob = (rb, bone, c, r, yaw, elev, size, col, flat = 0.35) => {
  const { p, n } = onHead(c, r, yaw, elev, size * flat * 0.6);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), n);
  rb.add(G.sphere(8, 6), col, new THREE.Matrix4().compose(p, q, V(size, size * 0.9, size * flat)), bone);
};

function quadRig(d) {
  const rb = new RigBuilder();
  const b = {};
  b.base = rb.bone('base', null, [0, 0, 0]);
  b.body = rb.bone('body', b.base, [0, d.bodyY, 0]);
  b.head = rb.bone('head', b.body, [0, d.neckY, d.neckZ]);
  b.jaw = rb.bone('jaw', b.head, d.jaw);
  b.eyes = rb.bone('eyes', b.head, [0, d.eyeY, d.eyeZ]);
  b.earL = rb.bone('earL', b.head, [d.earX, d.earY, d.earZ]);
  b.earR = rb.bone('earR', b.head, [-d.earX, d.earY, d.earZ]);
  b.tail = rb.bone('tail', b.body, [0, d.tailY, d.tailZ]);
  if (d.tail2) b.tail2 = rb.bone('tail2', b.tail, d.tail2);
  b.legFL = rb.bone('legFL', b.body, [d.legX, d.hipY, d.legZF]);
  b.legFR = rb.bone('legFR', b.body, [-d.legX, d.hipY, d.legZF]);
  b.legBL = rb.bone('legBL', b.body, [d.legX, d.hipY, d.legZB]);
  b.legBR = rb.bone('legBR', b.body, [-d.legX, d.hipY, d.legZB]);
  return { rb, b };
}

function stubbyLegs(rb, b, d, col, pawCol, r) {
  const L = d.hipY;
  for (const [bn, x, z] of [['legFL', d.legX, d.legZF], ['legFR', -d.legX, d.legZF], ['legBL', d.legX, d.legZB], ['legBR', -d.legX, d.legZB]]) {
    rb.add(G.capsule(r, L - r, 2, 7), col, { x, y: L / 2 + 0.01, z }, b[bn]);
    rb.add(G.sphere(7, 5), pawCol, { x, y: r * 0.7, z: z + r * 0.35, sx: r * 1.2, sy: r * 0.75, sz: r * 1.4 }, b[bn]);
  }
}

// trot/walk gait on the generic channels (diagonal pairs)
function quadWalk(o, g, amp, bounce, e = 1) {
  const sg = Math.sin(g);
  o.legFL = amp * sg; o.legBR = amp * sg; o.legFR = -amp * sg; o.legBL = -amp * sg;
  o.by = bounce * Math.abs(Math.cos(g)) * e; o.body = 0.03 * Math.sin(2 * g); o.roll = 0.05 * Math.cos(g);
  o.head = 0.06 * Math.sin(2 * g + 0.5); o.tailY = 0.25 * Math.sin(g);
}

// ------------------------------------------------------------------------------ Dog
export class Dog extends Animal {
  static species = 'dog';
  static variants(rng) {
    return rng.pick([
      { coat: '#c8894a', light: '#f4e6d0', patch: '#7a4a26', ear: '#7a4a26' },
      { coat: '#fbf7f0', light: '#fbf7f0', patch: '#2b2b3a', ear: '#2b2b3a' },
      { coat: '#e3b56b', light: '#fbefd9', patch: '#c8894a', ear: '#c8894a' },
      { coat: '#5a5f6e', light: '#c9ccd4', patch: '#34384a', ear: '#34384a' },
      { coat: '#2b2b3a', light: '#c8894a', patch: '#2b2b3a', ear: '#2b2b3a' },
    ]);
  }

  static build(c) {
    const d = {
      bodyY: 0.24, neckY: 0.33, neckZ: 0.13, jaw: [0, 0.36, 0.28], eyeY: 0.46, eyeZ: 0.3, earX: 0.13, earY: 0.53, earZ: 0.17,
      tailY: 0.3, tailZ: -0.18, hipY: 0.16, legX: 0.08, legZF: 0.12, legZB: -0.12,
    };
    const { rb, b } = quadRig(d);
    rb.add(G.capsule(0.13, 0.16, 4, 12), (x, y, z, col) => col.set(y < -0.06 && z > -0.04 ? c.light : c.coat), { y: d.bodyY + 0.02, rx: Math.PI / 2 }, b.body);
    const hc = V(0, 0.44, 0.2), hr = V(0.165, 0.15, 0.15);
    rb.add(G.sphere(12, 9), c.coat, { x: hc.x, y: hc.y, z: hc.z, sx: hr.x, sy: hr.y, sz: hr.z }, b.head);
    rb.add(G.sphere(10, 7), c.light, { y: 0.39, z: 0.33, sx: 0.085, sy: 0.065, sz: 0.08 }, b.head);
    rb.add(G.sphere(8, 6), '#2b2b3a', { y: 0.425, z: 0.405, sx: 0.036, sy: 0.027, sz: 0.026 }, b.head);
    rb.add(G.sphere(8, 5), shade(c.light, 0.9), { y: 0.345, z: 0.31, sx: 0.065, sy: 0.03, sz: 0.06 }, b.jaw);
    rb.add(G.sphere(6, 4), '#ff7e95', { y: 0.34, z: 0.35, sx: 0.032, sy: 0.012, sz: 0.045 }, b.jaw);
    if (c.patch !== c.coat) blob(rb, b.head, hc, hr, 0.4, 0.22, 0.075, c.patch);
    for (const s of [1, -1]) {
      const e = onHead(hc, hr, s * 0.4, 0.22, 0.012);
      cartoonEye(rb, b.eyes, e.p, e.n, 0.04, '#262634', V(0, 0, 1));
      rb.add(G.sphere(8, 6), c.ear, { x: s * 0.155, y: 0.43, z: 0.16, sx: 0.04, sy: 0.11, sz: 0.07, rz: s * 0.3 }, s > 0 ? b.earL : b.earR);
    }
    rb.add(G.torus(0.1, 0.018, 4, 14), P.tomato, { y: 0.33, z: 0.15, rx: Math.PI / 2 - 0.5 }, b.body);
    rb.add(G.cyl(0.022, 0.022, 0.006, 8), P.gold, { y: 0.27, z: 0.24, rx: 1.2 }, b.body);
    rb.add(G.capsule(0.03, 0.12, 2, 6), c.coat, { y: 0.38, z: -0.23, rx: -0.6 }, b.tail);
    rb.add(G.sphere(6, 4), c.light, { y: 0.44, z: -0.27, s: 0.035 }, b.tail);
    stubbyLegs(rb, b, d, c.coat, c.light, 0.05);
    const bp = rb.build();
    bp.meta = { height: 0.6, length: 0.6, shadow: 0.5, shadowZ: 1.4, headZ: 0.3, hop: 0.25 };
    return bp;
  }

  get defaultAction() { return 'idle'; }
  get gaitActions() { return QUAD_GAIT; }
  get stride() { return 0.34; }
  get defaultSpeed() { return 0.9; }
  get jawOpen() { return 0.45; }
  get reactDuration() { return 2.0; }
  applyPose(o) {
    super.applyPose(o);
    const B = this.bones;
    B.earL.rotation.set(o.earL, 0, -o.earL * 0.4);
    B.earR.rotation.set(o.earR, 0, o.earR * 0.4);
  }
  reactPose(o, t) {
    const w = super.reactPose(o, t);
    const bark = win(t, 0.6, 1.9, 0.1, 0.2);
    o.jaw = Math.max(o.jaw, Math.max(0, Math.sin(t * 16)) * bark); o.head -= 0.3 * bark;
    o.legFL = o.legFR = -0.35 * bark; o.body -= 0.1 * bark; o.tailX = 0.6;
    return w;
  }
}
const QUAD_GAIT = new Set(['walk', 'run', 'trot']);
Dog.ACTIONS = {
  idle(o, t, s) {
    const T = t * s.tempo + s.phase;
    o.jaw = 0.35 + 0.1 * Math.sin(T * 11); o.bsq = 0.02 * Math.sin(T * 11); // panting
    o.headY = 0.5 * noise(T * 0.3, s.seed); o.headZ = 0.25 * noise(T * 0.2, s.seed + 1) * win(T % 7, 3, 5);
    o.tailY = 0.5 * Math.sin(T * 6); o.tailX = 0.2;
    o.earL = 0.15 * Math.sin(T * 1.1); o.earR = 0.15 * Math.sin(T * 1.3 + 1);
  },
  walk(o, t, s) { quadWalk(o, s.gait, 0.5, 0.015); o.jaw = 0.3; o.tailY = 0.5 * Math.sin(s.gait * 2); o.tailX = 0.3; },
  run(o, t, s) {
    const g = s.gait;
    o.legFL = o.legFR = 0.8 * Math.sin(g); o.legBL = o.legBR = -0.8 * Math.sin(g);
    o.by = 0.05 * Math.abs(Math.sin(g)); o.body = 0.15 * Math.cos(g); o.jaw = 0.5; o.earL = o.earR = -0.6; o.tailX = 0.1;
  },
  sit(o, t, s) {
    const T = t * s.tempo + s.phase;
    o.body = -0.55; o.by = -0.05; o.bz = -0.04; o.legFL = o.legFR = -0.5; o.legBL = o.legBR = 1.2;
    o.head = 0.4; o.jaw = 0.3 + 0.08 * Math.sin(T * 10); o.tailY = 0.35 * Math.sin(T * 5); o.tailX = -0.6;
    o.headZ = 0.3 * noise(T * 0.25, s.seed) * win(T % 6, 2, 4);
  },
  wag(o, t, s) {
    const T = t * s.tempo;
    Dog.ACTIONS.sit(o, t, s);
    o.tailY = 0.9 * Math.sin(T * 22); o.bsq = 0.04 * Math.abs(Math.sin(T * 11)); o.by += 0.03 * Math.abs(Math.sin(T * 5.5));
    o.jaw = 0.55; o.earL = o.earR = 0.4 + 0.2 * Math.sin(T * 11); o.headZ = 0.2 * Math.sin(T * 3);
  },
  bark(o, t, s) {
    const T = t * s.tempo + s.phase;
    const k = Math.max(0, Math.sin(T * 9)) * win(T % 2.4, 0.2, 1.4, 0.05, 0.1);
    o.legFL = o.legFR = -0.35; o.legBL = o.legBR = 0.15; o.body = -0.15 + 0.1 * k; o.by = 0.02 * k;
    o.head = -0.35 - 0.2 * k; o.jaw = 0.1 + 0.9 * k; o.tailX = 0.5; o.tailY = 0.3 * Math.sin(T * 15);
    o.earL = o.earR = -0.3 * k; o.bsq = -0.06 * k;
  },
  sniff(o, t, s) {
    const T = t * s.tempo + s.phase;
    o.body = 0.2; o.head = 0.75; o.headY = 0.45 * Math.sin(T * 1.3); o.jaw = 0.05 * Math.abs(Math.sin(T * 14));
    o.tailX = 0.5; o.tailY = 0.2 * Math.sin(T * 7); o.legFL = 0.1 * Math.sin(T * 1.3);
  },
  sleep(o, t, s) {
    const T = t + s.phase;
    o.by = -0.15; o.legFL = o.legFR = -1.3; o.legBL = o.legBR = 1.3; o.head = 0.45; o.headZ = 0.3;
    o.lid = 1; o.bsq = 0.04 * Math.sin(T * 1.5); o.tailX = -0.9; o.tailY = 0.8; o.earL = o.earR = 0.3;
  },
};

// ------------------------------------------------------------------------------ Cat
export class Cat extends Animal {
  static species = 'cat';
  static variants(rng) {
    return rng.pick([
      { coat: '#f0a04a', stripe: '#d9772a', light: '#fbefd9' }, { coat: '#2f3140', stripe: '#2f3140', light: '#fbf7f0' },
      { coat: '#9aa0ab', stripe: '#6f7686', light: '#e8e4dc' }, { coat: '#fbf7f0', stripe: '#fbf7f0', light: '#fbf7f0' },
    ]);
  }

  static build(c) {
    const d = {
      bodyY: 0.2, neckY: 0.28, neckZ: 0.12, jaw: [0, 0.3, 0.25], eyeY: 0.35, eyeZ: 0.25, earX: 0.065, earY: 0.43, earZ: 0.19,
      tailY: 0.24, tailZ: -0.17, tail2: [0, 0.4, -0.25], hipY: 0.15, legX: 0.06, legZF: 0.1, legZB: -0.1,
    };
    const { rb, b } = quadRig(d);
    const stripes = (x, y, z, col) => col.set(y < -0.07 ? c.light : Math.sin(z * 45) > 0.45 ? c.stripe : c.coat);
    rb.add(G.capsule(0.1, 0.18, 4, 12), (x, y, z, col) => stripes(x, y, -z, col), { y: d.bodyY + 0.01, rx: Math.PI / 2 }, b.body);
    rb.add(G.sphere(12, 9), (x, y, z, col) => col.set(y < -0.04 && z > 0.02 ? c.light : c.coat), { y: 0.35, z: 0.2, sx: 0.12, sy: 0.105, sz: 0.1 }, b.head);
    rb.add(G.sphere(6, 4), '#ff9eb0', { y: 0.33, z: 0.3, sx: 0.016, sy: 0.012, sz: 0.012 }, b.head);
    rb.add(G.sphere(8, 5), c.light, { y: 0.305, z: 0.27, sx: 0.04, sy: 0.022, sz: 0.035 }, b.jaw);
    for (const s of [1, -1]) {
      cartoonEye(rb, b.eyes, V(s * 0.048, d.eyeY, 0.28), V(s * 0.45, 0.1, 0.9), 0.028, '#3a7a3a', V(0, 0, 1));
      rb.add(G.cone(0.04, 0.08, 4), c.coat, { x: s * 0.065, y: 0.45, z: 0.19, rz: -s * 0.3, ry: Math.PI / 4 }, s > 0 ? b.earL : b.earR);
      rb.add(G.cone(0.022, 0.05, 4), '#ffb8c2', { x: s * 0.064, y: 0.44, z: 0.205, rz: -s * 0.3, ry: Math.PI / 4 }, s > 0 ? b.earL : b.earR);
    }
    rb.add(G.capsule(0.022, 0.16, 2, 6), stripes, { y: 0.31, z: -0.2, rx: -0.9 }, b.tail);
    rb.add(G.capsule(0.022, 0.16, 2, 6), (x, y, z, col) => col.set(y > 0.07 ? c.light : c.coat), { y: 0.45, z: -0.26, rx: 0.15 }, b.tail2);
    stubbyLegs(rb, b, d, c.coat, c.light, 0.034);
    const bp = rb.build();
    bp.meta = { height: 0.47, length: 0.5, shadow: 0.38, shadowZ: 1.4, headZ: 0.25, hop: 0.3 };
    return bp;
  }

  get defaultAction() { return 'sit'; }
  get gaitActions() { return QUAD_GAIT; }
  get stride() { return 0.26; }
  get defaultSpeed() { return 0.6; }
  get jawOpen() { return 0.5; }
  get reactDuration() { return 1.6; }
  applyPose(o) {
    super.applyPose(o);
    this.bones.earL.rotation.set(0, 0, -o.earL * 0.5);
    this.bones.earR.rotation.set(0, 0, o.earR * 0.5);
    this.bones.legFL.rotation.x = -o.legFL - o.pawL;
  }
  reactPose(o, t) { // arched back hiss + puffed tail + hop
    const w = super.reactPose(o, t);
    const k = win(t, 0.3, 1.5, 0.1, 0.25);
    o.body = 0; o.bsq += 0.1 * k; o.tailX = 0.9 * k + 0.4; o.tail2 = -0.4 * k; o.jaw = 0.9 * k; o.earL = o.earR = 1.0 * k;
    o.head = -0.1 * k;
    return w;
  }
}
Cat.ACTIONS = {
  idle(o, t, s) { Cat.ACTIONS.sit(o, t, s); },
  sit(o, t, s) {
    const T = t * s.tempo + s.phase;
    o.body = -0.75; o.by = -0.04; o.bz = -0.05; o.legFL = o.legFR = -0.7; o.legBL = o.legBR = 1.4;
    o.head = 0.55; o.headY = 0.4 * noise(T * 0.25, s.seed); o.tailX = -1.2; o.tail2 = 0.9; o.tailY = 0.6 + 0.25 * Math.sin(T * 1.7);
    o.earL = 0.2 * win(T % 5, 3, 3.3); o.bsq = 0.015 * Math.sin(T * 2);
  },
  lick(o, t, s) {
    const T = t * s.tempo + s.phase;
    Cat.ACTIONS.sit(o, t, s);
    const lick = Math.max(0, Math.sin(T * 7));
    o.pawL = 2.0; o.head = 0.8 + 0.12 * lick; o.headY = 0.35; o.headZ = -0.3; o.jaw = 0.4 * lick; o.lid = 0.6;
  },
  swish(o, t, s) {
    const T = t * s.tempo + s.phase;
    o.tailX = 0.4; o.tailY = 0.9 * Math.sin(T * 2.5); o.tail2 = 0.4 * Math.sin(T * 2.5 - 1);
    o.headY = 0.4 * noise(T * 0.3, s.seed); o.bsq = 0.015 * Math.sin(T * 2);
  },
  walk(o, t, s) { quadWalk(o, s.gait, 0.45, 0.01); o.tailX = 0.5; o.tail2 = -0.5; o.tailY = 0.2 * Math.sin(s.gait); },
  run(o, t, s) {
    const g = s.gait;
    o.legFL = o.legFR = 0.9 * Math.sin(g); o.legBL = o.legBR = -0.9 * Math.sin(g); o.by = 0.05 * Math.abs(Math.sin(g));
    o.body = 0.15 * Math.cos(g); o.tailX = 0.1; o.earL = o.earR = 0.5;
  },
  sleep(o, t, s) { // curled up loaf with the tail wrapped round
    const T = t + s.phase;
    o.by = -0.1; o.legFL = o.legFR = -1.45; o.legBL = o.legBR = 1.45; o.head = 0.6; o.headY = 0.9; o.headZ = 0.5;
    o.lid = 1; o.tailX = -1.4; o.tailY = 1.3; o.tail2 = 0.6; o.bsq = -0.12 + 0.03 * Math.sin(T * 1.6); o.yaw = 0.4;
  },
};

// ------------------------------------------------------------------------------ Cow
export class Cow extends Animal {
  static species = 'cow';
  static variants(rng) {
    return rng.pick([{ coat: '#fbf7f0', patch: '#2b2b3a' }, { coat: '#fbf7f0', patch: '#8a4a26' }, { coat: '#b8733a', patch: '#fbf7f0' }]);
  }

  static build(c) {
    const d = {
      bodyY: 0.62, neckY: 0.8, neckZ: 0.5, jaw: [0, 0.72, 0.84], eyeY: 0.98, eyeZ: 0.8, earX: 0.25, earY: 0.98, earZ: 0.6,
      tailY: 0.86, tailZ: -0.58, hipY: 0.42, legX: 0.21, legZF: 0.36, legZB: -0.36,
    };
    const { rb, b } = quadRig(d);
    const bc = V(0, d.bodyY + 0.04, 0), br = V(0.36, 0.34, 0.62);
    rb.add(G.capsule(0.35, 0.54, 5, 14), c.coat, { y: bc.y, rx: Math.PI / 2, sz: 0.97 }, b.body);
    // a few big crisp patches sitting on the hide
    // patches on the capsule hide: angle around the long axis (0 = top, +x side positive) and z along it
    for (const [ang, z, sz] of [[0.9, 0.12, 0.2], [-1.2, -0.22, 0.24], [0.2, -0.4, 0.19], [-0.5, 0.3, 0.15], [1.6, -0.3, 0.17], [-1.9, 0.2, 0.14]]) {
      const n = V(Math.sin(ang), Math.cos(ang), 0);
      const p = V(0, bc.y, z).addScaledVector(n, 0.35 * 1.0 - sz * 0.3 * 0.5);
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), n);
      rb.add(G.sphere(8, 6), c.patch, new THREE.Matrix4().compose(p, q, V(sz * 0.9, sz * 1.2, sz * 0.3)), b.body);
    }
    const hc = V(0, 0.94, 0.72), hr = V(0.25, 0.24, 0.22);
    rb.add(G.sphere(12, 9), c.coat, { x: hc.x, y: hc.y, z: hc.z, sx: hr.x, sy: hr.y, sz: hr.z }, b.head);
    blob(rb, b.head, hc, hr, -0.5, 0.5, 0.12, c.patch, 0.3);
    rb.add(G.sphere(10, 8), '#ffb8b0', { y: 0.8, z: 0.88, sx: 0.2, sy: 0.13, sz: 0.13 }, b.head);
    for (const s of [1, -1]) rb.add(G.sphere(5, 4), '#c8756a', { x: s * 0.075, y: 0.82, z: 1.005, sx: 0.028, sy: 0.034, sz: 0.012 }, b.head);
    rb.add(G.sphere(8, 5), '#f59c95', { y: 0.715, z: 0.86, sx: 0.15, sy: 0.05, sz: 0.1 }, b.jaw);
    for (const s of [1, -1]) {
      const e = onHead(hc, hr, s * 0.45, 0.22, 0.015);
      cartoonEye(rb, b.eyes, e.p, e.n, 0.058, '#262634', V(0, 0, 1));
      rb.add(G.sphere(8, 5), c.coat, { x: s * 0.3, y: 0.97, z: 0.64, sx: 0.12, sy: 0.05, sz: 0.075, rz: s * -0.2 }, s > 0 ? b.earL : b.earR);
      rb.add(G.cone(0.04, 0.13, 6), '#f4ead0', { x: s * 0.13, y: 1.18, z: 0.66, rz: -s * 0.55 }, b.head);
    }
    rb.add(G.cyl(0.065, 0.075, 0.08, 8), P.gold, { y: 0.62, z: 0.62 }, b.head);
    rb.add(G.torus(0.21, 0.022, 4, 14), '#8a4a26', { y: 0.74, z: 0.52, rx: Math.PI / 2 - 0.9 }, b.body);
    rb.add(G.sphere(10, 7), '#ffb8c2', { y: 0.33, z: -0.18, sx: 0.14, sy: 0.08, sz: 0.12 }, b.body);
    rb.add(G.cyl(0.02, 0.014, 0.46, 5), c.coat, { y: 0.66, z: -0.64, rx: 0.12 }, b.tail);
    rb.add(G.sphere(6, 5), c.patch === '#fbf7f0' ? '#2b2b3a' : c.patch, { y: 0.41, z: -0.67, sx: 0.05, sy: 0.085, sz: 0.05 }, b.tail);
    for (const [bn, x, z] of [['legFL', d.legX, d.legZF], ['legFR', -d.legX, d.legZF], ['legBL', d.legX, d.legZB], ['legBR', -d.legX, d.legZB]]) {
      rb.add(G.capsule(0.1, 0.24, 2, 8), c.coat, { x, y: 0.25, z }, b[bn]);
      rb.add(G.cyl(0.1, 0.108, 0.1, 8), '#34384a', { x, y: 0.05, z }, b[bn]);
    }
    const bp = rb.build();
    bp.meta = { height: 1.25, length: 1.6, shadow: 1.2, shadowZ: 1.3, headZ: 0.8, hop: 0.3 };
    return bp;
  }

  get defaultAction() { return 'graze'; }
  get gaitActions() { return QUAD_GAIT; }
  get stride() { return 0.7; }
  get defaultSpeed() { return 0.6; }
  get jawOpen() { return 0.35; }
  get reactDuration() { return 1.8; }
  applyPose(o) {
    super.applyPose(o);
    this.bones.earL.rotation.set(0, 0, -o.earL * 0.6);
    this.bones.earR.rotation.set(0, 0, o.earR * 0.6);
  }
  reactPose(o, t) {
    const w = super.reactPose(o, t);
    const moo = win(t, 0.5, 1.6, 0.1, 0.2);
    o.head = -0.4 * moo; o.jaw = 0.9 * moo; o.lid = 0.7 * moo; o.tailX = 1.0;
    return w;
  }
}
Cow.ACTIONS = {
  idle(o, t, s) {
    const T = t * s.tempo + s.phase;
    o.jaw = 0.25 * Math.max(0, Math.sin(T * 5)); o.headY = 0.3 * noise(T * 0.2, s.seed); o.head = 0.05;
    o.tailY = 0.4 * Math.sin(T * 1.5) * win(T % 6, 0, 3); o.tailX = 0.05;
    o.earL = 0.4 * win(T % 5, 2, 2.3); o.earR = 0.4 * win(T % 7, 4, 4.3); o.bsq = 0.01 * Math.sin(T * 1.2);
  },
  graze(o, t, s) {
    const T = t * s.tempo + s.phase;
    const up = win(T % 12, 8, 10.5, 0.6, 0.6);
    o.head = 0.95 * (1 - up) + 0.05; o.neckY = 0; o.headY = 0.25 * Math.sin(T * 0.5) * (1 - up);
    o.jaw = 0.2 * Math.max(0, Math.sin(T * 6)); o.tailY = 0.5 * Math.sin(T * 1.3) * win(T % 5, 0, 2.5);
    o.earL = 0.3 * win(T % 5, 2, 2.3); o.earR = 0.3 * win(T % 6, 1, 1.3);
    const step = win(T % 12, 4, 5.2, 0.3, 0.3);
    o.legFL = 0.25 * step * Math.sin(T * 5); o.legBR = 0.25 * step * Math.sin(T * 5);
  },
  walk(o, t, s) { quadWalk(o, s.gait, 0.35, 0.02); o.head = 0.2; o.tailY = 0.3 * Math.sin(s.gait); },
  moo(o, t, s) {
    const T = t * s.tempo + s.phase;
    const k = win(T % 4, 0.5, 2.2, 0.2, 0.3);
    o.head = -0.45 * k; o.jaw = 0.85 * k; o.lid = 0.6 * k; o.bsq = 0.03 * k; o.tailX = 0.2 * k;
  },
  sleep(o, t, s) {
    const T = t + s.phase;
    o.by = -0.32; o.legFL = o.legFR = -1.4; o.legBL = o.legBR = 1.4; o.head = 0.2; o.lid = 1; o.bsq = 0.02 * Math.sin(T * 1.2);
  },
};

// ------------------------------------------------------------------------------ Sheep
export class Sheep extends Animal {
  static species = 'sheep';
  static variants(rng) { return { wool: rng.pick(['#f4efe4', '#f4efe4', '#fbf7f0', '#e8dcc4', '#5a5a68']), face: rng.pick(['#2b2b3a', '#2b2b3a', '#3d3440']) }; }

  static build(c) {
    const d = {
      bodyY: 0.42, neckY: 0.5, neckZ: 0.3, jaw: [0, 0.47, 0.54], eyeY: 0.6, eyeZ: 0.52, earX: 0.13, earY: 0.6, earZ: 0.44,
      tailY: 0.5, tailZ: -0.36, hipY: 0.28, legX: 0.13, legZF: 0.18, legZB: -0.18,
    };
    const { rb, b } = quadRig(d);
    rb.add(G.sphere(10, 8), c.wool, { y: d.bodyY, sx: 0.29, sy: 0.25, sz: 0.36 }, b.body);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      rb.add(G.sphere(7, 5), shade(c.wool, 0.96 + (i % 3) * 0.025), { x: Math.cos(a) * 0.24, y: d.bodyY + Math.sin(a) * 0.21 + 0.03, z: ((i % 4) - 1.5) * 0.13, s: 0.15 }, b.body);
    }
    const hc = V(0, 0.56, 0.47), hr = V(0.12, 0.135, 0.13);
    rb.add(G.sphere(10, 8), c.face, { x: hc.x, y: hc.y, z: hc.z, sx: hr.x, sy: hr.y, sz: hr.z, rx: 0.25 }, b.head);
    rb.add(G.sphere(8, 6), c.wool, { y: 0.67, z: 0.42, sx: 0.12, sy: 0.08, sz: 0.1 }, b.head);
    rb.add(G.sphere(8, 5), shade(c.face, 1.35), { y: 0.47, z: 0.56, sx: 0.055, sy: 0.028, sz: 0.04 }, b.jaw);
    for (const s of [1, -1]) {
      const e = onHead(hc, hr, s * 0.48, 0.18, 0.01);
      cartoonEye(rb, b.eyes, e.p, e.n, 0.036, '#262634', V(0, 0, 1));
      rb.add(G.sphere(6, 5), c.face, { x: s * 0.15, y: 0.6, z: 0.42, sx: 0.085, sy: 0.032, sz: 0.05, rz: s * -0.35 }, s > 0 ? b.earL : b.earR);
    }
    rb.add(G.sphere(6, 5), c.wool, { y: 0.5, z: -0.38, s: 0.08 }, b.tail);
    for (const [bn, x, z] of [['legFL', d.legX, d.legZF], ['legFR', -d.legX, d.legZF], ['legBL', d.legX, d.legZB], ['legBR', -d.legX, d.legZB]]) {
      rb.add(G.capsule(0.048, 0.2, 1, 6), c.face === '#f0dcc4' ? '#8a7a6a' : c.face, { x, y: 0.15, z }, b[bn]);
    }
    const bp = rb.build();
    bp.meta = { height: 0.76, length: 0.8, shadow: 0.7, shadowZ: 1.2, headZ: 0.5, hop: 0.35 };
    return bp;
  }

  get defaultAction() { return 'graze'; }
  get gaitActions() { return QUAD_GAIT; }
  get stride() { return 0.36; }
  get defaultSpeed() { return 0.5; }
  get jawOpen() { return 0.45; }
  get reactDuration() { return 1.2; }
  applyPose(o) {
    super.applyPose(o);
    this.bones.earL.rotation.set(0, 0, -o.earL * 0.6);
    this.bones.earR.rotation.set(0, 0, o.earR * 0.6);
  }
}
Sheep.ACTIONS = {
  idle(o, t, s) {
    const T = t * s.tempo + s.phase;
    o.jaw = 0.2 * Math.max(0, Math.sin(T * 6)); o.headY = 0.35 * noise(T * 0.3, s.seed); o.bsq = 0.02 * Math.sin(T * 1.6);
    o.earL = 0.3 * win(T % 4, 1, 1.3); o.earR = 0.3 * win(T % 5, 3, 3.3); o.tailY = 0.5 * Math.sin(T * 9) * win(T % 6, 4, 5);
  },
  graze(o, t, s) {
    const T = t * s.tempo + s.phase;
    const up = win(T % 10, 7, 8.8, 0.4, 0.4);
    o.head = 0.9 * (1 - up); o.jaw = 0.2 * Math.max(0, Math.sin(T * 7)); o.headY = 0.2 * Math.sin(T * 0.6) * (1 - up);
    o.tailY = 0.5 * Math.sin(T * 10) * win(T % 6, 2, 3);
  },
  walk(o, t, s) { quadWalk(o, s.gait, 0.45, 0.02); o.head = 0.15; },
  hop(o, t, s) { // stiff-legged boing
    const T = t * s.tempo + s.phase;
    const h = hop(T, 0.7);
    o.by = 0.3 * h; o.bsq = 0.12 * (h - 0.4); o.legFL = o.legFR = -0.2 * h; o.legBL = o.legBR = 0.2 * h; o.head = -0.2 * h; o.tailY = 0.6 * Math.sin(T * 20);
  },
  baa(o, t, s) {
    const T = t * s.tempo + s.phase;
    const k = win(T % 3, 0.4, 1.4, 0.1, 0.2);
    o.head = -0.35 * k; o.jaw = (0.6 + 0.4 * Math.sin(T * 30)) * k; o.lid = 0.5 * k;
  },
  sleep(o, t, s) { o.by = -0.2; o.legFL = o.legFR = -1.4; o.legBL = o.legBR = 1.4; o.head = 0.3; o.lid = 1; o.bsq = 0.03 * Math.sin((t + s.phase) * 1.4); },
};
