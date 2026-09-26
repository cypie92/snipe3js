// Shared base for all animals: same API shape as Person (root, setAction, react, celebrate, lookAt,
// update). Each species supplies a cached skinned blueprint (one draw call), an action library over
// the generic AnimalPose channels, and applyPose() mapping channels onto its bones.
import * as THREE from 'three';
import { Rng } from '../../../core/rng.js';
import { instantiate, G, shade } from '../rig.js';
import { Blender, createPoseType, clamp, damp, dampAngle, wrapAngle, bump, TAU, win, smooth } from '../anim.js';
import { IconPop, Snore, blobShadow, trackView, view, iconType } from '../icons.js';
import { characterMaterial, CHARACTER } from '../look.js';
import { emitCharacterEvent } from '../events.js';
import { setWet } from '../wet.js';

export const AnimalPose = createPoseType([
  'bx', 'by', 'bz', 'brx', 'bry', 'brz', 'bsq',
  'body', 'roll', 'yaw', 'bodyY',
  'neck', 'neckY', 'head', 'headY', 'headZ', 'headPz',
  'jaw', 'pouch', 'lid', 'earL', 'earR',
  'tailX', 'tailY', 'tail2',
  'wingL', 'wingR', 'wingFold',
  'legFL', 'legFR', 'legBL', 'legBR', 'kneeF', 'kneeB', 'pawL',
]);

const BLUEPRINTS = new Map();
const _v = new THREE.Vector3();

export class Animal {
  // species hooks (override in subclasses)
  static species = 'animal';
  static ACTIONS = {};
  static variants(rng) { return {}; }
  static build(cfg) { throw new Error('build() not implemented'); }

  static blueprint(cfg) {
    const key = `${this.species}:${JSON.stringify(cfg)}`;
    let bp = BLUEPRINTS.get(key);
    if (!bp) { bp = this.build(cfg); BLUEPRINTS.set(key, bp); }
    return bp;
  }

