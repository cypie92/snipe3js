// Chunky toy birds: Pigeon, Gull, Duck, Chicken and the star Pelican. Shared bird rig:
// base -> body -> neck -> head -> jaw/eyes, body -> wingL/wingR/tail, base -> legL/legR.
import * as THREE from 'three';
import { RigBuilder, G, tf, lathe, shade, mix } from '../rig.js';
import { P } from '../../../gfx/palette.js';
import { Animal, beadEye, cartoonEye } from './Animal.js';
import { TAU, clamp, noise, win, hop, smooth, bump } from '../anim.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * Generic bird skeleton + helpers. d = dims { bodyY, bodyZ, neckY, neckZ, headY, headZ, hipY, legX, tailY, tailZ, wingX, wingY, wingZ }
 * Returns { rb, b } where parts can be added in model space.
 */
function birdRig(d) {
  const rb = new RigBuilder();
  const b = {};
  b.base = rb.bone('base', null, [0, 0, 0]);
  b.body = rb.bone('body', b.base, [0, d.bodyY, d.bodyZ || 0]);
  b.neck = rb.bone('neck', b.body, [0, d.neckY, d.neckZ]);
  if (d.neck2) b.neck2 = rb.bone('neck2', b.neck, d.neck2);
  b.head = rb.bone('head', b.neck2 ?? b.neck, [0, d.headY, d.headZ]);
  b.jaw = rb.bone('jaw', b.head, d.jaw || [0, d.headY, d.headZ]);
  b.eyes = rb.bone('eyes', b.head, [0, d.eyeY ?? d.headY, d.headZ]);
  b.wingL = rb.bone('wingL', b.body, [d.wingX, d.wingY, d.wingZ]);
  b.wingR = rb.bone('wingR', b.body, [-d.wingX, d.wingY, d.wingZ]);
  b.tail = rb.bone('tail', b.body, [0, d.tailY, d.tailZ]);
  b.legL = rb.bone('legL', b.base, [d.legX, d.hipY, d.legZ || 0]);
  b.legR = rb.bone('legR', b.base, [-d.legX, d.hipY, d.legZ || 0]);
  return { rb, b };
}

function legs(rb, b, d, col, r = 0.012) {
  for (const s of [1, -1]) {
    const bone = s > 0 ? b.legL : b.legR;
    const x = s * d.legX, z = d.legZ || 0;
    rb.add(G.cyl(r, r, d.hipY, 5), col, { x, y: d.hipY / 2, z }, bone);
    rb.add(G.sphere(6, 4), col, { x, y: r * 0.6, z: z + d.foot * 0.35, sx: d.foot * 0.55, sy: r * 0.9, sz: d.foot }, bone);
  }
}

/** Folded wing: an ellipsoid lying along the body side, pivot at the shoulder. */
function wing(rb, bone, s, pivot, len, w, th, col, tip, bars) {
  const m = new THREE.Matrix4().compose(V(s * pivot.x, pivot.y, pivot.z - len * 0.45), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, s * 0.06, 0)), V(th, w, len * 0.55));
  rb.add(G.sphere(10, 6), (x, y, z, c) => {
    if (tip && z < -0.55) return c.set(tip);
    if (bars && z < 0.1 && z > -0.45 && (Math.floor((z + 0.45) * 7) % 2 === 0) && y > -0.2) return c.set(bars);
    c.set(col);
  }, m, bone);
}

// ------------------------------------------------------------------------------ Pigeon
export class Pigeon extends Animal {
  static species = 'pigeon';
  static variants(rng) {
    const v = rng.pick([['#8f9bb4', '#aab3c6', '#5d8f8a'], ['#8f9bb4', '#aab3c6', '#6f8f9a'], ['#b8b2ab', '#d9d2c8', '#8d8577'], ['#f2efe8', '#fbf7f0', '#cfd6dc'], ['#6f7686', '#8a90a0', '#4f7f7a']]);
    return { body: v[0], belly: v[1], neck: v[2] };
  }

