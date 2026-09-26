// Seaside animals: Seal (+ SealCatch for the "seals play catch" gag) and Crab.
// Same API as every Animal: root, setAction, react, celebrate, lookAt, update, perform, tell.
import * as THREE from 'three';
import { RigBuilder, G, tf, lathe, shade, blendSeg } from '../rig.js';
import { P } from '../../../gfx/palette.js';
import { hash3 } from '../../../core/rng.js';
import { part, merge, sphere } from '../../geo.js';
import { characterMaterial } from '../look.js';
import { Animal, beadEye } from './Animal.js';
import { TAU, clamp, noise, win, hop, smooth, bump, lerp } from '../anim.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

// ------------------------------------------------------------------------------ Seal
// Rig: base -> body (chest) -> rear -> tail;  body -> neck -> head -> jaw / eyes / ball;  body -> wingL/R (fore flippers).
// Extra channels: kneeB = rear bend, pawL = beach ball on the nose (0 hidden .. 1 shown).
export class Seal extends Animal {
  static species = 'seal';
  static WET_ACTIONS = new Set(['swim', 'dive']);
  static variants(rng) {
    return rng.pick([
      { coat: '#8d98ab', belly: '#cfd6e0', spot: '#6d788c' },
      { coat: '#a8998a', belly: '#dccfbe', spot: '#86766a' },
      { coat: '#6f7788', belly: '#adb5c2', spot: '#565d6c' },
    ]);
  }

