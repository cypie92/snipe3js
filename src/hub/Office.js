// Jack's Odd Jobs HQ: the 3D office hub, navigated by shooting suction darts at things.
//
//   const office = new Office({ scene, camera, canvas, env, sound, progress, levels, onAction });
//   office.enter();          // adds the room far away at ORIGIN, focuses the sun shadow, takes the camera
//   office.update(dt, t);    // every frame while entered (writes camera.position/quaternion/fov)
//   office.exit();           // removes the room, releases pointer handlers, restores env preset/shadows
//   office.refresh();        // re-read progress/levels (after upgrades, finishing a level)
//
// onAction receives { type: 'play', id } | { type: 'workshop' } | { type: 'settings' } | { type: 'radio', on }.
// office.view = { position, quaternion, fov } mirrors the camera pose (same shape as CameraRig.override).
// office.setInteractive(false) while a DOM panel (workshop/settings) is open on top of the office.
import * as THREE from 'three';
import { Pigeon, Cat } from '../world/characters/index.js';
import { part, merge, xform } from '../world/geo.js';
import { materials } from '../gfx/materials.js';
import { P } from '../gfx/palette.js';
import { bev, puck, boxCollider } from '../world/kit/props/lib.js';
import { ROOM, buildRoom } from './room.js';
import { buildOutside } from './outside.js';
import { birdseedBag, crate } from '../world/kit/props/index.js';
import * as F from './props.js';
import { buildBoard, boardEntries, buildTrophyShelf, BOARD } from './board.js';
import { Darts } from './darts.js';
import { HubHud } from './hud.js';
import { THEMES, themeFor } from './textures.js';

export const ORIGIN = new THREE.Vector3(0, 0, 4000);
const SUN_OFFSET = -0.5; // the sun comes in over the camera's left shoulder
// Long lens from further back: the back wall (the corkboard) reads ~30% bigger than a close wide
// camera would allow while the whole doll's house still fits, and the diorama shows over the walls.
const CAM = { pos: new THREE.Vector3(0, 4.4, 20), target: new THREE.Vector3(-0.15, 1.8, -1.0), fov: 17.25 };
// First entry: a beat on the establishing shot (HQ, lane, van, village), then a push-in to CAM.
const WIDE = { pos: new THREE.Vector3(-5.5, 13.5, 38), target: new THREE.Vector3(-3.5, 1.4, -18), fov: 26 };
// Later entries (back from a shift): a short settle from a little further out.
const BACK = { pos: new THREE.Vector3(0.6, 5.6, 25), target: new THREE.Vector3(-0.15, 1.8, -1.0), fov: 18.5 };
const INTRO_FIRST = 1.05;
const INTRO_AGAIN = 0.55;
const PARALLAX = { x: 1.1, y: 0.5, tx: 0.25, ty: 0.12 };
// The unscoped miniature DOF is tuned for the level perch; here it would blur Puddleby and the windmill.
// The room stays sharp anyway (the camera is ~20 m out), only the far hills go soft.
const OFFICE_GRADE = { tilt: { near: [0.3, 1.0], far: [420, 1100], bokeh: 1.2 } };
const RANK = { D: 1, C: 2, B: 3, A: 4, S: 5 };
const BOARD_X = -0.355;
const POPS = ['THWOCK!', 'SPLOCK!', 'THOCK!', 'PLOOP!'];
const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const bump = (t, a, b) => (t <= a || t >= b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI));
// hover glow: shared materials are swapped for a warm-emissive clone (same program, no recompile)
const HOT = new Map();
function hotMaterial(m) {
  if (!m || !m.isMeshStandardMaterial || m.emissiveMap || (m.emissive && m.emissive.getHex() !== 0)) return null;
  let h = HOT.get(m);
  if (!h) {
    h = m.clone();
    h.onBeforeCompile = m.onBeforeCompile;
    h.customProgramCacheKey = m.customProgramCacheKey;
    h.emissive.set('#ffcf73');
    h.emissiveIntensity = 0;
    h.name = `${m.name}-hot`;
    HOT.set(m, h);
  }
  return h;
}
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _ndc = new THREE.Vector2();
const UP = new THREE.Vector3(0, 1, 0);

