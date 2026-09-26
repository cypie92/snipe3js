// Puddleby Green: character helpers — one shared blob-shadow draw call for everyone, speech bubbles,
// scoped "chatter" (villagers mutter lines when you look at them through the scope) and cheering.
import * as THREE from 'three';
import { Person } from '../../world/characters/index.js';
import { BlobShadows } from '../../world/characters/icons.js';

const _v = new THREE.Vector3();
const WOMAN_HAIR = ['bun', 'bob', 'pigtails', 'long', 'ponytail'];

/** Babble voice for a villager (the lead's speech bubbles read root.userData.voice). */
function voiceOf(cfg = {}, preset) {
  if (cfg.kid || cfg.age === 'kid') return 'kid';
  if (preset === 'vicar' || preset === 'tourist') return 'posh';
  if (cfg.elder || cfg.age === 'elder' || preset === 'oldLady') return 'old';
  if (preset === 'bride' || cfg.top?.type === 'dress' || cfg.bottom?.type === 'skirt' || WOMAN_HAIR.includes(cfg.hair?.style)) return 'woman';
  return 'man';
}

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
  person(opts, x, z, ry = 0, action, actionOptions, { y = 0, name, lines, blob = true, voice } = {}) {
    const p = new Person({ ...opts, shadow: false });
    p.root.position.set(x, y, z);
    p.root.rotation.y = ry;
    p.root.userData.voice = voice || voiceOf(p.config, opts.preset);
    if (action) p.setAction(action, actionOptions || {}, 0);
    if (name) p.root.name = name;
    this.ctx.actor(p, { name: name || opts.preset || 'villager' });
    if (blob) this.shadows.attach(p);
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

  /** Fade out any bubble currently above these characters (so reaction lines never pile up). */
  hush(...ps) {
    const items = this.ctx.game?.popups?.items;
    if (!items) return;
    const roots = new Set(ps.map((p) => p.root || p));
    for (const it of items) if (it.bubble && roots.has(it.obj)) it.duration = Math.min(it.duration, it.t + 0.25);
  }

  /** Scripted line: replaces the speaker's current bubble and holds idle chatter back while it plays. */
  say(p, text, duration = 2.6) {
    this.hush(p);
    this.ctx.say(p.root || p, text, { duration });
    this.chatT = Math.max(this.chatT, duration + 0.8);
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
    this.hush(best.p);
    this.ctx.say(best.p.root, lines[best.i++ % lines.length], { duration: 2.8 });
  }

  /**
   * Sun shadows only for characters near the perch (the far ones keep their contact blob). Saves a
   * shadow-pass draw call + ~3k triangles per distant villager.
   */
  shadowLod(dt, near = 46) {
    this.lodT = (this.lodT ?? 0) - dt;
    if (this.lodT > 0) return;
    this.lodT = 0.5;
    const cam = this.ctx.game.rig.position;
    for (const c of [...this.people, ...this.animals]) {
      if (!c.mesh || c.noShadow) continue;
      c.root.getWorldPosition(_v);
      c.mesh.castShadow = _v.distanceTo(cam) < near;
    }
  }

  finish() {
    this.shadowLod(1);
    this.ctx.onUpdate((dt) => {
      this.shadows.update();
      this.update(dt);
      this.shadowLod(dt);
    });
  }
}

export { Person };
