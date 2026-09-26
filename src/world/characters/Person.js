// Person: a chunky "bean folk" villager. One SkinnedMesh (1 draw call) + blob shadow, fully
// procedural animation with cross-faded actions, bad-hit reactions, celebrations and look-at.
//   const p = new Person({ seed: 7, hat: 'bowler' });  scene.add(p.root);  p.setAction('wave');
//   p.update(dt, t) every frame.  p.react(hit) -> seconds.  p.lookAt(vec3 | object | null).
import * as THREE from 'three';
import { Rng } from '../../core/rng.js';
import { characterMaterial, CHARACTER } from './look.js';
import { emitCharacterEvent } from './events.js';
import { instantiate } from './rig.js';
import { buildPerson } from './personBuild.js';
import { resolveConfig, lookKey, PRESET_NAMES, voiceFor } from './personConfig.js';
import {
  PersonPose, ACTIONS, ACTION_NAMES, ACTION_PROPS, GAIT_ACTIONS, WATER_ACTIONS, SEATED_ACTIONS, ACTION_ICONS,
  reactPose, celebratePose, REACT_DURATION, CELEBRATE_DURATION, BUSY_HANDS, actionIcon,
} from './personActions.js';
import { Blender, clamp, damp, dampAngle, lerp, bump, wrapAngle, TAU, smooth, win } from './anim.js';
import { IconPop, Snore, blobShadow, makeFlash, rippleMaterial, trackView, view, iconType } from './icons.js';
import { makeProp, makeOar, FishLine, ROD_TIP, PROP_TYPES } from './props.js';
import { setWet } from './wet.js';

const BLUEPRINTS = new Map();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _qa = new THREE.Quaternion();
const warned = new Set();
const TALL_HATS = new Set(['chef', 'tophat', 'police', 'party', 'veil']);
const FOODS = ['chips', 'icecream'];

