// Chunky toy vehicles: car (hatch/beetle/van/pickup), ice-cream van, double-decker bus, tractor.
// Front = +Z, origin = ground centre. Body = 1 glossy mesh; wheels = pivots (parts.wheels) drawn
// by an InstancedMesh that follows them (<= 3 draw calls). Set userData.speed (m/s) to roll.
import * as THREE from 'three';
import { part, merge, rbox, xform } from '../../geo.js';
import { materials } from '../../../gfx/materials.js';
import { P } from '../../../gfx/palette.js';
import { Rng } from '../../../core/rng.js';
import {
  bev, lathe, puck, ball, blob, rod, arc, slab, latheBands, lettering, mesh, pivot, finish, paintFaces,
  InstancedPieces, Anims, ease, shade, boxCollider,
} from './lib.js';

const TYRE = '#3a3e4c';
const CHROME = '#e4e8ee';
const GLASS = '#4f8fbf';
const LAMP = '#fff3c4';
const TAIL = '#ff4a3d';
const PLATE_F = '#fff8ee';
const PLATE_R = '#ffd84a';
const DARK = '#3b3f4f';

// ---------------------------------------------------------------- wheels

const wheelCache = new Map();
/** Wheel geometry, axis = X, hub face on +X. lugs > 0 gives a knobbly tractor tread. */
export function wheelGeo({ r = 0.42, w = 0.3, hub = '#eef2f7', tyre = TYRE, seg = 12, lugs = 0, hubR = 0.62, cap = null } = {}) {
  const key = JSON.stringify([r, w, hub, tyre, seg, lugs, hubR, cap]);
  if (wheelCache.has(key)) return wheelCache.get(key);
  const c = Math.min(w * 0.32, r * 0.25);
  const ri = r * hubR;
  const tg = lathe([[ri, -w / 2], [r - c, -w / 2], [r, -w / 2 + c], [r, w / 2 - c], [r - c, w / 2], [ri, w / 2]], lugs ? lugs * 2 : seg);
  if (lugs) {
    const pos = tg.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const rr = Math.hypot(x, z);
      if (rr < r - c - 1e-3) continue;
      let th = Math.atan2(z, x);
      if (th < 0) th += Math.PI * 2;
      const idx = Math.round(th / (Math.PI / lugs)) % (lugs * 2);
      if (idx % 2 === 0) { const f = 1 + 0.11; pos.setX(i, x * f); pos.setZ(i, z * f); }
    }
    tg.computeVertexNormals();
  }
  const hg = lathe([[0, -w / 2 + 0.02], [ri, -w / 2 + 0.02], [ri, w / 2 - 0.01], [ri * 0.6, w / 2 + 0.028], [0, w / 2 + 0.036]], seg);
  const list = [part(tg, tyre), part(hg, hub)];
  if (cap) list.push(part(puck(ri * 0.38, 0.06, 0.02, 8), cap, { y: w / 2 + 0.04 }));
  const g = merge(list).rotateZ(-Math.PI / 2);
  wheelCache.set(key, g);
  return g;
}

/**
 * Attach wheels: defs = [{ x, y, z, r, geo }]. Creates pivots + InstancedPieces per geometry.
 * Returns tick(dt, t) that spins wheels from g.userData.speed and bobs `body`.
 */
export function rigWheels(g, body, defs) {
  const pivots = [];
  const groups = new Map();
  defs.forEach((d, i) => {
    const p = pivot(`wheel${i}`, d.x, d.y, d.z);
    p.userData.radius = d.r;
    g.add(p);
    pivots.push(p);
    if (!groups.has(d.geo)) groups.set(d.geo, []);
    groups.get(d.geo).push({ p, flip: d.x < 0 });
  });
  const meshes = [];
  for (const [geo, list] of groups) {
    const inst = new InstancedPieces(geo, materials.toy, list.map((o) => o.p), list.map((o) => (o.flip ? new THREE.Matrix4().makeRotationY(Math.PI) : null)));
    inst.name = 'wheels';
    g.add(inst);
    inst.sync(true);
    meshes.push(inst);
  }
  g.userData.speed = 0;
  let bob = 0;
  const tick = (dt, t) => {
    const s = g.userData.speed || 0;
    if (s) for (const p of pivots) p.rotation.x += (s / p.userData.radius) * dt;
    const a = Math.min(1, Math.abs(s) / 5);
    bob += (a - bob) * Math.min(1, dt * 4);
    if (bob > 0.001 && !g.userData.anims.has('bump')) {
      body.position.y = Math.abs(Math.sin(t * 8.5)) * 0.035 * bob;
      body.rotation.x = Math.sin(t * 4.2) * 0.012 * bob;
    }
    for (const m of meshes) m.sync();
  };
  return { pivots, meshes, tick };
}