export class Office {
  constructor({ scene, camera, canvas, env, sound, progress, levels = [], onAction, ui, preset = 'morning', radioOn = true } = {}) {
    this.scene = scene;
    this.camera = camera;
    this.canvas = canvas;
    this.env = env;
    this.sound = sound || { sfx() {} };
    this.progress = progress;
    this.levels = levels;
    this.onAction = onAction || (() => {});
    this.presetName = preset;
    this.radioOn = radioOn;

    this.root = new THREE.Group();
    this.root.name = 'office';
    this.root.position.copy(ORIGIN);
    this.root.userData.noHit = true;
    this.view = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), fov: CAM.fov };
    this.targets = [];
    this.pickables = [];
    this.ticks = [];
    this.pointer = { x: -1, y: -1, nx: 0, ny: 0, inside: false, dirty: true };
    this.par = new THREE.Vector2();
    this.hover = null;
    this.entered = false;
    this.interactive = true;
    this.busy = 0;
    this.time = 0;
    this.pending = [];
    this.anims = [];
    this.frame = 0;
    this.focus = { k: 0, goal: 0, point: new THREE.Vector3(), hold: 0 };
    this.intro = { t: 1, dur: INTRO_FIRST, from: WIDE, frames: 0, wall: null, speed: 1 };
    this.enterCount = 0;
    this.hotT = 0;
    this.aimPoint = new THREE.Vector3();
    this.raycaster = new THREE.Raycaster();
    this.hud = typeof document !== 'undefined' ? new HubHud(ui || document.body) : null;

    this.build();
    this.darts = new Darts({ root: this.root, camera, floorY: 0 });
    this.refresh();
    this.handlers = {
      move: (e) => this.onPointerMove(e),
      down: (e) => this.onPointerDown(e),
      leave: () => { this.pointer.inside = false; this.pointer.dirty = true; },
      enter: () => { this.pointer.inside = this.pointer.x >= 0; }, // no real position yet: don't hover the screen centre
    };
  }

  // ------------------------------------------------------------------ building
  add(obj, x, y, z, ry = 0, parent = this.root) {
    obj.position.set(x, y, z);
    obj.rotation.y = ry;
    parent.add(obj);
    return obj;
  }

  pick(...objs) {
    for (const o of objs) o?.traverse?.((m) => { if (m.isMesh && m.visible && !m.userData.collider) this.pickables.push(m); });
  }

  build() {
    const R = ROOM;
    const room = buildRoom();
    this.root.add(room.group);
    this.outside = buildOutside();
    this.root.add(this.outside.group);
    this.ticks.push((dt, tt) => this.outside.update(dt, tt));
    // cheap invisible proxies for darts landing on the floor / walls (the merged shell is dense)
    const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
    const proxy = (w, h, d, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), proxyMat);
      m.position.set(x, y, z);
      m.name = 'proxy';
      this.root.add(m);
      this.pickables.push(m);
    };
    const W = R.window;
    proxy(R.x1 - R.x0, 0.2, R.z1 - R.z0 + 0.2, 0, -0.1, (R.z0 + R.z1) / 2 + 0.1);
    proxy(W.x0 - R.x0, R.h, 0.1, (R.x0 + W.x0) / 2, R.h / 2, R.z0 - 0.05);
    proxy(R.x1 - W.x1, R.h, 0.1, (W.x1 + R.x1) / 2, R.h / 2, R.z0 - 0.05);
    proxy(W.x1 - W.x0, W.y0, 0.1, (W.x0 + W.x1) / 2, W.y0 / 2, R.z0 - 0.05);
    proxy(W.x1 - W.x0, R.h - W.y1, 0.1, (W.x0 + W.x1) / 2, (R.h + W.y1) / 2, R.z0 - 0.05);
    proxy(0.1, R.h, R.z1 - R.z0, R.x0 - 0.05, R.h / 2, (R.z0 + R.z1) / 2);
    proxy(0.1, R.h, R.z1 - R.z0, R.x1 + 0.05, R.h / 2, (R.z0 + R.z1) / 2);

    // ---- static decor
    const S = { toy: [], glossy: [], decal: [] };
    S.toy.push(...F.rug().map((g) => g.applyMatrix4(xform({ x: -0.35, z: -0.25 }))));
    S.toy.push(...F.bin().map((g) => g.applyMatrix4(xform({ x: -0.8, z: 1.5 }))));
    S.glossy.push(...F.radiator().map((g) => g.applyMatrix4(xform({ x: (W.x0 + W.x1) / 2, z: R.z0 + 0.14 }))));
    S.glossy.push(...F.extinguisher().map((g) => g.applyMatrix4(xform({ x: R.x0 + 0.25, z: 1.95 }))));
    const wall = (name, w, h, t, frameCol) => {
      S.decal.push(F.decal(name, w, h, { ...t, z: (t.z || 0) }));
      if (frameCol) S.toy.push(...F.frame(w, h, frameCol).map((g) => g.applyMatrix4(xform({ ...t }))));
    };
    // left wall (faces +X): map, calendar
    wall('map', 1.2, 0.87, { x: R.x0 + 0.035, y: 2.05, z: -1.85, ry: Math.PI / 2 }, P.woodDark);
    wall('calendar', 0.34, 0.425, { x: R.x0 + 0.02, y: 2.3, z: -0.62, ry: Math.PI / 2 });
    wall('sampler', 0.56, 0.44, { x: R.x0 + 0.035, y: 2.82, z: (R.door.z0 + R.door.z1) / 2, ry: Math.PI / 2 }, P.tomato);
    // right wall (faces -X): safety poster by the bench, employee of the month above the trophies
    wall('safety', 0.5, 0.65, { x: R.x1 - 0.035, y: 2.15, z: -2.42, ry: -Math.PI / 2 }, '#8a4b22');
    wall('portrait', 0.48, 0.59, { x: R.x1 - 0.035, y: 2.86, z: -0.6, ry: -Math.PI / 2 }, P.gold);
    // bunting along both side walls
    S.toy.push(...F.bunting(new THREE.Vector3(R.x0 + 0.06, 3.3, R.z0 + 0.1), new THREE.Vector3(R.x0 + 0.06, 3.3, R.z1 - 0.1), 15, 0.28));
    S.toy.push(...F.bunting(new THREE.Vector3(R.x1 - 0.06, 3.3, R.z0 + 0.1), new THREE.Vector3(R.x1 - 0.06, 3.3, R.z1 - 0.1), 15, 0.28));
    const decor = F.meshGroup('decor', S);
    this.root.add(decor);
    this.pick(decor);

    // ---- furniture (static)
    const deskG = new THREE.Group();
    deskG.name = 'deskArea';
    this.add(deskG, -2.2, 0, 0.95, 0.3);
    const desk = F.desk();
    deskG.add(desk);
    const chair = this.add(F.chair(), 0.05, 0, -0.78, 0.25, deskG);
    this.pick(desk, chair);
    const plant1 = this.add(F.pottedPlant({ seed: 4, size: 1.1 }), -4.08, 0, -2.45);
    const plant2 = this.add(F.pottedPlant({ seed: 9, size: 0.8, pot: P.cobalt }), 4.12, 0, 2.02);
    // clutter: birdseed sack under Pidge's window (he has noticed), apple crate by the bench
    const seed = this.add(birdseedBag({ seed: 3 }), (W.x0 + W.x1) / 2 + 0.72, 0, R.z0 + 0.42, -0.35);
    const apples = this.add(crate({ seed: 5, size: 0.62, contents: 'apples' }), 1.45, 0, R.z0 + 0.5, 0.25);
    this.pick(seed, apples);
    this.pick(plant1, plant2);

    // ---- interactive objects
    const t = this.targets;
    // corkboard (flyers are registered in refresh)
    this.board = buildBoard();
    this.add(this.board.group, BOARD_X, 1.2 + BOARD.h / 2, R.z0 + 0.004);
    this.pickables.push(...this.board.pickables);
    // trophy shelf
    this.shelf = buildTrophyShelf();
    this.add(this.shelf.group, R.x1 - 0.004, 0, -0.6, -Math.PI / 2);
    this.pickables.push(...this.shelf.pickables);
    this.addTarget('trophies', this.shelf.group, {
      collider: this.shelf.collider, lift: [0, 0, 0.03], anchor: [0, 1.7, 0.2], wobAmt: 0.15,
      tip: () => this.trophyTip(), shoot: () => this.trophyShot(),
    });
    this.ticks.push((dt, tt) => { for (const c of this.shelf.cups) c.userData.update?.(dt, tt); });
    // clock
    const clock = F.wallClock();
    this.add(clock, (W.x0 + W.x1) / 2, 3.04, R.z0 + 0.06);
    clock.scale.setScalar(0.78);
    clock.add(F.hitBox(0.75, 0.8, 0.2, { y: 0.03 }));
    this.addTarget('clock', clock, {
      collider: clock.children.at(-1), lift: [0, 0, 0.08], anchor: [0, 0, 0.05],
      tip: () => ({ title: 'Wall clock', sub: 'Always five minutes fast. Like Jack.', color: P.tomato }),
      shoot: () => { clock.userData.spin = 2; this.sfx('tick'); this.later(0.15, () => this.sfx('tick')); return null; },
    });
    this.ticks.push((dt) => clock.userData.tick(dt));
    // workbench = WORKSHOP
    const bench = F.workbench();
    this.add(bench, 3.12, 0, R.z0 + 0.43, 0);
    bench.add(F.hitBox(2.3, 3.0, 1.0, { y: 1.5, z: -0.05 }));
    this.pick(bench);
    this.addTarget('workshop', bench, {
      collider: bench.children.at(-1), lift: [0, 0, 0.03], anchor: [0, 1.9, -0.3], wobAmt: 0.12,
      tip: () => ({ title: 'Workshop', sub: `Upgrade your rifle · ${this.progress?.coins ?? 0} coins in the tin`, cta: 'Shoot to open the workshop', color: P.teal }),
      shoot: () => ({ type: 'workshop' }),
    });
    // filing cabinet = SETTINGS
    const cab = F.filingCabinet();
    this.add(cab, 4.02, 0, 1.08, -0.9);
    // body-high only: from the long-lens camera a 1.9 m box hid the trophy shelf behind it
    // (the cactus on top is still hoverable through its own mesh)
    cab.add(F.hitBox(0.8, 1.5, 0.9, { y: 0.75 }));
    this.pick(cab);
    this.addTarget('settings', cab, {
      collider: cab.children.at(-1), lift: [0, 0.05, 0], anchor: [0, 1.1, 0.4],
      tip: () => ({ title: 'Settings', sub: 'Volume, look speed, graphics', cta: 'Shoot to open the drawer', color: P.cobalt }),
      shoot: () => { this.openDrawer(cab); return { type: 'settings' }; },
    });
    // chalkboard easel = MODES (coming soon)
    const easel = F.chalkEasel();
    this.add(easel, 2.3, 0, 1.5, -0.4);
    easel.add(F.hitBox(1.45, 1.9, 0.6, { y: 0.95, z: 0.0 }));
    this.pick(easel);
    this.addTarget('modes', easel, {
      collider: easel.children.at(-1), lift: [0, 0.05, 0], anchor: [0, 1.25, 0.1],
      tip: () => ({ title: 'Game modes', sub: 'Time Attack, Ammo Hunt & Snapshot — coming soon!', color: '#2f5a4e' }),
      shoot: () => { this.popAt(easel, 'SOON!', '#9be38a'); return null; },
    });
    // desk objects
    const lamp = this.add(F.deskLamp(), -0.62, 0.885, -0.12, 0.5, deskG);
    lamp.add(F.hitBox(0.45, 0.8, 0.45, { y: 0.35 }));
    this.addTarget('lamp', lamp, {
      collider: lamp.children.at(-1), lift: [0, 0.06, 0], anchor: [-0.1, 0.5, 0.05],
      tip: () => ({ title: 'Desk lamp', sub: lamp.userData.on ? 'Click. Click.' : 'Let there be light!', color: P.sunflower }),
      shoot: () => { lamp.userData.on = !lamp.userData.on; lamp.userData.bulb.emissiveIntensity = lamp.userData.on ? 2.2 : 0; this.sfx('tick'); return null; },
    });
    const phone = this.add(F.phone(), 0.15, 0.885, -0.02, -0.15, deskG);
    phone.add(F.hitBox(0.45, 0.35, 0.4, { y: 0.14 }));
    this.addTarget('phone', phone, {
      collider: phone.children.at(-1), lift: [0, 0.06, 0], anchor: [0, 0.15, 0.05],
      tip: () => ({ title: 'Telephone', sub: 'Nobody ever calls. Except Mrs Pebble.', color: P.tomato }),
      shoot: () => { this.ringPhone(phone); return null; },
    });
    const mug = this.add(F.mug(), -0.2, 0.885, 0.28, 0.4, deskG);
    mug.add(F.hitBox(0.28, 0.3, 0.28, { y: 0.1 }));
    this.addTarget('mug', mug, {
      collider: mug.children.at(-1), lift: [0, 0.05, 0], anchor: [0, 0.1, 0.07],
      tip: () => ({ title: "Jack's mug", sub: 'Tea. Stone cold since Tuesday.', color: P.teal }),
      shoot: () => { this.popAt(mug, 'SLOSH!', '#b0703a'); return null; },
    });
    this.ticks.push((dt, tt) => mug.userData.tick(dt, tt));
    // radio = music on/off
    const radio = this.add(F.radio(), 0.62, 0.885, -0.12, -0.38, deskG);
    radio.add(F.hitBox(0.7, 0.62, 0.45, { y: 0.26 }));
    this.radio = radio;
    this.addTarget('radio', radio, {
      collider: radio.children.at(-1), lift: [0, 0.07, 0], anchor: [0, 0.28, 0.12],
      tip: () => ({ title: `Radio: ${this.radioOn ? 'ON' : 'OFF'}`, sub: this.radioOn ? 'Muddlecombe FM — all toe-tappers, all day.' : 'Silence. Suspicious silence.', cta: this.radioOn ? 'Shoot to switch the music off' : 'Shoot to switch the music on', color: P.bubblegum }),
      shoot: () => { this.setRadio(!this.radioOn); return { type: 'radio', on: this.radioOn }; },
    });
    this.ticks.push((dt, tt) => this.tickRadio(dt, tt));
    // coat rack with Jack's cap
    const rack = this.add(F.coatRack(), R.x0 + 0.5, 0, -0.35, 0.6);
    rack.add(F.hitBox(0.6, 2.1, 0.6, { y: 1.05 })); // (0.6: from the long-lens camera a wider box hid Gerald's middle)
    this.pick(rack);
    this.addTarget('cap', rack, {
      collider: rack.children.at(-1), lift: [0, 0, 0], anchor: [0, 1.95, 0], wobAmt: 0.5,
      tip: () => ({ title: "Jack's lucky cap", sub: 'Never washed. Never missed.', color: P.cobalt }),
      shoot: () => { this.hopCap(rack); return null; },
    });
    // plant (fun)
    // (narrower, and nudged left: from the hub camera the old 1.2 m box covered the left half of Pidge on the sill)
    plant1.add(F.hitBox(1.0, 2.1, 1.0, { x: -0.1, y: 1.0 }));
    this.addTarget('plant', plant1, {
      collider: plant1.children.at(-1), lift: [0, 0, 0], anchor: [0.2, 1.25, 0.3], wobAmt: 0.6, // right of the coat rack
      tip: () => ({ title: 'Gerald the plant', sub: 'Thrives on neglect.', color: '#5fae44' }),
      shoot: () => null,
    });
    // Inspector Pidge on the windowsill
    this.pidge = new Pigeon({ seed: 5, scale: 2.6, variant: { body: '#8f9bb4', belly: '#aab3c6', neck: '#5d8f8a' }, shadow: false });
    this.dressPidge(this.pidge);
    const pidgeG = new THREE.Group();
    pidgeG.name = 'pidge';
    pidgeG.add(this.pidge.root);
    this.add(pidgeG, (W.x0 + W.x1) / 2 + 0.22, W.y0 + 0.02, R.z0 + 0.13, 0.3);
    pidgeG.add(boxCollider(0.65, 1.05, 0.6, { y: 0.48 }));
    this.pidgeG = pidgeG;
    this.addTarget('pidge', pidgeG, {
      collider: pidgeG.children.at(-1), lift: [0, 0.03, 0], anchor: [0, 0.5, 0.1], bounce: true,
      tip: () => ({ title: 'Inspector Pidge', sub: 'Grades your work. Do NOT shoot the inspector.', color: '#9aa7c7' }),
      shoot: () => { this.pidgeHit(); return null; },
    });
    this.pfx = { t: 99, dur: 1, k: 0, hit: false, look: new THREE.Vector3(), lookT: 0, capY: 0, capVY: 0, capR: 0, capVR: 0, capSpin: 0 };
    this.ticks.push((dt, tt) => {
      this.pidge.lookAt(this.pfx.lookT > 0 ? this.pfx.look : this.aimPoint);
      this.pidge.update(dt, tt);
      this.animatePidge(dt);
    });
    // Biscuit the cat, asleep on a cushion (she is the LOST CAT on the corkboard...)
    const catG = new THREE.Group();
    catG.name = 'cat';
    const cush = new THREE.Mesh(merge([
      part(puck(0.46, 0.14, 0.06, 24), '#ff8a7e', { y: 0.07 }),
      part(new THREE.TorusGeometry(0.42, 0.1, 10, 28), P.tomato, { y: 0.12, rx: Math.PI / 2 }),
      part(puck(0.34, 0.05, 0.02, 20), '#fff3ea', { y: 0.15 }),
    ]), materials.toy);
    cush.castShadow = true;
    cush.receiveShadow = true;
    catG.add(cush);
    this.cat = new Cat({ seed: 2, scale: 1.25, variant: { coat: '#f0a04a', stripe: '#d9772a', light: '#fbefd9' }, action: 'sleep', shadow: false });
    this.cat.root.position.y = 0.16;
    this.cat.root.rotation.y = 0.9;
    catG.add(this.cat.root);
    this.add(catG, 0.7, 0, 0.3, -0.3);
    catG.add(boxCollider(1.0, 0.7, 1.0, { y: 0.3 }));
    this.pick(cush);
    this.addTarget('cat', catG, {
      collider: catG.children.at(-1), lift: [0, 0.02, 0], anchor: [0, 0.35, 0], bounce: true,
      tip: () => ({ title: 'Biscuit', sub: 'The office cat. Shhh... she’s napping.', color: '#f0a04a' }),
      shoot: () => {
        this.cat.react({});
        this.sfx('meow');
        this.popAt(catG, 'HISSS!', '#f0a04a');
        this.later(2.8, () => this.cat.setAction('sleep', {}, 0.6));
        return null;
      },
    });
    this.ticks.push((dt, tt) => this.cat.update(dt, tt));
  }

  /** Navy peaked cap on the head bone (its own pivot: it pops and gets straightened) + clipboard under the wing. */
  dressPidge(pidge) {
    const B = pidge.bones;
    const cap = new THREE.Mesh(merge([
      part(new THREE.CylinderGeometry(0.058, 0.05, 0.045, 18), '#2f3e6b', { y: 0.05 }),
      part(new THREE.SphereGeometry(0.06, 18, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#2f3e6b', { y: 0.07, sy: 0.45 }),
      part(new THREE.CylinderGeometry(0.052, 0.052, 0.012, 18), '#1c2340', { y: 0.032 }),
      part(new THREE.CylinderGeometry(0.05, 0.05, 0.008, 16, 1, false, -Math.PI * 0.4, Math.PI * 0.8), '#1c2340', { y: 0.03, z: 0.028, sz: 1.3, rx: 0.18 }),
      part(puck(0.013, 0.006, 0.002, 12), P.sunflower, { y: 0.058, z: 0.056, rx: Math.PI / 2 - 0.15 }),
    ]), materials.toy);
    cap.castShadow = true;
    const capPivot = new THREE.Group();
    capPivot.name = 'pidgeCap';
    capPivot.position.set(0, 0.035, -0.01);
    capPivot.rotation.x = -0.12;
    capPivot.scale.setScalar(1.25);
    cap.position.y = -0.035;
    capPivot.add(cap);
    B.head.add(capPivot);
    this.pidgeCap = capPivot;
    this.pidgeCapRest = { pos: capPivot.position.clone(), rot: capPivot.rotation.clone() };
    const board = new THREE.Mesh(merge([
      part(bev(0.11, 0.15, 0.008, 0.004), '#c98a4b'),
      part(bev(0.09, 0.12, 0.004, 0.002), '#fff8ee', { y: -0.008, z: 0.005 }),
      part(bev(0.04, 0.018, 0.012, 0.004), '#c9d2de', { y: 0.07, z: 0.006 }),
      part(bev(0.06, 0.006, 0.002, 0.001), P.cobalt, { y: 0.02, z: 0.008 }),
      part(bev(0.05, 0.006, 0.002, 0.001), P.cobalt, { y: -0.005, z: 0.008 }),
      part(bev(0.055, 0.006, 0.002, 0.001), P.tomato, { y: -0.03, z: 0.008 }),
    ]), materials.toy);
    board.position.set(0.0, -0.01, 0.125);
    board.rotation.set(-0.35, 0.18, 0.08);
    board.castShadow = true;
    B.body.add(board);
  }

  addTarget(name, pivot, opts) {
    const tg = {
      name, pivot, collider: opts.collider, kind: opts.kind || 'object', tip: opts.tip, shoot: opts.shoot,
      bounce: !!opts.bounce, lift: new THREE.Vector3(...(opts.lift || [0, 0.05, 0.06])),
      anchor: new THREE.Vector3(...(opts.anchor || [0, 0, 0])), wobAxis: opts.wobAxis || 'z', wobAmt: opts.wobAmt ?? 1,
      rest: { pos: pivot.position.clone(), rot: pivot.rotation.clone(), scale: pivot.scale.clone() },
      l: 0, lv: 0, w: 0, wv: 0, q: 0, qv: 0, meshes: [], data: opts.data,
    };
    tg.lift.applyEuler(pivot.rotation); // lift is authored in the object's own frame (+Z = its front)
    pivot.traverse((o) => { if (o.isMesh && !o.userData.collider && o.visible && !o.isSkinnedMesh) tg.meshes.push(o); });
    pivot.userData.hubTarget = tg;
    if (tg.collider) tg.collider.userData.hubTarget = tg;
    this.targets.push(tg);
    return tg;
  }

  removeTarget(tg) {
    const i = this.targets.indexOf(tg);
    if (i >= 0) this.targets.splice(i, 1);
    if (this.hover === tg) this.hover = null;
  }

  // ------------------------------------------------------------------ data
  refresh({ levels, progress } = {}) {
    if (levels) this.levels = levels;
    if (progress) this.progress = progress;
    for (const tg of this.targets.filter((x) => x.kind === 'flyer')) this.removeTarget(tg);
    const flyers = this.board.setLevels(boardEntries(this.levels || [], this.progress));
    for (const f of flyers) {
      const tg = this.addTarget(`flyer:${f.def.id}`, f.pivot, {
        collider: f.collider, lift: [0, 0.05, 0.22], anchor: [0, f.lockY, 0.03], data: f, wobAmt: 0.8, // anchor = the doodle, never the name
        tip: () => this.flyerTip(f), shoot: () => this.flyerShot(f),
      });
      tg.kind = 'flyer';
    }
    this.shelf.update(this.levels || [], this.progress);
    this.hud?.setChips(this.progress?.coins ?? 0, this.progress?.stars ?? 0);
    // a new or better grade since last time: celebrate it on the next entry
    const grades = new Map((this.levels || []).map((l) => [l.id, this.progress?.level?.(l.id)?.grade || null]));
    if (this.lastGrades) {
      for (const [id, g] of grades) {
        const old = this.lastGrades.get(id);
        if (g && (!old || (RANK[g] || 0) > (RANK[old] || 0))) this.newTrophy = { id, grade: g };
      }
    }
    this.lastGrades = grades;
  }

  /** The "new trophy" beat: the cup pops onto the shelf, the flyer gets its stamp, Pidge approves. */
  celebrateTrophy() {
    const nt = this.newTrophy;
    this.newTrophy = null;
    if (!nt || !this.entered) return;
    const shelf = this.target('trophies');
    const cup = this.shelf.byId.get(nt.id);
    if (cup) {
      const base = cup.scale.clone(), ry = cup.rotation.y;
      let t = 0;
      this.anims.push((dt) => {
        t += dt;
        const k = Math.min(1, t / 0.7);
        const s = k < 0.35 ? (k / 0.35) * 1.35 : 1 + 0.35 * Math.cos(((k - 0.35) / 0.65) * Math.PI * 2.5) * (1 - k);
        cup.scale.copy(base).multiplyScalar(Math.max(0.01, s));
        cup.rotation.y = ry + Math.PI * 2 * (1 - (1 - k) ** 3); // one full showy spin, ends facing front
        return k < 1;
      });
    }
    if (shelf) {
      shelf.wv += 10;
      this.popAt(shelf.pivot, 'NEW TROPHY!', '#ffc93c');
      this.focusOn(shelf.pivot, 0.16);
    }
    this.sfx('collect');
    this.later(0.45, () => {
      const f = this.target(`flyer:${nt.id}`);
      if (f) {
        f.qv += 16;
        f.wv += 8;
        this.popAt(f.pivot, `${nt.grade}!`, '#ff5a4e');
      }
      this.sfx('stamp');
    });
    this.later(0.7, () => { this.pidge.celebrate?.(); this.sfx('coo', { pitch: 1.2 }); });
  }

  flyerTip(f) {
    const { def, rec = {}, locked, need, teaser } = f.entry;
    const color = THEMES[themeFor(def)].color;
    if (teaser) return { key: def.id, title: def.name, sub: `${def.location} — new odd jobs coming soon!`, color: '#9aa3b2' };
    if (locked) {
      const have = this.progress?.stars ?? 0;
      return { key: def.id, title: `${def.name} (locked)`, sub: `Needs ${need} ★ — you have ${have}. Earn more stars!`, color: '#9aa3b2' };
    }
    const best = rec.grade ? `Best grade ${rec.grade}` : 'Not played yet';
    return {
      key: def.id, title: def.name, sub: `${def.location} · ${best} · par ${fmt(def.parTime || 180)}`,
      stars: [rec.stars || 0, 4], cta: 'Shoot the flyer to take the job!', color,
    };
  }

  flyerShot(f) {
    const { def, locked, teaser } = f.entry;
    if (teaser) { this.popAt(f.pivot, 'SOON!', P.cobalt); return null; }
    if (locked) {
      const tg = f.pivot.userData.hubTarget;
      if (tg) tg.rattle = 0.7;
      this.sfx('hitMetal');
      this.later(0.12, () => this.sfx('hitMetal', { pitch: 1.3, volume: 0.6 }));
      this.popAt(f.pivot, 'LOCKED!', '#c9d2de');
      return null;
    }
    this.focusOn(f.pivot, 0.34);
    return { type: 'play', id: def.id };
  }

  trophyTip() {
    const graded = (this.levels || []).map((l) => this.progress?.level?.(l.id)?.grade).filter(Boolean);
    const cnt = (g) => graded.filter((x) => x === g).length;
    const sub = graded.length
      ? `${cnt('S') + cnt('A')} gold · ${cnt('B')} silver · ${cnt('C') + cnt('D')} bronze. Inspector Pidge approves (mostly).`
      : 'Empty for now — finish a job to earn a trophy!';
    return { title: 'Trophy shelf', sub, color: P.gold };
  }

  trophyShot() {
    for (const c of this.shelf.group.getObjectByName('trophies')?.children || []) c.userData.wobble?.(1.2);
    this.sfx('ding');
    return null;
  }

  // ------------------------------------------------------------------ enter / exit
  enter() {
    if (this.entered) return;
    this.entered = true;
    this.scene.add(this.root);
    const env = this.env;
    if (env) {
      this.prevEnv = { preset: env.preset, center: env.shadowCenter?.clone(), radius: env.shadowRadius };
      if (this.presetName && env.preset !== this.presetName) env.apply(this.presetName);
      const s = env.sunDir || new THREE.Vector3(0.5, 0.7, -0.5);
      this.root.rotation.y = Math.atan2(s.x, s.z) - SUN_OFFSET;
      env.setShadowFocus(_v.set(0, 1, -0.5).applyAxisAngle(UP, this.root.rotation.y).add(ORIGIN), 14);
    }
    if (this.scene) {
      this.prevGrade = { value: this.scene.userData.grade };
      this.scene.userData.grade = { ...(this.scene.userData.grade || {}), ...OFFICE_GRADE };
    }
    this.root.updateMatrixWorld(true);
    this.darts.attachGun(true);
    // first entry: establishing shot + push-in; later entries: a short settle
    const first = this.enterCount++ === 0;
    Object.assign(this.intro, { t: 0, dur: first ? INTRO_FIRST : INTRO_AGAIN, from: first ? WIDE : BACK, frames: 0, wall: null, speed: 1 });
    if (this.newTrophy) this.later((first ? INTRO_FIRST : INTRO_AGAIN) + 0.25, () => this.celebrateTrophy());
    this.busy = 0;
    this.focus.goal = 0;
    this.focus.k = 0;
    this.setInteractive(true);
    const c = this.canvas;
    if (c) {
      c.addEventListener('pointermove', this.handlers.move);
      c.addEventListener('pointerdown', this.handlers.down);
      c.addEventListener('pointerleave', this.handlers.leave);
      c.addEventListener('pointerenter', this.handlers.enter);
    }
    this.hud?.show(true);
    this.setRadio(this.radioOn, { silent: true });
    this.updateCamera(0);
  }

  exit() {
    if (!this.entered) return;
    this.entered = false;
    this.root.removeFromParent();
    this.darts.attachGun(false);
    this.darts.clear();
    const c = this.canvas;
    if (c) {
      c.removeEventListener('pointermove', this.handlers.move);
      c.removeEventListener('pointerdown', this.handlers.down);
      c.removeEventListener('pointerleave', this.handlers.leave);
      c.removeEventListener('pointerenter', this.handlers.enter);
      c.style.cursor = '';
    }
    this.hud?.show(false);
    if (this.hover) this.setHot(this.hover, false);
    this.hover = null;
    this.hud?.setHover(null);
    this.pending.length = 0;
    if (this.scene && this.prevGrade) {
      // put back exactly what was there (even "nothing": the office tilt must not leak into a level)
      if (this.prevGrade.value === undefined) delete this.scene.userData.grade;
      else this.scene.userData.grade = this.prevGrade.value;
      this.prevGrade = null;
    }
    const env = this.env;
    if (env && this.prevEnv) {
      if (this.prevEnv.preset && env.preset !== this.prevEnv.preset) env.apply(this.prevEnv.preset);
      if (this.prevEnv.center) env.setShadowFocus(this.prevEnv.center, this.prevEnv.radius);
    }
  }

  /** Disable dart shooting (e.g. while a DOM workshop/settings panel is open over the office). */
  setInteractive(on) {
    this.interactive = on;
    if (this.canvas) this.canvas.style.cursor = on && this.entered ? 'none' : '';
    this.hud?.el.classList.toggle('passive', !on);
    if (!on) {
      if (this.hover) this.setHot(this.hover, false);
      this.hover = null;
      this.hud?.setHover(null);
      this.hud?.setPointer(-200, -200, false);
    }
  }

  /** Radio state (the game owns the actual music). silent = no onAction. */
  setRadio(on, { silent = false } = {}) {
    this.radioOn = !!on;
    const u = this.radio.userData;
    u.dialMat.emissiveIntensity = this.radioOn ? 1.4 : 0;
    if (!this.radioOn) for (const n of u.notes) u.setNote(n.id, false);
    u.noteMesh.visible = this.radioOn; // no notes, no draw call
    if (!silent) this.sfx('tick');
  }

  // ------------------------------------------------------------------ input
  onPointerMove(e) {
    const r = this.canvas.getBoundingClientRect();
    this.setPointerPx(e.clientX - r.left, e.clientY - r.top, e.clientX, e.clientY);
  }

  setPointerPx(x, y, clientX = x, clientY = y) {
    const r = this.canvas?.getBoundingClientRect?.() || { width: innerWidth, height: innerHeight, left: 0, top: 0 };
    const p = this.pointer;
    p.x = x;
    p.y = y;
    p.cx = clientX;
    p.cy = clientY;
    p.nx = (x / Math.max(1, r.width)) * 2 - 1;
    p.ny = -(y / Math.max(1, r.height)) * 2 + 1;
    p.inside = true;
    p.dirty = true;
    if (this.interactive) this.hud?.setPointer(clientX, clientY, true);
  }

  onPointerDown(e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const r = this.canvas.getBoundingClientRect();
    this.setPointerPx(e.clientX - r.left, e.clientY - r.top, e.clientX, e.clientY);
    this.fire();
  }

  /** Raycast the pointer: { target, point, normal, object } or null. */
  pickAt(nx, ny) {
    _ndc.set(nx, ny);
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(_ndc, this.camera);
    this.raycaster.far = 60;
    const list = this.pickables.concat(this.targets.map((t) => t.collider).filter(Boolean));
    const hits = this.raycaster.intersectObjects(list, false);
    const h = hits[0];
    if (!h) return null;
    let target = null;
    for (let o = h.object; o; o = o.parent) if (o.userData.hubTarget) { target = o.userData.hubTarget; break; }
    const normal = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : null;
    return { target, point: h.point.clone(), normal, object: h.object };
  }

  fire() {
    if (!this.entered || !this.interactive || this.busy > 0) return;
    if (this.fireCool > 0) return;
    this.fireCool = 0.22;
    this.intro.speed = 2.5; // a shot during the push-in hurries the camera along
    this.sound.unlock?.();
    this.hud?.hideHint();
    this.hud?.kick();
    this.sfx('pop');
    const hit = this.pickAt(this.pointer.nx, this.pointer.ny);
    if (!hit) {
      // miss: dart sails off into the garden
      this.raycaster.ray.at(25, _v);
      this.darts.fire(_v.clone(), null, null, { vanish: true });
      return;
    }
    const tg = hit.target;
    let point = hit.point, normal = hit.normal, attach = hit.object;
    if (tg) {
      // stick on the object's visible surface (colliders are generous)
      const ray = this.raycaster.ray.clone();
      let vis = this.raycaster.intersectObjects(tg.meshes, false)[0];
      if (!vis) {
        tg.pivot.updateWorldMatrix(true, false);
        const a = tg.anchor.clone().applyMatrix4(tg.pivot.matrixWorld);
        this.raycaster.set(this.camera.position, a.sub(this.camera.position).normalize());
        vis = this.raycaster.intersectObjects(tg.meshes, false)[0];
        this.raycaster.ray.copy(ray);
      }
      if (vis) {
        point = vis.point.clone();
        normal = vis.face ? vis.face.normal.clone().transformDirection(vis.object.matrixWorld) : normal;
        attach = vis.object;
      } else {
        attach = tg.pivot;
        point = tg.anchor.clone().applyMatrix4(tg.pivot.matrixWorld);
      }
    }
    this.darts.aim(point);
    this.darts.fire(point, normal, tg?.bounce ? null : attach, {
      bounce: !!tg?.bounce,
      onHit: () => this.onDartHit(tg, point),
    });
  }

  onDartHit(tg, point) {
    this.sfx('spring', { volume: 0.9 });
    const sp = this.toScreen(point);
    if (tg?.name !== 'pidge') this.pidgeFlinch(point);
    if (!tg) {
      if (sp) this.hud?.pop(sp.x, sp.y, POPS[(Math.random() * POPS.length) | 0]);
      return;
    }
    tg.wv += 9 * tg.wobAmt;
    tg.qv += 7;
    if (!tg.bounce && sp) this.hud?.pop(sp.x, sp.y, POPS[(Math.random() * POPS.length) | 0]);
    const action = tg.shoot?.(point);
    if (action) {
      if (action.type === 'play') this.busy = 2.5;
      this.later(0.3, () => {
        this.sfx('uiClick');
        this.onAction(action);
      });
    }
  }

  // ------------------------------------------------------------------ reactions
  later(sec, fn) { this.pending.push({ t: sec, fn }); }

  sfx(name, opts) {
    try { this.sound.sfx?.(name, opts); } catch { /* audio is optional */ }
  }

  toScreen(worldPoint) {
    if (!this.canvas) return null;
    const r = this.canvas.getBoundingClientRect();
    _v2.copy(worldPoint).project(this.camera);
    if (_v2.z > 1) return null;
    return { x: r.left + (_v2.x * 0.5 + 0.5) * r.width, y: r.top + (-_v2.y * 0.5 + 0.5) * r.height };
  }

  popAt(obj, text, color) {
    const tg = obj.userData.hubTarget;
    obj.updateWorldMatrix(true, false);
    const p = (tg ? tg.anchor.clone() : new THREE.Vector3()).applyMatrix4(obj.matrixWorld);
    const sp = this.toScreen(p);
    if (sp) this.later(0.08, () => this.hud?.pop(sp.x, sp.y - 40, text, color));
  }

  focusOn(obj, amount = 0.3) {
    obj.updateWorldMatrix(true, false);
    const tg = obj.userData.hubTarget;
    const p = (tg ? tg.anchor.clone() : new THREE.Vector3()).applyMatrix4(obj.matrixWorld);
    this.focus.point.copy(this.root.worldToLocal(p));
    this.focus.goal = amount;
    this.focus.hold = 1.4;
  }

  openDrawer(cab) {
    const d = cab.userData.drawer;
    const z0 = 0.35;
    let t = 0;
    const fn = (dt) => {
      t += dt;
      const k = t < 0.35 ? (t / 0.35) : t < 1.6 ? 1 : Math.max(0, 1 - (t - 1.6) / 0.4);
      const e = t < 0.35 ? 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2) : k;
      d.position.z = z0 + e * 0.32;
      return t < 2.0;
    };
    this.anims.push(fn);
    this.sfx('creak', { volume: 0.5 });
  }

  ringPhone(phone) {
    const h = phone.userData.handset;
    let t = 0;
    this.anims.push((dt) => {
      t += dt;
      const on = t < 1.4 && (t % 0.5) < 0.3;
      h.position.y = 0.17 + (on ? Math.abs(Math.sin(t * 60)) * 0.04 : 0);
      h.rotation.z = on ? Math.sin(t * 50) * 0.12 : 0;
      return t < 1.5;
    });
    this.sfx('ding');
    this.later(0.5, () => this.sfx('ding'));
    this.later(1.0, () => this.sfx('ding'));
  }

  hopCap(rack) {
    const cap = rack.userData.cap;
    const y0 = 1.96;
    let t = 0;
    this.anims.push((dt) => {
      t += dt;
      const k = Math.min(1, t / 0.9);
      cap.position.y = y0 + Math.sin(k * Math.PI) * 0.55;
      cap.rotation.y = 0.6 + k * Math.PI * 4;
      return k < 1;
    });
    this.sfx('whoosh', { volume: 0.4 });
  }

  // ------------------------------------------------------------------ Inspector Pidge
  /** A dart landed somewhere: Pidge flinches (squash + ruffle), squawks, glares at it, then fixes his cap. */
  pidgeFlinch(point) {
    const f = this.pfx;
    if (f.t < 0.5) return; // still mid-flinch
    this.pidgeG.getWorldPosition(_v);
    const k = THREE.MathUtils.clamp(1.25 - (point ? point.distanceTo(_v) : 5) / 7, 0.4, 1);
    const again = f.t < 1.7;
    Object.assign(f, { t: 0, dur: 1.5, k: again ? k * 0.75 : k, hit: false, lookT: 1.25, crook: (Math.random() < 0.5 ? -1 : 1) * (0.3 + 0.15 * k) });
    if (point) f.look.copy(point);
    f.capVY += 0.55 * f.k;
    this.sfx('pigeonFlap', { volume: 0.4 * f.k });
    if (!again) this.later(0.04, () => this.sfx('gull', { pitch: 1.22, volume: 0.28 + 0.28 * k }));
  }

  /** Shot directly: big startle, the cap flies off and lands crooked, an indignant OI!, then a huffy straighten. */
  pidgeHit() {
    const f = this.pfx;
    this.pidge.react({});
    Object.assign(f, { t: 0, dur: 2.1, k: 1, hit: true, lookT: 1.9, crook: 0.55 });
    f.look.copy(this.camera.position);
    f.capVY += 1.7;
    f.capSpin = 1;
    this.sfx('pigeonFlap');
    this.later(0.07, () => this.sfx('oi', { voice: 'posh', pitch: 1.45 }));
    this.later(1.05, () => this.sfx('coo', { pitch: 0.82, volume: 0.9 }));
    this.popAt(this.pidgeG, 'OI!', P.tomato);
  }

  animatePidge(dt) {
    const f = this.pfx, B = this.pidge.bones, cap = this.pidgeCap, rest = this.pidgeCapRest;
    if (!cap) return;
    f.t += dt;
    f.lookT -= dt;
    const t = f.t, k = f.k;
    const adjustAt = f.hit ? 1.12 : 0.58;
    const adjust = bump(t, adjustAt, adjustAt + 0.66);
    // cap: hops (ballistic, lands back on the head), sits crooked until the wing straightens it
    if (f.capY > 0 || f.capVY !== 0) {
      f.capVY -= 9 * dt;
      f.capY += f.capVY * dt;
      // one little bounce on a real landing; small impacts settle (the threshold scales with the frame
      // step so a slow frame's gravity kick can't keep a resting cap micro-bouncing, and spinning, forever)
      if (f.capY <= 0) { f.capY = 0; f.capVY = f.capVY < -Math.max(0.4, 18 * dt) ? -f.capVY * 0.3 : 0; }
    }
    const crook = t < adjustAt + 0.3 ? (f.crook || 0) * Math.min(1, t / 0.08) : 0;
    f.capVR += ((crook - f.capR) * 150 - f.capVR * (t > adjustAt ? 14 : 8)) * dt;
    f.capR += f.capVR * dt;
    // spins while airborne; once it lands it settles to the nearest whole turn
    if (f.capY === 0 && f.capVY === 0) f.capSpin = 0;
    f.capAng = (f.capAng || 0) + f.capSpin * 14 * dt;
    if (!f.capSpin) f.capAng += (Math.round(f.capAng / (Math.PI * 2)) * Math.PI * 2 - f.capAng) * (1 - Math.exp(-dt * 12));
    cap.position.set(rest.pos.x, rest.pos.y + f.capY, rest.pos.z);
    cap.rotation.set(rest.rot.x - Math.abs(f.capR) * 0.3, rest.rot.y + f.capAng, rest.rot.z + f.capR);
    if (t > f.dur + 0.2) return;
    // flinch: squash down, puff up, wings flare, head ducks (skipped when shot: react() does the startle)
    if (!f.hit) {
      const sq = bump(t, 0, 0.14) * 0.36 * k - bump(t, 0.12, 0.4) * 0.14 * k;
      B.base.scale.y *= 1 - sq;
      B.base.scale.x *= 1 + sq * 0.5;
      B.base.scale.z *= 1 + sq * 0.5;
      B.base.position.y += bump(t, 0.06, 0.34) * 0.05 * k; // a startled little hop
      if (B.head) B.head.rotation.x += bump(t, 0, 0.32) * 0.5 * k;
      const flare = bump(t, 0, 0.36) * 1.1 * k * (0.75 + 0.25 * Math.sin(t * 46));
      if (B.wingL) B.wingL.rotation.z += flare;
      if (B.wingR) B.wingR.rotation.z -= flare;
      if (B.body) B.body.scale.setScalar(1 + bump(t, 0.02, 0.34) * 0.12 * k);
    }
    // adjust the cap: the right wing (folded back along the body) pitches up and forward to the cap,
    // gives it a couple of taps, and the head tilts into it
    if (adjust > 0 && B.wingR) {
      const reach = Math.min(1, adjust * 1.35);
      B.wingR.rotation.x += 1.9 * reach; // tip swings up to cap height
      B.wingR.rotation.y += 0.3 * reach; // ...and in over the head
      B.wingR.rotation.z -= 0.2 * reach + Math.sin(t * 34) * 0.16 * reach;
      if (B.head) {
        B.head.rotation.z += 0.3 * adjust;
        B.head.rotation.x -= 0.1 * adjust;
      }
    }
  }

  tickRadio(dt, t) {
    const u = this.radio.userData;
    const grille = u.grille;
    if (!this.radioOn) { grille.scale.setScalar(1); return; }
    const beat = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * 1.9)), 6);
    grille.scale.set(1 + beat * 0.03, 1 + beat * 0.03, 1 + beat * 0.3);
    u.dialMat.emissiveIntensity = 1.2 + beat * 0.6;
    for (const n of u.notes) {
      n.t += dt;
      const k = n.t / 2.2;
      if (k < 0) { u.setNote(n.id, false); continue; }
      if (k >= 1) { n.t = -Math.random() * 0.6; u.setNote(n.id, false); continue; }
      // pop in, drift up, shrink away at the top (one instanced mesh: fade = scale)
      const s = Math.sin(Math.min(1, k * 4) * Math.PI / 2) * (1 - k * 0.3) * 1.3 * (1 - Math.max(0, (k - 0.7) / 0.3));
      u.setNote(n.id, true, Math.sin(k * 7 + n.id) * 0.1 + 0.05, 0.45 + k * 0.7, 0.1 + k * 0.05, Math.sin(k * 5 + n.id) * 0.4, s);
    }
  }

  // ------------------------------------------------------------------ frame
  update(dt, t) {
    if (!this.entered) return;
    dt = Math.min(Math.max(dt || 0, 0), 0.05); // (a first-frame rAF timestamp can predate the last one)
    this.time += dt;
    t = t ?? this.time;
    this.fireCool = Math.max(0, (this.fireCool || 0) - dt);
    this.busy = Math.max(0, this.busy - dt);
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.t -= dt;
      if (p.t <= 0) { this.pending.splice(i, 1); p.fn(); }
    }
    this.anims = this.anims.filter((fn) => fn(dt));
    this.tickIntro(dt);
    this.updateCamera(dt);
    this.updateHover(dt);
    for (const fn of this.ticks) fn(dt, t);
    this.updateTargets(dt);
    this.darts.update(dt);
  }

  /**
   * Intro clock. The first frames after enter() compile the office's shaders, so the push-in waits for
   * them; after that it advances by the real elapsed time (dt when frames are fast), so it lands in
   * ~1 s even when frames are slow (software rendering). Fixed-step sims (sandbox) advance by dt.
   */
  tickIntro(dt) {
    const I = this.intro;
    if (I.t >= 1) return;
    if (I.frames++ < 2) return;
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    const wall = I.wall == null ? 0 : (now - I.wall) / 1000;
    I.wall = now;
    I.t = Math.min(1, I.t + (Math.max(dt, wall) * I.speed) / I.dur);
  }

  /** Skip the rest of the entry push-in (automation / accessibility). */
  skipIntro() {
    this.intro.t = 1;
    this.updateCamera(0);
  }

  updateCamera(dt) {
    const p = this.pointer;
    const k = 1 - Math.exp(-dt * 4);
    const tx = this.interactive && p.inside ? THREE.MathUtils.clamp(p.nx, -1, 1) : 0;
    const ty = this.interactive && p.inside ? THREE.MathUtils.clamp(p.ny, -1, 1) : 0;
    this.par.x += (tx - this.par.x) * k;
    this.par.y += (ty - this.par.y) * k;
    const I = this.intro;
    // hold the establishing frame for a beat, then glide in and settle (smootherstep)
    const e = I.from === WIDE ? smoother(THREE.MathUtils.clamp((I.t - 0.1) / 0.9, 0, 1)) : smoother(I.t);
    const f = this.focus;
    f.hold -= dt;
    if (f.hold <= 0 && this.busy <= 0) f.goal = 0;
    f.k += (f.goal - f.k) * (1 - Math.exp(-dt * 3.2));
    const pos = _v.lerpVectors(I.from.pos, CAM.pos, e);
    const tgt = _v2.lerpVectors(I.from.target, CAM.target, e);
    // swoop: the camera path bows upward a little on the way in
    pos.y += Math.sin(e * Math.PI) * (I.from === WIDE ? 1.2 : 0.2);
    pos.x += this.par.x * PARALLAX.x * e;
    pos.y += this.par.y * PARALLAX.y * e;
    tgt.x += this.par.x * PARALLAX.tx * e;
    tgt.y += this.par.y * PARALLAX.ty * e;
    if (f.k > 1e-3) {
      pos.lerp(f.point, f.k);
      tgt.lerp(f.point, Math.min(1, f.k * 2.2));
    }
    this.root.updateMatrixWorld();
    const wp = this.view.position.copy(pos).applyMatrix4(this.root.matrixWorld);
    const wt = tgt.applyMatrix4(this.root.matrixWorld);
    _m.lookAt(wp, wt, UP);
    this.view.quaternion.setFromRotationMatrix(_m);
    const cam = this.camera;
    // framed for 16:9; on narrower screens widen the vertical fov so the room's width still fits
    const fit = Math.max(1, 16 / 9 / (cam.aspect || 16 / 9));
    const fov = THREE.MathUtils.lerp(I.from.fov, CAM.fov, e) - f.k * 3.5;
    this.view.fov = fit > 1 ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov) / 2) * fit)) : fov;
    cam.position.copy(this.view.position);
    cam.quaternion.copy(this.view.quaternion);
    if (Math.abs(cam.fov - this.view.fov) > 1e-3) {
      cam.fov = this.view.fov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
    this.darts.fitView(cam.fov, cam.aspect);
  }

  updateHover() {
    const p = this.pointer;
    // raycast when the pointer moved, otherwise every 4th frame (parallax keeps the camera drifting)
    this.frame++;
    const moving = this.intro.t < 1;
    if (!p.dirty && !moving && this.frame % 4 && this._lastHit !== undefined) return this.applyHover(this._lastHit);
    p.dirty = false;
    let hit = null;
    if (this.interactive && p.inside && this.busy <= 0) hit = this.pickAt(p.nx, p.ny);
    this._lastHit = hit;
    this.applyHover(hit);
  }

  /** Swap a target's meshes to (or back from) their warm hover-glow clones. */
  setHot(tg, on) {
    if (tg.kind === 'flyer') return; // flyers get the halo + lift instead (a glow would wash the ink out)
    for (const m of tg.meshes) {
      if (on) {
        if (m.userData.coolMat) continue;
        const h = hotMaterial(m.material);
        if (!h) continue;
        m.userData.coolMat = m.material;
        m.material = h;
      } else if (m.userData.coolMat) {
        m.material = m.userData.coolMat;
        m.userData.coolMat = null;
      }
    }
  }

  applyHover(hit) {
    const p = this.pointer;
    const tg = hit?.target || null;
    const point = hit?.point || null;
    if (point) this.aimPoint.copy(point);
    else {
      _ndc.set(p.nx, p.ny);
      this.raycaster.setFromCamera(_ndc, this.camera);
      this.raycaster.ray.at(20, this.aimPoint);
    }
    this.darts.aim(this.aimPoint);
    if (tg !== this.hover) {
      if (this.hover) this.setHot(this.hover, false);
      this.hover = tg;
      const halo = this.board.halo;
      halo.visible = false;
      if (tg) {
        this.setHot(tg, true);
        this.hotT = 0;
        tg.wv += 3.5 * tg.wobAmt;
        tg.qv -= 5; // a little squash-and-pop as it comes to the cursor
        this.sfx('uiHover', { pitch: tg.kind === 'flyer' ? 1.15 : 1 });
        if (tg.kind === 'flyer') {
          tg.pivot.add(halo);
          halo.visible = true;
          halo.scale.setScalar(0.85);
        }
      }
    }
    if (!this.hud) return;
    if (!tg) return this.hud.setHover(null);
    const info = { key: tg.name, ...tg.tip() };
    // flyer tooltips sit under the flyer so they never hide the board's names
    if (tg.kind === 'flyer') {
      const [, fh] = tg.data.size;
      tg.pivot.updateWorldMatrix(true, false);
      const sp = this.toScreen(_v.set(0, -fh + 0.02, 0.05).applyMatrix4(tg.pivot.matrixWorld));
      if (sp) info.at = { x: sp.x, y: sp.y + 10 };
    }
    this.hud.setHover(info);
  }

  updateTargets(dt) {
    this.hotT += dt;
    const glow = 0.08 + 0.06 * (0.5 + 0.5 * Math.sin(this.hotT * 7)) + 0.2 * Math.exp(-this.hotT * 7);
    for (const h of HOT.values()) h.emissiveIntensity = glow;
    const halo = this.board.halo;
    for (const tg of this.targets) {
      const goal = tg === this.hover ? 1 : 0;
      tg.lv += ((goal - tg.l) * 170 - tg.lv * 20) * dt;
      tg.l += tg.lv * dt;
      tg.wv += (-tg.w * 190 - tg.wv * 7.5) * dt;
      tg.w += tg.wv * dt;
      tg.qv += (-tg.q * 300 - tg.qv * 13) * dt;
      tg.q += tg.qv * dt;
      const pv = tg.pivot, r = tg.rest;
      pv.position.copy(r.pos).addScaledVector(tg.lift, tg.l);
      pv.rotation.copy(r.rot);
      const w = tg.w * 0.05;
      if (tg.wobAxis === 'y') pv.rotation.y += w;
      else pv.rotation.z += w;
      let s = 1 + tg.l * 0.035;
      if (tg.kind === 'flyer') {
        // hovered flyers straighten up on their pin and pop forward
        pv.rotation.z -= r.rot.z * THREE.MathUtils.clamp(tg.l, 0, 1);
        s = 1 + tg.l * 0.07;
        if (tg.rattle > 0) {
          tg.rattle = Math.max(0, tg.rattle - dt);
          pv.rotation.z += Math.sin(tg.rattle * 70) * 0.09 * tg.rattle;
        }
        if (tg === this.hover && halo.parent === pv) halo.scale.setScalar(THREE.MathUtils.clamp(0.85 + tg.l * 0.15, 0.85, 1.04));
      }
      const q = THREE.MathUtils.clamp(tg.q * 0.06, -0.25, 0.25);
      pv.scale.set(r.scale.x * s * (1 + q * 0.5), r.scale.y * s * (1 - q), r.scale.z * s * (1 + q * 0.5));
    }
  }

  // ------------------------------------------------------------------ debug / automation
  targetNames() { return this.targets.map((t) => t.name); }

  target(name) { return this.targets.find((t) => t.name === name) || null; }

  /** Screen position (canvas CSS px) of a target's anchor. */
  screenPos(name) {
    const tg = this.target(name);
    if (!tg || !this.canvas) return null;
    this.updateCamera(0);
    tg.pivot.updateWorldMatrix(true, false);
    const p = tg.anchor.clone().applyMatrix4(tg.pivot.matrixWorld).project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: (p.x * 0.5 + 0.5) * r.width, y: (-p.y * 0.5 + 0.5) * r.height };
  }

  debugHover(name) {
    // automation aims at the settled view (mid push-in, the camera would carry the target out from under the pointer)
    if (this.intro.t < 1) this.skipIntro();
    const s = this.screenPos(name);
    if (!s) return false;
    const r = this.canvas.getBoundingClientRect();
    this.setPointerPx(s.x, s.y, s.x + r.left, s.y + r.top);
    return true;
  }

  debugShoot(name) {
    if (!this.debugHover(name)) return false;
    this.fireCool = 0;
    this.updateCamera(0);
    this.fire();
    return true;
  }

  /** Triangles + draw calls of the office (visible meshes, instanced counted once). */
  stats() {
    let tris = 0, calls = 0;
    this.root.traverseVisible((o) => {
      if (!o.isMesh || o.userData.collider || o.material?.visible === false) return;
      const g = o.geometry;
      const n = (g.index ? g.index.count : g.attributes.position?.count || 0) / 3;
      tris += n * (o.isInstancedMesh ? o.count : 1);
      calls++;
    });
    return { tris: Math.round(tris), calls };
  }

  dispose() {
    this.exit();
    this.hud?.destroy();
  }
}
