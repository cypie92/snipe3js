// Bird flocks. PigeonFlock: pigeons pottering about an area (pecking, strutting, hopping); scare(point)
// sends the ones nearby up into the air to circle and land again elsewhere. GullFlock: the same for
// gulls, with harbour extras: perches (bollards, roofs, masts), floating on the water, wide high circles
// over the basin, squawking, and the chip-stealing gag (stealChip(person)).
//   const flock = new PigeonFlock({ seed: 4, count: 10, area: { x: 5, z: -3, w: 8, d: 6 } });
//   scene.add(flock.root); flock.update(dt, t); flock.scare(hitPoint);
// Shooting any bird (react) scares the flock around it.
import * as THREE from 'three';
import { Rng } from '../../../core/rng.js';
import { Pigeon, Gull } from './birds.js';
import { dampAngle, clamp, TAU } from '../anim.js';
import { BlobShadows } from '../icons.js';
import { emitCharacterEvent } from '../events.js';

const _d = new THREE.Vector3();
const _w = new THREE.Vector3();
const AIR = new Set(['fly', 'circle', 'return', 'swoop', 'carry']);

export class PigeonFlock {
  /**
   * opts: seed, count, area {x, z, w, d} | {x, z, r}, groundY (number | fn(x,z)), variant, species (default Pigeon),
   *   perches [Vector3 | [x,y,z]] landing spots, water { y, area } (birds may float there), circle {x, z} centre of
   *   the circling (default: area centre), tune { circleR, circleH, circleT, climb, flee, perchChance, waterChance }
   */
  constructor(opts = {}) {
    this.rng = new Rng(opts.seed ?? 1);
    this.area = opts.area || { x: 0, z: 0, w: 6, d: 6 };
    this.groundY = typeof opts.groundY === 'function' ? opts.groundY : () => opts.groundY ?? 0;
    this.perches = (opts.perches || []).map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(...p)));
    this.water = opts.water || null;
    this.circleC = opts.circle ? new THREE.Vector3(opts.circle.x, 0, opts.circle.z) : null;
    this.tune = { circleR: [4, 7], circleH: [5, 8], circleT: [3, 6], climb: [3.5, 5], flee: [2.5, 4], perchChance: 0.35, waterChance: 0.3, ...this.defaults, ...(opts.tune || {}) };
    this.root = new THREE.Group();
    this.root.name = opts.name || 'bird-flock';
    this.birds = [];
    const Species = opts.species || this.species || Pigeon;
    const n = opts.count ?? 8;
    this.shadows = new BlobShadows(n);
    this.root.add(this.shadows.mesh);
    this._taken = new Set();
    for (let i = 0; i < n; i++) {
      const p = new Species({ seed: this.rng.int(1, 1e9), variant: opts.variant, shadow: false });
      this.shadows.attach(p);
      const agent = new FlockAgent(this, p);
      p.controller = agent;
      agent.settle(this._landingSpot(agent), true);
      p.root.rotation.y = this.rng.range(-Math.PI, Math.PI);
      const react = p.react.bind(p);
      p.react = (hit = {}) => { const d = react(hit); this.scare(hit.point || p.root.getWorldPosition(new THREE.Vector3()), 4); return d; };
      this.birds.push(p);
      this.root.add(p.root);
    }
  }

  get pigeons() { return this.birds; }
  get center() { return new THREE.Vector3(this.area.x, 0, this.area.z); }

  _spot(A = this.area) {
    const r = this.rng;
    if (A.r != null) { const a = r.range(0, TAU), d = Math.sqrt(r.random()) * A.r; return { x: A.x + Math.sin(a) * d, z: A.z + Math.cos(a) * d }; }
    return { x: A.x + r.range(-A.w / 2, A.w / 2), z: A.z + r.range(-A.d / 2, A.d / 2) };
  }

  // where a bird lands: a free perch, the water, or the ground area
  _landingSpot(agent) {
    const r = this.rng, T = this.tune;
    if (agent.perch) this._taken.delete(agent.perch);
    agent.perch = null;
    const free = this.perches.filter((p) => !this._taken.has(p));
    if (free.length && r.chance(T.perchChance)) {
      const p = r.pick(free);
      this._taken.add(p);
      agent.perch = p;
      return { pos: p.clone(), kind: 'perch' };
    }
    if (this.water && r.chance(T.waterChance)) {
      const s = this._spot(this.water.area);
      return { pos: new THREE.Vector3(s.x, this.water.y, s.z), kind: 'water' };
    }
    const s = this._spot();
    return { pos: new THREE.Vector3(s.x, this.groundY(s.x, s.z), s.z), kind: 'ground' };
  }

  /** Birds within `radius` of `point` (world) take off. Returns how many flew. */
  scare(point, radius = 7) {
    let n = 0;
    this.root.updateWorldMatrix(true, false);
    const lp = this.root.worldToLocal(point.clone());
    for (const b of this.birds) {
      const a = b.controller;
      if (AIR.has(a.state)) continue;
      if (b.root.position.distanceTo(lp) < radius) { a.takeOff(lp); n++; }
    }
    return n;
  }

  update(dt, t) { for (const b of this.birds) b.update(dt, t); this.shadows.update(); }

  dispose() { for (const b of this.birds) b.dispose(); this.root.removeFromParent(); }
}