function vehicleFinish(g, body, bodyMesh, defs, name, extraParts = {}) {
  const anims = new Anims();
  finish(g, { name, parts: {}, surface: 'metal', anims, bodyForWobble: body });
  const w = rigWheels(g, body, defs);
  g.userData.parts = { body, bodyMesh, wheels: w.pivots, ...extraParts };
  g.userData.addTick(w.tick);
  /** Boing! Body hops on its springs (fun prop hit). */
  g.userData.bump = (strength = 1) => anims.play(0.9, (k) => {
    const h = Math.sin(Math.min(1, k * 1.8) * Math.PI) * 0.35 * strength;
    body.position.y = Math.max(0, h);
    body.rotation.z = Math.sin(k * Math.PI * 5) * (1 - k) * 0.05 * strength;
    const sq = k > 0.55 ? Math.sin((k - 0.55) / 0.45 * Math.PI * 3) * (1 - k) * 0.25 * strength : 0;
    body.scale.set(1 + sq * 0.4, 1 - sq, 1 + sq * 0.4);
  }, { key: 'bump' }).then((d) => { if (d) { body.position.y = 0; body.rotation.z = 0; body.scale.set(1, 1, 1); } return d; });
  return g;
}

function faceParts(L, { w, zF, zR, yLamp, yBumper, lampR = 0.15, lampX = 0.55, grille = true, bumperLen }) {
  const bl = bumperLen ?? w - 0.1;
  for (const s of [-1, 1]) {
    L.push(latheBands([[0, -0.04], [lampR * 1.2, -0.04], [lampR * 1.2, 0.0], [lampR, 0.02], [lampR * 0.7, 0.045], [0, 0.05]], 10,
      (y, i) => (i < 3 ? CHROME : LAMP), { x: s * lampX, y: yLamp, z: zF, rx: Math.PI / 2 }));
    L.push(part(bev(0.26, 0.14, 0.06, 0.03), TAIL, { x: s * (w / 2 - 0.25), y: yLamp, z: zR }));
  }
  if (grille) {
    L.push(part(bev(0.7, 0.2, 0.06, 0.05), DARK, { y: yLamp - 0.2, z: zF }));
    L.push(part(bev(0.56, 0.035, 0.07, 0.015), CHROME, { y: yLamp - 0.16, z: zF + 0.01 }));
    L.push(part(bev(0.56, 0.035, 0.07, 0.015), CHROME, { y: yLamp - 0.24, z: zF + 0.01 }));
  }
  for (const [z, s] of [[zF + 0.05, 1], [zR - 0.05, -1]]) {
    L.push(part(new THREE.CapsuleGeometry(0.1, bl, 3, 8), CHROME, { y: yBumper, z, rz: Math.PI / 2 }));
    const py = s > 0 ? yBumper : yBumper + 0.24;
    const pz = s > 0 ? z + 0.1 : zR - 0.015;
    L.push(part(bev(0.44, 0.13, 0.03, 0.012), s > 0 ? PLATE_F : PLATE_R, { y: py, z: pz }));
    L.push(part(lettering(0.32, 0.05, 1, DARK, {}, null, 0.012), DARK, { y: py, z: pz + s * 0.022 }));
  }
}

function roofExtra(L, kind, { y, z = 0, w = 1.4, len = 1.5 }, rng) {
  if (kind === 'rack' || kind === 'luggage' || kind === 'surfboard') {
    for (const s of [-1, 1]) L.push(part(bev(0.07, 0.07, len, 0.025), DARK, { x: s * w / 2, y: y + 0.08, z }));
    for (const dz of [-len / 3, 0, len / 3]) L.push(part(bev(w + 0.1, 0.05, 0.07, 0.02), DARK, { y: y + 0.13, z: z + dz }));
  }
  if (kind === 'luggage') {
    const cols = rng.shuffle([P.tomato, P.sunflower, P.teal, P.bubblegum, P.violet]);
    L.push(part(bev(0.9, 0.34, 0.6, 0.08), cols[0], { x: -0.12, y: y + 0.34, z: z + 0.2, ry: 0.1 }));
    L.push(part(bev(0.62, 0.28, 0.46, 0.07), cols[1], { x: 0.2, y: y + 0.62, z: z + 0.15, ry: -0.15 }));
    L.push(part(bev(0.5, 0.36, 0.4, 0.08), cols[2], { x: 0.25, y: y + 0.34, z: z - 0.45 }));
    L.push(part(bev(0.08, 0.66, 0.66, 0.02), '#7a4a26', { x: -0.12, y: y + 0.45, z: z + 0.2, ry: 0.1 }));
  }
  if (kind === 'surfboard') {
    const g = new THREE.CapsuleGeometry(0.28, 1.9, 4, 10);
    g.scale(1, 1, 0.18);
    L.push(part(g, rng.pick([P.sunflower, P.teal, P.bubblegum]), { y: y + 0.24, z, rx: Math.PI / 2 }));
    L.push(part(bev(0.08, 0.02, 2.2, 0.01), '#fff8ee', { y: y + 0.29, z }));
  }
}

