// Dockside props for Barnacle Bay: dock crane, foghorn, bell buoy, lobster pot, fish box, net pile,
// snagged net, mooring bollard, rope coil, lifebuoy, anchor. Origin = quay ground (buoy: waterline).
import * as THREE from 'three';
import { part, merge, xform, rbox, tube } from '../../geo.js';
import { materials } from '../../../gfx/materials.js';
import { P } from '../../../gfx/palette.js';
import { Rng } from '../../../core/rng.js';
import {
  bev, lathe, puck, ball, blob, rod, arc, slab, latheBands, lettering, mesh, pivot, finish, paintFaces, inside,
  LiveMesh, Anims, ease, shade, boxCollider, ballCollider, collider, noise3,
} from './lib.js';
import { floatRig } from './boatlib.js';

const INK = '#2b2b3a';
const ROPE = '#e3cf9c';
const IRON = '#3d4a6b';
const BRASS = '#f0b848';
const CREAM = '#fff4e6';
const UP = new THREE.Vector3(0, 1, 0);
const lerp = THREE.MathUtils.lerp;

/** Diagonal hazard stripes painter (yellow / ink) for a part. */
function hazard(geo, a = P.sunflower, b = INK, w = 0.16) {
  return paintFaces(geo, (x, y, z, nx, ny, nz, c) => c.set(Math.floor((x + y + z) / w) % 2 ? a : b));
}

/** Toothed gear wheel in the XY plane (axis Z). */
function gearGeo(r, depth, teeth, color, hub = INK) {
  const list = [part(new THREE.CylinderGeometry(r, r, depth, 16), color, { rx: Math.PI / 2 })];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    list.push(part(new THREE.BoxGeometry(r * 0.26, r * 0.22, depth), color, { x: Math.cos(a) * (r + r * 0.08), y: Math.sin(a) * (r + r * 0.08), rz: a }));
  }
  list.push(part(new THREE.CylinderGeometry(r * 0.3, r * 0.3, depth + 0.06, 8), hub, { rx: Math.PI / 2 }));
  for (let i = 0; i < 4; i++) list.push(part(new THREE.BoxGeometry(r * 1.3, r * 0.12, depth + 0.02), shade(color, -0.15), { rz: (i * Math.PI) / 4 }));
  return merge(list);
}

// ---------------------------------------------------------------- dock crane

function latticeJib(len, w0, w1, color, brace) {
  // box-girder lattice along +Z from 0..len: 4 chords + zig-zag bracing on each face
  const list = [];
  const half = (t) => lerp(w0, w1, t) / 2;
  const corner = (t, sx, sy) => new THREE.Vector3(sx * half(t), sy * half(t), t * len);
  for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) list.push(part(rod(corner(0, sx, sy), corner(1, sx, sy), 0.075, 5, 0.06), color));
  const n = 12;
  const faces = [[[1, 1], [1, -1]], [[-1, 1], [-1, -1]], [[1, 1], [-1, 1]], [[1, -1], [-1, -1]]];
  for (const [[ax, ay], [bx, by]] of faces) {
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const A = i % 2 ? corner(t0, ax, ay) : corner(t0, bx, by);
      const B = i % 2 ? corner(t1, bx, by) : corner(t1, ax, ay);
      list.push(part(rod(A, B, 0.045, 4), brace));
    }
  }
  return merge(list);
}

/**
 * dockCrane({ seed, color, jibAngle = 0.56 rad, cable = 5.5 }) — chunky portal crane: rail bogies,
 * braced legs, slewing machinery house with cab + red counterweight, lattice jib, cable, hook block
 * and a dangling crate. Jib points +Z; tip ≈ (0, 11.6, 11.6).
 * parts: { cab (slew pivot), jib, tip (Object3D at the jib tip), hook, crate, brake (gear pivot, collider),
 * cable }. userData: jammed (crate jiggles + gear judders while true), lowerCrate({ toY = 1.2, duration })
 * -> Promise (brake gear spins, cable pays out until the crate bottom reaches toY in group space),
 * release() (leave the crate where it is, hook rises), slew(yaw) -> Promise. 3 draw calls.
 */