/** Gulls: harbour flock with perches, water, big circles, squawks and chip theft. */
export class GullFlock extends PigeonFlock {
  get species() { return Gull; }
  get defaults() { return { circleR: [7, 13], circleH: [8, 13], circleT: [4, 8], climb: [4, 6], flee: [3, 5] }; }

  constructor(opts = {}) {
    super({ name: 'gull-flock', ...opts });
    this.victims = [];
  }

  /**
   * Gag: the nearest settled gull swoops on `person`'s chips, snatches one and flies off with it; the
   * person jumps ("!?") and shakes a fist. Returns seconds until the snatch (or 0 if no gull is free).
   */
  stealChip(person, { onSnatch } = {}) {
    person.root.getWorldPosition(_w);
    const lp = this.root.worldToLocal(_w.clone());
    let best = null, bd = Infinity;
    for (const b of this.birds) {
      if (AIR.has(b.controller.state) || b.busy) continue;
      const d = b.root.position.distanceToSquared(lp);
      if (d < bd) { bd = d; best = b; }
    }
    if (!best) return 0;
    best.controller.swoop(person, onSnatch);
    return Math.sqrt(bd) / 6 + 0.8;
  }

  update(dt, t) {
    super.update(dt, t);
    for (const b of this.birds) { // squawk now and then
      const a = b.controller;
      if ((a.state === 'ground' || a.state === 'perched') && a.task !== 'squawk' && !b.busy && this.rng.random() < dt * 0.04) {
        a.task = 'squawk'; b.setAction('squawk'); a.timer = 2.2;
        emitCharacterEvent('squawk', b);
      }
    }
  }
}

class FlockAgent {
  constructor(flock, bird) {
    this.flock = flock;
    this.b = bird;
    this.rng = flock.rng.fork(bird.s.seed);
    this.state = 'ground';
    this.timer = this.rng.range(0.5, 3);
    this.task = 'idle';
    this.target = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.circleA = 0;
    this.perch = null;
    this.landing = null;
  }

  // put the bird down at a landing spot (instant when `snap`)
  settle(spot, snap = false) {
    const b = this.b;
    if (snap) b.root.position.copy(spot.pos);
    this.state = spot.kind === 'perch' ? 'perched' : spot.kind === 'water' ? 'float' : 'ground';
    this.task = 'idle';
    this.timer = this.rng.range(0.5, 2);
    b.airborne = false;
    b.hideShadow = this.state === 'float';
    b.setAction(this.state === 'float' && b.hasAction('float') ? 'float' : 'idle', {}, snap ? 0 : 0.25);
  }