  static build(c) {
    const d = { bodyY: 0.15, bodyZ: 0, neckY: 0.2, neckZ: 0.07, headY: 0.285, headZ: 0.1, eyeY: 0.295, hipY: 0.075, legX: 0.032, legZ: 0.01, foot: 0.03, tailY: 0.15, tailZ: -0.11, wingX: 0.075, wingY: 0.19, wingZ: 0.05 };
    const { rb, b } = birdRig(d);
    rb.add(G.sphere(12, 9), (x, y, z, col) => col.set(y < -0.3 && z > -0.3 ? c.belly : c.body), { y: d.bodyY, sx: 0.105, sy: 0.1, sz: 0.15, rx: -0.3 }, b.body);
    rb.add(G.sphere(10, 7), (x, y, z, col) => col.set(mix(c.neck, '#8a6fb0', Math.max(0, x) * 0.8)), { y: 0.205, z: 0.075, sx: 0.07, sy: 0.075, sz: 0.07 }, b.neck);
    rb.add(G.sphere(10, 8), c.body, { y: d.headY, z: d.headZ, s: 0.055 }, b.head);
    rb.add(G.cone(0.014, 0.045, 6), '#3d4450', { y: d.headY - 0.008, z: d.headZ + 0.07, rx: Math.PI / 2 }, b.head);
    rb.add(G.sphere(6, 4), '#e8e4dc', { y: d.headY + 0.004, z: d.headZ + 0.05, sx: 0.013, sy: 0.009, sz: 0.012 }, b.head);
    for (const s of [1, -1]) {
      rb.add(G.sphere(6, 5), '#ff8a3c', { x: s * 0.035, y: d.eyeY, z: d.headZ + 0.03, s: 0.017 }, b.eyes);
      beadEye(rb, b.eyes, V(s * 0.045, d.eyeY, d.headZ + 0.036), V(s * 0.7, 0.1, 0.7), 0.014);
      wing(rb, s > 0 ? b.wingL : b.wingR, s, V(d.wingX, d.wingY - 0.02, d.wingZ), 0.2, 0.065, 0.028, shade(c.body, 0.95), shade(c.body, 0.6), shade(c.body, 0.55));
    }
    rb.add(G.sphere(8, 5), shade(c.body, 0.62), { y: 0.14, z: -0.2, sx: 0.06, sy: 0.018, sz: 0.09, rx: -0.25 }, b.tail);
    legs(rb, b, d, '#e0707a', 0.01);
    const bp = rb.build();
    bp.meta = { height: 0.34, length: 0.36, shadow: 0.26, shadowZ: 1.3, headZ: 0.1, hop: 0.12 };
    return bp;
  }

  constructor(opts = {}) { super(opts); }
  get defaultAction() { return 'idle'; }
  get gaitActions() { return GAIT_WALK; }
  get stride() { return 0.14; }
  get defaultSpeed() { return 0.35; }
  get reactDuration() { return 0.8; }
}
const GAIT_WALK = new Set(['walk', 'run']);