export function dockCrane({ seed = 1, color, jibAngle = 0.56, cable = 5.5 } = {}) {
  const rng = new Rng(`crane-${seed}`);
  const c = color || rng.pick([P.sunflower, P.sunflower, P.tangerine]);
  const B = [];
  // rails + bogies
  for (const x of [-1.9, 1.9]) {
    B.push(part(bev(0.3, 0.12, 4.4, 0.03), '#6b7280', { x, y: 0.06 }));
    for (const z of [-1.5, 1.5]) {
      B.push(part(bev(0.62, 0.45, 1.1, 0.06), INK, { x, y: 0.4, z }));
      for (const dz of [-0.3, 0.3]) B.push(part(new THREE.CylinderGeometry(0.22, 0.22, 0.66, 10), '#5a6272', { x, y: 0.26, z: z + dz, rz: Math.PI / 2 }));
    }
  }
  // portal legs + braces + deck
  const top = 3.3;
  for (const x of [-1.8, 1.8]) {
    for (const z of [-1.5, 1.5]) B.push(part(bev(0.42, top - 0.5, 0.42, 0.06), c, { x: x * 0.92, y: 0.55 + (top - 0.5) / 2, z: z * 0.92 }));
    B.push(part(rod([x * 0.92, 0.8, -1.38], [x * 0.92, top - 0.3, 1.38], 0.08, 5), shade(c, -0.12)));
    B.push(part(rod([x * 0.92, 0.8, 1.38], [x * 0.92, top - 0.3, -1.38], 0.08, 5), shade(c, -0.12)));
  }
  B.push(part(bev(3.9, 0.42, 3.4, 0.08), c, { y: top + 0.2 }));
  B.push(hazard(part(new THREE.BoxGeometry(3.94, 0.14, 3.44, 8, 1, 8), '#fff'), P.sunflower, INK, 0.3).applyMatrix4(xform({ y: top - 0.02 })));
  B.push(part(puck(1.25, 0.3, 0.05, 16), '#6b7280', { y: top + 0.55 }));
  // ladder up one leg
  for (let i = 0; i < 7; i++) B.push(part(new THREE.BoxGeometry(0.4, 0.04, 0.04), '#e4e8ee', { x: 1.9, y: 0.9 + i * 0.36, z: 1.72 }));
  const g = new THREE.Group();
  g.add(mesh(B, materials.toy, 'portal'));
  // slewing house
  const cab = pivot('cab', 0, top + 0.7, 0);
  const H = [];
  H.push(part(rbox(2.5, 1.8, 3.3, 0.18, 2), c, { y: 0.9, z: -0.3 }));
  H.push(part(bev(2.62, 0.12, 3.44, 0.04), CREAM, { y: 1.86, z: -0.3 }));
  H.push(part(bev(2.3, 1.1, 1.2, 0.08), P.tomato, { y: 0.6, z: -2.4 }));
  H.push(hazard(part(new THREE.BoxGeometry(2.32, 0.18, 1.22, 8, 1, 1), '#fff'), P.sunflower, INK, 0.22).applyMatrix4(xform({ y: 1.2, z: -2.4 })));
  H.push(part(rbox(1.25, 1.25, 1.25, 0.14, 2), CREAM, { x: 0.95, y: 1.3, z: 1.35 }));
  H.push(part(bev(1.0, 0.55, 0.06, 0.03), '#4f8fbf', { x: 0.95, y: 1.45, z: 1.99 }));
  H.push(part(bev(0.06, 0.55, 0.9, 0.03), '#4f8fbf', { x: 1.59, y: 1.45, z: 1.35 }));
  H.push(part(bev(1.35, 0.1, 1.35, 0.04), P.tomato, { x: 0.95, y: 1.97, z: 1.35 }));
  // A-frame gantry + luffing ropes
  const apex = new THREE.Vector3(0, 4.3, -1.4);
  for (const x of [-1.0, 1.0]) {
    H.push(part(rod([x, 1.9, -0.6], apex, 0.09, 6), c));
    H.push(part(rod([x, 1.9, -2.2], apex, 0.09, 6), c));
  }
  const foot = new THREE.Vector3(0, 1.0, 1.3);
  const len = 11.5;
  const dirJ = new THREE.Vector3(0, Math.sin(jibAngle), Math.cos(jibAngle));
  const tipC = foot.clone().addScaledVector(dirJ, len);
  H.push(part(rod(apex, tipC.clone().add(new THREE.Vector3(0.18, 0.2, 0)), 0.03, 4), '#d8dde6'));
  H.push(part(rod(apex, tipC.clone().add(new THREE.Vector3(-0.18, 0.2, 0)), 0.03, 4), '#d8dde6'));
  const jibG = latticeJib(len, 0.8, 0.42, c, shade(c, -0.18));
  const jq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dirJ);
  jibG.applyMatrix4(new THREE.Matrix4().compose(foot, jq, new THREE.Vector3(1, 1, 1)));
  H.push(jibG);
  H.push(part(new THREE.CylinderGeometry(0.34, 0.34, 0.3, 12), INK, { x: tipC.x, y: tipC.y, z: tipC.z, rz: Math.PI / 2 }));
  H.push(part(ball(0.12, 0), P.tomato, { x: tipC.x, y: tipC.y + 0.4, z: tipC.z }));
  cab.add(mesh(H, materials.toy, 'house'));
  const jib = pivot('jib', foot.x, foot.y, foot.z);
  jib.quaternion.copy(jq);
  cab.add(jib);
  g.add(cab);
  // moving bits: cable, hook, crate, slings, brake gear
  const live = new LiveMesh(materials.toy);
  const tip = pivot('tip', tipC.x, tipC.y - 0.3, tipC.z);
  cab.add(tip);
  const swing = pivot('swing');
  tip.add(swing);
  const cableP = pivot('cable');
  swing.add(cableP);
  live.addPiece(cableP, merge([
    part(new THREE.CylinderGeometry(0.03, 0.03, 1, 4, 1, true).translate(0, -0.5, 0), '#5a6272', { x: 0.08 }),
    part(new THREE.CylinderGeometry(0.03, 0.03, 1, 4, 1, true).translate(0, -0.5, 0), '#5a6272', { x: -0.08 }),
  ]));
  const hook = pivot('hook', 0, -cable, 0);
  swing.add(hook);
  live.addPiece(hook, merge([
    hazard(part(bev(0.42, 0.5, 0.3, 0.06), '#fff'), P.sunflower, INK, 0.14).applyMatrix4(xform({ y: -0.2 })),
    part(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 5), '#6b7280', { y: -0.58 }),
    part(arc(0.14, 0.045, Math.PI * 1.3, 5, 9), '#6b7280', { y: -0.83, rz: -Math.PI * 0.15 }),
    part(new THREE.ConeGeometry(0.05, 0.12, 5), '#6b7280', { x: 0.1, y: -0.73, rz: 0.4 }),
  ]));
  const crate = pivot('crate', 0, -1.9, 0);
  hook.add(crate);
  const cw = 1.4, ch = 1.0, cd = 1.1;
  const CR = [part(bev(cw, ch, cd, 0.05), P.woodLight, { y: -ch / 2 })];
  for (const y of [-0.04, -ch + 0.04]) {
    for (const z of [-1, 1]) CR.push(part(new THREE.BoxGeometry(cw + 0.04, 0.09, 0.09), P.wood, { y, z: z * (cd / 2 - 0.03) }));
    for (const x of [-1, 1]) CR.push(part(new THREE.BoxGeometry(0.09, 0.09, cd + 0.04), P.wood, { y, x: x * (cw / 2 - 0.03) }));
  }
  for (const s of [-1, 1]) CR.push(part(new THREE.BoxGeometry(cw * 1.1, 0.08, 0.04), P.wood, { y: -ch / 2, z: s * (cd / 2 + 0.01), rz: s * 0.6 }));
  CR.push(part(lettering(0.7, 0.14, 1, P.tomato, {}, rng, 0.02), P.tomato, { y: -ch / 2 - 0.25, z: cd / 2 + 0.02 }));
  const slingTop = new THREE.Vector3(0, 0.95, 0);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) CR.push(part(rod(slingTop, [sx * (cw / 2 - 0.1), 0, sz * (cd / 2 - 0.1)], 0.02, 3), '#9aa3b2'));
  live.addPiece(crate, merge(CR));
  crate.add(boxCollider(cw + 0.2, ch + 0.2, cd + 0.2, { y: -ch / 2 }));
  // brake gear on the house side
  const brake = pivot('brake', 1.32, 1.0, -0.6);
  brake.rotation.y = Math.PI / 2;
  cab.add(brake);
  live.addPiece(brake, gearGeo(0.62, 0.16, 14, P.tomato));
  brake.add(ballCollider(0.95, {}));
  const band = [part(arc(0.72, 0.06, Math.PI, 5, 10), '#6b7280', { rz: Math.PI * 0.6 }), part(bev(0.12, 0.7, 0.12, 0.03), INK, { x: 0.3, y: -0.9, rz: 0.4 })];
  cab.children[0].geometry = merge([cab.children[0].geometry, merge(band).applyMatrix4(xform({ x: 1.42, y: 1.0, z: -0.6, ry: Math.PI / 2 }))]);
  g.add(live);
  live.build();
  const anims = new Anims();
  g.userData.jammed = true;
  finish(g, { name: 'dockCrane', parts: { cab, jib, tip, hook, crate, brake, cable: cableP }, surface: 'metal', anims });
  let len0 = cable;
  const setLen = (L0) => { len0 = L0; cableP.scale.set(1, Math.max(0.01, L0), 1); hook.position.y = -L0; };
  setLen(cable);
  g.userData.addTick((dt, t) => {
    if (g.userData.jammed) {
      swing.rotation.x = Math.sin(t * 1.3 + seed) * 0.07 + Math.sin(t * 7.7) * 0.012;
      swing.rotation.z = Math.sin(t * 0.9) * 0.05;
      brake.rotation.z = Math.sin(t * 23) * 0.03;
    } else {
      swing.rotation.x *= Math.exp(-dt * 1.5);
      swing.rotation.z *= Math.exp(-dt * 1.5);
    }
    live.sync(t);
  });
  g.userData.lowerCrate = ({ toY = 1.2, duration } = {}) => {
    g.userData.jammed = false;
    g.updateMatrixWorld(true);
    const tipY = new THREE.Vector3();
    tip.getWorldPosition(tipY);
    g.worldToLocal(tipY);
    const hookToBottom = 1.9 + ch;
    const target = Math.max(0.5, tipY.y - hookToBottom - toY);
    const from = len0;
    const d = duration ?? 1.2 + Math.abs(target - from) * 0.35;
    const g0 = brake.rotation.z;
    return anims.play(d, (k) => {
      setLen(lerp(from, target, k));
      brake.rotation.z = g0 - (target - from) * 1.6 * k;
    }, { ease: ease.inOutSine, key: 'lower' });
  };
  g.userData.release = () => {
    cab.attach(crate);
    crate.userData.released = true;
    const from = len0;
    return anims.play(1.6, (k) => setLen(lerp(from, Math.max(2, from - 4), k)), { ease: ease.inOutSine, key: 'lower' });
  };
  g.userData.slew = (yaw) => {
    const from = cab.rotation.y;
    return anims.play(1.5 + Math.abs(yaw - from), (k) => { cab.rotation.y = lerp(from, yaw, k); }, { ease: ease.inOutSine, key: 'slew' });
  };
  return g;
}