// ---------------------------------------------------------------- cars

/** Slope a box linearly over its full height: top face shrinks to kFront/kBack of the depth. */
function slopeFull(geo, h, kF, kB) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const f = (pos.getY(i) + h / 2) / h;
    const z = pos.getZ(i);
    pos.setZ(i, z * (1 - (1 - (z > 0 ? kF : kB)) * f));
  }
  return geo;
}

/**
 * Toy-car cabin: body-coloured sloped block with inset glass (windscreen, side band split by a
 * B-pillar, rear window) and an optional contrasting roof lid. Returns roof top y / centre z.
 */
function cabin(L, c, { w, h, d, y, z, kF = 0.7, kB = 0.88, r = 0.2, roof = null, bPillar = true }) {
  L.push(part(slopeFull(rbox(w, h, d, r, 2), h, kF, kB), c, { y, z }));
  const thF = Math.atan(((1 - kF) * d / 2) / h);
  const thB = Math.atan(((1 - kB) * d / 2) / h);
  const zF = z + (d / 2) * (1 - (1 - kF) / 2);
  const zB = z - (d / 2) * (1 - (1 - kB) / 2);
  L.push(part(bev(w - 0.26, (h * 0.62) / Math.cos(thF), 0.05, 0.03), GLASS, { y: y + 0.03, z: zF + 0.012, rx: -thF }));
  L.push(part(bev(w - 0.36, (h * 0.5) / Math.cos(thB), 0.05, 0.03), GLASS, { y: y + 0.06, z: zB - 0.012, rx: thB }));
  const hw = h * 0.5, yw = 0.06;
  const frac = (yw + hw / 2 + h / 2) / h;
  const front = z + (d / 2) * (1 - (1 - kF) * frac) - 0.1;
  const back = z - (d / 2) * (1 - (1 - kB) * frac) + 0.14;
  L.push(part(bev(w + 0.04, hw, front - back, 0.04), GLASS, { y: y + yw, z: (front + back) / 2 }));
  if (bPillar) L.push(part(new THREE.BoxGeometry(w + 0.06, hw + 0.02, 0.13), c, { y: y + yw, z: (front + back) / 2 + (front - back) * 0.12 }));
  const topLen = (d / 2) * (kF + kB);
  const topZ = z + (d / 2) * (kF - kB) / 2;
  if (roof) L.push(part(bev(w + 0.02, 0.08, topLen - 0.04, 0.035), roof, { y: y + h / 2 + 0.01, z: topZ }));
  return { roofY: y + h / 2 + (roof ? 0.05 : 0), roofZ: topZ };
}

function hatchBody(L, c, rng) {
  L.push(part(rbox(1.8, 0.8, 3.5, 0.3, 2), c, { y: 0.72 }));
  const roof = rng.chance(0.5) ? '#fff4e0' : null;
  const cab = cabin(L, c, { w: 1.64, h: 0.74, d: 2.1, y: 1.46, z: -0.2, kF: 0.7, kB: 0.88, roof });
  for (const s of [-1, 1]) L.push(part(bev(0.1, 0.1, 0.18, 0.04), c, { x: s * 0.96, y: 1.22, z: 0.66 }));
  if (rng.chance(0.5)) L.push(part(bev(1.84, 0.1, 2.9, 0.04), '#fff8ee', { y: 0.86 }));
  faceParts(L, { w: 1.8, zF: 1.74, zR: -1.74, yLamp: 0.86, yBumper: 0.42 });
  return { roofY: cab.roofY, roofZ: cab.roofZ, wheels: { r: 0.42, w: 0.32, x: 0.8, zf: 1.15, zr: -1.15 } };
}