// shared small-bird actions (pigeon, chicken, gull on the ground)
const smallBird = {
  idle(o, t, s) {
    const T = t * s.tempo + s.phase;
    o.headY = 0.7 * noise(T * 0.5, s.seed); o.headZ = 0.2 * noise(T * 0.4, s.seed + 1);
    const jerk = Math.round(noise(T * 0.9, s.seed + 2) * 2) / 2;
    o.headY = o.headY * 0.4 + jerk * 0.6;
    o.bsq = 0.02 * Math.sin(T * 2.4); o.tailX = 0.05 * Math.sin(T * 1.3);
  },
  walk(o, t, s) {
    const g = s.gait, sg = Math.sin(g);
    o.legFL = 0.5 * sg; o.legFR = -0.5 * sg;
    o.headPz = 0.022 * (Math.sin(2 * g + 1.2) > 0 ? 1 : -1) * 0.7 + 0.01 * Math.sin(2 * g);
    o.roll = 0.08 * Math.cos(g); o.by = 0.006 * Math.abs(Math.cos(g)); o.head = 0.06 * Math.sin(2 * g);
    o.tailX = 0.08 * Math.sin(2 * g);
  },
  run(o, t, s) {
    const g = s.gait, sg = Math.sin(g);
    o.legFL = 0.8 * sg; o.legFR = -0.8 * sg; o.body = 0.25; o.by = 0.02 * Math.abs(Math.sin(g));
    o.wingL = o.wingR = 0.5 + 0.4 * Math.sin(t * 30); o.wingFold = 0.5; o.head = -0.2; o.jaw = 0.6;
  },
  peck(o, t, s) {
    const T = t * s.tempo * 1.6 + s.phase;
    const k = T % 1.1;
    const dip = k < 0.12 ? smooth(k / 0.12) : k < 0.2 ? 1 : 1 - smooth((k - 0.2) / 0.25);
    const often = Math.sin(T * 0.37 + s.seed) > -0.3 ? 1 : 0.2;
    o.body = 0.55 * dip * often; o.head = 0.75 * dip * often; o.neck = 0.3 * dip * often;
    o.tailX = -0.2 * dip; o.headY = 0.3 * noise(T * 0.2, s.seed) * (1 - dip);
    o.legFL = 0.05 * Math.sin(T * 0.8);
  },
  hop(o, t, s) {
    const h = hop(t * s.tempo, 0.55);
    o.by = 0.08 * h; o.bsq = 0.1 * (h - 0.4); o.wingL = o.wingR = 0.25 * h; o.wingFold = 0.2 * h;
    o.legFL = o.legFR = -0.3 * h;
  },
  flutter(o, t, s) {
    const T = t * s.tempo;
    o.by = 0.05 + 0.03 * Math.sin(T * 5); o.wingFold = 1.1; o.wingL = o.wingR = 0.4 + 0.8 * Math.sin(T * 34);
    o.body = -0.35; o.head = 0.2; o.tailX = 0.2; o.legFL = o.legFR = -0.4;
  },
  fly(o, t, s) {
    const T = t * s.tempo;
    const f = Math.sin(T * 22);
    o.wingFold = 1.35; o.wingL = o.wingR = 0.15 + 0.85 * f;
    o.body = 0.05; o.head = -0.15; o.by = 0.02 * f; o.legFL = o.legFR = -1.3; o.tailX = -0.1;
  },
  glide(o, t, s, opt) {
    const T = t * s.tempo;
    o.wingFold = 1.4; o.wingL = o.wingR = 0.18 + 0.05 * Math.sin(T * 2); o.body = 0.05; o.head = -0.1;
    o.roll = opt.bank ?? 0.3 * Math.sin(T * 0.4); o.legFL = o.legFR = -1.3;
  },
  land(o, t, s) {
    const f = Math.sin(t * 30);
    o.wingFold = 1.2; o.wingL = o.wingR = 0.6 + 0.5 * f; o.body = -0.45; o.head = 0.3; o.legFL = o.legFR = 0.3; o.tailX = 0.3;
  },
};
Pigeon.ACTIONS = { ...smallBird };

// ------------------------------------------------------------------------------ Chicken
export class Chicken extends Animal {
  static species = 'chicken';
  static variants(rng) { return { body: rng.pick(['#fbf7f0', '#c77d3a', '#fbf7f0', '#8a5a2b', '#2b2b3a']) }; }

  static build(c) {
    const d = { bodyY: 0.2, neckY: 0.27, neckZ: 0.08, headY: 0.36, headZ: 0.1, eyeY: 0.37, hipY: 0.11, legX: 0.045, legZ: 0.0, foot: 0.045, tailY: 0.24, tailZ: -0.12, wingX: 0.1, wingY: 0.24, wingZ: 0.04 };
    const { rb, b } = birdRig(d);
    const light = shade(c.body, 1.08);
    rb.add(G.sphere(12, 9), (x, y, z, col) => col.set(y < -0.4 ? light : c.body), { y: d.bodyY, sx: 0.13, sy: 0.13, sz: 0.16, rx: -0.15 }, b.body);
    rb.add(G.sphere(10, 7), c.body, { y: 0.3, z: 0.07, sx: 0.075, sy: 0.09, sz: 0.075 }, b.neck);
    rb.add(G.sphere(10, 8), c.body, { y: d.headY, z: d.headZ, s: 0.065 }, b.head);
    for (let i = 0; i < 3; i++) rb.add(G.sphere(6, 5), P.tomato, { y: d.headY + 0.06 + (i === 1 ? 0.015 : 0), z: d.headZ + 0.035 - i * 0.03, s: 0.026 }, b.head);
    rb.add(G.cone(0.02, 0.05, 6), P.tangerine, { y: d.headY - 0.005, z: d.headZ + 0.085, rx: Math.PI / 2 }, b.head);
    rb.add(G.sphere(6, 5), P.tomato, { y: d.headY - 0.045, z: d.headZ + 0.05, sx: 0.016, sy: 0.03, sz: 0.016 }, b.jaw);
    for (const s of [1, -1]) {
      beadEye(rb, b.eyes, V(s * 0.052, d.eyeY, d.headZ + 0.036), V(s * 0.75, 0.1, 0.6), 0.019);
      wing(rb, s > 0 ? b.wingL : b.wingR, s, V(d.wingX, d.wingY - 0.03, d.wingZ), 0.2, 0.08, 0.035, shade(c.body, 0.92), shade(c.body, 0.8));
    }
    for (let i = 0; i < 3; i++) rb.add(G.sphere(8, 5), i === 1 ? shade(c.body, 0.8) : c.body, { x: (i - 1) * 0.03, y: 0.3 + i * 0.01, z: -0.16, sx: 0.03, sy: 0.08, sz: 0.05, rx: -0.6, rz: (i - 1) * 0.3 }, b.tail);
    legs(rb, b, d, P.tangerine, 0.013);
    const bp = rb.build();
    bp.meta = { height: 0.44, length: 0.4, shadow: 0.34, shadowZ: 1.2, headZ: 0.1, hop: 0.18 };
    return bp;
  }