// ---------------------------------------------------------------- foghorn

/**
 * foghorn({ seed, color }) — big brass horn on a riveted compressor box, pull cord with a T handle.
 * Horn points +Z. parts: { horn (pivot), cord (pivot at the lever, collider), mouth (Object3D at the
 * bell) }. userData: blast(duration = 1.6) -> Promise (cord yanks, horn shudders, sound rings
 * burst from the mouth; onBlast(worldPos) fires). 2 draw calls.
 */
export function foghorn({ seed = 1, color } = {}) {
  const rng = new Rng(`foghorn-${seed}`);
  const c = color || rng.pick([P.tomato, '#34466e', P.teal]);
  const S = [
    part(bev(1.0, 0.75, 0.7, 0.08), c, { y: 0.45 }),
    part(bev(1.1, 0.1, 0.8, 0.03), shade(c, -0.25), { y: 0.05 }),
    part(bev(1.06, 0.08, 0.76, 0.03), shade(c, 0.15), { y: 0.84 }),
    part(rod([0, 0.85, -0.1], [0, 1.72, -0.1], 0.09, 8), BRASS),
    part(puck(0.16, 0.08, 0.02, 10), BRASS, { y: 1.74, z: -0.1 }),
  ];
  for (let i = 0; i < 8; i++) S.push(part(ball(0.025, 0), shade(c, -0.3), { x: -0.42 + (i % 4) * 0.28, y: i < 4 ? 0.74 : 0.16, z: 0.36 }));
  S.push(part(bev(0.34, 0.2, 0.03, 0.01), '#fff8ee', { y: 0.45, z: 0.36 }));
  S.push(part(lettering(0.26, 0.08, 1, INK, {}, rng, 0.012), INK, { y: 0.45, z: 0.38 }));
  S.push(part(bev(0.3, 0.06, 0.06, 0.02), '#6b7280', { x: 0.2, y: 1.52, z: -0.1 }));
  const g = new THREE.Group();
  g.add(mesh(S, materials.toy, 'box'));
  const live = new LiveMesh(materials.glossy);
  const horn = pivot('horn', 0, 1.78, -0.1);
  live.addPiece(horn, latheBands([[0.08, 0], [0.09, 0.3], [0.13, 0.55], [0.22, 0.75], [0.4, 0.9], [0.46, 0.96], [0.44, 0.99], [0.36, 0.97], [0.12, 0.6], [0.06, 0.3]], 14,
    (y, i) => (i === 5 || i === 6 ? P.tomato : BRASS), { rx: Math.PI / 2, z: -0.2 }));
  const mouth = pivot('mouth', 0, 0, 0.8);
  horn.add(mouth);
  const cord = pivot('cord', 0.35, 1.52, -0.1);
  live.addPiece(cord, merge([
    part(new THREE.CylinderGeometry(0.018, 0.018, 0.62, 4).translate(0, -0.31, 0), ROPE),
    part(new THREE.CapsuleGeometry(0.04, 0.2, 2, 6), P.woodLight, { y: -0.66, rz: Math.PI / 2 }),
  ]));
  cord.add(boxCollider(0.45, 0.95, 0.4, { y: -0.4 }));
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const r = pivot(`ring${i}`, 0, 0, 0.9);
    r.visible = false;
    horn.add(r);
    live.addPiece(r, part(new THREE.TorusGeometry(0.5, 0.05, 5, 16), '#fff8ee'));
    rings.push(r);
  }
  g.add(horn, cord, live);
  live.build();
  const anims = new Anims();
  finish(g, { name: 'foghorn', parts: { horn, cord, mouth }, surface: 'metal', anims });
  g.userData.addTick((dt, t) => live.sync(t));
  g.userData.blast = (duration = 1.6) => {
    anims.play(0.45, (k) => { cord.position.y = 1.52 - Math.sin(k * Math.PI) * 0.25; }, { key: 'cord' });
    rings.forEach((r, i) => {
      anims.play(1.0, (k) => {
        r.visible = k > 0 && k < 1;
        const s = 0.6 + k * 2.4;
        r.scale.setScalar(s);
        r.position.z = 0.9 + k * 2.2;
      }, { delay: 0.12 + i * 0.35, key: `ring${i}` }).then(() => { r.visible = false; });
    });
    g.userData.onBlast?.(mouth.getWorldPosition(new THREE.Vector3()));
    return anims.play(duration, (k) => {
      const s = 1 + Math.sin(k * Math.PI * 22) * 0.05 * Math.sin(k * Math.PI);
      horn.scale.set(s, s, 1 + (s - 1) * 2);
    }, { delay: 0.1, key: 'horn' });
  };
  return g;
}

