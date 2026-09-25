// Crowd: seeded villagers spread over an area without overlaps. Some chat in face-to-face groups,
// some stroll along given paths, the rest idle and now and then do something (look up, wave,
// point, scratch their head...). One update() drives everyone.
//   const crowd = new Crowd({ seed: 3, area: { x: 0, z: 0, w: 30, d: 20 }, count: 30, groups: 4,
//                             paths: [[[-10, 5], [10, 5]]], avoid: [{ x: 0, z: 0, r: 4 }] });
//   level.add(crowd.root); onUpdate((dt, t) => crowd.update(dt, t));
import * as THREE from 'three';
import { Rng } from '../../core/rng.js';
import { Person } from './Person.js';
import { Walker } from './Walker.js';
import { TAU } from './anim.js';
import { BlobShadows } from './icons.js';

const FLAVOURS = ['lookUp', 'wave', 'point', 'scratch', 'clap', 'shrug', 'talk'];
const PROP_ACTION = { newspaper: 'read', camera: 'photo', icecream: 'eat', broom: 'sweep' };

export class Crowd {
  /**
   * opts: seed | rng, area {x, z, w, d} (rect) or {x, z, r} (disc), count, groups (number of chat groups),
   *   groupSize [min, max] (default [2, 3]), paths [[pts]...] (points as [x,z] | [x,y,z] | Vector3),
   *   walkers (how many use the paths, default ~25% of count), avoid [{x, z, r}], spacing (default 1.1 m),
   *   presets [names] mixed in, personOptions {} applied to every random villager,
   *   ambient (true: idlers occasionally do flavour actions), groundY(x, z) -> y
   */
  constructor(opts = {}) {
    this.rng = opts.rng || new Rng(opts.seed ?? 1);
    const rng = this.rng;
    this.root = new THREE.Group();
    this.root.name = 'crowd';
    this.people = [];
    this.walkers = [];
    this.groups = [];
    this.idlers = [];
    this.ambient = opts.ambient !== false;
    this.spacing = opts.spacing ?? 1.1;
    this.area = opts.area || { x: 0, z: 0, w: 20, d: 20 };
    this.avoid = opts.avoid || [];
    this.groundY = opts.groundY || null;
    this.placed = [];
    const count = opts.count ?? 20;
    const presets = (opts.presets || []).slice();
    // all contact shadows of the crowd in one instanced draw call
    this.shadows = new BlobShadows(count + 4);
    this.root.add(this.shadows.mesh);
    const make = () => {
      const pre = presets.length ? presets.shift() : null;
      const po = { ...(opts.personOptions || {}), shadow: false };
      const p = pre ? Person.preset(pre, { seed: rng.int(1, 1e9), shadow: false }) : Person.random(rng, po);
      this.people.push(p);
      this.root.add(p.root);
      this.shadows.attach(p);
      return p;
    };

    // walkers along paths (idlers and chat groups keep off the paths)
    const paths = opts.paths || [];
    for (const path of paths) {
      const pts = path.map((q) => (q.isVector3 ? q : q.length === 2 ? new THREE.Vector3(q[0], 0, q[1]) : new THREE.Vector3(q[0], q[1], q[2])));
      for (let i = 0; i < pts.length - 1; i++) {
        const n = Math.ceil(pts[i].distanceTo(pts[i + 1]) / 0.8);
        for (let k = 0; k <= n; k++) {
          const q = pts[i].clone().lerp(pts[i + 1], k / n);
          this.placed.push({ x: q.x, z: q.z, r: 0.7 });
        }
      }
    }
    const nWalk = paths.length ? (opts.walkers ?? Math.max(1, Math.round(count * 0.25))) : 0;
    for (let i = 0; i < nWalk; i++) {
      const p = make();
      const path = paths[i % paths.length];
      const closed = path.length > 2 && !opts.openPaths;
      const w = new Walker(p, path, {
        loop: closed && rng.chance(0.7), pingPong: !closed || rng.chance(0.3), start: rng.random(), startFraction: true,
        reverse: rng.chance(0.5), speed: (p.config.elder ? 0.7 : p.config.kid ? 1.35 : 1.1) * rng.range(0.9, 1.1),
        groundY: this.groundY, lane: 0.35,
      });
      if (p.config.kid && rng.chance(0.3)) { w.speed = 2.4; w.action = 'run'; p.setAction('run'); }
      w.baseSpeed = w.speed;
      w.pathId = i % paths.length;
      this.walkers.push(w);
    }

    // chat groups
    const nGroups = opts.groups ?? Math.round(count / 8);
    const [gMin, gMax] = opts.groupSize || [2, 3];
    for (let g = 0; g < nGroups && this.people.length < count; g++) {
      const n = Math.min(rng.int(gMin, gMax), count - this.people.length);
      if (n < 2) break;
      const rad = n === 2 ? 0.55 : 0.68;
      const c = this._spot(rad + this.spacing * 0.5);
      if (!c) break;
      const group = [];
      const a0 = rng.range(0, TAU);
      for (let k = 0; k < n; k++) {
        const p = make();
        const a = a0 + (k / n) * TAU + rng.range(-0.15, 0.15);
        p.root.position.set(c.x + Math.sin(a) * rad, 0, c.z + Math.cos(a) * rad);
        p.root.position.y = this.groundY ? this.groundY(p.root.position.x, p.root.position.z) : 0;
        p.faceTowards(new THREE.Vector3(c.x, 0, c.z));
        p.root.rotation.y += rng.range(-0.12, 0.12);
        p.s.talkPhase = (k / n) * TAU + rng.range(-0.3, 0.3);
        p.setAction('talk', { period: rng.range(4.5, 7) }, 0);
        group.push(p);
      }
      // everybody glances at whoever is talking
      this.groups.push({ people: group, center: new THREE.Vector3(c.x, 1.2, c.z) });
    }

    // idlers
    while (this.people.length < count) {
      const c = this._spot(this.spacing * 0.5);
      if (!c) break;
      const p = make();
      p.root.position.set(c.x, this.groundY ? this.groundY(c.x, c.z) : 0, c.z);
      p.root.rotation.y = rng.range(-Math.PI, Math.PI);
      const held = p.fixedProps?.R?.type;
      const act = PROP_ACTION[held] && rng.chance(0.6) ? PROP_ACTION[held] : 'idle';
      p.setAction(act, {}, 0);
      this.idlers.push({ p, base: act, next: rng.range(3, 12), until: 0 });
    }
  }