function beetleBody(L, c, rng) {
  const b = new THREE.SphereGeometry(1, 20, 12);
  b.scale(0.9, 0.64, 1.62);
  b.translate(0, 0.82, 0);
  const pos = b.attributes.position;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0.36) pos.setY(i, 0.36 - (0.36 - pos.getY(i)) * 0.15);
  L.push(part(b, c));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) L.push(part(ball(0.5, 1), c, { x: sx * 0.77, y: 0.66, z: sz * 1.02, sx: 0.47, sy: 0.64, sz: 0.97 }));
    L.push(part(bev(0.2, 0.07, 1.25, 0.03), DARK, { x: sx * 0.8, y: 0.38 }));
    L.push(latheBands([[0, -0.05], [0.15, -0.05], [0.15, 0.0], [0.13, 0.02], [0.09, 0.05], [0, 0.055]], 10,
      (y, i) => (i < 3 ? CHROME : LAMP), { x: sx * 0.76, y: 0.86, z: 1.36, rx: Math.PI / 2 - 0.35 }));
    L.push(part(bev(0.12, 0.2, 0.08, 0.04), TAIL, { x: sx * 0.76, y: 0.86, z: -1.37, rx: 0.3 }));
    L.push(part(rod([sx * 0.66, 1.16, 0.5], [sx * 0.8, 1.22, 0.5], 0.02, 4), CHROME));
    L.push(part(bev(0.08, 0.1, 0.16, 0.035), c, { x: sx * 0.82, y: 1.24, z: 0.5 }));
    for (const z of [1.3, -1.3]) L.push(part(rod([sx * 0.55, 0.42, z * 0.97], [sx * 0.55, 0.42, z * 1.1], 0.03, 4), CHROME));
  }
  const glass = new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  L.push(part(glass, GLASS, { y: 1.02, z: -0.2, sx: 0.76, sy: 0.72, sz: 0.98 }));
  const roof = new THREE.SphereGeometry(1, 18, 4, 0, Math.PI * 2, 0, 0.62);
  L.push(part(roof, c, { y: 1.02, z: -0.22, sx: 0.79, sy: 0.75, sz: 0.97 }));
  L.push(part(new THREE.CapsuleGeometry(0.065, 1.5, 3, 8), CHROME, { y: 0.42, z: 1.44, rz: Math.PI / 2 }));
  L.push(part(new THREE.CapsuleGeometry(0.065, 1.5, 3, 8), CHROME, { y: 0.42, z: -1.44, rz: Math.PI / 2 }));
  const surfZ = (y) => 1.62 * Math.sqrt(Math.max(0, 1 - ((y - 0.82) / 0.64) ** 2));
  L.push(part(bev(0.4, 0.12, 0.03, 0.012), PLATE_R, { y: 0.62, z: -surfZ(0.62) - 0.005, rx: 0.3 }));
  for (let i = 0; i < 4; i++) {
    const y = 1.02 - i * 0.07;
    L.push(part(bev(0.46, 0.035, 0.035, 0.012), DARK, { y, z: -surfZ(y) - 0.004, rx: 0.5 }));
  }
  return { roofY: 1.74, roofZ: -0.2, wheels: { r: 0.4, w: 0.3, x: 0.78, zf: 1.02, zr: -1.02 } };
}

function vanBody(L, c, rng) {
  const cream = '#fff4e0';
  L.push(part(rbox(1.9, 1.72, 4.0, 0.34, 2), c, { y: 1.18 }));
  L.push(part(bev(1.92, 0.78, 4.02, 0.12), cream, { y: 1.68 }));
  L.push(part(bev(1.6, 0.56, 0.1, 0.05), GLASS, { y: 1.66, z: 2.0, rx: -0.08 }));
  L.push(part(bev(1.96, 0.46, 2.9, 0.06), GLASS, { y: 1.68, z: -0.25 }));
  for (const z of [0.9, 0.05, -0.8]) L.push(part(new THREE.BoxGeometry(1.99, 0.48, 0.12), cream, { y: 1.68, z }));
  L.push(part(new THREE.BoxGeometry(0.04, 1.1, 0.04), shade(c, -0.3), { x: 0.965, y: 1.05, z: -0.1 }));
  L.push(part(ball(0.2, 1), cream, { y: 1.12, z: 2.0, sz: 0.3 }));
  L.push(part(ball(0.12, 1), c, { y: 1.12, z: 2.05, sz: 0.3 }));
  faceParts(L, { w: 1.9, zF: 2.0, zR: -2.0, yLamp: 0.92, yBumper: 0.44, lampX: 0.6, lampR: 0.16, grille: false });
  return { roofY: 2.08, roofZ: -0.3, wheels: { r: 0.42, w: 0.32, x: 0.82, zf: 1.35, zr: -1.35 } };
}