// ---------------------------------------------------------------- bell buoy

/**
 * bellBuoy({ seed, color, bob = 1 }) — floating bell buoy (waterline y 0): striped float, braced cage,
 * swinging bell with clapper, lamp on top. Bobs and rolls a lot (a moving target).
 * parts: { float, bell (pivot, collider r 0.6) }. userData: ring() -> Promise (big swing + clapper
 * hits; onRing(worldPos) fires), bob. 2 draw calls.
 */
export function bellBuoy({ seed = 1, color, bob = 1 } = {}) {
  const rng = new Rng(`buoy-${seed}`);
  const c = color || rng.pick([P.tomato, '#3fa34d', P.sunflower]);
  const S = [
    latheBands([[0, -0.55], [0.5, -0.5], [0.72, -0.22], [0.76, 0.0], [0.76, 0.14], [0.7, 0.3], [0.55, 0.4], [0, 0.42]], 14,
      (y, i) => (y < 0 ? shade(c, -0.35) : i === 4 ? '#fff8ee' : c)),
  ];
  const legTop = 2.05;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    S.push(part(rod([Math.cos(a) * 0.5, 0.38, Math.sin(a) * 0.5], [Math.cos(a) * 0.14, legTop, Math.sin(a) * 0.14], 0.05, 5), c));
  }
  S.push(part(new THREE.TorusGeometry(0.36, 0.04, 4, 12), c, { y: 1.0, rx: Math.PI / 2 }));
  S.push(part(bev(0.5, 0.06, 0.06, 0.02), c, { y: 1.72 }));
  S.push(part(puck(0.2, 0.1, 0.03, 8), c, { y: legTop + 0.02 }));
  S.push(part(new THREE.CylinderGeometry(0.12, 0.12, 0.2, 8), '#fff3b0', { y: legTop + 0.17 }));
  S.push(part(new THREE.ConeGeometry(0.15, 0.14, 8), c, { y: legTop + 0.34 }));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    S.push(part(ball(0.06, 0), shade(c, -0.2), { x: Math.cos(a) * 0.4, y: 1.25, z: Math.sin(a) * 0.4 }));
  }
  const g = new THREE.Group();
  g.add(mesh(S, materials.glossy, 'buoy'));
  const bell = pivot('bell', 0, 1.7, 0);
  bell.add(mesh([
    latheBands([[0.26, -0.5], [0.27, -0.46], [0.22, -0.34], [0.2, -0.16], [0.14, -0.04], [0, 0]], 12, () => BRASS),
    part(rod([0, -0.02, 0], [0, 0.02, 0], 0.03, 5), '#6b7280'),
    part(rod([0, -0.1, 0], [0, -0.44, 0], 0.015, 4), '#6b7280'),
    part(ball(0.06, 0), '#6b7280', { y: -0.46 }),
  ], materials.glossy, 'bellMesh'));
  bell.add(ballCollider(0.6, { y: -0.25 }));
  g.add(bell);
  const anims = new Anims();
  finish(g, { name: 'bellBuoy', parts: { bell }, surface: 'metal', anims });
  const node = floatRig(g, { bob, seed, heave: 0.12, roll: 0.14, pitch: 0.09, speed: 1.25 });
  g.userData.parts.float = node;
  let hit = 0;
  g.userData.addTick((dt, t) => {
    hit = Math.max(0, hit - dt * 0.45);
    const lag = -node.rotation.z * 0.8;
    bell.rotation.z = lag + Math.sin(t * 9) * 0.55 * hit;
    bell.rotation.x = -node.rotation.x * 0.8 + Math.cos(t * 7) * 0.2 * hit;
  });
  g.userData.ring = () => {
    hit = 1;
    g.userData.onRing?.(bell.getWorldPosition(new THREE.Vector3()));
    return anims.play(2.2, () => {}, { key: 'ring' });
  };
  return g;
}

