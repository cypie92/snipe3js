// A flock of pigeons pottering about an area: pecking, strutting, hopping. scare(point) makes the
// ones nearby burst into flight, circle overhead for a few seconds, then glide back down and land
// somewhere else in the area. Shooting any pigeon (react) scares the flock around it.
//   const flock = new PigeonFlock({ seed: 4, count: 10, area: { x: 5, z: -3, w: 8, d: 6 } });
//   scene.add(flock.root); flock.update(dt, t); flock.scare(hitPoint);
import * as THREE from 'three';
import { Rng } from '../../../core/rng.js';
import { Pigeon } from './birds.js';
import { dampAngle, clamp, TAU } from '../anim.js';
import { BlobShadows } from '../icons.js';

const _d = new THREE.Vector3();

export class PigeonFlock {
  /** opts: seed, count, area {x, z, w, d} | {x, z, r}, groundY (number | fn(x,z)), variant, species (default Pigeon) */
  constructor(opts = {}) {
    this.rng = new Rng(opts.seed ?? 1);
    this.area = opts.area || { x: 0, z: 0, w: 6, d: 6 };
    this.groundY = typeof opts.groundY === 'function' ? opts.groundY : () => opts.groundY ?? 0;
    this.root = new THREE.Group();
    this.root.name = 'pigeon-flock';
    this.birds = [];
    const Species = opts.species || Pigeon;
    const n = opts.count ?? 8;
    this.shadows = new BlobShadows(n);
    this.root.add(this.shadows.mesh);
    for (let i = 0; i < n; i++) {
      const p = new Species({ seed: this.rng.int(1, 1e9), variant: opts.variant, shadow: false });
      this.shadows.attach(p);
      const spot = this._spot();
      p.root.position.set(spot.x, this.groundY(spot.x, spot.z), spot.z);
      p.root.rotation.y = this.rng.range(-Math.PI, Math.PI);
      const agent = new FlockAgent(this, p);
      p.controller = agent;
      const react = p.react.bind(p);
      p.react = (hit = {}) => { const d = react(hit); this.scare(hit.point || p.root.getWorldPosition(new THREE.Vector3()), 4); return d; };
      this.birds.push(p);
      this.root.add(p.root);
    }
  }

  get pigeons() { return this.birds; }
  get center() { return new THREE.Vector3(this.area.x, 0, this.area.z); }

  _spot() {
    const A = this.area, r = this.rng;
    if (A.r != null) { const a = r.range(0, TAU), d = Math.sqrt(r.random()) * A.r; return { x: A.x + Math.sin(a) * d, z: A.z + Math.cos(a) * d }; }
    return { x: A.x + r.range(-A.w / 2, A.w / 2), z: A.z + r.range(-A.d / 2, A.d / 2) };
  }

  /** Birds within `radius` of `point` (world) take off. Returns how many flew. */
  scare(point, radius = 7) {
    let n = 0;
    this.root.updateWorldMatrix(true, false);
    const lp = this.root.worldToLocal(point.clone());
    for (const b of this.birds) {
      const a = b.controller;
      if (a.state === 'fly' || a.state === 'circle' || a.state === 'return') continue;
      if (b.root.position.distanceTo(lp) < radius) { a.takeOff(lp); n++; }
    }
    return n;
  }

  update(dt, t) { for (const b of this.birds) b.update(dt, t); this.shadows.update(); }

  dispose() { for (const b of this.birds) b.dispose(); this.root.removeFromParent(); }
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
  }

  takeOff(from) {
    const p = this.b.root.position;
    _d.subVectors(p, from).setY(0);
    if (_d.lengthSq() < 1e-4) _d.set(this.rng.range(-1, 1), 0, this.rng.range(-1, 1));
    _d.normalize();
    this.vel.set(_d.x * this.rng.range(2.5, 4), this.rng.range(3.5, 5), _d.z * this.rng.range(2.5, 4));
    this.state = 'fly';
    this.timer = this.rng.range(1.0, 1.6);
    this.b.setAction('fly', {}, 0.08);
    this.b.hideShadow = true;
  }

  update(dt) {
    const b = this.b, root = b.root, f = this.flock;
    if (this.state === 'ground') {
      if (b.busy) return;
      this.timer -= dt;
      if (this.task === 'walk') {
        _d.subVectors(this.target, root.position).setY(0);
        const dist = _d.length();
        if (dist < 0.05 || this.timer <= 0) { this.timer = 0; }
        else {
          root.rotation.y = dampAngle(root.rotation.y, Math.atan2(_d.x, _d.z), 8, dt);
          const sp = 0.32;
          root.position.addScaledVector(_d.normalize(), Math.min(dist, sp * dt));
          root.position.y = f.groundY(root.position.x, root.position.z);
          b.speed = sp;
        }
      }
      if (this.timer <= 0) {
        const r = this.rng.random();
        if (r < 0.4) { this.task = 'peck'; b.setAction('peck'); this.timer = this.rng.range(1.5, 4); }
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
      if (this.timer <= 0) {
        this.state = 'circle';
        this.timer = this.rng.range(3, 6);
        this.circleR = this.rng.range(4, 7);
        this.circleH = this.rng.range(5, 8);
        this.circleA = Math.atan2(p.x - f.area.x, p.z - f.area.z);
        this.circleDir = this.rng.sign();
        b.setAction('glide', { bank: this.circleDir * 0.35 }, 0.3);
      }
    } else if (this.state === 'circle') {
      this.circleA += this.circleDir * (4 / this.circleR) * dt;
      const tx = f.area.x + Math.sin(this.circleA) * this.circleR, tz = f.area.z + Math.cos(this.circleA) * this.circleR;
      const ty = f.groundY(tx, tz) + this.circleH;
      _d.set(tx - p.x, ty - p.y, tz - p.z);
      this.vel.lerp(_d.multiplyScalar(1.5), 1 - Math.exp(-3 * dt));
      p.addScaledVector(this.vel, dt);
      this.timer -= dt;
      if (Math.sin(this.timer * 3) > 0.7) { if (b.action !== 'fly') b.setAction('fly', {}, 0.15); } else if (b.action !== 'glide') b.setAction('glide', { bank: this.circleDir * 0.35 }, 0.3);
      if (this.timer <= 0) {
        this.state = 'return';
        const s = f._spot();
        this.target.set(s.x, f.groundY(s.x, s.z), s.z);
        b.setAction('glide', { bank: 0 }, 0.3);
      }
    } else if (this.state === 'return') {
      _d.subVectors(this.target, p);
      const dist = _d.length();
      const sp = clamp(dist * 1.2, 1.2, 5);
      this.vel.lerp(_d.normalize().multiplyScalar(sp), 1 - Math.exp(-3 * dt));
      p.addScaledVector(this.vel, dt);
      if (dist < 1.2 && b.action !== 'land') b.setAction('land', {}, 0.2);
      if (dist < 0.08 || p.y < this.target.y) {
        p.copy(this.target);
        this.vel.set(0, 0, 0);
        this.state = 'ground';
        this.task = 'idle';
        this.timer = this.rng.range(0.5, 2);
        b.setAction('idle', {}, 0.25);
        b.hideShadow = false;
      }
    }
    const h = this.vel.x * this.vel.x + this.vel.z * this.vel.z;
    if (h > 0.01) root.rotation.y = dampAngle(root.rotation.y, Math.atan2(this.vel.x, this.vel.z), 6, dt);
  }
}