  takeOff(from) {
    const p = this.b.root.position, T = this.flock.tune;
    _d.subVectors(p, from).setY(0);
    if (_d.lengthSq() < 1e-4) _d.set(this.rng.range(-1, 1), 0, this.rng.range(-1, 1));
    _d.normalize();
    const fl = this.rng.range(...T.flee);
    this.vel.set(_d.x * fl, this.rng.range(...T.climb), _d.z * fl);
    this.state = 'fly';
    this.timer = this.rng.range(1.0, 1.6);
    this.b.setAction('fly', {}, 0.08);
    this.b.airborne = true;
    this.b.hideShadow = true;
    if (this.perch) { this.flock._taken.delete(this.perch); this.perch = null; }
  }

  swoop(person, onSnatch) {
    this.victim = person;
    this.onSnatch = onSnatch;
    this.state = 'swoop';
    this.timer = 6;
    this.vel.set(0, 3, 0);
    this.b.setAction('fly', {}, 0.1);
    this.b.airborne = true;
    this.b.hideShadow = true;
    if (this.perch) { this.flock._taken.delete(this.perch); this.perch = null; }
  }

  _startCircle() {
    const b = this.b, f = this.flock, T = f.tune, p = b.root.position;
    const c = f.circleC || new THREE.Vector3(f.area.x, 0, f.area.z);
    this.state = 'circle';
    this.timer = this.rng.range(...T.circleT);
    this.circleR = this.rng.range(...T.circleR);
    this.circleH = this.rng.range(...T.circleH);
    this.circleA = Math.atan2(p.x - c.x, p.z - c.z);
    this.circleDir = this.rng.sign();
    b.setAction('glide', { bank: this.circleDir * 0.35 }, 0.3);
  }