// ---------------------------------------------------------------- lobster pot

/**
 * lobsterPot({ seed }) — D-shaped creel: wooden base, hoops, netting, entrance ring, rope + float.
 * parts: { inside (Object3D inside the pot: stash a golden spanner or a crab there) }. 1 draw call.
 */
export function lobsterPot({ seed = 1 } = {}) {
  const rng = new Rng(`lpot-${seed}`);
  const L = [part(bev(0.95, 0.07, 0.62, 0.02), P.wood, { y: 0.035 })];
  for (const x of [-0.42, 0, 0.42]) L.push(part(arc(0.3, 0.025, Math.PI, 4, 10), P.woodLight, { x, y: 0.06, ry: Math.PI / 2 }));
  for (const a of [0.5, 1.57, 2.64]) L.push(part(new THREE.BoxGeometry(0.9, 0.03, 0.03), P.woodLight, { y: 0.06 + Math.sin(a) * 0.3, z: Math.cos(a) * 0.3 }));
  const net = part(new THREE.CylinderGeometry(0.295, 0.295, 0.86, 10, 3, true, 0, Math.PI), '#fff', { y: 0.06, rz: Math.PI / 2 });
  paintFaces(net, (x, y, z, nx, ny, nz, cc) => cc.set((Math.floor(x * 11) + Math.floor(Math.atan2(y, z) * 3)) % 2 ? '#3d7a6e' : '#8fc2b4'));
  L.push(net, inside(net.clone()));
  L.push(part(new THREE.TorusGeometry(0.12, 0.03, 4, 10), P.tangerine, { x: 0.44, y: 0.2, ry: Math.PI / 2 }));
  L.push(part(tube([new THREE.Vector3(-0.44, 0.3, 0), new THREE.Vector3(-0.8, 0.1, 0.15), new THREE.Vector3(-1.05, 0.05, 0.5)], 0.02, 8, 3), ROPE));
  L.push(part(ball(0.12, 1), rng.pick([P.tangerine, P.tomato, P.sunflower]), { x: -1.1, y: 0.12, z: 0.56 }));
  const g = new THREE.Group();
  g.add(mesh(L, materials.toy, 'pot'));
  const insideP = pivot('inside', 0, 0.15, 0);
  g.add(insideP);
  return finish(g, { name: 'lobsterPot', parts: { inside: insideP }, surface: 'wood' });
}

// ---------------------------------------------------------------- fish box

/**
 * fishBox({ seed, propped = true }) — wooden box heaped with fish on ice. Lid hinged at the back,
 * propped open by a stick (the pelican's buffet). parts: { lid (pivot), stick (pivot, collider) }.
 * userData: slamLid() -> Promise (stick kicks out, lid slams with a bounce), propped. 2 draw calls.
 */