  get gaitActions() { return GAIT_WALK; }
  get stride() { return 0.18; }
  get defaultSpeed() { return 0.4; }
  get reactDuration() { return 1.2; }
  reactPose(o, t) {
    const w = super.reactPose(o, t);
    o.wingFold = 1.0 * win(t, 0.05, 1.1); o.wingL = o.wingR = (0.5 + 0.7 * Math.sin(t * 38)) * win(t, 0.05, 1.1);
    o.by += 0.04 * Math.abs(Math.sin(t * 12)) * win(t, 0.4, 1.1);
    return w;
  }
}
Chicken.ACTIONS = {
  ...smallBird,
  flap(o, t, s) { const T = t * s.tempo; o.wingFold = 0.9; o.wingL = o.wingR = 0.5 + 0.7 * Math.sin(T * 32); o.by = 0.03 * Math.abs(Math.sin(T * 6)); o.body = -0.2; o.jaw = 0.5 * Math.max(0, Math.sin(T * 4)); o.head = -0.2; },
};

// ------------------------------------------------------------------------------ Gull
export class Gull extends Animal {
  static species = 'gull';
  static variants(rng) { return { back: rng.pick(['#aebacb', '#9aa6b8', '#bcc6d4']) }; }

  static build(c) {
    const d = { bodyY: 0.2, neckY: 0.26, neckZ: 0.1, headY: 0.34, headZ: 0.14, eyeY: 0.355, hipY: 0.1, legX: 0.04, legZ: 0.02, foot: 0.045, tailY: 0.21, tailZ: -0.17, wingX: 0.09, wingY: 0.25, wingZ: 0.06 };
    const { rb, b } = birdRig(d);
    const white = '#f7f5f0';
    rb.add(G.sphere(12, 9), (x, y, z, col) => col.set(y > 0.35 && z < 0.4 ? c.back : white), { y: d.bodyY, sx: 0.11, sy: 0.105, sz: 0.19, rx: -0.12 }, b.body);
    rb.add(G.sphere(10, 7), white, { y: 0.28, z: 0.1, sx: 0.07, sy: 0.08, sz: 0.07 }, b.neck);
    rb.add(G.sphere(10, 8), white, { y: d.headY, z: d.headZ, sx: 0.062, sy: 0.058, sz: 0.068 }, b.head);
    rb.add(G.cone(0.018, 0.08, 6), '#ffd23c', { y: d.headY - 0.008, z: d.headZ + 0.1, rx: Math.PI / 2, sy: 1 }, b.head);
    rb.add(G.sphere(5, 4), P.tomato, { y: d.headY - 0.022, z: d.headZ + 0.1, s: 0.009 }, b.jaw);
    rb.add(G.cone(0.012, 0.05, 5), '#f2c030', { y: d.headY - 0.02, z: d.headZ + 0.085, rx: Math.PI / 2 }, b.jaw);
    for (const s of [1, -1]) {
      rb.add(G.sphere(5, 4), '#ffe590', { x: s * 0.043, y: d.eyeY, z: d.headZ + 0.035, s: 0.013 }, b.eyes);
      beadEye(rb, b.eyes, V(s * 0.052, d.eyeY, d.headZ + 0.04), V(s * 0.8, 0.1, 0.55), 0.011);
      wing(rb, s > 0 ? b.wingL : b.wingR, s, V(d.wingX, d.wingY - 0.02, d.wingZ), 0.36, 0.06, 0.03, c.back, '#2b2b3a');
    }
    rb.add(G.sphere(8, 5), white, { y: 0.21, z: -0.24, sx: 0.06, sy: 0.02, sz: 0.09, rx: -0.1 }, b.tail);
    legs(rb, b, d, '#f0a8a8', 0.011);
    const bp = rb.build();
    bp.meta = { height: 0.42, length: 0.5, shadow: 0.32, shadowZ: 1.5, headZ: 0.14, hop: 0.15 };
    return bp;
  }