function pickupBody(L, c, rng) {
  L.push(part(rbox(1.9, 0.8, 4.2, 0.28, 2), c, { y: 0.8 }));
  cabin(L, c, { w: 1.72, h: 0.74, d: 1.5, y: 1.55, z: 0.42, kF: 0.7, kB: 0.97, bPillar: false, roof: rng.chance(0.5) ? '#fff4e0' : null });
  for (const s of [-1, 1]) {
    L.push(part(bev(0.12, 0.44, 1.95, 0.05), c, { x: s * 0.9, y: 1.4, z: -1.15 }));
    L.push(part(bev(0.1, 0.1, 0.18, 0.04), c, { x: s * 1.0, y: 1.26, z: 0.98 }));
  }
  L.push(part(bev(1.84, 0.44, 0.12, 0.05), c, { y: 1.4, z: -2.08 }));
  L.push(part(bev(1.7, 0.06, 1.9, 0.02), DARK, { y: 1.22, z: -1.15 }));
  // cargo: hay bale + milk churn
  const hay = '#f2cd5c';
  L.push(part(bev(0.95, 0.5, 0.62, 0.09), hay, { x: -0.3, y: 1.5, z: -1.3, ry: 0.15 }));
  for (const dx of [-0.25, 0.25]) L.push(part(bev(0.05, 0.52, 0.64, 0.02), '#c9a040', { x: -0.3 + dx, y: 1.5, z: -1.3 + dx * 0.15, ry: 0.15 }));
  L.push(latheBands([[0, 0], [0.2, 0], [0.2, 0.42], [0.12, 0.52], [0.12, 0.6], [0.15, 0.62], [0.15, 0.66], [0, 0.66]], 10, (y) => (y > 0.58 ? P.tomato : CHROME), { x: 0.45, y: 1.24, z: -1.5 }));
  faceParts(L, { w: 1.9, zF: 2.1, zR: -2.12, yLamp: 0.9, yBumper: 0.45 });
  return { roofY: 2.0, roofZ: 0.36, wheels: { r: 0.45, w: 0.34, x: 0.83, zf: 1.35, zr: -1.3 } };
}

const STYLES = { hatch: hatchBody, beetle: beetleBody, van: vanBody, pickup: pickupBody };
const CAR_COLORS = [P.tomato, P.cobalt, P.teal, P.sunflower, P.bubblegum, P.tangerine, '#8ad14f', P.violet];

/**
 * car({ style: 'hatch'|'beetle'|'van'|'pickup', color, seed, roof: 'none'|'rack'|'luggage'|'surfboard' })
 * parts: { body (Group; bounces), bodyMesh, wheels: [FL, FR, RL, RR] pivots (rotation.x = spin) }.
 * userData: speed (m/s, spins wheels + bobs), bump(strength), wobble().
 */
export function car({ style = 'hatch', color, seed = 1, roof } = {}) {
  const rng = new Rng(`car-${style}-${seed}`);
  const c = color || rng.pick(CAR_COLORS);
  const L = [];
  const info = (STYLES[style] || hatchBody)(L, c, rng);
  const roofKind = roof ?? (style === 'pickup' ? 'none' : rng.pick(['none', 'none', 'rack', 'luggage', 'surfboard']));
  if (style !== 'pickup') roofExtra(L, roofKind, { y: info.roofY, z: info.roofZ, w: style === 'beetle' ? 1.1 : 1.4, len: style === 'van' ? 2.4 : 1.4 }, rng);
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  const bodyMesh = mesh(L, materials.glossy, 'bodyMesh');
  body.add(bodyMesh);
  g.add(body);
  const W = info.wheels;
  const geo = wheelGeo({ r: W.r, w: W.w, hub: rng.pick(['#eef2f7', '#eef2f7', P.sunflower, CHROME]) });
  const defs = [[W.x, W.zf], [-W.x, W.zf], [W.x, W.zr], [-W.x, W.zr]].map(([x, z]) => ({ x, y: W.r, z, r: W.r, geo }));
  return vehicleFinish(g, body, bodyMesh, defs, `car-${style}`);
}

// ---------------------------------------------------------------- ice-cream van

function dripStrip(len, h = 0.16, n = 9) {
  const s = new THREE.Shape();
  s.moveTo(-len / 2, h / 2);
  s.lineTo(len / 2, h / 2);
  s.lineTo(len / 2, -h / 2 + 0.02);
  const step = len / n;
  for (let i = n; i > 0; i--) {
    const x0 = -len / 2 + i * step;
    const deep = i % 2 ? 0.16 : 0.09;
    s.quadraticCurveTo(x0 - step * 0.5, -h / 2 - deep, x0 - step, -h / 2 + 0.02);
  }
  s.lineTo(-len / 2, h / 2);
  return slab(s, 0.03, 0, 3);
}

/**
 * iceCreamVan({ seed, color }) — pastel van with a giant cone on the roof and a serving hatch.
 * parts: { body, bodyMesh, wheels, speaker (roof loudspeaker pivot) }.
 * userData: speed, bump(), jingle(bool) (speaker pulses: a job tell).
 */
