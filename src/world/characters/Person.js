// Person: a chunky "bean folk" villager. One SkinnedMesh (1 draw call) + blob shadow, fully
// procedural animation with cross-faded actions, bad-hit reactions, celebrations and look-at.
//   const p = new Person({ seed: 7, hat: 'bowler' });  scene.add(p.root);  p.setAction('wave');
//   p.update(dt, t) every frame.  p.react(hit) -> seconds.  p.lookAt(vec3 | object | null).
import * as THREE from 'three';
import { materials } from '../../gfx/materials.js';
import { Rng } from '../../core/rng.js';
import { instantiate } from './rig.js';
import { buildPerson } from './personBuild.js';
import { resolveConfig, lookKey, PRESET_NAMES } from './personConfig.js';
import {
  PersonPose, ACTIONS, ACTION_NAMES, ACTION_PROPS, GAIT_ACTIONS, reactPose, celebratePose, REACT_DURATION, CELEBRATE_DURATION,
} from './personActions.js';
import { Blender, clamp, damp, dampAngle, lerp, bump, wrapAngle, TAU, smooth } from './anim.js';
import { IconPop, Snore, blobShadow, makeFlash } from './icons.js';
import { makeProp, FishLine, ROD_TIP, PROP_TYPES } from './props.js';

const BLUEPRINTS = new Map();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const warned = new Set();
const SEATED = new Set(['sit', 'sleep']);

function blueprintFor(cfg) {
  const key = lookKey(cfg);
  let bp = BLUEPRINTS.get(key);
  if (!bp) { bp = buildPerson(cfg); BLUEPRINTS.set(key, bp); }
  return bp;
}

export class Person {
  /** A random villager drawn from an Rng (or seed). opts can pin any look/motion field. */
  static random(rng, opts = {}) {
    const r = rng instanceof Rng ? rng : new Rng(rng ?? 1);
    return new Person({ ...opts, seed: Math.floor(r.random() * 2 ** 31) + 1 });
  }

  /** A named preset: postman, chef, vicar, bride, groom, kid, fisherman, farmer, police, tourist, oldLady, builder, trader, jogger, painter. */
  static preset(name, opts = {}) { return new Person({ ...opts, preset: name }); }

  static get presets() { return PRESET_NAMES; }
  static get actions() { return ACTION_NAMES; }