/** Is this action (with these options) sitting on something? (bad hits keep them on it) */
function seated(name, opts = {}) {
  if (name === 'sleep') return !opts.stand;
  return SEATED_ACTIONS.has(name) || (name === 'lie' && opts.pose === 'deckchair') ||
    ((name === 'fish' || name === 'lookout') && !!(opts.sit || opts.height));
}

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
  /** Global switch for the automatic tell stickers that come with actions (scratch "?", point "!"...). */
  static autoIcons = true;

  constructor(opts = {}) {
    const cfg = resolveConfig(opts);
    if (CHARACTER.scale !== 1 && !opts.ignoreGlobalScale) cfg.scale *= CHARACTER.scale;
    this.config = cfg;
    this.kind = 'person';
    const bp = blueprintFor(cfg);
    this.meta = bp.meta;
    this.tris = bp.tris;
    const d = this.meta.d;
    const { mesh, bones } = instantiate(bp, characterMaterial());
    this.mesh = mesh;
    this.bones = bones;
    mesh.name = 'person-mesh';
    trackView(mesh);
    this.autoIcons = opts.autoIcons ?? true;
    this._tell = null;
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
    this.voice = this.root.userData.voice = opts.voice || voiceFor(cfg); // babble voice for speech bubbles

    const iconY = Math.max(d.top, d.headC + (this.meta.hatTop || 0)) + 0.1;
    this.icon = new IconPop(this.body, iconY, 0.62 / Math.max(0.8, cfg.scale));
    this.snore = new Snore(this.body);
    this.snore.origin.set(0.22, d.headC + 0.3, 0.15);

    this.rng = new Rng((cfg.seed ?? opts.seed ?? 1) ^ 0x5bd1e995);
    const m = cfg.motion;
    this.s = {
      energy: m.energy, tempo: m.tempo, phase: m.phase, stoop: m.stoop || 0, idle: m.idle, kid: cfg.kid,
      seed: Math.floor(m.phase * 1000) % 997, legLen: d.hipY, bodyBottom: d.bodyBottom, scale: cfg.scale,
      armBase: this._armBase(), smile: cfg.face.smile ?? 0.8, gait: this.rng.range(0, TAU), talkPhase: 0,
      seat: 0.45, reactSpin: 1, reactFace: 0, pointYaw: 0.35, pointPitch: 0.25, d, belly: cfg.build.belly, food: null,
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
    this.autoProps = [];
    this.oars = null;
    this._perform = null;
    this._iconT = 0;
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
    if (name === 'eat') this.s.food = opts.food || FOODS.find((f) => this.fixedProps.L?.type === f || this.fixedProps.R?.type === f) || 'icecream';
    const changed = this.blender.set(name, opts, fade);
    const need = ACTION_PROPS[name];
    this._syncProps(typeof need === 'function' ? need(this.s, opts) : need);
    this.snore.set(name === 'sleep');
    if (name === 'fish') this._fishOpts = { waterY: opts.waterY ?? 0, cast: opts.cast ?? 2.4 };
    if (name === 'row' && opts.oars !== false) this._showOars(opts);
    else if (this.oars) for (const m of this.oars) m.visible = false;
    if (changed) { this._iconT = actionIcon(name, opts)?.[4] ?? 0.35; emitCharacterEvent('action', this, name, opts); }
    if (!opts._perform) this._perform = null;
    return this;
  }

  /**
   * Play an action for `seconds`, then go back to whatever it was doing before (keeps its options).
   * e.g. fred.perform('shakeFist', 3); kid.perform('cheer', 2). Returns seconds.
   */
  perform(name, seconds = 2, opts = {}, fade = 0.25) {
    const back = this._perform?.back || { name: this.action, opts: this.blender.cur.opts };
    this.setAction(name, { ...opts, _perform: true }, fade);
    this._perform = { t: 0, dur: seconds, back };
    return seconds;
  }

  /**
   * Pop a tell sticker above the head: '!' | '?' | '!?' | '♪' | 'z' | 'heart' | 'anger' (or bang,
   * question, surprise, note). Sized to read from the perch unscoped. Returns the duration.
   */
  tell(type = '!', { duration = 1.6, size } = {}) {
    const t = iconType(type);
    this.icon.show(t, duration, size ?? this.icon.size);
    emitCharacterEvent('tell', this, t);
    return duration;
  }

  /** Repeat a tell sticker every `every` seconds until setTell(null) (e.g. a job owner asking for help). */
  setTell(type, { every = 8, duration = 1.6 } = {}) {
    this._tell = type ? { type, every, duration, t: 0.2 } : null;
    return this;
  }

  /** In water? (swim / tread): the root is on the surface and the body below it is hidden. */
  get inWater() { return WATER_ACTIONS.has(this.action); }

  /** Aim the 'point' action at a world position (or Object3D). */
  pointAt(target) { this._pointTarget = target; return this; }

  /** Turn the head (and a little of the body) toward a world point / Object3D (for `seconds`, or until null). */
  lookAt(target, seconds = 0) { this.lookTarget = target || null; this._lookT = target ? seconds : 0; return this; }

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

  // Action props: reuse a held one when possible, otherwise attach temporary ones (to a hand, or to
  // the chest/head for two-handed props like the newspaper, camera and binoculars).
  _syncProps(need = []) {
    need = [].concat(need || []);
    this.autoProps = this.autoProps.filter((a) => {
      if (need.some((n) => n.type === a.type)) return true;
      a.mesh.removeFromParent();
      return false;
    });
    for (const n of need) {
      if (this.autoProps.some((a) => a.type === n.type)) continue;
      const fixed = this.fixedProps.L?.type === n.type || this.fixedProps.R?.type === n.type;
      if (fixed && !n.bone) continue;
      const pr = makeProp(n.type, this.config.icecream || 0);
      if (!pr) continue;
      if (n.bone) this._placeOnBone(pr, n.bone);
      else this.bones['hand' + pr.hand].add(pr.mesh);
      pr.bone = n.bone;
      this.autoProps.push(pr);
    }
    const busy = BUSY_HANDS[this.action] || '';
    this._carryHidden = busy.includes('L') || this.autoProps.some((a) => !a.bone && a.hand === 'L'); // baked-in handbag / shopping bag
    for (const h of ['L', 'R']) {
      const f = this.fixedProps[h];
      if (f) f.mesh.visible = !busy.includes(h) && !this.autoProps.some((a) => (!a.bone && a.hand === h) || a.type === f.type);
    }
    this.s.fist = this._freeHand();
  }

  /** The hand to shake a fist with: the empty one (right if both are empty or both full). */
  _freeHand() {
    const vis = (h) => { const p = this.heldProp(h); return !!p && p.mesh.visible !== false; };
    return vis('R') && !vis('L') ? 'L' : 'R';
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
    } else if (pr.type === 'binoculars') {
      m.position.set(0, d.headC - d.neckY + e.ey, d.Rz + 0.06);
    }
    this.bones[bone].add(m);
  }

  heldProp(hand = 'R') {
    const ap = this.autoProps.find((a) => !a.bone && a.hand === hand);
    return ap || this.fixedProps[hand];
  }

  /**
   * Bad-hit reaction: hat pops off & tumbles, jump + spin, "!?", fist shake at the shooter, hat returns.
   * hit may carry { point, origin|from, direction } (world). Returns the duration in seconds.
   */
  react(hit = {}) {
    const s = this.s;
    const cur = this.blender.cur;
    const keep = WATER_ACTIONS.has(cur.name) ? 'water' : cur.name === 'lie' && cur.opts.pose !== 'deckchair' ? 'lie' : seated(cur.name, cur.opts) ? 'seat' : null;
    s.reactSpin = keep ? 0 : (this.rng.chance(0.5) ? 1 : -1);
    s.reactKeep = keep;
    s.reactFace = 0;
    s.reactLook = 0; s.reactPitch = 0;
    const from = hit.origin || hit.from || (hit.ray && hit.ray.origin) ||
      (hit.direction && hit.point ? _v.copy(hit.point).addScaledVector(hit.direction, -40) : null) ||
      (view.has ? view.position : null);
    if (from) {
      this.root.updateWorldMatrix(true, false);
      _v2.copy(from);
      this.root.worldToLocal(_v2);
      const yaw = wrapAngle(Math.atan2(_v2.x, _v2.z));
      s.reactFace = keep && keep !== 'water' ? 0 : clamp(yaw, -2.8, 2.8);
      s.reactLook = keep && keep !== 'water' ? yaw : 0; // seated / lying: turn head & shoulders instead
      s.reactPitch = Math.atan2(_v2.y - this.meta.d.headC * this.config.scale, Math.hypot(_v2.x, _v2.z) + 1e-3);
    }
    emitCharacterEvent('react', this, hit);
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
    emitCharacterEvent('celebrate', this);
    return CELEBRATE_DURATION;
  }

  // ------------------------------------------------------------------------------ per frame
  update(dt, t) {
    dt = Math.min(dt || 0, 0.1);
    this.time += dt;
    const s = this.s;
    if (this._perform && !this._react && (this._perform.t += dt) >= this._perform.dur) {
      const { back } = this._perform;
      this._perform = null;
      this.setAction(back.name, back.opts, 0.3);
    }
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
      const keep = WATER_ACTIONS.has(cur) ? 'water' : cur === 'lie' ? 'lie' : seated(cur, this.blender.cur.opts) ? 'seat' : null;
      if (keep) this._keepBase(o, this._ov, keep, 0.5);
      else this._ov.by += o.by;
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
    const wet = WATER_ACTIONS.has(cur) || (WATER_ACTIONS.has(prev) && this.blender.w < 1);
    if (wet !== !!this.mesh.userData.wet) setWet(this.mesh, wet);
    this._updateHat(dt);
    if (this.balloon) this._updateBalloon(dt);
    this._updateFish();
    this._updateFlash(dt);
    this._updateHeld();
    if (this.oars && this.oars[0].visible) this._updateOars();
    this._updateActionIcon(dt, cur);
    if (this.icon.active || this.snore.on) {
      const hp = this._headInBody(_v);
      this.icon.base.set(hp.x, hp.y - this.meta.d.headC, hp.z);
      this.snore.base.set(hp.x, hp.y - this.meta.d.headC, hp.z);
    }
    this.icon.update(dt);
    this.snore.update(this.time);
    // contact shadow: none in water, long and centred when lying down
    const lying = cur === 'lie' && this.blender.cur.opts.pose !== 'deckchair';
    const k = 1 - clamp((o.by - (seated(cur, this.blender.cur.opts) || lying ? o.by : 0)) * 0.9, 0, 0.5);
    const sc = this.config.scale;
    const ss = this.shadowState || (this.shadowState = {});
    const size = this.shadowSize * k * (lying ? 1.15 : 1);
    ss.x = lying ? 0 : o.bx * sc; ss.z = lying ? 0 : o.bz * sc; ss.size = size * sc; ss.sz = lying ? 2.3 : 1;
    ss.visible = this.root.visible && !wet;
    if (this.shadow) {
      if (wet) { // the blob quad becomes a ripple ring on the water around the swimmer
        if (!this._blobMat) { this._blobMat = this.shadow.material; this.shadow.material = rippleMaterial(); }
        const r = this.shadowSize * (1.45 + 0.1 * Math.sin(this.time * 2.6 + s.phase));
        this.shadow.scale.set(r, 1, r * (cur === 'swim' ? 1.3 : 1));
        this.shadow.position.set(o.bx, 0.012 / sc, o.bz + this.meta.d.shY * Math.sin(o.brx) * 0.8);
      } else {
        if (this._blobMat) { this.shadow.material = this._blobMat; this._blobMat = null; }
        this.shadow.scale.set(size, 1, size * ss.sz);
        this.shadow.position.set(ss.x / sc, 0.012 / sc, ss.z / sc);
      }
    }
  }

  /** Keep a pose's base/legs from `from` when an overlay would stand the character up (seat/lie/water). */
  _keepBase(from, ov, keep, hop = 0.35) {
    const keys = keep === 'seat' ? ['lFL', 'lFR', 'kL', 'kR', 'lOL', 'lOR', 'hrx', 'hy']
      : ['lFL', 'lFR', 'kL', 'kR', 'lOL', 'lOR', 'hrx', 'hy', 'brx', 'bz', 'bx', 'lTL', 'lTR'];
    for (const k of keys) ov[k] = from[k];
    ov.by = from.by + ov.by * (keep === 'water' ? 0.4 : hop);
    if (keep !== 'seat') ov.bsq *= 0.4;
    if (keep === 'lie') { ov.srx = from.srx; ov.nrx = from.nrx - 0.3; }
  }

  _headInBody(out) { // head centre, in body space (follows sitting, lying, swimming...)
    const h = this.bones.head;
    h.updateWorldMatrix(true, false);
    out.set(0, this.meta.d.headC - this.meta.d.neckY, 0).applyMatrix4(h.matrixWorld);
    return this.body.worldToLocal(out);
  }

  _updateActionIcon(dt, cur) {
    if (this._react || this._celebrate) return;
    const tl = this._tell;
    if (tl) { // level-driven repeating tell wins over action icons
      tl.t -= dt;
      if (tl.t <= 0 && !this.icon.active) { this.tell(tl.type, { duration: tl.duration }); tl.t = tl.every; }
      return;
    }
    const ic = actionIcon(cur, this.blender.cur.opts);
    if (!ic || !Person.autoIcons || !this.autoIcons || this.blender.cur.opts.icon === false) return;
    this._iconT -= dt;
    if (this._iconT <= 0 && !this.icon.active) {
      this.icon.show(ic[0], ic[2], this.icon.size * (ic[3] ?? 0.9));
      this._iconT = ic[1] * (0.85 + this.rng.random() * 0.3);
    }
  }

  // props flagged `upright` (chip cone, a fish held by the tail) stay level whatever the arm does
  _updateHeld() {
    for (const pr of [this.fixedProps.L, this.fixedProps.R, ...this.autoProps]) {
      if (!pr?.upright || !pr.mesh.visible || pr.bone) continue;
      const hand = pr.mesh.parent;
      hand.updateWorldMatrix(true, false);
      hand.getWorldQuaternion(_q);
      this.root.getWorldQuaternion(_qa);
      pr.mesh.quaternion.copy(_q.invert()).multiply(_qa);
    }
  }

  _showOars(opts) {
    if (!this.oars) {
      this.oars = [makeOar(), makeOar()];
      for (const m of this.oars) { m.raycast = () => {}; this.body.add(m); }
    }
    const sc = this.config.scale;
    const lock = opts.oarlock || [0.62, (opts.height ?? 0.34) + 0.16, 0.25];
    this._oarlock = [lock[0] / sc, lock[1] / sc, lock[2] / sc];
    for (const m of this.oars) m.visible = true;
  }

  // Oars are levers: handle in the hand, shaft through the rowlock, blade beyond it.
  _updateOars() {
    const [lx, ly, lz] = this._oarlock;
    this.oars.forEach((m, i) => {
      const hand = this.bones[i ? 'handR' : 'handL'];
      hand.updateWorldMatrix(true, false);
      _v.set(0, -0.05, 0.02).applyMatrix4(hand.matrixWorld);
      this.body.worldToLocal(_v);
      _v2.set(i ? -lx : lx, ly, lz).sub(_v).normalize();
      m.position.copy(_v);
      m.quaternion.setFromUnitVectors(Y_UP, _v2);
    });
  }

  _updateReact(o, dt) {
    const r = this._react;
    const s = this.s;
    r.t += dt;
    const w = reactPose(this._ov.reset(), r.t, s);
    if (s.reactKeep) { // stay seated / lying / in the water, with a little jolt
      this._keepBase(o, this._ov, s.reactKeep);
      if (s.reactKeep === 'seat') this._ov.srx -= 0.1;
    }
    o.mixIn(this._ov, w);
    { // shake the fist AT Jack: look up/over toward the shooter
      const k = win(r.t, 0.7, 2.1, 0.2, 0.3) * w;
      if (s.reactLook) { o.sry += clamp(s.reactLook * 0.45, -0.7, 0.7) * k; o.nry += clamp(s.reactLook * 0.55, -0.9, 0.9) * k; }
      o.nrx -= clamp(s.reactPitch, -0.2, 0.6) * 0.7 * k;
    }
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
    if (this._lookT > 0 && (this._lookT -= dt) <= 0) this.lookTarget = null; // lookAt(target, seconds)
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
    const canTurn = !this.controller && !GAIT_ACTIONS.has(this.action) && !seated(this.action, this.blender.cur.opts) && this.action !== 'lie' && !this._react;
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
    // the outward rest angle only matters for hanging arms (clearing the belly): raised arms keep the
    // authored angle, otherwise tubby folk lift them straight up into their big heads
    const abL = s.armBase * (1 - smooth((o.aOL - 0.9) / 0.9)), abR = s.armBase * (1 - smooth((o.aOR - 0.9) / 0.9));
    // YZX: swing forward first, then raise sideways, then yaw -> "forward" stays forward when raised
    B.armL.rotation.set(-o.aFL, -o.aTL, o.aOL + abL, 'YZX');
    B.armR.rotation.set(-o.aFR, o.aTR, -(o.aOR + abR), 'YZX');
    B.foreL.rotation.set(-o.eBL, 0, -o.eSL);
    B.foreR.rotation.set(-o.eBR, 0, o.eSR);
    B.handL.rotation.set(-o.wBL, 0, o.wWL);
    if (B.carryL) B.carryL.scale.setScalar(this._carryHidden ? 1e-3 : 1);
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
    if (B.hat && B.hat.parent === B.head && (!this.hatState || this.hatState.phase === 'done')) {
      const k = clamp(o.hat, 0, 1) * (TALL_HATS.has(this.config.hat?.type) ? 0 : 1); // tip the hat over the eyes (not a chef's toque)
      B.hat.quaternion.copy(this.rest.hat.quat).multiply(_q.setFromEuler(_e.set(1.15 * k, 0, 0)));
      B.hat.position.copy(this.rest.hat.pos);
      B.hat.position.y -= 0.12 * k * this.meta.d.HS;
      B.hat.position.z += 0.1 * k * this.meta.d.HS;
    }
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
    const ap = this.autoProps.find((a) => a.type === 'camera');
    if (!ap) { if (this.flash) this.flash.visible = false; return; }
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
const Y_UP = new THREE.Vector3(0, 1, 0);