export function fishBox({ seed = 1, propped = true } = {}) {
  const rng = new Rng(`fishbox-${seed}`);
  const w = 0.95, h = 0.4, d = 0.62;
  const L = [];
  for (const [ww, dd, x, z] of [[w, 0.06, 0, d / 2 - 0.03], [w, 0.06, 0, -d / 2 + 0.03], [0.06, d, w / 2 - 0.03, 0], [0.06, d, -w / 2 + 0.03, 0]]) {
    L.push(part(bev(ww, h, dd, 0.02), P.woodLight, { x, y: h / 2, z }));
  }
  L.push(part(bev(w, 0.05, d, 0.02), P.wood, { y: 0.025 }));
  L.push(part(blob(0.4, 1, 0.08, seed), '#e9fbff', { y: h - 0.08, sx: 1.1, sy: 0.25, sz: 0.7 }));
  for (let i = 0; i < 7; i++) {
    const x = -0.32 + (i % 4) * 0.21 + (i > 3 ? 0.1 : 0), z = i > 3 ? 0.1 : -0.1;
    const col = rng.pick(['#9fb8d0', '#b8c8dc', '#ff9a8a']);
    L.push(part(ball(0.08, 0), col, { x, y: h + 0.02, z, sx: 1.9, sy: 0.65, ry: rng.range(-0.4, 0.4) }));
    L.push(part(new THREE.ConeGeometry(0.06, 0.09, 3), shade(col, -0.15), { x: x - 0.16, y: h + 0.02, z, rz: -Math.PI / 2, sz: 0.35 }));
  }
  L.push(part(lettering(0.6, 0.12, 1, P.cobalt, {}, rng, 0.012), P.cobalt, { y: h / 2, z: d / 2 + 0.005 }));
  const g = new THREE.Group();
  g.add(mesh(L, materials.toy, 'box'));
  const live = new LiveMesh(materials.toy);
  const lid = pivot('lid', 0, h, -d / 2);
  live.addPiece(lid, merge([
    part(bev(w + 0.04, 0.05, d + 0.04, 0.02), P.wood, { y: 0.025, z: d / 2 }),
    part(bev(0.2, 0.04, 0.05, 0.015), '#6b7280', { y: 0.06, z: d - 0.02 }),
  ]));
  const openA = -1.05;
  const stick = pivot('stick', 0.12, h, d / 2 - 0.06);
  // stick length to reach the propped lid's front underside
  const tipLocal = new THREE.Vector3(0, 0, d).applyAxisAngle(new THREE.Vector3(1, 0, 0), openA).add(new THREE.Vector3(0.12, h, -d / 2));
  const sdir = tipLocal.clone().sub(stick.position);
  const slen = sdir.length() - 0.02;
  stick.quaternion.setFromUnitVectors(UP, sdir.normalize());
  live.addPiece(stick, part(new THREE.CylinderGeometry(0.022, 0.026, slen, 5).translate(0, slen / 2, 0), P.woodDark));
  stick.add(collider(new THREE.CylinderGeometry(0.16, 0.16, slen, 6).translate(0, slen / 2, 0)));
  g.add(lid, stick, live);
  const anims = new Anims();
  finish(g, { name: 'fishBox', parts: { lid, stick }, surface: 'wood', anims });
  const stickHome = { p: stick.position.clone(), q: stick.quaternion.clone() };
  const lieDown = () => {
    stick.position.set(0.1, 0.03, d / 2 + 0.35);
    stick.quaternion.setFromEuler(new THREE.Euler(0, 0.4, Math.PI / 2));
  };
  if (propped) lid.rotation.x = openA; else lieDown();
  g.userData.propped = !!propped;
  live.build();
  g.userData.addTick((dt, t) => live.sync(t));
  g.userData.slamLid = () => {
    if (!g.userData.propped) return Promise.resolve(false);
    g.userData.propped = false;
    const p0 = stick.position.clone(), q0 = stick.quaternion.clone();
    const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.4, Math.PI / 2));
    const p1 = new THREE.Vector3(0.1, 0.03, d / 2 + 0.35);
    anims.play(0.6, (k) => {
      stick.position.lerpVectors(p0, p1, k);
      stick.position.y += Math.sin(k * Math.PI) * 0.35;
      stick.quaternion.slerpQuaternions(q0, q1, k);
    }, { key: 'stick' });
    const a0 = lid.rotation.x;
    return anims.play(0.55, (k) => { lid.rotation.x = lerp(a0, 0, k); }, { ease: ease.outBounce, delay: 0.08, key: 'lid' });
  };
  g.userData.prop = () => {
    g.userData.propped = true;
    stick.position.copy(stickHome.p);
    stick.quaternion.copy(stickHome.q);
    lid.rotation.x = openA;
  };
  return g;
}

// ---------------------------------------------------------------- nets, bollards, rope, lifebuoy, anchor

function netPaint(geo, a = '#3d7a6e', b = '#6fae9c', k = 7) {
  return paintFaces(geo, (x, y, z, nx, ny, nz, c) => c.set((Math.floor((x + z) * k) + Math.floor((x - z) * k)) % 2 ? a : b));
}

/** netPile({ seed }) — heap of fishing net with floats and a trailing rope. 1 draw call. */
export function netPile({ seed = 1 } = {}) {
  const rng = new Rng(`netpile-${seed}`);
  const L = [netPaint(part(blob(0.7, 1, 0.14, seed), '#fff', { y: 0.2, sx: 1.25, sy: 0.42, sz: 0.95 }))];
  L.push(netPaint(part(blob(0.4, 1, 0.16, seed + 3), '#fff', { x: 0.55, y: 0.14, z: 0.35, sy: 0.4 }), '#2f6e62', '#5fa08e'));
  for (let i = 0; i < 9; i++) {
    const a = i * 1.7 + rng.range(-0.3, 0.3), r = rng.range(0.3, 0.75);
    L.push(part(ball(0.085, 0), i % 3 ? P.tangerine : '#fff8ee', { x: Math.cos(a) * r, y: 0.3 + rng.range(-0.05, 0.08), z: Math.sin(a) * r * 0.75 }));
  }
  L.push(part(tube([new THREE.Vector3(-0.6, 0.15, 0.2), new THREE.Vector3(-1.0, 0.04, 0.5), new THREE.Vector3(-1.2, 0.04, 1.0), new THREE.Vector3(-0.9, 0.04, 1.3)], 0.03, 10, 4), ROPE));
  const g = new THREE.Group();
  g.add(mesh(L, materials.toy, 'nets'));
  return finish(g, { name: 'netPile', parts: {}, surface: 'soft' });
}