  get gaitActions() { return GAIT_WALK; }
  get stride() { return 0.2; }
  get defaultSpeed() { return 0.45; }

  /** setAction('circle', { center: Vector3, radius, height, speed, clockwise }) glides in circles. */
  afterUpdate(dt) {
    const c = this.blender.cur;
    if (c.name !== 'circle') { this.hideShadow = false; return; }
    const o = c.opts;
    const r = o.radius ?? 8, h = o.height ?? 10, sp = o.speed ?? 4, dir = o.clockwise ? -1 : 1;
    const cen = o.center || this._circleC || (this._circleC = this.root.position.clone());
    this._ang = (this._ang ?? this.rng.range(0, TAU)) + dir * (sp / r) * dt;
    const a = this._ang;
    this.root.position.set(cen.x + Math.sin(a) * r, cen.y + h + Math.sin(a * 2 + this.s.phase) * 0.6, cen.z + Math.cos(a) * r);
    this.root.rotation.y = a + dir * Math.PI / 2;
    this.hideShadow = true;
  }
}
Gull.ACTIONS = {
  ...smallBird,
  squawk(o, t, s) {
    const T = t * s.tempo + s.phase;
    const k = win(T % 3, 0.8, 1.8, 0.1, 0.2);
    o.head = -0.8 * k; o.neck = -0.3 * k; o.jaw = (0.6 + 0.4 * Math.sin(T * 20)) * k; o.body = -0.15 * k;
    o.wingFold = 0.35 * k; o.wingL = o.wingR = 0.3 * k;
  },
  circle(o, t, s, opt) {
    const T = t * s.tempo;
    const flap = win(T % 6, 0, 1.2, 0.2, 0.3);
    o.wingFold = 1.4; o.wingL = o.wingR = 0.2 + flap * 0.7 * Math.sin(T * 14);
    o.roll = (opt.clockwise ? 1 : -1) * 0.35; o.legFL = o.legFR = -1.3; o.head = -0.05; o.headY = (opt.clockwise ? -1 : 1) * 0.3;
  },
};

// ------------------------------------------------------------------------------ Duck
export class Duck extends Animal {
  static species = 'duck';
  static variants(rng) {
    return rng.pick([
      { head: '#2f8f5a', body: '#b9bfc8', chest: '#8a5a3a', bill: '#ffd23c', ring: '#fbf7f0' },
      { head: '#fbf7f0', body: '#fbf7f0', chest: '#fbf7f0', bill: P.tangerine, ring: '#fbf7f0' },
      { head: '#9a7a52', body: '#b8966a', chest: '#a88458', bill: '#e0a040', ring: '#b8966a' },
    ]);
  }