  /** opts: seed, variant fields (colours etc.), scale, action, shadow (bool), name */
  constructor(opts = {}) {
    const C = this.constructor;
    this.kind = 'animal';
    this.species = C.species;
    this.rng = new Rng(((opts.seed ?? 1) * 2654435761) >>> 0 || 7);
    this.config = { ...C.variants(new Rng(opts.seed ?? 1)), ...(opts.variant || {}) };
    for (const k of Object.keys(this.config)) if (opts[k] !== undefined) this.config[k] = opts[k];
    const bp = C.blueprint(this.config);
    this.meta = bp.meta || {};
    this.tris = bp.tris;
    const { mesh, bones } = instantiate(bp, characterMaterial());
    this.mesh = mesh;
    this.bones = bones;
    trackView(mesh);
    const h = this.meta.height || 0.5;
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, h * 0.5, 0), Math.max(h, this.meta.length || h) * 1.4 + 0.5);
    this.root = new THREE.Group();
    this.root.name = opts.name || this.species;
    this.body = new THREE.Group();
    this.scale = (opts.scale ?? this.config.scale ?? 1) * (opts.ignoreGlobalScale ? 1 : CHARACTER.scale);
    this.body.scale.setScalar(this.scale);
    this.root.add(this.body);
    this.body.add(mesh);
    this.root.userData.character = this;
    this.shadowSize = this.meta.shadow || 0.5;
    this.shadow = opts.shadow === false ? null : blobShadow(this.shadowSize);
    if (this.shadow) this.body.add(this.shadow);
    this.icon = new IconPop(this.body, h + 0.12, 0.5);
    this.snore = new Snore(this.body);
    this.snore.origin.set(0.1, h * 0.8, (this.meta.headZ || 0.1));
    this.s = {
      phase: this.rng.range(0, 100), tempo: this.rng.range(0.9, 1.1), energy: this.rng.range(0.9, 1.1),
      seed: this.rng.int(0, 996), gait: this.rng.range(0, TAU), speed: 0, lookYaw: 0, lookPitch: 0,
      blinkT: this.rng.range(0.5, 3), blinkAge: 9, react: 0,
    };
    this.rest = {};
    for (const [n, b] of Object.entries(bones)) this.rest[n] = { pos: b.position.clone(), quat: b.quaternion.clone() };
    this.blender = new Blender(AnimalPose, (name, t, o, opt) => (C.ACTIONS[name] || C.ACTIONS.idle)(o, t, this.s, opt, this));
    this.pose = new AnimalPose();
    this._ov = new AnimalPose();
    this.time = 0;
    this.speed = 0;
    this.controller = null;
    this.lookTarget = null;
    this.lookW = 0;
    this._react = null;
    this._celebrate = null;
    this.setAction(opts.action || this.defaultAction || 'idle', opts.actionOptions || {}, 0);
    this.update(0, 0);
  }

  get action() { return this.blender.cur.name; }
  get busy() { return !!(this._react || this._celebrate); }
  get position() { return this.root.position; }
  hasAction(name) { return !!this.constructor.ACTIONS[name]; }
  static get actions() { return Object.keys(this.ACTIONS); }

  setAction(name, opts = {}, fade = 0.3) {
    if (!this.constructor.ACTIONS[name]) name = 'idle';
    if (this.blender.set(name, opts, fade)) emitCharacterEvent('action', this, name, opts);
    this.snore.set(name === 'sleep');
    if (!opts._perform) this._perform = null;
    return this;
  }

  /** Play an action for `seconds`, then return to the previous one. Returns seconds. */
  perform(name, seconds = 2, opts = {}, fade = 0.25) {
    const back = this._perform?.back || { name: this.action, opts: this.blender.cur.opts };
    this.setAction(name, { ...opts, _perform: true }, fade);
    this._perform = { t: 0, dur: seconds, back };
    return seconds;
  }

  /** Pop a tell sticker ('!', '?', '♪', 'heart', ...). Returns the duration. */
  tell(type = '!', { duration = 1.4, size } = {}) {
    const t = iconType(type);
    this.icon.show(t, duration, size ?? this.icon.size);
    emitCharacterEvent('tell', this, t);
    return duration;
  }

  /** Repeat a tell sticker every `every` seconds (null to stop). */
  setTell(type, { every = 8, duration = 1.4 } = {}) {
    this._tell = type ? { type, every, duration, t: 0.2 } : null;
    return this;
  }

  lookAt(target) { this.lookTarget = target || null; return this; }

  faceTowards(point) {
    const p = this.root.position;
    this.root.rotation.y = Math.atan2(point.x - p.x, point.z - p.z);
    return this;
  }

  /** Startled hop + "!" (species may extend via onReact). Returns duration. */
  react(hit = {}) {
    this._react = { t: 0, dur: this.reactDuration || 1.4, face: 0 };
    const from = hit.origin || hit.from || (hit.ray && hit.ray.origin) || (view.has ? view.position : null);
    if (from && !this.flying) { // turn to glare / bark at the shooter
      this.root.updateWorldMatrix(true, false);
      _v.copy(from);
      this.root.worldToLocal(_v);
      this._react.face = clamp(wrapAngle(Math.atan2(_v.x, _v.z)), -2.8, 2.8);
    }
    this.icon.show('bang', Math.min(1.2, this._react.dur));
    this.onReact?.(hit);
    emitCharacterEvent('react', this, hit);
    return this._react.dur;
  }

  celebrate() {
    if (this._react) return 0;
    this._celebrate = { t: 0 };
    this.icon.show('heart', 1.1);
    emitCharacterEvent('celebrate', this);
    return 1.2;
  }

  /** Default startle pose (hop, squash, wide eyes); species can override reactPose. */
  reactPose(o, t) {
    const air = clamp((t - 0.05) / 0.4, 0, 1);
    o.by = (this.meta.hop || 0.25) * 4 * air * (1 - air);
    o.bsq = -0.25 * win(t, 0, 0.1, 0.02, 0.05) + 0.12 * bump(t, 0.05, 0.3) - 0.18 * bump(t, 0.42, 0.6);
    o.head = -0.3 * win(t, 0.05, 1.2); o.jaw = 0.8 * win(t, 0.05, 0.9);
    o.wingL = o.wingR = 1.2 * win(t, 0.05, 0.6) * (0.6 + 0.4 * Math.sin(t * 40));
    o.tailX = 0.5 * win(t, 0, 1);
    o.earL = o.earR = 0.6 * win(t, 0, 1);
    o.lid = -0.3;
    return win(t, 0, this._react.dur, 0.04, 0.35);
  }

  update(dt, t) {
    dt = Math.min(dt || 0, 0.1);
    this.time += dt;
    const s = this.s;
    if (this._perform && !this._react && (this._perform.t += dt) >= this._perform.dur) {
      const { back } = this._perform;
      this._perform = null;
      this.setAction(back.name, back.opts, 0.3);
    }
    if (this._tell && !this._react) {
      this._tell.t -= dt;
      if (this._tell.t <= 0 && !this.icon.active) { this.tell(this._tell.type, { duration: this._tell.duration }); this._tell.t = this._tell.every; }
    } else if (!this._react && !this._celebrate) { // per-species action stickers (e.g. the pelican's huff)
      const ic = this.constructor.ICONS?.[this.blender.cur.name];
      if (ic && this.blender.cur.opts.icon !== false) {
        if (this._iconAction !== this.blender.cur.name) { this._iconAction = this.blender.cur.name; this._iconT = ic[4] ?? 0.3; }
        this._iconT -= dt;
        if (this._iconT <= 0 && !this.icon.active) { this.icon.show(ic[0], ic[2], this.icon.size * (ic[3] ?? 1)); this._iconT = ic[1]; }
      } else this._iconAction = null;
    }
    if (this.controller) this.controller.update(dt, t);
    const moving = this.gaitActions?.has(this.blender.cur.name) || this.gaitActions?.has(this.blender.prev?.name);
    if (moving) {
      const spd = this.speed > 0.01 ? this.speed : (this.defaultSpeed || 0.6);
      s.gait += TAU * spd * dt / ((this.stride || 0.4) * this.scale);
    }
    const o = this.pose.copy(this.blender.update(dt));
    if (this._react) {
      const r = this._react;
      r.t += dt;
      const w = this.reactPose(this._ov.reset(), r.t);
      if (this.keepY) this._ov.by += o.by;
      this._ov.bry = o.bry + r.face * win(r.t, 0.25, r.dur, 0.25, 0.4);
      o.mixIn(this._ov, w);
      if (r.t >= r.dur) { this._react = null; this.onReactEnd?.(); }
    } else if (this._celebrate) {
      const c = this._celebrate;
      c.t += dt;
      const air = (c.t % 0.5) / 0.5;
      this._ov.reset();
      this._ov.by = o.by + (c.t < 1 ? 0.18 * 4 * air * (1 - air) : 0);
      this._ov.bsq = 0.1 * Math.sin(c.t * 12);
      this._ov.tailX = 0.4; this._ov.tailY = 0.6 * Math.sin(c.t * 25);
      this._ov.jaw = 0.5; this._ov.wingL = this._ov.wingR = 0.8 * Math.abs(Math.sin(c.t * 18));
      o.mixIn(this._ov, win(c.t, 0, 1.2, 0.05, 0.3));
      if (c.t >= 1.2) this._celebrate = null;
    }
    // look at
    if (this.lookTarget) {
      this.root.updateWorldMatrix(true, false);
      const p = this.lookTarget.isVector3 ? _v.copy(this.lookTarget) : this.lookTarget.getWorldPosition(_v);
      this.root.worldToLocal(p);
      const yaw = clamp(wrapAngle(Math.atan2(p.x, p.z) - o.bry), -1.2, 1.2);
      s.lookYaw = dampAngle(s.lookYaw, yaw, 6, dt);
      this.lookW = damp(this.lookW, 1, 4, dt);
    } else this.lookW = damp(this.lookW, 0, 3, dt);
    if (this.lookW > 1e-3) o.headY += (s.lookYaw - o.headY) * this.lookW * 0.8;
    // blink
    s.blinkT -= dt; s.blinkAge += dt;
    if (s.blinkT <= 0) { s.blinkAge = 0; s.blinkT = this.rng.range(1.5, 5); }
    o.lid = Math.max(o.lid, bump(s.blinkAge, 0, 0.14));
    this.applyPose(o);
    const W = this.constructor.WET_ACTIONS;
    if (W) {
      const wet = W.has(this.blender.cur.name) || (W.has(this.blender.prev?.name) && this.blender.w < 1);
      if (wet !== !!this.mesh.userData.wet) setWet(this.mesh, wet);
    }
    this.afterUpdate?.(dt, o);
    this.icon.update(dt);
    this.snore.update(this.time);
    {
      const k0 = 1 - clamp(o.by * 0.8 / Math.max(0.3, this.meta.height || 0.5), 0, 0.6);
      const ss = this.shadowState || (this.shadowState = {});
      ss.x = o.bx * this.scale; ss.z = o.bz * this.scale; ss.size = this.shadowSize * k0 * this.scale; ss.sz = this.meta.shadowZ || 1; ss.visible = !this.hideShadow && this.root.visible;
    }
    if (this.shadow) {
      const k = 1 - clamp(o.by * 0.8 / Math.max(0.3, this.meta.height || 0.5), 0, 0.6);
      this.shadow.scale.set(this.shadowSize * k, 1, this.shadowSize * k * (this.meta.shadowZ || 1));
      this.shadow.position.set(o.bx, 0.012 / this.scale, o.bz);
      this.shadow.visible = !this.hideShadow;
    }
  }

  /** Common bone mapping; species call super.applyPose then add extras. */
  applyPose(o) {
    const B = this.bones, R = this.rest;
    B.base.position.set(o.bx, o.by, o.bz);
    B.base.rotation.set(o.brx, o.bry, o.brz, 'YXZ');
    const sq = Math.max(0.55, 1 + o.bsq), inv = 1 / Math.sqrt(sq);
    B.base.scale.set(inv, sq, inv);
    if (B.body) { B.body.rotation.set(o.body, o.yaw, o.roll, 'YXZ'); B.body.position.y = R.body.pos.y + o.bodyY; }
    if (B.neck) B.neck.rotation.set(o.neck, o.neckY, 0, 'YXZ');
    if (B.head) {
      B.head.rotation.set(o.head, o.headY, o.headZ, 'YXZ');
      B.head.position.z = R.head.pos.z + o.headPz;
    }
    if (B.jaw) B.jaw.rotation.x = o.jaw * (this.jawOpen || 0.5);
    if (B.tail) B.tail.rotation.set(o.tailX, o.tailY, 0, 'YXZ');
    if (B.tail2) B.tail2.rotation.set(o.tail2, o.tailY * 0.8, 0, 'YXZ');
    // wings: spread (Y) first, then flap (Z)
    if (B.wingL) { B.wingL.rotation.set(0, -o.wingFold, o.wingL, 'ZYX'); B.wingR.rotation.set(0, o.wingFold, -o.wingR, 'ZYX'); }
    if (B.earL) { B.earL.rotation.x = o.earL; B.earR.rotation.x = o.earR; }
    for (const [bn, ch] of [['legFL', 'legFL'], ['legFR', 'legFR'], ['legBL', 'legBL'], ['legBR', 'legBR'], ['legL', 'legFL'], ['legR', 'legFR']]) {
      if (B[bn]) B[bn].rotation.x = -o[ch];
    }
    if (B.eyes) B.eyes.scale.y = Math.max(0.08, 1 - clamp(o.lid, 0, 1));
  }

  dispose() { this.root.removeFromParent(); this.mesh.skeleton.dispose(); }
}