function mooringGeo(color = IRON, rope = false) {
  const list = [
    part(bev(0.74, 0.06, 0.74, 0.02), shade(color, 0.1), { y: 0.03 }),
    latheBands([[0, 0.05], [0.3, 0.05], [0.3, 0.1], [0.22, 0.14], [0.19, 0.42], [0.24, 0.5], [0.31, 0.58], [0.29, 0.65], [0.2, 0.69], [0, 0.7]], 12,
      (y, i) => (i >= 5 ? shade(color, 0.18) : color)),
  ];
  for (const [x, z] of [[0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]]) list.push(part(ball(0.035, 0), shade(color, -0.2), { x, y: 0.07, z }));
  if (rope) {
    list.push(part(new THREE.TorusGeometry(0.21, 0.045, 5, 12), ROPE, { y: 0.4, rx: Math.PI / 2 + 0.15 }));
    list.push(part(tube([new THREE.Vector3(0.18, 0.38, 0.1), new THREE.Vector3(0.7, 0.1, 0.6), new THREE.Vector3(1.4, 0.05, 1.3)], 0.045, 10, 4), ROPE));
  }
  return merge(list);
}

/** mooringBollard({ seed, color, rope = false }) — cast-iron mooring bollard (also `bollard({ style: 'mooring' })`). */
export function mooringBollard({ seed = 1, color = IRON, rope = false } = {}) {
  const g = new THREE.Group();
  g.add(mesh([mooringGeo(color, rope)], materials.glossy, 'bollard'));
  return finish(g, { name: 'mooringBollard', parts: {}, surface: 'metal' });
}

/**
 * snaggedNet({ seed }) — a fishing net snagged on an iron bollard, draped over the quay edge (+Z).
 * parts: { knot (pivot, collider r 0.45), net (pivot), bollard }. userData: free({ to }) -> Promise
 * (knot unties, net slides off and flops toward `to`, default (0, -1.3, 2.6) = into a boat below), freed.
 */
export function snaggedNet({ seed = 1 } = {}) {
  const rng = new Rng(`snag-${seed}`);
  const g = new THREE.Group();
  const bollardMesh = mesh([mooringGeo(IRON)], materials.glossy, 'bollard');
  g.add(bollardMesh);
  const live = new LiveMesh(materials.toy);
  const net = pivot('net', 0, 0.55, 0.05);
  const cols = 6, rows = 8, W = 1.5, Ln = 2.6;
  const pos = [], colA = [];
  const ca = new THREE.Color('#3d7a6e'), cb = new THREE.Color('#7fb8a6');
  const at = (k, r) => {
    const u = k / cols - 0.5, v = r / rows;
    const x = u * W * (0.55 + v * 0.6);
    const z = v * Ln;
    const y = -(Math.max(0, v - 0.35) ** 1.6) * 2.2 - v * 0.2;
    return [x, y, z];
  };
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const a = at(k, r), b = at(k + 1, r), c2 = at(k, r + 1), d2 = at(k + 1, r + 1);
      const col = (k + r) % 2 ? ca : cb;
      for (const [p1, p2, p3] of [[a, c2, b], [b, c2, d2]]) {
        for (const side of [1, -1]) {
          const seq = side > 0 ? [p1, p2, p3] : [p1, p3, p2];
          for (const p of seq) { pos.push(p[0], p[1] + side * 0.008, p[2]); colA.push(col.r, col.g, col.b); }
        }
      }
    }
  }
  const ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  ng.setAttribute('color', new THREE.Float32BufferAttribute(colA, 3));
  ng.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  const floats = [];
  for (let i = 0; i <= cols; i += 2) {
    const [x, y, z] = at(i, rows);
    floats.push(part(ball(0.08, 0), P.tangerine, { x, y, z }));
  }
  live.addPiece(net, merge([ng, ...floats]), (v, t) => {
    const d = Math.max(0, v.z / Ln);
    v.x += Math.sin(t * 1.6 + v.z * 1.3) * 0.05 * d;
    v.y += Math.sin(t * 2.1 + v.x * 3) * 0.03 * d;
  });
  const knot = pivot('knot', 0, 0.47, 0.12);
  live.addPiece(knot, merge([
    part(new THREE.TorusGeometry(0.23, 0.07, 5, 12), ROPE, { rx: Math.PI / 2 + 0.2 }),
    part(blob(0.12, 1, 0.2, seed), ROPE, { y: 0.02, z: 0.2 }),
    part(new THREE.TorusGeometry(0.08, 0.035, 4, 8), ROPE, { y: 0.05, z: 0.27, ry: 0.6 }),
  ]));
  knot.add(ballCollider(0.45, { z: 0.12 }));
  g.add(net, knot, live);
  live.build();
  const anims = new Anims();
  finish(g, { name: 'snaggedNet', parts: { knot, net, bollard: bollardMesh }, surface: 'soft', anims });
  g.userData.addTick((dt, t) => {
    if (!g.userData.freed) net.rotation.x = Math.sin(t * 2.4 + seed) * 0.03 + Math.sin(t * 13) * 0.008;
    live.sync(t);
  });
  g.userData.free = ({ to = new THREE.Vector3(0, -1.3, 2.6) } = {}) => {
    if (g.userData.freed) return Promise.resolve(false);
    g.userData.freed = true;
    anims.play(0.35, (k) => knot.scale.setScalar(Math.max(0.001, 1 - k)), { key: 'knot' }).then(() => { knot.visible = false; });
    const p0 = net.position.clone();
    const target = to.isVector3 ? to : new THREE.Vector3(...to);
    return anims.play(1.3, (k) => {
      net.position.lerpVectors(p0, target, ease.inQuad(k));
      net.position.y += Math.sin(k * Math.PI) * 0.5;
      net.rotation.x = -0.5 * k;
      net.scale.set(1, 1 - 0.5 * k, 1 - 0.35 * k);
    }, { key: 'net' });
  };
  return g;
}