  // rejection sampling for a free spot of radius r inside the area
  _spot(r) {
    const rng = this.rng, A = this.area;
    for (let tries = 0; tries < 60; tries++) {
      let x, z;
      if (A.r != null) { const a = rng.range(0, TAU), d = Math.sqrt(rng.random()) * (A.r - r); x = A.x + Math.sin(a) * d; z = A.z + Math.cos(a) * d; }
      else { x = A.x + rng.range(-A.w / 2 + r, A.w / 2 - r); z = A.z + rng.range(-A.d / 2 + r, A.d / 2 - r); }
      if (this.avoid.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + r)) continue;
      if (this.placed.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + r)) continue;
      this.placed.push({ x, z, r });
      return { x, z };
    }
    return null;
  }

  update(dt, t) {
    if (this.ambient) {
      for (const it of this.idlers) {
        if (it.p.busy) continue;
        it.next -= dt;
        if (it.until > 0) {
          it.until -= dt;
          if (it.until <= 0) it.p.setAction(it.base);
        } else if (it.next <= 0) {
          const f = this.rng.pick(FLAVOURS);
          it.p.setAction(f, f === 'talk' ? { role: 'speak' } : {});
          it.until = this.rng.range(2, 4.5);
          it.next = it.until + this.rng.range(6, 16);
        }
      }
    }
    // walkers sharing a path keep a little gap (the one behind eases off)
    const W = this.walkers;
    for (const w of W) w.speed = w.baseSpeed;
    for (let i = 0; i < W.length; i++) {
      for (let j = 0; j < W.length; j++) {
        if (i === j || W[i].pathId !== W[j].pathId) continue;
        const a = W[i].person.root.position, b = W[j].person.root.position;
        const dx = b.x - a.x, dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 1.4 * 1.4) continue;
        const yaw = W[i].person.root.rotation.y;
        if (Math.cos(yaw - W[j].person.root.rotation.y) < 0.3) continue; // opposite ways: lanes keep them apart
        if (Math.sin(yaw) * dx + Math.cos(yaw) * dz > 0) W[i].speed = W[i].baseSpeed * (d2 < 0.8 * 0.8 ? 0.05 : 0.45); // j is ahead of i
      }
    }
    for (const p of this.people) p.update(dt, t);
    this.shadows.update();
  }

  /** Make everyone within radius of a world point jump (e.g. after a nearby bad hit). */
  startle(point, radius = 6) {
    for (const p of this.people) {
      if (p.busy) continue;
      if (p.root.position.distanceTo(point) < radius) p.react({ origin: point });
    }
  }

  /** Everyone in the crowd celebrates (e.g. job complete nearby). */
  celebrate(point, radius = Infinity) {
    for (const p of this.people) if (!point || p.root.position.distanceTo(point) < radius) p.celebrate();
  }

  forEach(fn) { this.people.forEach(fn); }

  dispose() { for (const p of this.people) p.dispose(); this.root.removeFromParent(); }
}