  static build(c) {
    const rb = new RigBuilder();
    const b = {};
    b.base = rb.bone('base', null, [0, 0, 0]);
    b.body = rb.bone('body', b.base, [0, 0.24, 0.05]);
    b.rear = rb.bone('rear', b.body, [0, 0.2, -0.28]);
    b.tail = rb.bone('tail', b.rear, [0, 0.12, -0.6]);
    b.neck = rb.bone('neck', b.body, [0, 0.34, 0.2]);
    b.head = rb.bone('head', b.neck, [0, 0.5, 0.34]);
    b.jaw = rb.bone('jaw', b.head, [0, 0.5, 0.5]);
    b.eyes = rb.bone('eyes', b.head, [0, 0.6, 0.5]);
    b.ball = rb.bone('ball', b.head, [0, 0.8, 0.6]);
    b.wingL = rb.bone('wingL', b.body, [0.22, 0.2, 0.16]);
    b.wingR = rb.bone('wingR', b.body, [-0.22, 0.2, 0.16]);
    // torpedo body along Z (lathe around Y, tipped forward), belly lighter, a few spots
    const prof = [[0.02, -0.68], [0.09, -0.62], [0.15, -0.46], [0.21, -0.26], [0.255, -0.05], [0.265, 0.1], [0.24, 0.24], [0.17, 0.33], [0.06, 0.38], [0, 0.39]];
    const spots = (x, y, z, col) => {
      if (y < -0.1) return col.set(c.belly);
      col.set(hash3(Math.floor(x * 9), Math.floor(y * 9), Math.floor(z * 9)) > 0.83 ? c.spot : c.coat);
    };
    rb.add(lathe(prof, 14), (x, y, z, col) => spots(x, -z, y, col), { y: 0.24, rx: Math.PI / 2, sz: 0.86 }, blendSeg(b.body, b.rear, V(0, 0.24, 0.1), V(0, 0.2, -0.4), 0.35, 0.75));
    // neck + round head
    const n0 = V(0, 0.3, 0.2), n1 = V(0, 0.52, 0.36);
    const dir = n1.clone().sub(n0);
    rb.add(G.capsule(0.15, dir.length(), 2, 10), c.coat, new THREE.Matrix4().compose(n0.clone().add(n1).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.normalize()), V(1, 1, 1)), b.neck);
    rb.add(G.sphere(12, 9), c.coat, { y: 0.58, z: 0.42, sx: 0.19, sy: 0.18, sz: 0.19 }, b.head);
    for (const s of [1, -1]) {
      rb.add(G.sphere(8, 6), c.belly, { x: s * 0.052, y: 0.53, z: 0.58, sx: 0.065, sy: 0.055, sz: 0.05 }, b.head); // whisker pads
      for (let i = 0; i < 2; i++) rb.add(G.sphere(4, 3), shade(c.spot, 0.7), { x: s * (0.06 + i * 0.02), y: 0.535 - i * 0.015, z: 0.625, s: 0.008 }, b.head);
      beadEye(rb, b.eyes, V(s * 0.085, 0.615, 0.565), V(s * 0.5, 0.15, 0.85), 0.052);
      rb.add(G.sphere(5, 3), shade(c.coat, 0.72), { x: s * 0.085, y: 0.69, z: 0.555, sx: 0.035, sy: 0.012, sz: 0.02, rz: s * 0.3 }, b.head); // brows
      rb.add(G.sphere(8, 5), shade(c.coat, 0.9), { x: s * 0.28, y: 0.13, z: 0.1, sx: 0.06, sy: 0.15, sz: 0.09, rx: 0.9, rz: s * 0.5 }, s > 0 ? b.wingL : b.wingR);
      rb.add(G.sphere(8, 5), shade(c.coat, 0.88), { x: s * 0.09, y: 0.11, z: -0.73, sx: 0.07, sy: 0.03, sz: 0.13, ry: s * 0.5 }, b.tail);
    }
    rb.add(G.sphere(7, 5), '#2b2b3a', { y: 0.565, z: 0.6, sx: 0.036, sy: 0.026, sz: 0.022 }, b.head); // nose
    rb.add(G.sphere(8, 5), '#e8707e', { y: 0.49, z: 0.54, sx: 0.05, sy: 0.022, sz: 0.04 }, b.jaw);
    rb.add(G.sphere(6, 4), c.belly, { y: 0.475, z: 0.53, sx: 0.055, sy: 0.02, sz: 0.045 }, b.jaw);
    // beach ball balanced on the nose (hidden unless balancing)
    const seg = [P.tomato, '#fff8ee', P.cobalt, P.sunflower];
    rb.add(G.sphere(10, 8), (x, y, z, col) => col.set(Math.abs(y) > 0.92 ? '#fff8ee' : seg[Math.floor(((Math.atan2(x, z) + Math.PI) / TAU) * 6) % 4]), { y: 0.8, z: 0.6, s: 0.13 }, b.ball);
    const bp = rb.build();
    bp.meta = { height: 0.72, length: 1.1, shadow: 0.8, shadowZ: 1.4, headZ: 0.45, hop: 0.2 };
    return bp;
  }

  get defaultAction() { return 'idle'; }
  get gaitActions() { return SEAL_GAIT; }
  get stride() { return 0.36; }
  get defaultSpeed() { return 0.5; }
  get jawOpen() { return 0.7; }
  get reactDuration() { return 1.6; }

  applyPose(o) {
    super.applyPose(o);
    const B = this.bones;
    B.rear.rotation.set(o.kneeB, o.tailY * 0.5, 0);
    B.wingL.rotation.set(-o.wingL * 0.5, 0, o.wingL * 0.6);
    B.wingR.rotation.set(-o.wingR * 0.5, 0, -o.wingR * 0.6);
    const bl = clamp(o.pawL, 0, 1);
    B.ball.scale.setScalar(Math.max(0.001, bl));
    B.ball.rotation.set(0.3 * Math.sin(this.time * 4) * bl, this.time * 2, 0.2 * Math.sin(this.time * 3.3) * bl);
    if (this._bop != null) { // nose flick (playing catch)
      this._bop += 1 / 60;
      B.head.rotation.x -= 0.5 * bump(this._bop, 0, 0.35);
      if (this._bop > 0.4) this._bop = null;
    }
  }

  /** Quick upward nose flick (SealCatch calls it when the ball arrives). */
  bop() { this._bop = 0; return this; }

  /** World position of the nose tip (for balancing / catching a ball). */
  nosePosition(out = new THREE.Vector3()) {
    this.bones.head.updateWorldMatrix(true, false);
    return out.set(0, 0.07, 0.29).applyMatrix4(this.bones.head.matrixWorld); // bind nose tip (0, .565, .62) in head space
  }

  /** Keeps the balanced beach ball sitting on top of the nose whatever the head is doing. */
  afterUpdate(dt, o) {
    if (o.pawL <= 0.01) return;
    const B = this.bones;
    B.head.updateWorldMatrix(true, false);
    const p = this.nosePosition(_v);
    p.y += 0.14 * B.head.matrixWorld.getMaxScaleOnAxis();
    B.ball.position.copy(B.head.worldToLocal(p));
  }

  /**
   * Belly-slide off a rock into the water: slides to `point` (parent space; its y = the water surface),
   * dives in and ends up swimming there. Returns the duration.
   */
  slideInto(point, { duration = 1.4, onDone } = {}) {
    const from = this.root.position.clone();
    const to = point.clone();
    this.root.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
    this.setAction('slide', {}, 0.15);
    let t = 0;
    this.controller = {
      update: (dt) => {
        t += dt;
        const k = clamp(t / duration, 0, 1);
        const e = k * k; // accelerating slide
        this.root.position.lerpVectors(from, to, e);
        this.root.position.y = lerp(from.y, to.y, e) + Math.sin(Math.PI * k) * 0.25;
        if (k > 0.7 && this.action === 'slide') this.setAction('dive', {}, 0.12);
        if (k >= 1) {
          this.controller = null;
          this.root.position.copy(to);
          this.setAction('swim', {}, 0.5);
          onDone?.(this);
        }
      },
    };
    return duration;
  }
}
const SEAL_GAIT = new Set(['flop', 'walk']);
Seal.ACTIONS = {
  idle(o, t, s) {
    const T = t * s.tempo + s.phase;
    o.bsq = 0.02 * Math.sin(T * 1.7);
    o.headY = 0.55 * noise(T * 0.28, s.seed); o.head = 0.1 * noise(T * 0.35, s.seed + 1); o.neck = -0.05;
    const pat = win(T % 7.5, 5, 6.2, 0.15, 0.2); // pats its tummy
    o.wingL = 0.3 + 0.35 * pat * Math.max(0, Math.sin(T * 12)); o.wingR = 0.3;
    o.tailX = 0.15 * Math.sin(T * 0.9); o.kneeB = -0.1 * Math.max(0, Math.sin(T * 0.9));
  },
  flop(o, t, s) { // galumphing along on the belly
    const g = s.gait;
    o.body = -0.16 * Math.sin(g); o.kneeB = 0.35 * Math.sin(g + 1.2); o.tailX = -0.3 * Math.sin(g + 2);
    o.by = 0.05 * Math.max(0, Math.sin(g)); o.bsq = 0.05 * Math.sin(g * 2);
    o.wingL = o.wingR = 0.3 + 0.5 * Math.max(0, -Math.sin(g));
    o.neck = 0.1 * Math.sin(g + 0.5); o.head = -0.05;
  },
  bark(o, t, s) { // ORK ORK!
    const T = t * s.tempo + s.phase;
    const k = Math.max(0, Math.sin(T * 8)) * win(T % 2.6, 0.2, 1.5, 0.05, 0.15);
    o.neck = -0.45 - 0.15 * k; o.head = -0.25 - 0.1 * k; o.body = -0.12;
    o.jaw = 0.1 + 0.9 * k; o.by = 0.03 * k; o.bsq = -0.05 * k;
    o.wingL = o.wingR = 0.4 + 0.6 * k; o.tailX = -0.3 * k;
  },
  clap(o, t, s) { // sits up and claps its flippers
    const T = t * s.tempo + s.phase;
    const c = Math.sin(T * 12);
    o.body = -0.4; o.neck = -0.3; o.head = -0.15; o.kneeB = 0.25; o.tailX = -0.2;
    o.wingL = o.wingR = 1.25 + 0.5 * c; o.jaw = 0.45 + 0.3 * Math.max(0, Math.sin(T * 6)); o.lid = 0.35;
    o.by = 0.02 * Math.abs(c);
  },
  balance(o, t, s, opt) { // beach ball on the nose
    const T = t * s.tempo + s.phase;
    o.body = -0.42; o.neck = -0.5; o.head = -0.3 + 0.06 * Math.sin(T * 2.3); o.headZ = 0.08 * Math.sin(T * 1.7);
    o.kneeB = 0.3; o.tailX = -0.25;
    o.wingL = 0.9 + 0.3 * Math.sin(T * 2.1); o.wingR = 0.9 - 0.3 * Math.sin(T * 2.1);
    o.pawL = opt.ball === false ? 0 : 1; o.lid = 0.25;
  },
  slide(o, t, s) { // tobogganing on the belly
    o.body = 0.05; o.neck = 0.35; o.head = 0.15; o.kneeB = -0.25; o.tailX = -0.35;
    o.wingL = o.wingR = -0.9; o.bsq = -0.08; o.by = -0.03; o.jaw = 0.35; o.lid = -0.2;
  },
  dive(o, t, s) { // nose down into the water (root on the surface)
    const k = smooth(t / 0.5);
    o.brx = 0.95 * k; o.by = -0.45 * k; o.neck = 0.2; o.head = 0.25; o.wingL = o.wingR = -0.9; o.tailX = -0.5;
  },
  swim(o, t, s) { // root on the water surface: just the head bobs above it
    const T = t * s.tempo + s.phase;
    o.by = -0.34 + 0.025 * Math.sin(T * 1.9); o.body = 0.05; o.neck = -0.1; o.head = 0.05;
    o.headY = 0.6 * noise(T * 0.25, s.seed); o.tailX = 0.3 * Math.sin(T * 2.4);
    o.wingL = 0.4 * Math.sin(T * 2.4); o.wingR = -0.4 * Math.sin(T * 2.4);
  },
  sleep(o, t, s) {
    const T = t + s.phase;
    o.roll = 1.25; o.by = 0.04; o.neck = 0.45; o.head = 0.2; o.lid = 1; o.bsq = 0.03 * Math.sin(T * 1.4);
    o.wingL = o.wingR = 0.1; o.kneeB = 0.2; o.tailX = 0.2;
  },
};
Seal.ACTIONS.walk = Seal.ACTIONS.flop;