export function iceCreamVan({ seed = 1, color = '#fff4e6', trim = '#ff9ec4', roofColor = '#bfe8cc' } = {}) {
  const rng = new Rng(`icv-${seed}`);
  const L = [];
  L.push(part(rbox(2.0, 1.86, 4.6, 0.36, 2), color, { y: 1.25 }));
  L.push(part(bev(2.03, 0.46, 4.63, 0.16), trim, { y: 0.56 }));
  L.push(part(bev(2.06, 0.16, 4.45, 0.07), roofColor, { y: 2.2 }));
  for (const s of [-1, 1]) {
    L.push(part(dripStrip(3.8), trim, { x: s * 1.015, y: 0.99, ry: s * Math.PI / 2 }));
  }
  L.push(part(bev(1.82, 0.66, 0.1, 0.05), GLASS, { y: 1.72, z: 2.28, rx: -0.1 }));
  for (const s of [-1, 1]) L.push(part(bev(0.06, 0.55, 0.8, 0.03), GLASS, { x: s * 1.0, y: 1.7, z: 1.6 }));
  // serving hatch (+X side) with striped awning flap and counter
  L.push(part(bev(0.06, 0.82, 1.7, 0.04), '#3d5f86', { x: 1.0, y: 1.52, z: -0.45 }));
  L.push(part(bev(0.3, 0.07, 1.8, 0.03), P.woodLight, { x: 1.12, y: 1.1, z: -0.45 }));
  const flap = paintFaces(part(new THREE.BoxGeometry(0.05, 0.8, 1.8, 1, 1, 8), '#fff'),
    (x, y, z, nx, ny, nz, c) => c.set(Math.floor((z + 0.9) / 0.225) % 2 ? trim : '#fff8ee'));
  L.push(flap.applyMatrix4(xform({ x: 1.3, y: 2.08, z: -0.45, rz: -1.05 })));
  // cone + scoop decals on both sides
  for (const s of [-1, 1]) {
    for (const [z, col] of [[-1.55, P.bubblegum], [s > 0 ? 0.75 : -0.35, '#8ad14f']]) {
      L.push(part(new THREE.ConeGeometry(0.13, 0.32, 3), '#e3a85a', { x: s * 1.01, y: 1.36, z, rz: Math.PI, sx: 0.25 }));
      L.push(part(ball(0.15, 0), col, { x: s * 1.01, y: 1.6, z, sx: 0.22 }));
    }
  }
  faceParts(L, { w: 2.0, zF: 2.3, zR: -2.3, yLamp: 0.95, yBumper: 0.45, lampX: 0.62, lampR: 0.16 });
  // giant cone on the roof
  const coneG = new THREE.ConeGeometry(0.42, 1.05, 10, 3, true);
  const cone = part(coneG, '#fff', { y: 2.9, z: -0.7, rx: Math.PI });
  paintFaces(cone, (x, y, z, nx, ny, nz, c) => {
    const a = Math.atan2(x, z + 0.7);
    const k = Math.floor((a + Math.PI) / (Math.PI / 5)) + Math.floor(y / 0.18);
    c.set(k % 2 ? '#e8b060' : '#cf8a45');
  });
  L.push(cone);
  L.push(part(puck(0.38, 0.12, 0.04, 12), trim, { y: 2.33, z: -0.7 }));
  L.push(part(rod([0, 2.3, -0.7], [0, 2.5, -0.7], 0.08, 8), shade(trim, -0.2)));
  L.push(part(blob(0.47, 1, 0.07, seed), '#ffb3d1', { y: 3.52, z: -0.7, sy: 0.85 }));
  L.push(part(blob(0.38, 1, 0.08, seed + 1), '#fff3d6', { y: 3.95, z: -0.62, sy: 0.9 }));
  L.push(part(bev(0.11, 0.6, 0.11, 0.03), '#6b3a22', { x: 0.22, y: 4.2, z: -0.55, rz: -0.35 }));
  L.push(part(ball(0.12, 1), '#e8203a', { x: -0.08, y: 4.33, z: -0.66 }));
  L.push(part(rod([-0.08, 4.4, -0.66], [0.0, 4.6, -0.7], 0.018, 4), '#4a7a2a'));
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  const bodyMesh = mesh(L, materials.glossy, 'bodyMesh');
  body.add(bodyMesh);
  g.add(body);
  // loudspeaker
  const speaker = pivot('speaker', 0, 2.28, 1.35);
  const horn = [
    part(rod([0, 0, 0], [0, 0.28, 0], 0.04, 6), '#9aa3b2'),
    latheBands([[0.05, 0], [0.07, 0.12], [0.12, 0.26], [0.22, 0.36], [0.23, 0.4], [0.18, 0.38], [0.06, 0.2]], 12,
      (y, i) => (i === 3 || i === 4 ? P.tomato : '#f2f4f8'), { y: 0.4, rx: Math.PI / 2 }),
    part(ball(0.08, 1), '#9aa3b2', { y: 0.36, z: -0.02 }),
  ];
  speaker.add(mesh(horn, materials.glossy, 'hornMesh'));
  speaker.add(boxCollider(0.6, 0.6, 0.6, { y: 0.35, z: 0.2 }));
  body.add(speaker);
  const geo = wheelGeo({ r: 0.43, w: 0.32, hub: trim });
  const defs = [[0.86, 1.5], [-0.86, 1.5], [0.86, -1.45], [-0.86, -1.45]].map(([x, z]) => ({ x, y: 0.43, z, r: 0.43, geo }));
  vehicleFinish(g, body, bodyMesh, defs, 'iceCreamVan', { speaker });
  let jingle = false;
  g.userData.addTick((dt, t) => {
    if (!jingle) { speaker.scale.setScalar(1); return; }
    const p = 1 + Math.abs(Math.sin(t * 14)) * 0.12;
    speaker.scale.set(p, p, 1 + (p - 1) * 2);
    speaker.rotation.y = Math.sin(t * 7) * 0.08;
  });
  g.userData.jingle = (on) => { jingle = !!on; };
  /** Job reaction: jingle stops and the loudspeaker droops, broken, with a boing. */
  g.userData.breakSpeaker = () => {
    jingle = false;
    g.userData.speakerBroken = true;
    return g.userData.anims.play(1.0, (k) => {
      speaker.rotation.x = ease.outBounce(k) * 0.8;
      speaker.rotation.z = Math.sin(k * 22) * (1 - k) * 0.25;
    }, { key: 'speaker' });
  };
  return g;
}