  static build(c) {
    const d = { bodyY: 0.14, neckY: 0.2, neckZ: 0.1, headY: 0.3, headZ: 0.14, eyeY: 0.315, hipY: 0.07, legX: 0.05, legZ: 0.0, foot: 0.06, tailY: 0.17, tailZ: -0.17, wingX: 0.1, wingY: 0.19, wingZ: 0.05 };
    const { rb, b } = birdRig(d);
    rb.add(G.sphere(12, 9), (x, y, z, col) => col.set(z > 0.35 ? c.chest : y < -0.2 ? shade(c.body, 1.08) : c.body), { y: d.bodyY, sx: 0.13, sy: 0.1, sz: 0.19, rx: -0.05 }, b.body);
    rb.add(G.cyl(0.045, 0.055, 0.1, 8), (x, y, z, col) => col.set(y < -0.03 ? c.ring : c.head), { y: 0.23, z: 0.12, rx: 0.3 }, b.neck);
    rb.add(G.sphere(10, 8), c.head, { y: d.headY, z: d.headZ, sx: 0.078, sy: 0.076, sz: 0.082 }, b.head);
    rb.add(G.sphere(8, 5), c.bill, { y: d.headY - 0.016, z: d.headZ + 0.1, sx: 0.042, sy: 0.016, sz: 0.058 }, b.head);
    rb.add(G.sphere(8, 5), shade(c.bill, 0.9), { y: d.headY - 0.03, z: d.headZ + 0.092, sx: 0.036, sy: 0.011, sz: 0.05 }, b.jaw);
    for (const s of [1, -1]) {
      beadEye(rb, b.eyes, V(s * 0.062, d.eyeY, d.headZ + 0.036), V(s * 0.8, 0.15, 0.5), 0.017);
      wing(rb, s > 0 ? b.wingL : b.wingR, s, V(d.wingX, d.wingY - 0.02, d.wingZ), 0.22, 0.06, 0.03, shade(c.body, 0.9), null, c.head === '#2f8f5a' ? '#3a5fd0' : null);
    }
    rb.add(G.sphere(8, 5), shade(c.body, 0.8), { y: 0.19, z: -0.2, sx: 0.05, sy: 0.03, sz: 0.06, rx: -0.6 }, b.tail);
    if (c.head === '#2f8f5a') rb.add(G.torus(0.015, 0.006, 3, 8, Math.PI * 1.3), '#2b2b3a', { y: 0.235, z: -0.22, ry: Math.PI / 2 }, b.tail);
    legs(rb, b, d, P.tangerine, 0.012);
    const bp = rb.build();
    bp.meta = { height: 0.36, length: 0.44, shadow: 0.34, shadowZ: 1.4, headZ: 0.14, hop: 0.12 };
    return bp;
  }

  get gaitActions() { return GAIT_WALK; }
  get stride() { return 0.16; }
  get defaultSpeed() { return 0.35; }
  get defaultAction() { return 'swim'; }
  get keepY() { return true; }
  afterUpdate() { this.hideShadow = ['swim', 'dabble'].includes(this.action); }
}
Duck.ACTIONS = {
  ...smallBird,
  walk(o, t, s) { // proper duck waddle
    const g = s.gait, sg = Math.sin(g);
    o.legFL = 0.45 * sg; o.legFR = -0.45 * sg; o.roll = 0.16 * Math.cos(g); o.yaw = 0.1 * sg;
    o.by = 0.008 * Math.abs(Math.cos(g)); o.tailY = 0.3 * Math.cos(g); o.head = 0.05 * Math.sin(2 * g);
  },
  swim(o, t, s) {
    const T = t * s.tempo + s.phase;
    o.by = -0.075 + 0.008 * Math.sin(T * 2.1); o.body = 0.03 * Math.sin(T * 1.3); o.roll = 0.04 * Math.sin(T * 1.7);
    o.headY = 0.5 * noise(T * 0.35, s.seed); o.tailY = 0.25 * Math.sin(T * 3.1) * win(T % 5, 3, 4);
    o.legFL = 0.6 * Math.sin(T * 5); o.legFR = -0.6 * Math.sin(T * 5);
  },
  dabble(o, t, s) { // tail up, head under water
    const T = t * s.tempo + s.phase;
    const k = win(T % 6, 0.8, 4.2, 0.35, 0.35);
    o.by = -0.075 + 0.05 * k; o.body = 1.75 * k; o.head = 0.3 * k; o.neck = 0.4 * k;
    o.tailY = 0.5 * Math.sin(T * 9) * k; o.legFL = (0.9 * Math.sin(T * 9)) * k; o.legFR = -(0.9 * Math.sin(T * 9)) * k;
    o.headY = 0.4 * noise(T * 0.4, s.seed) * (1 - k);
  },
  quack(o, t, s) {
    const T = t * s.tempo + s.phase;
    const k = win(T % 2.2, 0.3, 1.0, 0.08, 0.15);
    o.jaw = (0.5 + 0.5 * Math.sin(T * 26)) * k; o.head = -0.3 * k; o.bsq = 0.05 * k; o.by = -0.075;
  },
};

// ------------------------------------------------------------------------------ Pelican (star animal)
export class Pelican extends Animal {
  static species = 'pelican';
  static variants(rng) { return { body: '#f7f4ee', pouch: rng.pick(['#ff9e6e', '#ffb07a']), bill: '#f5c04a' }; }