/**
 * Two seals playing catch with a beach ball (the "seals play catch" secret job):
 *   const game = new SealCatch(sealA, sealB); scene.add(game.ball); ... game.update(dt) (after the seals update).
 * Pass { ball } to reuse a props-kit beach ball (any Object3D), otherwise a toy one is made.
 */
export class SealCatch {
  constructor(a, b, { ball, period = 1.5, arc = 1.3, radius = 0.13 } = {}) {
    this.seals = [a, b];
    this.period = period;
    this.arc = arc;
    this.t = 0;
    this.from = 0;
    if (!ball) {
      const seg = [P.tomato, '#fff8ee', P.cobalt, P.sunflower];
      ball = new THREE.Mesh(merge([part(sphere(1, 12, 10), (x, y, z, col) => col.set(Math.abs(y) > 0.92 ? '#fff8ee' : seg[Math.floor(((Math.atan2(x, z) + Math.PI) / TAU) * 6) % 4]), {})]), characterMaterial());
      ball.scale.setScalar(radius);
      ball.castShadow = true;
      ball.name = 'seal-ball';
    }
    this.ball = ball;
    for (const s of this.seals) s.setAction('balance', { ball: false }, 0.3);
  }

  update(dt) {
    this.t += dt;
    let k = this.t / this.period;
    if (k >= 1) { // caught! flick it back
      this.t -= this.period;
      k = this.t / this.period;
      this.from = 1 - this.from;
      const catcher = this.seals[this.from];
      catcher.bop();
      if (Math.random() < 0.35) catcher.perform('bark', 0.8);
    }
    const A = this.seals[this.from].nosePosition(_v);
    const Bp = this.seals[1 - this.from].nosePosition(_v2);
    const p = this.ball.parent ? this.ball.parent.worldToLocal(A.lerp(Bp, k)) : A.lerp(Bp, k);
    p.y += Math.sin(Math.PI * k) * this.arc + 0.12;
    this.ball.position.copy(p);
    this.ball.rotation.x += dt * 6;
  }