/** ropeCoil({ seed, color }) — flat coil of thick rope with a loose end. 1 draw call. */
export function ropeCoil({ seed = 1, color = ROPE } = {}) {
  const rng = new Rng(`coil-${seed}`);
  const pts = [];
  const turns = 3.4;
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * turns * Math.PI * 2;
    const r = 0.14 + (i / 64) * 0.32;
    pts.push(new THREE.Vector3(Math.cos(a) * r, 0.05 + Math.sin(i * 0.7) * 0.004 + (i < 10 ? 0.04 : 0), Math.sin(a) * r));
  }
  const end = pts[pts.length - 1];
  pts.push(end.clone().add(new THREE.Vector3(0.25, -0.01, 0.2)), end.clone().add(new THREE.Vector3(0.55, -0.01, 0.5)));
  const g = new THREE.Group();
  const geo = part(tube(pts, 0.05, 90, 5), color);
  paintFaces(geo, (x, y, z, nx, ny, nz, c) => { c.set(color); c.multiplyScalar(0.88 + noise3(Math.round(x * 30), Math.round(z * 30), seed) * 0.16); });
  g.add(mesh([geo, part(new THREE.TorusGeometry(0.1, 0.05, 5, 10), shade(color, -0.1), { y: 0.1, rx: Math.PI / 2 })], materials.toy, 'coil'));
  return finish(g, { name: 'ropeCoil', parts: {}, surface: 'soft' });
}

/**
 * lifebuoy({ seed, mount: 'post'|'wall'|'none' }) — red/white ring buoy with grab line on a post,
 * a wall board (back at z 0) or lying flat. parts: { ring (pivot + collider) }. 1-2 draw calls.
 */
export function lifebuoy({ seed = 1, mount = 'post' } = {}) {
  const S = [];
  let ry = 1.25, rz = 0.1;
  if (mount === 'post') {
    S.push(part(bev(0.13, 1.7, 0.13, 0.03), P.woodLight, { y: 0.85, z: -0.1 }));
    S.push(part(bev(0.9, 0.12, 0.26, 0.03), P.tomato, { y: 1.72, z: -0.02 }));
    S.push(part(bev(0.3, 0.12, 0.2, 0.04), P.woodDark, { y: 0.06, z: -0.1 }));
  } else if (mount === 'wall') {
    S.push(part(bev(0.9, 1.0, 0.06, 0.03), '#fff8ee', { y: 1.25, z: 0.03 }));
    S.push(part(lettering(0.6, 0.1, 1, P.tomato, {}, null, 0.012), P.tomato, { y: 1.66, z: 0.065 }));
    rz = 0.2;
  } else {
    ry = 0.1;
  }
  const ring = pivot('ring', 0, ry, rz);
  if (mount === 'none') ring.rotation.x = -Math.PI / 2;
  const R = [
    part(new THREE.TorusGeometry(0.36, 0.1, 6, 16), '#fff'),
    part(new THREE.TorusGeometry(0.47, 0.018, 3, 16), ROPE),
  ];
  paintFaces(R[0], (x, y, z, nx, ny, nz, c) => { const a = Math.atan2(y, x) + Math.PI; c.set(Math.floor(a / (Math.PI / 4)) % 2 ? '#fff8ee' : P.tomato); });
  if (mount !== 'none') R.push(part(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 5), '#6b7280', { y: 0.42, z: -0.06, rx: Math.PI / 2 }));
  ring.add(mesh(R, materials.glossy, 'ringMesh'));
  ring.add(ballCollider(0.55, {}));
  const g = new THREE.Group();
  if (S.length) g.add(mesh(S, materials.toy, 'mount'));
  g.add(ring);
  return finish(g, { name: 'lifebuoy', parts: { ring }, surface: 'soft', bodyForWobble: ring });
}

/** anchorProp({ seed, color }) — big display anchor on its crown with a draped chain. 1 draw call. */
export function anchorProp({ seed = 1, color = '#34466e' } = {}) {
  const L = [
    part(bev(0.16, 1.6, 0.16, 0.05), color, { y: 1.0 }),
    part(rod([-0.55, 1.55, 0], [0.55, 1.55, 0], 0.07, 6), P.woodDark),
    part(ball(0.1, 0), P.woodDark, { x: -0.6, y: 1.55 }), part(ball(0.1, 0), P.woodDark, { x: 0.6, y: 1.55 }),
    part(new THREE.TorusGeometry(0.16, 0.05, 5, 12), color, { y: 1.95 }),
    part(arc(0.62, 0.08, Math.PI, 6, 12), color, { y: 0.78, rz: Math.PI }),
    part(ball(0.12, 0), color, { y: 0.16 }),
  ];
  for (const s of [-1, 1]) L.push(part(new THREE.ConeGeometry(0.2, 0.36, 3), color, { x: s * 0.62, y: 0.86, rz: s * 0.5, sz: 0.35 }));
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    L.push(part(new THREE.TorusGeometry(0.075, 0.025, 4, 8), '#6b7280', {
      x: 0.12 + t * 0.95, y: 1.9 * (1 - t) ** 2 + 0.05, z: 0.15 + t * 0.4, ry: i % 2 ? Math.PI / 2 : 0, rz: -0.8 * (1 - t),
    }));
  }
  const g = new THREE.Group();
  const m = mesh(L, materials.glossy, 'anchor');
  m.rotation.z = 0.06;
  g.add(m);
  return finish(g, { name: 'anchorProp', parts: {}, surface: 'metal' });
}