  static build(c) {
    const d = {
      bodyY: 0.4, bodyZ: 0, neckY: 0.52, neckZ: 0.22, neck2: [0, 0.74, 0.12], headY: 0.93, headZ: 0.19, eyeY: 0.96, jaw: [0, 0.9, 0.26],
      hipY: 0.16, legX: 0.1, legZ: 0.02, foot: 0.09, tailY: 0.42, tailZ: -0.36, wingX: 0.19, wingY: 0.5, wingZ: 0.14,
    };
    const { rb, b } = birdRig(d);
    const W = c.body;
    rb.add(G.sphere(14, 10), (x, y, z, col) => col.set(y < -0.45 ? shade(W, 0.95) : W), { y: d.bodyY, sx: 0.26, sy: 0.25, sz: 0.4, rx: -0.2 }, b.body);
    // S-neck: capsules skinned to neck & neck2
    const n1a = V(0, 0.5, 0.24), n1b = V(0, 0.74, 0.1), n2b = V(0, 0.92, 0.17);
    const seg = (a, bb, r, bone) => {
      const dir = bb.clone().sub(a);
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
      rb.add(G.capsule(r, dir.length(), 2, 8, 2), W, new THREE.Matrix4().compose(a.clone().add(bb).multiplyScalar(0.5), q, V(1, 1, 1)), bone);
    };
    seg(n1a, n1b, 0.07, b.neck);
    seg(n1b, n2b, 0.064, b.neck2);
    rb.add(G.sphere(12, 9), W, { y: d.headY, z: d.headZ, sx: 0.1, sy: 0.098, sz: 0.115 }, b.head);
    for (let i = 0; i < 4; i++) rb.add(G.sphere(6, 4), '#ffe590', { x: (i % 2 - 0.5) * 0.03, y: d.headY + 0.09 + (i === 1 ? 0.02 : 0), z: d.headZ - 0.02 - i * 0.025, s: 0.036 }, b.head);
    // bill: long upper mandible with a hooked red tip
    rb.add(G.capsule(0.034, 0.38, 2, 8), (x, y, z, col) => col.set(y > 0.18 ? '#ff7a4a' : c.bill), { y: d.headY - 0.02, z: d.headZ + 0.3, rx: Math.PI / 2 + 0.1, sx: 1.3, sz: 0.55 }, b.head);
    rb.add(G.sphere(6, 4), '#ff7a4a', { y: d.headY - 0.06, z: d.headZ + 0.5, sx: 0.03, sy: 0.032, sz: 0.032 }, b.head);
    // lower mandible + stretchy throat pouch on the jaw bone
    rb.add(G.capsule(0.026, 0.36, 2, 6), shade(c.bill, 0.92), { y: d.headY - 0.055, z: d.headZ + 0.29, rx: Math.PI / 2 + 0.16, sx: 1.25, sz: 0.5 }, b.jaw);
    rb.add(G.sphere(12, 8), c.pouch, { y: d.headY - 0.095, z: d.headZ + 0.25, sx: 0.065, sy: 0.06, sz: 0.21, rx: 0.18 }, b.jaw);
    for (const s of [1, -1]) {
      const dir = V(s * 0.78, 0.2, 0.6).normalize();
      const ep = V(s * 0.075, d.eyeY, d.headZ + 0.055);
      cartoonEye(rb, b.eyes, ep, dir, 0.038, '#262634', V(0, -0.15, 1));
      // sly half-lid over each eye (the harbour thief)
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), dir).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, 0, s * 0.2)));
      rb.add(G.hemi(10, 3), (x, y, z, col) => col.set(y < 0.15 ? '#2b2b3a' : shade(W, 0.92)), new THREE.Matrix4().compose(ep, q, V(0.043, 0.048, 0.034)), b.eyes);
      wing(rb, s > 0 ? b.wingL : b.wingR, s, V(d.wingX, d.wingY - 0.04, d.wingZ), 0.66, 0.17, 0.07, W, '#34384a');
    }
    rb.add(G.sphere(8, 5), W, { y: 0.44, z: -0.44, sx: 0.12, sy: 0.05, sz: 0.12, rx: 0.3 }, b.tail);
    for (const s of [1, -1]) {
      const bone = s > 0 ? b.legL : b.legR;
      rb.add(G.capsule(0.04, 0.1, 2, 6), P.tangerine, { x: s * d.legX, y: 0.1, z: 0.02 }, bone);
      rb.add(G.sphere(8, 5), P.tangerine, { x: s * d.legX, y: 0.02, z: 0.08, sx: 0.085, sy: 0.022, sz: 0.11 }, bone);
    }
    const bp = rb.build();
    bp.meta = { height: 1.05, length: 1.0, shadow: 0.8, shadowZ: 1.3, headZ: 0.35, hop: 0.3 };
    return bp;
  }

  get defaultAction() { return 'idle'; }
  get gaitActions() { return GAIT_WALK; }
  get stride() { return 0.32; }
  get defaultSpeed() { return 0.5; }
  get jawOpen() { return 0.55; }
  get reactDuration() { return 1.8; }
  applyPose(o) {
    super.applyPose(o);
    const B = this.bones;
    if (B.neck2) B.neck2.rotation.set(-o.neck * 0.6, o.neckY * 0.5, 0, 'YXZ');
    const p = 1 + Math.max(0, o.pouch);
    B.jaw.scale.set(1 + (p - 1) * 0.5, p, 1);
  }
  reactPose(o, t) {
    const w = super.reactPose(o, t);
    const k = win(t, 0.05, 1.6, 0.1, 0.3);
    o.wingFold = 1.3 * k; o.wingL = o.wingR = (0.3 + 0.6 * Math.sin(t * 16)) * k;
    o.jaw = (0.7 + 0.3 * Math.sin(t * 20)) * k; o.head = -0.5 * k; o.neck = -0.3 * k;
    return w;
  }
}
Pelican.ACTIONS = {
  idle(o, t, s) {
    const T = t * s.tempo + s.phase;
    o.head = 0.35 + 0.05 * Math.sin(T * 0.7); o.neck = 0.25; o.headY = 0.5 * noise(T * 0.3, s.seed);
    o.bsq = 0.015 * Math.sin(T * 1.8); o.pouch = 0.05 * Math.sin(T * 1.8);
    const shuffle = win(T % 9, 6, 7.5);
    o.wingFold = 0.15 * shuffle; o.wingL = o.wingR = 0.1 * shuffle * Math.sin(T * 12);
  },
  walk(o, t, s) {
    const g = s.gait, sg = Math.sin(g);
    o.legFL = 0.4 * sg; o.legFR = -0.4 * sg; o.roll = 0.18 * Math.cos(g); o.yaw = 0.08 * sg;
    o.by = 0.02 * Math.abs(Math.cos(g)); o.head = 0.25 + 0.06 * Math.sin(2 * g); o.neck = 0.2 + 0.1 * Math.sin(2 * g);
    o.headZ = -0.1 * Math.cos(g); o.pouch = 0.08 * Math.sin(2 * g + 1);
    o.wingFold = 0.12; o.wingL = o.wingR = 0.12;
  },
  flap(o, t, s) {
    const T = t * s.tempo;
    const f = Math.sin(T * 7);
    o.wingFold = 1.35; o.wingL = o.wingR = 0.35 + 0.75 * f; o.by = 0.03 * Math.max(0, f);
    o.head = -0.1; o.neck = -0.1; o.jaw = 0.25 * Math.max(0, Math.sin(T * 3.5)); o.body = -0.12; o.bsq = -0.04 * f;
  },
  gulp(o, t, s) { // the thief swallows something big: head back, pouch bulges and wobbles
    const T = (t * s.tempo) % 4;
    const up = win(T, 0.2, 3.2, 0.3, 0.4);
    o.head = -0.9 * up; o.neck = -0.55 * up; o.body = -0.2 * up;
    o.jaw = 0.9 * win(T, 0.25, 0.9, 0.1, 0.2);
    o.pouch = (0.9 * win(T, 0.6, 3.0, 0.2, 0.6)) * (1 + 0.15 * Math.sin(T * 18));
    o.bsq = 0.04 * Math.sin(T * 9) * up;
  },
  snap(o, t, s) {
    const T = t * s.tempo + s.phase;
    o.jaw = Math.max(0, Math.sin(T * 9)) * win(T % 2, 0.2, 1.2); o.head = 0.1; o.neck = 0.1; o.headY = 0.3 * Math.sin(T * 0.8);
  },
  fly(o, t, s) {
    const f = Math.sin(t * 6.5);
    o.wingFold = 1.4; o.wingL = o.wingR = 0.15 + 0.7 * f; o.body = 0.5; o.neck = 0.6; o.head = -0.3; o.legFL = o.legFR = -1.2;
  },
  sit(o, t, s) {
    const T = t * s.tempo + s.phase;
    o.by = -0.18; o.legFL = o.legFR = 1.2; o.head = 0.45; o.neck = 0.35; o.lid = 0.4; o.headY = 0.3 * noise(T * 0.2, s.seed);
  },
};