// ---------------------------------------------------------------- bus

/** bus({ seed, color }) — chunky double-decker. parts: { body, bodyMesh, wheels }. userData: speed, bump(). */
export function bus({ seed = 1, color } = {}) {
  const rng = new Rng(`bus-${seed}`);
  const c = color || P.tomato;
  const cream = '#fff4e0';
  const L = [];
  L.push(part(rbox(2.5, 2.05, 8.6, 0.34, 2), c, { y: 1.33 }));
  L.push(part(rbox(2.5, 1.95, 8.4, 0.5, 2), c, { y: 3.3 }));
  L.push(part(bev(2.54, 0.24, 8.62, 0.08), cream, { y: 2.33 }));
  L.push(part(bev(2.56, 0.86, 6.9, 0.1), GLASS, { y: 1.72, z: -0.55 }));
  L.push(part(bev(2.56, 0.84, 7.2, 0.1), GLASS, { y: 3.3, z: 0 }));
  for (let i = 0; i < 6; i++) L.push(part(new THREE.BoxGeometry(2.6, 0.9, 0.14), c, { y: 1.72, z: -3.3 + i * 1.12 }));
  for (let i = 0; i < 7; i++) L.push(part(new THREE.BoxGeometry(2.6, 0.88, 0.14), c, { y: 3.3, z: -3.6 + i * 1.2 }));
  // front: windscreen, upper windows, destination board
  L.push(part(bev(1.9, 1.05, 0.1, 0.06), GLASS, { y: 1.7, z: 4.3 }));
  L.push(part(bev(0.12, 1.05, 0.14, 0.04), c, { y: 1.7, z: 4.32 }));
  L.push(part(bev(1.6, 0.8, 0.1, 0.06), GLASS, { y: 3.3, z: 4.2 }));
  L.push(part(bev(0.12, 0.8, 0.14, 0.04), c, { y: 3.3, z: 4.22 }));
  L.push(part(bev(1.7, 0.36, 0.1, 0.04), '#2b2b3a', { y: 2.6, z: 4.27 }));
  L.push(part(lettering(1.3, 0.16, 1, P.sunflower, {}, rng, 0.012), P.sunflower, { y: 2.6, z: 4.33 }));
  // door (front right) and advert panel
  L.push(part(bev(0.08, 1.7, 0.95, 0.04), GLASS, { x: 1.25, y: 1.2, z: 3.4 }));
  L.push(part(new THREE.BoxGeometry(0.1, 1.72, 0.05), cream, { x: 1.27, y: 1.2, z: 3.4 }));
  for (const s of [-1, 1]) {
    L.push(part(lettering(3.2, 0.14, 1, c, {}, rng, 0.014), c, { x: s * 1.285, y: 2.33, z: -0.6, ry: Math.PI / 2 }));
  }
  // rear window + details
  L.push(part(bev(1.8, 0.7, 0.1, 0.05), GLASS, { y: 3.3, z: -4.2 }));
  faceParts(L, { w: 2.5, zF: 4.3, zR: -4.3, yLamp: 0.85, yBumper: 0.45, lampX: 0.9, lampR: 0.18, bumperLen: 2.2 });
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  const bodyMesh = mesh(L, materials.glossy, 'bodyMesh');
  body.add(bodyMesh);
  g.add(body);
  const geo = wheelGeo({ r: 0.56, w: 0.4, hub: '#eef2f7', cap: c });
  const defs = [[1.08, 2.9], [-1.08, 2.9], [1.08, -2.7], [-1.08, -2.7]].map(([x, z]) => ({ x, y: 0.56, z, r: 0.56, geo }));
  return vehicleFinish(g, body, bodyMesh, defs, 'bus');
}