  stop() { for (const s of this.seals) s.setAction('idle', {}, 0.4); }
}

// ------------------------------------------------------------------------------ Crab
// Rig: base -> body -> eyes (stalks), clawL/R -> pincerL/R, legL0..2 / legR0..2.
// Channels: wingL/R = claw raise, jaw = pincer opening, earL/R = eye-stalk wobble, legFL = scuttle amount.
export class Crab extends Animal {
  static species = 'crab';
  static variants(rng) { return rng.pick([{ shell: '#ff6a3d', claw: '#ef4f2c' }, { shell: '#ff8a3c', claw: '#f0652a' }, { shell: '#e2533a', claw: '#c9412d' }]); }

  static build(c) {
    const rb = new RigBuilder();
    const b = {};
    b.base = rb.bone('base', null, [0, 0, 0]);
    b.body = rb.bone('body', b.base, [0, 0.12, 0]);
    b.eyes = rb.bone('eyes', b.body, [0, 0.19, 0.08]);
    b.earL = rb.bone('earL', b.body, [0.05, 0.17, 0.09]);
    b.earR = rb.bone('earR', b.body, [-0.05, 0.17, 0.09]);
    const under = '#ffd0a8';
    rb.add(G.sphere(12, 8), (x, y, z, col) => col.set(y < -0.35 ? under : hash3(Math.floor(x * 5), Math.floor(y * 5), Math.floor(z * 5)) > 0.8 ? shade(c.shell, 1.12) : c.shell), { y: 0.13, sx: 0.19, sy: 0.095, sz: 0.145 }, b.body);
    rb.add(G.torus(0.035, 0.008, 3, 8, Math.PI), '#5b2333', { y: 0.12, z: 0.138, rz: Math.PI }, b.body); // smile
    for (const s of [1, -1]) {
      const S = s > 0 ? 'L' : 'R';
      const stalk = s > 0 ? b.earL : b.earR;
      rb.add(G.capsule(0.013, 0.09, 1, 5), c.shell, { x: s * 0.055, y: 0.225, z: 0.095, rz: -s * 0.15 }, stalk);
      rb.add(G.sphere(8, 6), '#fbfaf4', { x: s * 0.066, y: 0.29, z: 0.1, s: 0.036 }, stalk);
      rb.add(G.sphere(6, 4), '#262634', { x: s * 0.068, y: 0.292, z: 0.128, s: 0.018 }, stalk);
      rb.add(G.sphere(4, 3), '#ffffff', { x: s * 0.062, y: 0.3, z: 0.142, s: 0.006 }, stalk);
      // claw arm + pincers
      b['claw' + S] = rb.bone('claw' + S, b.body, [s * 0.15, 0.12, 0.07]);
      b['pincer' + S] = rb.bone('pincer' + S, b['claw' + S], [s * 0.27, 0.19, 0.2]);
      const a0 = V(s * 0.15, 0.12, 0.07), a1 = V(s * 0.25, 0.17, 0.18);
      const dir = a1.clone().sub(a0);
      rb.add(G.capsule(0.026, dir.length(), 1, 6), c.claw, new THREE.Matrix4().compose(a0.clone().add(a1).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.normalize()), V(1, 1, 1)), b['claw' + S]);
      rb.add(G.sphere(8, 6), c.claw, { x: s * 0.27, y: 0.18, z: 0.22, sx: 0.06, sy: 0.052, sz: 0.07 }, b['claw' + S]);
      rb.add(G.cone(0.03, 0.09, 5), (x, y, z, col) => col.set(y > 0.02 ? '#fff1d6' : c.claw), { x: s * 0.27, y: 0.165, z: 0.3, rx: Math.PI / 2, sz: 0.6 }, b['claw' + S]);
      rb.add(G.cone(0.03, 0.09, 5), (x, y, z, col) => col.set(y > 0.02 ? '#fff1d6' : c.claw), { x: s * 0.27, y: 0.2, z: 0.3, rx: Math.PI / 2, sz: 0.6 }, b['pincer' + S]);
      // three little legs per side
      for (let i = 0; i < 3; i++) {
        const z = 0.05 - i * 0.075;
        const bone = b['leg' + S + i] = rb.bone('leg' + S + i, b.body, [s * 0.15, 0.11, z]);
        const k0 = V(s * 0.15, 0.11, z), k1 = V(s * 0.26, 0.15, z - 0.01), k2 = V(s * 0.31, 0.01, z - 0.02);
        for (const [p0, p1] of [[k0, k1], [k1, k2]]) {
          const d = p1.clone().sub(p0);
          rb.add(G.capsule(0.017, d.length(), 1, 5), c.claw, new THREE.Matrix4().compose(p0.clone().add(p1).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()), V(1, 1, 1)), bone);
        }
      }
    }
    const bp = rb.build();
    bp.meta = { height: 0.33, length: 0.4, shadow: 0.55, shadowZ: 0.8, headZ: 0.1, hop: 0.2 };
    return bp;
  }

  get defaultAction() { return 'idle'; }
  get gaitActions() { return CRAB_GAIT; }
  get stride() { return 0.12; }
  get defaultSpeed() { return 0.5; }
  get reactDuration() { return 1.5; }

  applyPose(o) {
    super.applyPose(o);
    const B = this.bones, g = this.s.gait, amp = clamp(o.legFL, 0, 1.2);
    for (const S of ['L', 'R']) {
      const sd = S === 'L' ? 1 : -1;
      for (let i = 0; i < 3; i++) {
        const ph = g + i * 2.1 + (S === 'L' ? 0 : Math.PI);
        B['leg' + S + i].rotation.set(0, sd * 0.35 * amp * Math.cos(ph), sd * (0.45 * amp * Math.max(0, Math.sin(ph)) + 0.05 * Math.sin(this.time * 2 + i)));
      }
      B['claw' + S].rotation.set(-0.5 * (sd > 0 ? o.wingL : o.wingR), 0, sd * 0.6 * (sd > 0 ? o.wingL : o.wingR));
      B['pincer' + S].rotation.x = -0.6 * clamp(o.jaw, 0, 1.2);
    }
    B.earL.rotation.set(0.3 * o.earL, 0, -0.2 * o.earL);
    B.earR.rotation.set(0.3 * o.earR, 0, 0.2 * o.earR);
  }

  reactPose(o, t) {
    const w = super.reactPose(o, t);
    const k = win(t, 0.1, 1.3, 0.1, 0.25);
    o.wingL = o.wingR = 1.2 * k; o.jaw = Math.max(0, Math.sin(t * 22)) * k; o.earL = o.earR = 0.8 * Math.sin(t * 15) * k;
    return w;
  }
}
const CRAB_GAIT = new Set(['scuttle', 'walk', 'run']);
Crab.ACTIONS = {
  idle(o, t, s) {
    const T = t * s.tempo + s.phase;
    o.earL = Math.sin(T * 1.7); o.earR = Math.sin(T * 1.3 + 1);
    o.wingL = 0.15 + 0.1 * Math.sin(T * 0.8); o.wingR = 0.15 + 0.1 * Math.sin(T * 0.9 + 1);
    o.jaw = 0.3 * Math.max(0, Math.sin(T * 1.1)) + 0.4 * Math.max(0, Math.sin(T * 9)) * win(T % 6, 4, 5);
    o.by = 0.006 * Math.sin(T * 3); o.bsq = 0.02 * Math.sin(T * 3);
    o.legFL = 0.15 * win(T % 5, 2, 3);
  },
  scuttle(o, t, s) { // sideways! (the Walker points the root along the path; the crab turns side-on)
    const T = t * s.tempo;
    o.bry = -Math.PI / 2; o.legFL = 1; o.by = 0.012 * Math.abs(Math.sin(s.gait * 2)); o.roll = 0.06 * Math.sin(s.gait * 2);
    o.wingL = o.wingR = 0.4; o.jaw = 0.2 + 0.2 * Math.sin(T * 7); o.earL = 0.5 * Math.sin(T * 9); o.earR = 0.5 * Math.sin(T * 9 + 1);
  },
  snap(o, t, s) { // claws up, snip snip!
    const T = t * s.tempo + s.phase;
    o.wingL = o.wingR = 1.25; o.jaw = Math.max(0, Math.sin(T * 14)) * 1.1; o.by = 0.03 * Math.abs(Math.sin(T * 7));
    o.earL = o.earR = 0.3 * Math.sin(T * 5); o.legFL = 0.25;
  },
  wave(o, t, s) {
    const T = t * s.tempo;
    o.wingL = 1.4 + 0.25 * Math.sin(T * 8); o.wingR = 0.2; o.jaw = 0.5; o.earL = 0.4 * Math.sin(T * 4);
  },
  hide(o, t, s) { // pulls everything in and peeps
    const T = t * s.tempo + s.phase;
    o.by = -0.04; o.bsq = -0.15; o.wingL = o.wingR = -0.3; o.earL = o.earR = -0.8; o.lid = 0.3 * Math.max(0, Math.sin(T * 0.8));
  },
};
Crab.ACTIONS.walk = Crab.ACTIONS.scuttle;
Crab.ACTIONS.run = (o, t, s) => { Crab.ACTIONS.scuttle(o, t, s); o.legFL = 1.2; };
