// Puddleby Green: character helpers — one shared blob-shadow draw call for everyone, speech bubbles,
// scoped "chatter" (villagers mutter lines when you look at them through the scope) and cheering.
import * as THREE from 'three';
import { Person } from '../../world/characters/index.js';
import { BlobShadows } from '../../world/characters/icons.js';

const _v = new THREE.Vector3();

export class Cast {
  constructor(ctx) {
    this.ctx = ctx;
    this.shadows = new BlobShadows(110);
    this.shadows.mesh.name = 'village-blobs';
    ctx.root.add(this.shadows.mesh);
    this.people = [];
    this.animals = [];
    this.talkers = [];
    this.chatT = 4;
    this.lastTalker = null;
  }

  /** Create + register a villager. opts: Person options (preset allowed). */
  person(opts, x, z, ry = 0, action, actionOptions, { y = 0, name, lines } = {}) {
    const p = new Person({ ...opts, shadow: false });
    p.root.position.set(x, y, z);
    p.root.rotation.y = ry;
    if (action) p.setAction(action, actionOptions || {}, 0);
    if (name) p.root.name = name;
    this.ctx.actor(p, { name: name || opts.preset || 'villager' });
    this.shadows.attach(p);
    this.people.push(p);
    if (lines) this.talkers.push({ p, lines, i: 0 });
    return p;
  }

  /** Register an animal (any class from the characters kit). */
  animal(a, x, z, ry = 0, { y = 0, blob = true, name } = {}) {
    a.root.position.set(x, y, z);
    a.root.rotation.y = ry;
    this.ctx.actor(a, { name: name || a.species });
    if (blob) this.shadows.attach(a);
    this.animals.push(a);
    return a;
  }

  say(p, text, duration = 2.6) {
    this.ctx.say(p.root || p, text, { duration });
  }

  /** Nearby villagers celebrate (hop + heart). */
  cheerNear(point, radius = 12, { except = [], say = null } = {}) {
    let n = 0;
    for (const p of this.people) {
      if (except.includes(p) || !p.root.visible) continue;
      p.root.getWorldPosition(_v);
      if (_v.distanceTo(point) > radius) continue;
      p.celebrate();
      if (say && n === 0) this.say(p, say, 2.2);
      n++;
    }
    return n;
  }

  /** Nearby villagers jump (after a bad hit, a crash...). */
  startle(point, radius = 5, except = []) {
    for (const p of this.people) {
      if (except.includes(p) || p.busy) continue;
      p.root.getWorldPosition(_v);
      if (_v.distanceTo(point) < radius) p.react({ origin: point });
    }
  }

  /** Scoped chatter: characters you look at through the scope say their lines. */
  update(dt) {
    const game = this.ctx.game;
    this.chatT -= dt;
    if (this.chatT > 0 || !this.talkers.length || game.state !== 'play') return;
    const scoped = game.rig.scoped && game.rig.zoom >= 2;
    this.chatT = scoped ? 2.2 : 7;
    if (!scoped) return;
    const cam = this.ctx.camera;
    let best = null, bestD = 0.22;
    for (const t of this.talkers) {
      if (t === this.lastTalker || t.p.busy || !t.p.root.visible) continue;
      t.p.root.getWorldPosition(_v);
      _v.y += 1.2;
      _v.project(cam);
      if (_v.z > 1) continue;
      const d = Math.hypot(_v.x, _v.y);
      if (d < bestD) { bestD = d; best = t; }
    }
    if (!best) return;
    this.lastTalker = best;
    const lines = typeof best.lines === 'function' ? best.lines() : best.lines;
    if (!lines?.length) return;
    this.say(best.p, lines[best.i++ % lines.length], 2.8);
  }

  finish() {
    this.ctx.onUpdate((dt) => {
      this.shadows.update();
      this.update(dt);
    });
  }
}

export { Person };