// ---------------------------------------------------------------- builder helpers
/** Glossy toy bead eye (+ white catchlight). dir = outward normal (model space). */
export function beadEye(rb, bone, pos, dir, r, col = '#262634') {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
  const m = new THREE.Matrix4().compose(pos, q, new THREE.Vector3(r, r, r * 0.8));
  rb.add(G.sphere(8, 6), col, m, bone);
  const hl = m.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(0.35, 0.4, 0.75), new THREE.Quaternion(), new THREE.Vector3(0.3, 0.3, 0.3)));
  rb.add(G.sphere(5, 3), '#ffffff', hl, bone);
}

/** Cartoon white eye with a big pupil and catchlight. */
export function cartoonEye(rb, bone, pos, dir, r, pupil = '#262634', look = new THREE.Vector3(0, 0, 1)) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
  const m = new THREE.Matrix4().compose(pos, q, new THREE.Vector3(r, r * 1.12, r * 0.75));
  rb.add(G.sphere(10, 7), '#fbfaf4', m, bone);
  const ql = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), look.clone().applyQuaternion(q.clone().invert()).normalize());
  const pm = m.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(0, 0, 0), ql, new THREE.Vector3(1, 1, 1)));
  rb.add(G.sphere(8, 5), pupil, pm.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(0, 0, 0.78), new THREE.Quaternion(), new THREE.Vector3(0.58, 0.6, 0.3))), bone);
  rb.add(G.sphere(5, 3), '#ffffff', pm.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(0.2, 0.25, 1.05), new THREE.Quaternion(), new THREE.Vector3(0.2, 0.2, 0.1))), bone);
}

export { G, shade, smooth, win, bump, clamp, TAU };