  update(dt) {
    const b = this.b, root = b.root, f = this.flock;
    if (this.state === 'ground' || this.state === 'perched' || this.state === 'float') {
      if (b.busy) return;
      this.timer -= dt;
      if (this.task === 'walk') {
        _d.subVectors(this.target, root.position).setY(0);
        const dist = _d.length();
        if (dist < 0.05 || this.timer <= 0) this.timer = 0;
        else {
          root.rotation.y = dampAngle(root.rotation.y, Math.atan2(_d.x, _d.z), 8, dt);
          const sp = this.state === 'float' ? 0.18 : 0.32;
          root.position.addScaledVector(_d.normalize(), Math.min(dist, sp * dt));
          if (this.state === 'ground') root.position.y = f.groundY(root.position.x, root.position.z);
          b.speed = sp;
        }
      }
      if (this.timer <= 0) {
        const r = this.rng.random();
        const idleAct = this.state === 'float' && b.hasAction('float') ? 'float' : 'idle';
        if (this.state === 'perched') { this.task = 'idle'; b.setAction(r < 0.3 && b.hasAction('squawk') ? 'squawk' : 'idle'); this.timer = this.rng.range(2, 5); }
        else if (this.state === 'float') {
          if (r < 0.5) { this.task = 'walk'; const p = root.position; this.target.set(p.x + this.rng.range(-1, 1), p.y, p.z + this.rng.range(-1, 1)); this.timer = 5; }
          else { this.task = 'idle'; this.timer = this.rng.range(2, 5); }
          b.setAction(idleAct);
        } else if (r < 0.4) { this.task = 'peck'; b.setAction('peck'); this.timer = this.rng.range(1.5, 4); }
        else if (r < 0.75) {
          this.task = 'walk';
          const s = f._spot();
          const p = root.position;
          this.target.set(p.x + clamp(s.x - p.x, -1.5, 1.5), 0, p.z + clamp(s.z - p.z, -1.5, 1.5));
          b.setAction('walk'); this.timer = 5;
        } else if (r < 0.85) { this.task = 'hop'; b.setAction('hop'); this.timer = 1.1; }
        else { this.task = 'idle'; b.setAction('idle'); this.timer = this.rng.range(1, 3); }
      }
      return;
    }
    const p = root.position;
    if (this.state === 'fly') { // climb away
      this.vel.y -= 1.5 * dt;
      p.addScaledVector(this.vel, dt);
      this.timer -= dt;
      if (this.timer <= 0) this._startCircle();
    } else if (this.state === 'circle' || this.state === 'carry') {
      const c = f.circleC || new THREE.Vector3(f.area.x, 0, f.area.z);
      this.circleA += this.circleDir * (4.5 / this.circleR) * dt;
      const tx = c.x + Math.sin(this.circleA) * this.circleR, tz = c.z + Math.cos(this.circleA) * this.circleR;
      const ty = (f.water?.y ?? f.groundY(tx, tz)) + this.circleH;
      _d.set(tx - p.x, ty - p.y, tz - p.z);
      this.vel.lerp(_d.multiplyScalar(1.5), 1 - Math.exp(-3 * dt));
      p.addScaledVector(this.vel, dt);
      this.timer -= dt;
      if (Math.sin(this.timer * 3) > 0.7) { if (b.action !== 'fly') b.setAction('fly', {}, 0.15); } else if (b.action !== 'glide') b.setAction('glide', { bank: this.circleDir * 0.35 }, 0.3);
      if (this.timer <= 0) {
        this.state = 'return';
        this.landing = f._landingSpot(this);
        this.target.copy(this.landing.pos);
        b.setAction('glide', { bank: 0 }, 0.3);
      }
    } else if (this.state === 'swoop') { // dive onto the victim's chips
      const v = this.victim;
      const hand = v.heldProp?.('L')?.mesh || v.bones?.handL || v.root;
      hand.getWorldPosition(_w);
      f.root.worldToLocal(_w);
      _w.y += 0.12;
      _d.subVectors(_w, p);
      const dist = _d.length();
      const sp = clamp(dist * 2, 3, 7);
      this.vel.lerp(_d.normalize().multiplyScalar(sp), 1 - Math.exp(-6 * dt));
      p.addScaledVector(this.vel, dt);
      this.timer -= dt;
      if (dist < 0.3 || this.timer <= 0) { // snatch!
        b.holdingChip = true;
        v.tell?.('!?', { duration: 1.2 });
        v.perform?.('shakeFist', 2.8, { icon: false });
        emitCharacterEvent('stealChip', b, v);
        this.onSnatch?.(b, v);
        this.victim = null;
        this.vel.set(this.rng.range(-2, 2), 5, this.rng.range(-2, 2));
        this.state = 'fly';
        this.timer = 0.9;
        this._carrying = true;
      }
    } else if (this.state === 'return') {
      _d.subVectors(this.target, p);
      const dist = _d.length();
      const sp = clamp(dist * 1.2, 1.2, 6);
      this.vel.lerp(_d.normalize().multiplyScalar(sp), 1 - Math.exp(-3 * dt));
      p.addScaledVector(this.vel, dt);
      if (dist < 1.2 && b.action !== 'land') b.setAction('land', {}, 0.2);
      if (dist < 0.08 || p.y < this.target.y) {
        p.copy(this.target);
        this.vel.set(0, 0, 0);
        this.settle(this.landing || { pos: this.target, kind: 'ground' });
        if (this._carrying) { this._carrying = false; b.holdingChip = false; b.perform('peck', 1.2); } // gobbles the chip
      }
    }
    const h = this.vel.x * this.vel.x + this.vel.z * this.vel.z;
    if (h > 0.01) root.rotation.y = dampAngle(root.rotation.y, Math.atan2(this.vel.x, this.vel.z), 6, dt);
  }
}