// ---------------------------------------------------------------- tractor

/** tractor({ seed, color }) — toy tractor with knobbly big rear wheels. userData: speed, bump(). */
export function tractor({ seed = 1, color } = {}) {
  const rng = new Rng(`tractor-${seed}`);
  const c = color || rng.pick([P.tomato, P.tomato, '#5cb83c']);
  const hub = P.sunflower;
  const L = [];
  L.push(part(bev(0.8, 0.35, 2.6, 0.08), DARK, { y: 0.62, z: 0.1 }));
  L.push(part(rbox(1.0, 0.9, 1.7, 0.2, 2), c, { y: 1.18, z: 0.72 }));
  L.push(part(bev(0.86, 0.66, 0.08, 0.04), DARK, { y: 1.12, z: 1.58 }));
  for (let i = 0; i < 4; i++) L.push(part(bev(0.7, 0.05, 0.1, 0.02), CHROME, { y: 0.9 + i * 0.15, z: 1.61 }));
  for (const s of [-1, 1]) L.push(part(puck(0.1, 0.08, 0.02, 10), LAMP, { x: s * 0.42, y: 1.52, z: 1.52, rx: Math.PI / 2 }));
  L.push(part(rod([0.25, 1.6, 1.0], [0.25, 2.45, 1.0], 0.07, 8), DARK));
  L.push(part(puck(0.1, 0.1, 0.03, 8), DARK, { x: 0.25, y: 2.5, z: 1.0 }));
  // cab: seat, steering, fenders, roll frame with roof
  L.push(part(bev(0.6, 0.12, 0.55, 0.05), DARK, { y: 1.35, z: -0.8 }));
  L.push(part(bev(0.56, 0.5, 0.12, 0.05), P.sunflower, { y: 1.6, z: -1.05, rx: -0.15 }));
  L.push(part(rod([0, 1.35, -0.05], [0, 1.9, -0.35], 0.035, 6), DARK));
  L.push(part(new THREE.TorusGeometry(0.2, 0.035, 5, 12), DARK, { y: 1.92, z: -0.37, rx: 1.2 }));
  for (const s of [-1, 1]) {
    const fender = new THREE.Shape();
    fender.absarc(0, 0, 1.06, 0, Math.PI, false);
    fender.absarc(0, 0, 0.96, Math.PI, 0, true);
    L.push(part(slab(fender, 0.56, 0.02, 10), c, { x: s * 0.9, y: 0.82, z: -0.75, ry: Math.PI / 2 }));
    for (const z of [-1.2, -0.3]) L.push(part(rod([s * 0.6, 1.3, z], [s * 0.6, 2.5, z], 0.045, 6), '#eef2f7'));
  }
  L.push(part(rbox(1.5, 0.12, 1.25, 0.06, 2), '#fff4e0', { y: 2.55, z: -0.75 }));
  L.push(part(bev(0.5, 0.12, 0.3, 0.04), DARK, { y: 0.55, z: -1.55 }));
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  const bodyMesh = mesh(L, materials.glossy, 'bodyMesh');
  body.add(bodyMesh);
  g.add(body);
  const big = wheelGeo({ r: 0.82, w: 0.46, hub, lugs: 12, hubR: 0.6, cap: c });
  const small = wheelGeo({ r: 0.45, w: 0.28, hub, hubR: 0.6, cap: c });
  const defs = [
    { x: 0.72, y: 0.45, z: 1.2, r: 0.45, geo: small }, { x: -0.72, y: 0.45, z: 1.2, r: 0.45, geo: small },
    { x: 0.95, y: 0.82, z: -0.75, r: 0.82, geo: big }, { x: -0.95, y: 0.82, z: -0.75, r: 0.82, geo: big },
  ];
  return vehicleFinish(g, body, bodyMesh, defs, 'tractor');
}
