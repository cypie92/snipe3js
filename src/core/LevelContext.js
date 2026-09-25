// The API handed to level builders (see docs/DESIGN.md "Level module contract").
import * as THREE from 'three';
import { Rng } from './rng.js';
import { sound } from './sound.js';

export class LevelContext {
  constructor(game, def) {
    this.game = game;
    this.def = def;
    this.root = new THREE.Group();
    this.root.name = `level:${def.id}`;
    this.rng = new Rng(`${def.id}:${def.seed || 1}`);
    this.updaters = [];
    this.collectibles = [];
    this.bystanders = [];
    this.actors = [];
    this.flocks = [];
    this.smokers = [];
  }

  get fx() { return this.game.fx; }
  get audio() { return sound; }
  get tweens() { return this.game.tweens; }
  get env() { return this.game.env; }
  get camera() { return this.game.camera; }
  get jobs() { return this.game.jobs; }

  /** Register a job (see Jobs.add for the definition shape). */
  job(def) {
    return this.game.jobs.add(def);
  }

  /** Hitting this object = Bad Hit. opts: { actor, name, onHit } */
  bystander(obj, opts = {}) {
    obj.userData.hit = { kind: 'bystander', actor: opts.actor || null, name: opts.name || obj.name, onHit: opts.onHit };
    this.bystanders.push(obj);
    return obj;
  }

  /** A character/animal with { root, update(dt,t), react(hit) }. Adds, updates and protects it. */
  actor(a, opts = {}) {
    if (a.root && !a.root.parent) (opts.parent || this.root).add(a.root);
    if (a.update) this.onUpdate((dt, t) => a.update(dt, t));
    if (opts.bystander !== false) this.bystander(a.root, { actor: a, name: opts.name });
    this.actors.push(a);
    return a;
  }

  /** Something with scare(point) (pigeon flocks etc.) — scared by nearby impacts. */
  flock(f) {
    if (f.root && !f.root.parent) this.root.add(f.root);
    if (f.update) this.onUpdate((dt, t) => f.update(dt, t));
    this.flocks.push(f);
    return f;
  }

  /** Fun reaction, no penalty. opts: { onHit(hit, obj), surface, once } */
  prop(obj, opts = {}) {
    obj.userData.hit = { kind: 'prop', ...opts };
    return obj;
  }

  /** Golden Spanner style collectible. */
  collectible(obj, opts = {}) {
    obj.userData.hit = { kind: 'collectible', id: opts.id || `spanner${this.collectibles.length + 1}`, onCollect: opts.onCollect };
    this.collectibles.push(obj);
    return obj;
  }

  /** Impact effect type for scenery: wood|metal|stone|soft|glass|water|grass|dust|leaves */
  surface(obj, type) {
    obj.userData.surface = type;
    return obj;
  }

  /** Invisible enlarged hit area for a thin/small target. */
  collider(parent, geometry, offset = {}) {
    const m = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    m.visible = false;
    m.userData.collider = true;
    m.position.set(offset.x || 0, offset.y || 0, offset.z || 0);
    parent.add(m);
    return m;
  }

  /** Chimney-style smoke source at a world position. */
  smoke(position, { rate = 1.2, color } = {}) {
    this.smokers.push({ position: position.clone(), rate, color, acc: Math.random() });
  }

  onUpdate(fn) {
    this.updaters.push(fn);
  }

  to(target, props, opts) {
    return this.game.tweens.to(target, props, opts);
  }

  delay(seconds, fn) {
    return this.game.tweens.delay(seconds, fn);
  }

  say(obj, text, opts) {
    this.game.popups.bubble(obj, text, opts);
  }

  popText(pos, text, opts) {
    this.game.popups.text(pos, text, opts);
  }

  sfx(name, opts) {
    sound.sfx(name, opts);
  }

  update(dt, t) {
    for (const fn of this.updaters) fn(dt, t);
    for (const s of this.smokers) {
      s.acc += dt * s.rate;
      while (s.acc >= 1) {
        s.acc -= 1;
        this.game.fx.burst('smoke', s.position, null, { scale: 1, color: s.color });
      }
    }
  }
}