  constructor(opts = {}) {
    const cfg = resolveConfig(opts);
    this.config = cfg;
    this.kind = 'person';
    const bp = blueprintFor(cfg);
    this.meta = bp.meta;
    this.tris = bp.tris;
    const d = this.meta.d;
    const { mesh, bones } = instantiate(bp, materials.toy);
    this.mesh = mesh;
    this.bones = bones;
    mesh.name = 'person-mesh';
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.1, 0), 2.3);

    this.root = new THREE.Group();
    this.root.name = opts.name || (opts.preset ? `person:${opts.preset}` : 'person');
    this.body = new THREE.Group();
    this.body.name = 'person-body';
    this.body.scale.setScalar(cfg.scale);
    this.root.add(this.body);
    this.body.add(mesh);
    this.shadowSize = d.bodyR * 2.9 + 0.12;
    this.shadow = opts.shadow === false ? null : blobShadow(this.shadowSize);
    if (this.shadow) this.body.add(this.shadow);
    this.root.userData.character = this;

    const iconY = Math.max(d.top, d.headC + (this.meta.hatTop || 0)) + 0.42;
    this.icon = new IconPop(this.body, iconY, 0.62 / Math.max(0.8, cfg.scale));
    this.snore = new Snore(this.body);
    this.snore.origin.set(0.22, d.headC + 0.3, 0.15);

    this.rng = new Rng((cfg.seed ?? opts.seed ?? 1) ^ 0x5bd1e995);
    const m = cfg.motion;
    this.s = {
      energy: m.energy, tempo: m.tempo, phase: m.phase, stoop: m.stoop || 0, idle: m.idle, kid: cfg.kid,
      seed: Math.floor(m.phase * 1000) % 997, legLen: d.hipY, bodyBottom: d.bodyBottom, scale: cfg.scale,
      armBase: this._armBase(), smile: cfg.face.smile ?? 0.8, gait: this.rng.range(0, TAU), talkPhase: 0,
      seat: 0.45, reactSpin: 1, reactFace: 0, pointYaw: 0.35, pointPitch: 0.25,
      lookYaw: 0, lookPitch: 0, bodyTurn: 0, blinkT: this.rng.range(0.5, 3), blinkAge: 9, eyeX: 0, eyeY: 0, eyeTX: 0, eyeTY: 0, eyeT: 1,
    };
    this.rest = {
      hips: bones.hips.position.clone(),
      browL: bones.browL?.position.clone(), browR: bones.browR?.position.clone(),
      pupilL: bones.pupilL.quaternion.clone(), pupilR: bones.pupilR.quaternion.clone(),
      hat: bones.hat ? { pos: bones.hat.position.clone(), quat: bones.hat.quaternion.clone() } : null,
    };
    this.blender = new Blender(PersonPose, (name, t, o, opt) => (ACTIONS[name] || ACTIONS.idle)(o, t, this.s, opt));
    this.pose = new PersonPose();
    this._ov = new PersonPose();
    this.time = 0;
    this.speed = 0;
    this.controller = null;
    this.lookTarget = null;
    this.lookW = 0;
    this._react = null;
    this._celebrate = null;
    this.hatState = null;
    this.fixedProps = { L: null, R: null };
    this.autoProp = null;
    this.fishLine = null;
    this.balloon = [].concat(cfg.accessory || []).includes('balloon') ? { pos: null, vel: new THREE.Vector3() } : null;
    for (const a of [].concat(cfg.accessory || [])) if (PROP_TYPES.includes(a)) this.hold(a);
    this.setAction(opts.action || cfg.defaultAction || 'idle', opts.actionOptions || {}, 0);
    this.update(0, 0);
  }

  get action() { return this.blender.cur.name; }
  get busy() { return !!(this._react || this._celebrate); }
  get position() { return this.root.position; }
  get height() { return (this.meta.d.top + (this.meta.hatTop || 0) * 0.5) * this.config.scale; }

  // outward rest angle so hanging arms clear the belly
  _armBase() {
    const d = this.meta.d;
    const belly = this.config.build.belly;
    let a = 0.08;
    for (const t of [0.2, 0.3, 0.4, 0.5]) {
      const y = d.bodyBottom + t * d.bodyH;
      const drop = d.shY - y;
      if (drop <= 0.02) continue;
      const r = d.bodyR * (1 + belly * 0.17 * Math.exp(-(((t - 0.33) / 0.2) ** 2))) * [0.99, 1, 0.985, 0.955][[0.2, 0.3, 0.4, 0.5].indexOf(t)];
      const need = r + d.armR + 0.012 - d.shX;
      a = Math.max(a, Math.atan2(need, drop));
    }
    return a;
  }

  /**
   * Switch action with a smooth cross-fade. opts per action, e.g.
   *   sit/sleep {height}, sleep {stand:true}, talk {role:'speak'|'listen', period}, point {at: Vector3},
   *   fish {waterY, cast, sit}. fade = blend seconds (default 0.3).
   */
  setAction(name, opts = {}, fade = 0.3) {
    if (!ACTIONS[name]) {
      if (!warned.has(name)) { console.warn(`[characters] unknown action "${name}", using idle`); warned.add(name); }
      name = 'idle';
    }
    if (opts.at) this.pointAt(opts.at);
    if (opts.height != null) this.s.seat = opts.height;
    this.blender.set(name, opts, fade);
    this._syncProps(ACTION_PROPS[name]);
    this.snore.set(name === 'sleep');
    if (name === 'fish') this._fishOpts = { waterY: opts.waterY ?? 0, cast: opts.cast ?? 2.4 };
    return this;
  }

  /** Aim the 'point' action at a world position (or Object3D). */
  pointAt(target) { this._pointTarget = target; return this; }

  /** Turn the head (and a little of the body) toward a world point / Object3D. null to stop. */
  lookAt(target) { this.lookTarget = target || null; return this; }

  /** Rotate the root to face a world point (instant). */
  faceTowards(point) {
    const p = this.root.position;
    this.root.rotation.y = Math.atan2(point.x - p.x, point.z - p.z);
    return this;
  }

  /** Hold a prop permanently (broom, rod, newspaper, camera, icecream, book, bouquet, brush, palette). */
  hold(type) {
    const pr = makeProp(type, this.config.icecream || 0);
    if (!pr) return this;
    const h = pr.hand;
    this.fixedProps[h]?.mesh.removeFromParent();
    this.fixedProps[h] = pr;
    this.bones['hand' + h].add(pr.mesh);
    this._syncProps(ACTION_PROPS[this.action]);
    return this;
  }

  drop(hand = 'R') {
    this.fixedProps[hand]?.mesh.removeFromParent();
    this.fixedProps[hand] = null;
    return this;
  }

  // Action props: reuse a held one when possible, otherwise attach a temporary one (to a hand, or to
  // the chest/head for two-handed props like the newspaper and camera).
  _syncProps(need) {
    const a = this.autoProp;
    if (a && (!need || a.type !== need.type)) { a.mesh.removeFromParent(); this.autoProp = null; }
    if (need && !this.autoProp) {
      const fixed = this.fixedProps.L?.type === need.type || this.fixedProps.R?.type === need.type;
      if (!fixed || need.bone) {
        const pr = makeProp(need.type, this.config.icecream || 0);
        if (pr) {
          if (need.bone) this._placeOnBone(pr, need.bone);
          else this.bones['hand' + pr.hand].add(pr.mesh);
          pr.bone = need.bone;
          this.autoProp = pr;
        }
      }
    }
    const ap = this.autoProp;
    for (const h of ['L', 'R']) {
      const f = this.fixedProps[h];
      if (f) f.mesh.visible = !(ap && ((!ap.bone && ap.hand === h) || ap.type === f.type));
    }
  }

  _placeOnBone(pr, bone) {
    const d = this.meta.d, e = this.meta.eye;
    const m = pr.mesh;
    m.rotation.set(0, 0, 0);
    if (pr.type === 'newspaper') {
      m.position.set(0, d.headC - 0.19 - d.waistY, d.R * 0.9 + 0.2);
      m.rotation.set(-0.25, 0, 0);
    } else if (pr.type === 'camera') {
      m.position.set(-e.ex, d.headC - d.neckY + e.ey, d.Rz * 0.9 + 0.075);
    }
    this.bones[bone].add(m);
  }

  heldProp(hand = 'R') {
    const ap = this.autoProp;
    if (ap && !ap.bone && ap.hand === hand) return ap;
    return this.fixedProps[hand];
  }

  /**
   * Bad-hit reaction: hat pops off & tumbles, jump + spin, "!?", fist shake at the shooter, hat returns.
   * hit may carry { point, origin|from, direction } (world). Returns the duration in seconds.
   */
  react(hit = {}) {
    const s = this.s;
    const seated = SEATED.has(this.action) && !this.blender.cur.opts.stand;
    s.reactSpin = seated ? 0 : (this.rng.chance(0.5) ? 1 : -1);
    s.reactSeated = seated;
    s.reactFace = 0;
    const from = hit.origin || hit.from || (hit.ray && hit.ray.origin) || (hit.direction && hit.point ? _v.copy(hit.point).addScaledVector(hit.direction, -40) : null);
    if (from) {
      this.root.updateWorldMatrix(true, false);
      _v2.copy(from);
      this.root.worldToLocal(_v2);
      s.reactFace = seated ? 0 : clamp(wrapAngle(Math.atan2(_v2.x, _v2.z)), -2.6, 2.6);
    }
    this._react = { t: 0, hatPopped: false, angry: false };
    this._celebrate = null;
    this.icon.show('surprise', 1.0);
    if (this.action === 'sleep') this.snore.set(false);
    return REACT_DURATION;
  }

  /** Happy job-complete hop. Returns duration. */
  celebrate() {
    if (this._react) return 0;
    this._celebrate = { t: 0 };
    this.icon.show('heart', 1.3);
    return CELEBRATE_DURATION;
  }

  // ------------------------------------------------------------------------------ per frame
  update(dt, t) {
    dt = Math.min(dt || 0, 0.1);
    this.time += dt;
    const s = this.s;
    if (this.controller) this.controller.update(dt, t);

    const cur = this.blender.cur.name, prev = this.blender.prev?.name;
    if (GAIT_ACTIONS.has(cur) || GAIT_ACTIONS.has(prev)) {
      const run = cur === 'run' || cur === 'panic';
      const spd = this.speed > 0.01 ? this.speed : (run ? 2.4 : 1.0) * s.tempo;
      const k = run ? 1 : 0;
      const A = (0.5 + 0.38 * k) * (0.85 + 0.15 * s.energy);
      const stride = 4 * s.legLen * Math.sin(A) * this.config.scale * (run ? 1.6 : 1);
      s.gait += TAU * spd * dt / stride;
    }
    if (this._pointTarget) this._aim(this._pointTarget);

    const o = this.pose.copy(this.blender.update(dt));

    // one-shot overlays
    if (this._react) this._updateReact(o, dt);
    else if (this._celebrate) {
      const c = this._celebrate;
      c.t += dt;
      const w = celebratePose(this._ov.reset(), c.t, s);
      this._ov.by += o.by;
      o.mixIn(this._ov, w);
      if (c.t >= CELEBRATE_DURATION) this._celebrate = null;
    }

    this._updateLook(o, dt);
    this._updateEyes(o, dt);
    if (this.hatState?.boing != null) {
      const bt = this.hatState.boing += dt;
      o.bsq += -0.14 * Math.exp(-7 * bt) * Math.cos(bt * 24);
      if (bt > 0.8) this.hatState = null;
    }
    this._apply(o);
    this._updateHat(dt);
    if (this.balloon) this._updateBalloon(dt);
    this._updateFish();
    this._updateFlash(dt);
    this.icon.update(dt);
    this.snore.update(this.time);
    const k = 1 - clamp((o.by - (SEATED.has(cur) ? o.by : 0)) * 0.9, 0, 0.5);
    const sc = this.config.scale;
    const ss = this.shadowState || (this.shadowState = {});
    ss.x = o.bx * sc; ss.z = o.bz * sc; ss.size = this.shadowSize * k * sc; ss.visible = this.root.visible;
    if (this.shadow) {
      this.shadow.scale.set(this.shadowSize * k, 1, this.shadowSize * k);
      this.shadow.position.set(o.bx, 0.012 / sc, o.bz);
    }
  }

  _updateReact(o, dt) {
    const r = this._react;
    const s = this.s;
    r.t += dt;
    const w = reactPose(this._ov.reset(), r.t, s);
    if (s.reactSeated) { // keep the seated legs/hips, add a hop
      for (const k of ['lFL', 'lFR', 'kL', 'kR', 'lOL', 'lOR', 'hrx', 'hy']) this._ov[k] = o[k];
      this._ov.by = o.by + this._ov.by * 0.35;
      this._ov.srx -= 0.1;
    }
    o.mixIn(this._ov, w);
    if (!r.hatPopped && r.t > 0.1) { r.hatPopped = true; this._popHat(); }
    if (!r.angry && r.t > 0.85) { r.angry = true; this.icon.show('anger', 1.15, this.icon.size * 0.85); }
    if (r.t > 1.95 && this.hatState?.phase === 'ground') this._returnHat();
    if (r.t >= REACT_DURATION) {
      this._react = null;
      if (this.action === 'sleep') this.snore.set(true);
    }
  }

  _aim(target) {
    this.root.updateWorldMatrix(true, false);
    const p = target.isVector3 ? _v.copy(target) : target.getWorldPosition(_v);
    this.root.worldToLocal(p);
    const hy = (this.meta.d.shY) * this.config.scale;
    this.s.pointYaw = Math.atan2(p.x, p.z);
    this.s.pointPitch = Math.atan2(p.y - hy, Math.hypot(p.x, p.z));
  }

  _updateLook(o, dt) {
    const s = this.s;
    if (this.lookTarget) {
      this.root.updateWorldMatrix(true, false);
      const p = this.lookTarget.isVector3 ? _v.copy(this.lookTarget) : this.lookTarget.getWorldPosition(_v);
      this.root.worldToLocal(p);
      const hy = (this.meta.d.headC + o.by) * this.config.scale;
      const yaw = wrapAngle(Math.atan2(p.x, p.z) - o.bry - s.bodyTurn);
      const pitch = Math.atan2(p.y - hy, Math.hypot(p.x, p.z) + 1e-3);
      s.lookYaw = dampAngle(s.lookYaw, yaw, 7, dt);
      s.lookPitch = damp(s.lookPitch, pitch, 7, dt);
      this.lookW = damp(this.lookW, 1, 5, dt);
    } else this.lookW = damp(this.lookW, 0, 3, dt);
    const w = this.lookW;
    const canTurn = !this.controller && !GAIT_ACTIONS.has(this.action) && !SEATED.has(this.action) && !this._react;
    if (w < 1e-3) { s.bodyTurn = damp(s.bodyTurn, 0, 2, dt); o.bry += s.bodyTurn; return; }
    const yaw = s.lookYaw;
    const head = clamp(yaw, -1.0, 1.0);
    const spine = clamp(yaw - head, -0.45, 0.45);
    const excess = yaw - head - spine;
    s.bodyTurn = damp(s.bodyTurn, canTurn && Math.abs(excess) > 0.05 ? s.bodyTurn + excess : s.bodyTurn, 2.5, dt);
    o.bry += s.bodyTurn;
    o.nry = lerp(o.nry, head, w);
    o.nrx = lerp(o.nrx, clamp(-s.lookPitch * 0.75, -0.6, 0.45), w);
    o.sry += spine * w;
    o.eyeX = lerp(o.eyeX, clamp((yaw - head - spine) * 1.5, -0.8, 0.8), w);
    o.eyeY = lerp(o.eyeY, clamp(s.lookPitch * 0.8, -0.6, 0.8), w);
  }

  _updateEyes(o, dt) {
    const s = this.s;
    s.blinkT -= dt;
    s.blinkAge += dt;
    if (s.blinkT <= 0) {
      s.blinkAge = 0;
      s.blinkT = this.rng.chance(0.18) ? 0.22 : this.rng.range(2, 5.5);
    }
    o.lid = Math.max(o.lid, bump(s.blinkAge, 0, 0.16));
    s.eyeT -= dt;
    if (s.eyeT <= 0) {
      s.eyeT = this.rng.range(0.8, 3.2);
      const center = this.rng.chance(0.45);
      s.eyeTX = center ? 0 : this.rng.range(-0.7, 0.7);
      s.eyeTY = center ? 0 : this.rng.range(-0.3, 0.35);
    }
    s.eyeX = damp(s.eyeX, s.eyeTX, 18, dt);
    s.eyeY = damp(s.eyeY, s.eyeTY, 18, dt);
    const free = 1 - this.lookW;
    o.eyeX += s.eyeX * 0.6 * free;
    o.eyeY += s.eyeY * 0.6 * free;
  }

  _apply(o) {
    const B = this.bones, s = this.s;
    B.base.position.set(o.bx, o.by, o.bz);
    B.base.rotation.set(o.brx, o.bry, o.brz, 'YXZ');
    const sq = Math.max(0.55, 1 + o.bsq), inv = 1 / Math.sqrt(sq);
    B.base.scale.set(inv, sq, inv);
    B.hips.position.set(this.rest.hips.x + o.hx, this.rest.hips.y + o.hy, this.rest.hips.z);
    B.hips.rotation.set(o.hrx, o.hry, o.hrz, 'YXZ');
    B.spine.rotation.set(o.srx + s.stoop, o.sry, o.srz, 'YXZ');
    const br = 1 + o.ssq;
    B.spine.scale.set(1 + o.ssq * 0.6, br, 1 + o.ssq * 0.6);
    B.head.rotation.set(o.nrx - s.stoop * 0.7, o.nry, o.nrz, 'YXZ');
    const ab = s.armBase;
    // YZX: swing forward first, then raise sideways, then yaw -> "forward" stays forward when raised
    B.armL.rotation.set(-o.aFL, -o.aTL, o.aOL + ab, 'YZX');
    B.armR.rotation.set(-o.aFR, o.aTR, -(o.aOR + ab), 'YZX');
    B.foreL.rotation.set(-o.eBL, 0, -o.eSL);
    B.foreR.rotation.set(-o.eBR, 0, o.eSR);
    B.handL.rotation.set(-o.wBL, 0, o.wWL);
    B.handR.rotation.set(-o.wBR, 0, -o.wWR);
    B.legL.rotation.set(-o.lFL, o.lTL, o.lOL, 'YXZ');
    B.legR.rotation.set(-o.lFR, -o.lTR, -o.lOR, 'YXZ');
    B.shinL.rotation.x = o.kL;
    B.shinR.rotation.x = o.kR;
    const lid = lerp(-1.8, 0.12, clamp(o.lid, -0.25, 1));
    B.lidL.rotation.set(lid, 0, o.lidT * 0.5, 'ZXY');
    B.lidR.rotation.set(lid, 0, -o.lidT * 0.5, 'ZXY');
    const HS = this.meta.d.HS;
    if (B.browL) {
      B.browL.position.y = this.rest.browL.y + o.browY * 0.024 * HS;
      B.browR.position.y = this.rest.browR.y + o.browY * 0.024 * HS;
      B.browL.rotation.z = o.browT * 0.4;
      B.browR.rotation.z = -o.browT * 0.4;
    }
    let sm = clamp(s.smile + o.smile, -1, 1.3);
    if (Math.abs(sm) < 0.22) sm = sm < 0 ? -0.22 : 0.22;
    const mo = clamp(o.mouth, 0, 1);
    B.mouth.scale.set(1 + 0.12 * Math.max(0, sm - 0.8) + 0.25 * mo, sm, 1);
    B.jaw.scale.set(1 - 0.2 * mo, 0.03 + mo, 1 + 0.2 * mo);
    _q.setFromEuler(_e.set(-o.eyeY * 0.3, o.eyeX * 0.4, 0));
    B.pupilL.quaternion.copy(this.rest.pupilL).multiply(_q);
    B.pupilR.quaternion.copy(this.rest.pupilR).multiply(_q);
  }

  // ------------------------------------------------------------------------------ hat flight
  _popHat() {
    const hat = this.bones.hat;
    if (!hat || this.hatState) return;
    hat.updateWorldMatrix(true, false);
    this.body.attach(hat);
    hat.scale.set(1, 1, 1);
    const a = this.rng.range(0, TAU);
    const sc = this.config.scale;
    this.hatState = {
      phase: 'fly', t: 0,
      v: new THREE.Vector3(Math.sin(a) * 1.3, 4.6, Math.cos(a) * 1.3).multiplyScalar(1 / Math.sqrt(sc)),
      spin: new THREE.Vector3(this.rng.range(-10, 10), this.rng.range(-7, 7), this.rng.range(-10, 10)),
      bounces: 0, restTilt: this.rng.range(-0.5, 0.5),
    };
  }

  _updateHat(dt) {
    const h = this.hatState;
    const hat = this.bones.hat;
    if (!h || !hat) return;
    if (h.phase === 'fly' || h.phase === 'ground') {
      const g = 13 / this.config.scale;
      h.v.y -= g * dt;
      hat.position.addScaledVector(h.v, dt);
      _e.set(h.spin.x * dt, h.spin.y * dt, h.spin.z * dt);
      hat.quaternion.multiply(_q.setFromEuler(_e));
      const floor = 0.03;
      if (hat.position.y < floor) {
        hat.position.y = floor;
        if (h.v.y < 0) {
          h.bounces++;
          h.v.y *= -0.32; h.v.x *= 0.5; h.v.z *= 0.5; h.spin.multiplyScalar(0.4);
          if (h.bounces >= 2 || Math.abs(h.v.y) < 0.6) { h.phase = 'ground'; h.v.set(0, 0, 0); h.spin.set(0, 0, 0); }
        }
      }
      if (h.phase === 'ground') { // settle upright-ish on the ground
        _q.setFromEuler(_e.set(0, 0, h.restTilt));
        hat.quaternion.slerp(_q, 1 - Math.exp(-10 * dt));
        hat.position.y = damp(hat.position.y, floor + Math.abs(h.restTilt) * 0.1, 10, dt);
      }
      if (!this._react && h.phase !== 'return') this._returnHat();
    } else if (h.phase === 'return') {
      h.t += dt;
      const k = smooth(h.t / 0.45);
      // target = hat rest transform under the head, expressed in body space
      this.bones.head.updateWorldMatrix(true, false);
      _m.compose(this.rest.hat.pos, this.rest.hat.quat, _v2.set(1, 1, 1));
      _m.premultiply(this.bones.head.matrixWorld);
      _m.premultiply(_m2.copy(this.body.matrixWorld).invert());
      _m.decompose(_v, _q, _v2);
      hat.position.lerpVectors(h.from, _v, k);
      hat.position.y += Math.sin(Math.PI * k) * 0.7;
      hat.quaternion.slerpQuaternions(h.fromQ, _q, k);
      if (h.t >= 0.45) {
        this.bones.head.add(hat);
        hat.position.copy(this.rest.hat.pos);
        hat.quaternion.copy(this.rest.hat.quat);
        hat.scale.set(1, 1, 1);
        this.hatState = { phase: 'done', boing: 0 };
      }
    }
  }

  _returnHat() {
    const h = this.hatState;
    if (!h || h.phase === 'return' || h.phase === 'done') return;
    const hat = this.bones.hat;
    this.hatState = { phase: 'return', t: 0, from: hat.position.clone(), fromQ: hat.quaternion.clone() };
  }

  // ------------------------------------------------------------------------------ extras
  _updateBalloon(dt) {
    const B = this.bones;
    const b = this.balloon;
    B.handL.updateWorldMatrix(true, false);
    _v.setFromMatrixPosition(B.handL.matrixWorld);
    B.base.worldToLocal(_v);
    const t = this.time + this.s.phase;
    _v.x += 0.08 + Math.sin(t * 1.3) * 0.07;
    _v.y += 0.95 + Math.sin(t * 2.1) * 0.03;
    _v.z += 0.1 + Math.sin(t * 0.9 + 1) * 0.06;
    if (!b.pos || dt === 0) { b.pos = _v.clone(); b.vel.set(0, 0, 0); }
    b.vel.addScaledVector(_v2.subVectors(_v, b.pos), 40 * dt);
    b.vel.multiplyScalar(Math.exp(-5 * dt));
    b.pos.addScaledVector(b.vel, dt);
    B.prop.position.copy(b.pos);
    B.prop.rotation.set(clamp(-b.vel.z * 0.15, -0.4, 0.4), 0, clamp(b.vel.x * 0.15, -0.4, 0.4));
  }

  _updateFish() {
    const rod = this.heldProp('R');
    const on = this.action === 'fish' && rod?.type === 'rod';
    if (!on) { if (this.fishLine) this.fishLine.visible = false; return; }
    if (!this.fishLine) this.fishLine = new FishLine(this.body);
    this.fishLine.visible = true;
    rod.mesh.updateWorldMatrix(true, false);
    const tip = rod.mesh.localToWorld(_v.copy(ROD_TIP));
    this.body.worldToLocal(tip);
    const f = this._fishOpts || { waterY: 0, cast: 2.4 };
    const t = this.time + this.s.phase;
    const bite = ((t * this.s.tempo) % 8.5) > 6.1 && ((t * this.s.tempo) % 8.5) < 6.6;
    _v2.set(0.35, f.waterY / this.config.scale + 0.02 + Math.sin(t * 2.2) * 0.012 - (bite ? 0.05 : 0), f.cast / this.config.scale);
    this.fishLine.set(tip, _v2);
  }

  _updateFlash(dt) {
    const ap = this.autoProp;
    if (!ap || ap.type !== 'camera') { if (this.flash) this.flash.visible = false; return; }
    const T = this.blender.cur.t * this.s.tempo + this.s.phase;
    const k = (T % 3.6) - 1.62;
    if (!this.flash) { this.flash = makeFlash(); ap.mesh.add(this.flash); }
    if (this.flash.parent !== ap.mesh) ap.mesh.add(this.flash);
    const on = k > 0 && k < 0.22;
    this.flash.visible = on;
    if (on) { const sc = 0.5 * Math.sin((k / 0.22) * Math.PI); this.flash.scale.set(sc, sc, 1); }
  }

  /** Detach from the scene and free per-instance GPU data (geometry is shared & cached). */
  dispose() {
    this.root.removeFromParent();
    this.mesh.skeleton.dispose();
    this.fishLine?.dispose();
  }
}
