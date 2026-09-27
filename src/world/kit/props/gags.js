// Gag & job props: gnome, giant marrow, alarm clock, camera on tripod, birdseed bag, teapot,
// firework rocket, trophy and the Golden Spanner collectible.
import * as THREE from 'three';
import { part, merge, xform, tube } from '../../geo.js';
import { materials } from '../../../gfx/materials.js';
import { P } from '../../../gfx/palette.js';
import { Rng } from '../../../core/rng.js';
import {
  bev, lathe, puck, ball, blob, rod, arc, slab, latheBands, lettering, mesh, pivot, finish, paint, paintFaces,
  Anims, ease, shade, boxCollider, ballCollider, goldMaterial, noise3,
} from './lib.js';

const INK = '#2b2b3a';
const SKIN = '#ffd9bd';
const lerp = THREE.MathUtils.lerp;

// ---------------------------------------------------------------- gnome

/**
 * gnome({ seed, pose: 'stand'|'fishing'|'toadstool'|'wave', hat, coat })
 * Glazed ceramic garden gnome (~0.8 m). parts: { hat (pivot), body }. userData: bonk() -> Promise.
 */
export function gnome({ seed = 1, pose = 'stand', hat, coat } = {}) {
  const rng = new Rng(`gnome-${seed}`);
  const hatC = hat || rng.pick([P.tomato, P.tomato, '#e8402a', P.violet]);
  const coatC = coat || rng.pick([P.cobalt, '#3fa34d', P.teal, P.tangerine]);
  const L = [];
  let y0 = 0;
  if (pose === 'toadstool') {
    L.push(latheBands([[0, 0], [0.13, 0], [0.11, 0.1], [0.1, 0.34], [0, 0.36]], 10, () => '#fff4e6'));
    const cap = part(lathe([[0, 0.3], [0.34, 0.31], [0.36, 0.36], [0.3, 0.45], [0.16, 0.51], [0, 0.53]], 14), '#e8303a');
    L.push(cap);
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9 + 0.3, r = i % 2 ? 0.26 : 0.17;
      L.push(part(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 6), '#fff8ee', { x: Math.cos(a) * r, y: 0.455 + (0.3 - r) * 0.3, z: Math.sin(a) * r, rx: Math.sin(a) * 0.5, rz: -Math.cos(a) * 0.5 }));
    }
    y0 = 0.5;
  }
  const B = (geo, col, t) => L.push(part(geo, col, { ...t, y: (t?.y || 0) + y0 }));
  for (const s of [-1, 1]) B(ball(0.085, 0), '#6b3a22', { x: s * 0.08, y: 0.05, z: 0.04, sy: 0.62, sz: 1.35 });
  L.push(latheBands([[0, 0.05], [0.19, 0.05], [0.215, 0.11], [0.21, 0.235], [0.224, 0.24], [0.224, 0.29], [0.205, 0.295], [0.2, 0.3], [0.15, 0.42], [0, 0.45]], 12,
    (y) => (y > 0.238 && y < 0.292 ? '#6b3a22' : coatC), { y: y0 }));
  B(bev(0.075, 0.065, 0.03, 0.01), P.gold, { y: 0.265, z: 0.225 });
  const armL = pose === 'wave' ? [[-0.16, 0.36, 0], [-0.3, 0.56, 0.02]] : [[-0.16, 0.36, 0], [-0.2, 0.2, 0.1]];
  const armR = pose === 'fishing' ? [[0.16, 0.36, 0], [0.17, 0.28, 0.2]] : [[0.16, 0.36, 0], [0.2, 0.2, 0.1]];
  for (const [a, b] of [armL, armR]) {
    B(rod(a, b, 0.05, 8), coatC);
    B(ball(0.058, 0), SKIN, { x: b[0], y: b[1], z: b[2] });
  }
  B(ball(0.135, 1), SKIN, { y: 0.54 });
  B(ball(0.05, 1), '#ff9a8a', { y: 0.53, z: 0.13 });
  for (const s of [-1, 1]) {
    B(ball(0.02, 0), INK, { x: s * 0.05, y: 0.58, z: 0.115 });
    B(ball(0.03, 0), '#ffb3b3', { x: s * 0.09, y: 0.55, z: 0.1, sz: 0.5 });
  }
  const beard = part(lathe([[0, 0.24], [0.06, 0.27], [0.13, 0.37], [0.14, 0.48], [0.1, 0.52], [0, 0.52]], 10), '#f6f2ea', { y: y0, z: 0.055, sz: 0.75 });
  L.push(beard);
  if (pose === 'fishing') {
    B(rod([0.17, 0.28, 0.22], [0.35, 0.95, 0.75], 0.015, 4), P.woodDark);
    B(rod([0.35, 0.95, 0.75], [0.36, 0.25, 0.8], 0.006, 3), '#f4f0e6');
    B(ball(0.045, 0), P.tomato, { x: 0.36, y: 0.24, z: 0.8 });
  }
  const g = new THREE.Group();
  const body = mesh(L, materials.glossy, 'body');
  g.add(body);
  const hatPivot = pivot('hat', 0, 0.62 + y0, -0.01);
  const hg = new THREE.ConeGeometry(0.16, 0.44, 12, 3);
  const pos = hg.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = (pos.getY(i) + 0.22) / 0.44;
    pos.setZ(i, pos.getZ(i) - k * k * 0.1);
  }
  hg.computeVertexNormals();
  hatPivot.add(mesh([part(hg, hatC, { y: 0.2, rx: -0.12 }), part(new THREE.TorusGeometry(0.15, 0.032, 4, 12), shade(hatC, -0.15), { y: 0.0, rx: Math.PI / 2 })], materials.glossy, 'hatMesh'));
  hatPivot.add(ballCollider(0.22, { y: 0.18 }));
  g.add(hatPivot);
  g.add(boxCollider(0.5, 0.8, 0.45, { y: 0.4 + y0 }));
  const anims = new Anims();
  finish(g, { name: 'gnome', parts: { hat: hatPivot, body }, surface: 'stone', anims });
  const hatY = hatPivot.position.y;
  g.userData.bonk = () => {
    g.userData.wobble(1.2);
    return anims.play(1.0, (k) => {
      const up = Math.sin(Math.min(1, k * 1.25) * Math.PI);
      hatPivot.position.y = hatY + up * 0.55;
      hatPivot.rotation.y = k * Math.PI * 4;
      hatPivot.rotation.z = Math.sin(k * 20) * (1 - k) * 0.3;
    }, { key: 'hat' });
  };
  return g;
}

// ---------------------------------------------------------------- giant marrow

/** giantMarrow({ seed }) — prize-winning 1.7 m marrow on straw with a 1st-prize rosette. parts: { marrow, straw }. */
export function giantMarrow({ seed = 1 } = {}) {
  const rng = new Rng(`marrow-${seed}`);
  const straw = part(new THREE.CylinderGeometry(1.0, 1.15, 0.16, 12, 1), '#f2cd5c', { y: 0.08, sz: 0.62 });
  const sp = straw.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const n = noise3(Math.round(sp.getX(i) * 20), Math.round(sp.getY(i) * 20), Math.round(sp.getZ(i) * 20) + seed);
    if (sp.getY(i) > 0.1) sp.setY(i, sp.getY(i) + (n - 0.5) * 0.08);
  }
  straw.computeVertexNormals();
  paintFaces(straw, (x, y, z, nx, ny, nz, c) => c.set(noise3(x * 9, y * 9, z * 9) > 0.6 ? '#ffe590' : noise3(x * 5, z * 5, 1) > 0.7 ? '#d9a93c' : '#f2cd5c'));
  const S = [straw];
  for (let i = 0; i < 10; i++) {
    const a = rng.range(0, Math.PI * 2);
    S.push(part(new THREE.BoxGeometry(0.02, 0.02, 0.3), '#e8c24c', { x: Math.cos(a) * rng.range(0.8, 1.05), y: 0.1, z: Math.sin(a) * rng.range(0.45, 0.62), ry: rng.range(0, 3) }));
  }
  S.push(part(rod([0.95, 0.0, 0.1], [0.95, 0.75, 0.1], 0.02, 4), P.woodLight));
  S.push(part(bev(0.34, 0.22, 0.03, 0.01), '#fff8ee', { x: 0.95, y: 0.75, z: 0.12, rz: 0.08 }));
  S.push(part(lettering(0.24, 0.1, 2, INK, {}, rng, 0.008), INK, { x: 0.95, y: 0.75, z: 0.14, rz: 0.08 }));
  const g = new THREE.Group();
  const strawMesh = mesh(S, materials.toy, 'straw');
  g.add(strawMesh);
  const marrow = pivot('marrow', 0, 0.44, 0);
  const cap = new THREE.CapsuleGeometry(0.34, 1.05, 6, 14);
  const mp = cap.attributes.position;
  for (let i = 0; i < mp.count; i++) {
    const y = mp.getY(i);
    const k = y / 0.87;
    const fat = 1 + 0.12 * k;
    mp.setXYZ(i, mp.getX(i) * fat, y, mp.getZ(i) * fat + k * k * 0.12);
  }
  cap.computeVertexNormals();
  const body = part(cap, '#fff', { rz: Math.PI / 2 });
  paint(body, (x, y, z, nx, ny, nz, c) => {
    const a = Math.atan2(y, z);
    const band = 0.5 + 0.5 * Math.sin(a * 5 + Math.sin(x * 3) * 0.6);
    c.set('#3d8a3a').lerp(new THREE.Color('#9bd86a'), band > 0.55 ? 0.85 : 0.1);
  });
  const M = [
    body,
    part(rod([-0.83, 0.0, 0.05], [-1.0, 0.1, 0.12], 0.06, 6, 0.045), '#7a5a2a'),
    part(puck(0.12, 0.03, 0.01, 12), P.cobalt, { x: 0.1, y: 0.35, z: 0.05, rx: -0.3 }),
  ];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    M.push(part(new THREE.ConeGeometry(0.035, 0.06, 3), P.cobalt, { x: 0.1 + Math.cos(a) * 0.12, y: 0.35 - Math.sin(a) * 0.035, z: 0.05 + Math.sin(a) * 0.115, rz: -a - Math.PI / 2, rx: -0.3 }));
  }
  M.push(part(puck(0.055, 0.04, 0.01, 10), P.gold, { x: 0.1, y: 0.37, z: 0.06, rx: -0.3 }));
  M.push(part(bev(0.06, 0.2, 0.015, 0.005), P.tomato, { x: 0.06, y: 0.24, z: 0.2, rz: 0.2, rx: -0.9 }));
  M.push(part(bev(0.06, 0.2, 0.015, 0.005), P.tomato, { x: 0.15, y: 0.24, z: 0.2, rz: -0.2, rx: -0.9 }));
  marrow.add(mesh(M, materials.glossy, 'marrowMesh'));
  marrow.add(boxCollider(2.0, 0.8, 0.8, {}));
  marrow.rotation.y = rng.range(-0.15, 0.15);
  g.add(marrow);
  return finish(g, { name: 'giantMarrow', parts: { marrow, straw: strawMesh }, surface: 'soft', bodyForWobble: marrow });
}

// ---------------------------------------------------------------- alarm clock

/**
 * alarmClock({ seed, color, size = 0.55 }) — twin-bell alarm clock (gag-sized).
 * parts: { bell (pivot: bells + hammer), body }. userData: ring(bool) — shakes + hammer rattles.
 */
export function alarmClock({ seed = 1, color, size = 0.55 } = {}) {
  const rng = new Rng(`clock-${seed}`);
  const c = color || rng.pick([P.tomato, P.teal, P.cobalt, P.bubblegum]);
  const s = size / 0.55;
  const L = [
    part(puck(0.22, 0.16, 0.05, 16), c, { y: 0.3, rx: Math.PI / 2 }),
    part(new THREE.CylinderGeometry(0.185, 0.185, 0.02, 16), '#fff8ee', { y: 0.3, z: 0.08, rx: Math.PI / 2 }),
    part(new THREE.TorusGeometry(0.19, 0.024, 5, 16), P.gold, { y: 0.3, z: 0.085 }),
    part(bev(0.022, 0.1, 0.012, 0.005), INK, { y: 0.35, z: 0.095, rz: -0.35 }),
    part(bev(0.018, 0.14, 0.012, 0.005), INK, { x: 0.05, y: 0.33, z: 0.1, rz: -1.05 }),
    part(ball(0.018, 0), P.tomato, { y: 0.3, z: 0.105 }),
  ];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    L.push(part(new THREE.BoxGeometry(i % 3 ? 0.014 : 0.022, i % 3 ? 0.022 : 0.045, 0.01), INK, { x: Math.sin(a) * 0.155, y: 0.3 + Math.cos(a) * 0.155, z: 0.095, rz: -a }));
  }
  for (const sx of [-1, 1]) {
    L.push(part(rod([sx * 0.1, 0.12, 0], [sx * 0.15, 0.02, 0.03], 0.025, 6), INK));
    L.push(part(ball(0.04, 0), INK, { x: sx * 0.15, y: 0.03, z: 0.03 }));
  }
  L.push(part(bev(0.12, 0.04, 0.06, 0.015), P.gold, { y: 0.3, z: -0.12 }));
  L.push(part(rod([0, 0.3, -0.08], [0, 0.3, -0.12], 0.015, 5), P.gold));
  const g = new THREE.Group();
  const bodyPivot = pivot('bodyPivot');
  const body = mesh(L, materials.glossy, 'body');
  bodyPivot.add(body);
  g.add(bodyPivot);
  const bell = pivot('bell', 0, 0.5, 0);
  const Bl = [];
  for (const sx of [-1, 1]) {
    Bl.push(part(lathe([[0.1, 0], [0.1, 0.02], [0.09, 0.07], [0.05, 0.11], [0, 0.12]], 12), P.gold, { x: sx * 0.12, y: -0.02, rz: -sx * 0.55 }));
    Bl.push(part(rod([sx * 0.04, -0.06, 0], [sx * 0.1, 0.0, 0], 0.012, 4), P.gold));
  }
  Bl.push(part(rod([0, -0.04, 0], [0, 0.11, 0], 0.012, 4), INK), part(ball(0.025, 0), INK, { y: 0.12 }));
  Bl.push(part(arc(0.07, 0.014, Math.PI, 4, 8), P.gold, { y: 0.05, z: -0.02 }));
  bell.add(mesh(Bl, materials.glossy, 'bellMesh'));
  bell.add(boxCollider(0.5, 0.3, 0.25, { y: 0.04 }));
  bodyPivot.add(bell);
  g.add(boxCollider(0.5, 0.5, 0.25, { y: 0.28 }));
  g.scale.setScalar(s);
  let ringing = false;
  finish(g, {
    name: 'alarmClock', parts: { bell, body }, surface: 'metal', bodyForWobble: bodyPivot,
    tick: (dt, t) => {
      if (!ringing) return;
      bell.rotation.z = Math.sin(t * 70) * 0.09;
      bell.position.y = 0.5 + Math.abs(Math.sin(t * 35)) * 0.015;
      bodyPivot.position.y = Math.abs(Math.sin(t * 22)) * 0.03;
      bodyPivot.rotation.z = Math.sin(t * 13) * 0.05;
      bodyPivot.rotation.y = Math.sin(t * 3) * 0.15;
    },
  });
  g.userData.ring = (on) => {
    ringing = !!on;
    g.userData.ringing = ringing;
    if (!ringing) { bell.rotation.z = 0; bell.position.y = 0.5; bodyPivot.position.y = 0; bodyPivot.rotation.set(0, 0, 0); }
  };
  return g;
}

// ---------------------------------------------------------------- camera on tripod

/**
 * cameraOnTripod({ seed, color }) — retro camera on a wooden tripod.
 * parts: { camera (pivot at the tripod head: rotate y/x to aim), tripod, flash (emissive, hidden) }.
 * userData: flash() -> Promise (pop of light), aim(yaw, pitch) -> Promise.
 */
export function cameraOnTripod({ seed = 1, color } = {}) {
  const rng = new Rng(`camera-${seed}`);
  const c = color || rng.pick([P.tomato, P.teal, P.sunflower, P.cobalt]);
  const H = 1.3;
  const T = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    T.push(part(rod([Math.sin(a) * 0.06, H - 0.05, Math.cos(a) * 0.06], [Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5], 0.042, 6, 0.036), P.woodLight));
    T.push(part(ball(0.035, 0), INK, { x: Math.sin(a) * 0.5, y: 0.02, z: Math.cos(a) * 0.5 }));
  }
  T.push(part(puck(0.09, 0.08, 0.02, 10), INK, { y: H - 0.02 }));
  T.push(part(rod([0, H - 0.5, 0], [0, H, 0], 0.025, 6), '#6b7280'));
  const g = new THREE.Group();
  const tripod = mesh(T, materials.toy, 'tripod');
  g.add(tripod);
  const cam = pivot('camera', 0, H + 0.02, 0);
  const Cm = [
    part(bev(0.44, 0.26, 0.2, 0.05), INK, { y: 0.15 }),
    part(bev(0.46, 0.1, 0.21, 0.04), '#fff4e0', { y: 0.25 }),
    part(bev(0.46, 0.08, 0.215, 0.03), c, { y: 0.1 }),
    part(bev(0.14, 0.1, 0.14, 0.03), INK, { x: -0.06, y: 0.33 }),
    part(puck(0.1, 0.16, 0.03, 16), INK, { y: 0.15, z: 0.16, rx: Math.PI / 2 }),
    part(puck(0.11, 0.04, 0.015, 16), '#e4e8ee', { y: 0.15, z: 0.23, rx: Math.PI / 2 }),
    part(puck(0.075, 0.02, 0.006, 16), '#5aa7cf', { y: 0.15, z: 0.25, rx: Math.PI / 2 }),
    part(bev(0.12, 0.09, 0.07, 0.02), '#e4e8ee', { x: 0.14, y: 0.36 }),
    part(bev(0.1, 0.06, 0.02, 0.01), '#fffbe0', { x: 0.14, y: 0.36, z: 0.04 }),
    part(ball(0.025, 0), P.tomato, { x: -0.16, y: 0.3 }),
  ];
  cam.add(mesh(Cm, materials.glossy, 'cameraMesh'));
  cam.add(boxCollider(0.56, 0.5, 0.45, { y: 0.2, z: 0.05 }));
  const flashM = mesh([part(new THREE.IcosahedronGeometry(0.12, 1), '#fff', { x: 0.14, y: 0.36, z: 0.09, sz: 0.4 })], materials.emissive('#fffbe8', 6), 'flash');
  flashM.visible = false;
  flashM.castShadow = false;
  cam.add(flashM);
  g.add(cam);
  const photo = pivot('photo', 0, H + 0.45, 0);
  photo.add(mesh([
    part(bev(0.2, 0.17, 0.012, 0.004), '#fff8ee'),
    part(new THREE.BoxGeometry(0.16, 0.07, 0.014), '#8fd3f4', { y: 0.025 }),
    part(new THREE.BoxGeometry(0.16, 0.05, 0.014), '#7cc653', { y: -0.035 }),
    part(new THREE.BoxGeometry(0.04, 0.04, 0.016), P.sunflower, { x: 0.05, y: 0.035 }),
  ], materials.toy, 'photoMesh'));
  photo.visible = false;
  g.add(photo);
  const anims = new Anims();
  finish(g, { name: 'cameraOnTripod', parts: { camera: cam, tripod, flash: flashM, photo }, surface: 'metal', anims });
  g.userData.flash = () => {
    flashM.visible = true;
    return anims.play(0.22, (k) => { const s = Math.sin(k * Math.PI) * 1.8 + 0.01; flashM.scale.setScalar(s); }, { key: 'flash' })
      .then((d) => { flashM.visible = false; return d; });
  };
  /** Job reaction: flash, then a photo pops out of the top and flutters down in front. */
  g.userData.snap = () => {
    g.userData.flash();
    const start = new THREE.Vector3(0, H + 0.45, 0);
    const dir = new THREE.Vector3(Math.sin(cam.rotation.y), 0, Math.cos(cam.rotation.y));
    const end = start.clone().addScaledVector(dir, 0.8).setY(0.012);
    return anims.play(1.8, (k) => {
      photo.visible = true;
      const up = Math.sin(Math.min(1, k * 2.2) * Math.PI) * 0.45;
      photo.position.lerpVectors(start, end, ease.inQuad(k));
      photo.position.y = Math.max(0.012, lerp(start.y, end.y, ease.inQuad(k)) + up);
      photo.position.x += Math.sin(k * 14) * 0.12 * (1 - k);
      photo.rotation.set(-Math.PI / 2 * ease.outCubic(k) + Math.sin(k * 11) * 0.4 * (1 - k), k * 2.5, Math.sin(k * 9) * 0.5 * (1 - k));
    }, { delay: 0.24, key: 'photo' });
  };
  g.userData.aim = (yaw = 0, pitch = 0) => {
    const y0 = cam.rotation.y, p0 = cam.rotation.x;
    return anims.play(0.6, (k) => { cam.rotation.y = lerp(y0, yaw, k); cam.rotation.x = lerp(p0, -pitch, k); }, { ease: ease.outBack, key: 'aim' });
  };
  return g;
}

// ---------------------------------------------------------------- birdseed bag

/**
 * birdseedBag({ seed, drop = 0 }) — paper sack of birdseed with a bird on the label.
 * `drop`: height of the bag's base above the ground the seed should land on (e.g. 0.51 on a bench
 * seat; put the bag at the front of the seat). The seed always pours out of the bag MOUTH, in front.
 * parts: { bag (pivot at the front-bottom edge, tips forward), spill (ground point where the seed
 * lands - send pigeons here; move it and the seed follows), pile (mound mesh), seeds (InstancedMesh) }.
 * userData: spill() -> Promise (bag tips over - off the ledge when drop > 0 - and seed pours from the
 * mouth onto the pile), spilled, reset(). 1 draw call (3 while/after spilling), 634 tris (+~560 spilled).
 */
export function birdseedBag({ seed = 1, drop = 0 } = {}) {
  const rng = new Rng(`seedbag-${seed}`);
  const kraft = '#d9b27c';
  const HZ = 0.16; // hinge (front-bottom edge) z
  const bag = pivot('bag', 0, 0, HZ);
  const Bg = [
    part(bev(0.42, 0.52, 0.3, 0.06), kraft, { y: 0.26, z: -0.16 }),
    part(bev(0.45, 0.08, 0.33, 0.035), shade(kraft, 0.15), { y: 0.52, z: -0.16 }),
    part(blob(0.18, 1, 0.1, seed), '#e8c25a', { y: 0.53, z: -0.16, sx: 1.05, sy: 0.35, sz: 0.72 }),
    part(bev(0.3, 0.3, 0.02, 0.01), '#fff4e0', { y: 0.27, z: -0.005 }),
    part(ball(0.07, 1), P.cobalt, { x: -0.02, y: 0.25, z: 0.01, sz: 0.3 }),
    part(ball(0.045, 1), P.cobalt, { x: 0.05, y: 0.31, z: 0.012, sz: 0.3 }),
    part(new THREE.ConeGeometry(0.02, 0.05, 3), P.tangerine, { x: 0.1, y: 0.31, z: 0.015, rz: -Math.PI / 2, sz: 0.4 }),
    part(ball(0.01, 0), INK, { x: 0.06, y: 0.32, z: 0.025 }),
    part(lettering(0.22, 0.04, 1, P.tomato, {}, rng, 0.006), P.tomato, { y: 0.17, z: 0.01 }),
  ];
  for (let i = 0; i < 10; i++) {
    const a = rng.range(0, Math.PI * 2), r = rng.range(0, 0.12);
    Bg.push(part(ball(0.022, 0), rng.pick(['#f2cd5c', '#b98a5a', '#fff4d6']), { x: Math.cos(a) * r * 1.4, y: 0.58, z: -0.16 + Math.sin(a) * r }));
  }
  bag.add(mesh(Bg, materials.toy, 'bagMesh'));
  bag.add(boxCollider(0.5, 0.62, 0.4, { y: 0.3, z: -0.16 }));
  const g = new THREE.Group();
  g.add(bag);
  // final pose: lying on its front with the mouth forward (on the ledge, or on the ground after the fall)
  const TIP = 1.42;
  const off = drop > 0.05; // topples off its ledge
  const restP = new THREE.Vector3(0, off ? -drop : 0, HZ + (off ? 0.26 : 0));
  const mouthLocal = new THREE.Vector3(0, 0.56, -0.16);
  const mouth = mouthLocal.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), TIP).add(restP);
  const spill = pivot('spill', 0, -drop, mouth.z + 0.26);
  g.add(spill);
  // golden-brown heap + dark/orange/cream seeds: reads on pale paving as well as on grass
  const Pl = [paintFaces(part(blob(0.24, 1, 0.12, seed + 3), '#fff', { y: 0.01, z: 0.02, sy: 0.24, sx: 1.3 }),
    (x, y, z, nx, ny, nz, c) => c.set(noise3(x * 31, y * 31, z * 31) > 0.72 ? '#7a4a26' : noise3(z * 17, x * 17, 3) > 0.6 ? '#e8902c' : '#d49a36'))];
  const pile = mesh(Pl, materials.toy, 'pile');
  pile.visible = false;
  pile.castShadow = false;
  spill.add(pile);
  // seeds: poured from the mouth, each lands on its own spot of the pile (spill-local fan)
  const NS = 64;
  const seedGeo = part(new THREE.OctahedronGeometry(0.024, 0), '#ffffff');
  const seeds = new THREE.InstancedMesh(seedGeo, materials.toy, NS);
  seeds.name = 'seeds';
  seeds.visible = false;
  seeds.castShadow = false;
  seeds.frustumCulled = false;
  seeds.raycast = () => {};
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const cols = ['#e8a93c', '#7a4a26', '#fff4d6', '#d4782c', '#b98a5a'].map((c) => new THREE.Color(c));
  const S = [];
  for (let i = 0; i < NS; i++) {
    const a = rng.range(-1.15, 1.15), r = Math.sqrt(rng.random()) * 0.55;
    S.push({
      spot: new THREE.Vector3(Math.sin(a) * r, 0.016, Math.cos(a) * r * 0.9 - 0.2), // spill space: fans out from the mouth
      t0: 0.08 + (i / NS) * 0.75 + rng.range(0, 0.05), dur: rng.range(0.32, 0.46), spin: rng.range(4, 12),
      from: new THREE.Vector3(), to: new THREE.Vector3(), lift: rng.range(0.05, 0.25),
    });
    seeds.setMatrixAt(i, zero);
    seeds.setColorAt(i, cols[i % cols.length]);
  }
  g.add(seeds);
  const anims = new Anims();
  let spilled = false;
  let pourT = null; // seconds since the pour started (negative = waiting for the bag to land)
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
  const tickSeeds = (dt) => {
    if (pourT === null) return;
    pourT += dt;
    if (pourT < 0) return;
    seeds.visible = true;
    pile.visible = true;
    const pk = ease.outCubic(Math.min(1, Math.max(0, (pourT - 0.25) / 0.9)));
    pile.scale.set(Math.max(0.001, pk), 0.4 + 0.6 * pk, Math.max(0.001, pk));
    let moving = pk < 1;
    for (let i = 0; i < NS; i++) {
      const s = S[i];
      const k = (pourT - s.t0) / s.dur;
      if (k <= 0) { seeds.setMatrixAt(i, zero); moving = true; continue; }
      const kk = Math.min(1, k);
      v.lerpVectors(s.from, s.to, kk);
      v.y = THREE.MathUtils.lerp(s.from.y, s.to.y, kk * kk) + Math.sin(kk * Math.PI) * s.lift; // pops out, then falls
      e.set(kk * s.spin, i, kk * s.spin * 0.7);
      m4.compose(v, q.setFromEuler(e), one);
      seeds.setMatrixAt(i, m4);
      if (k < 1) moving = true;
    }
    seeds.instanceMatrix.needsUpdate = true;
    if (!moving) pourT = null;
  };
  finish(g, { name: 'birdseedBag', parts: { bag, spill, pile, seeds }, surface: 'soft', anims, tick: tickSeeds });
  g.userData.drop = drop;
  g.userData.spill = () => {
    if (spilled) return Promise.resolve(false);
    spilled = true;
    g.userData.spilled = true;
    // seed flight paths: from the resting mouth (group space) to the pile spots (spill pivot, wherever it is now)
    spill.updateMatrix();
    for (const s of S) {
      s.from.copy(mouth).add(v.set(rng.range(-0.08, 0.08), rng.range(-0.04, 0.03), rng.range(-0.02, 0.04)));
      s.to.copy(s.spot).applyMatrix4(spill.matrix);
    }
    pourT = off ? -0.62 : -0.45; // starts pouring once the bag has landed
    if (!off) return anims.play(0.8, (k) => { bag.rotation.x = k * TIP; }, { ease: ease.outBounce, key: 'tip' });
    // off a ledge: tip over the edge, drop to the ground, flop with a little bounce
    const p0 = bag.position.clone();
    return anims.play(1.0, (k, lin) => {
      const t = lin * 1.0;
      const tipK = Math.min(1, t / 0.32);
      const fallK = Math.min(1, Math.max(0, (t - 0.22) / 0.34));
      bag.rotation.x = t < 0.56 ? ease.inQuad(tipK) * 0.95 + fallK * (TIP - 0.95) : TIP + Math.sin((t - 0.56) / 0.44 * Math.PI * 2) * 0.12 * (1 - (t - 0.56) / 0.44);
      bag.position.set(p0.x, p0.y + (restP.y - p0.y) * fallK * fallK, p0.z + (restP.z - p0.z) * ease.outQuad(fallK));
    }, { key: 'tip' });
  };
  g.userData.reset = () => {
    anims.cancel('tip');
    spilled = false;
    g.userData.spilled = false;
    bag.rotation.x = 0;
    bag.position.set(0, 0, HZ);
    pile.visible = false;
    seeds.visible = false;
    pourT = null;
    for (let i = 0; i < NS; i++) seeds.setMatrixAt(i, zero);
    seeds.instanceMatrix.needsUpdate = true;
  };
  return g;
}

// ---------------------------------------------------------------- teapot

/**
 * teapot({ seed, color, size = 0.4 }) — chunky polka-dot teapot.
 * parts: { lid (pivot), spout (spawn point at the spout tip), body }. userData: rattle(bool) (boiling tell).
 */
export function teapot({ seed = 1, color, size = 0.4 } = {}) {
  const rng = new Rng(`teapot-${seed}`);
  const c = color || rng.pick([P.bubblegum, P.teal, P.cobalt, P.sunflower]);
  const prof = [[0, 0], [0.12, 0], [0.17, 0.03], [0.2, 0.07], [0.215, 0.12], [0.22, 0.17], [0.21, 0.21], [0.19, 0.25], [0.15, 0.29], [0.12, 0.3], [0, 0.3]];
  const bodyG = part(lathe(prof, 20), c);
  const rAt = (y) => {
    for (let i = 1; i < prof.length; i++) {
      const [r0, y0] = prof[i - 1], [r1, y1] = prof[i];
      if (y >= y0 && y <= y1 && y1 > y0) return r0 + (r1 - r0) * ((y - y0) / (y1 - y0));
    }
    return 0.2;
  };
  const dotParts = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (const [y, n, off] of [[0.215, 8, 0], [0.1, 9, 0.35]]) {
    const r = rAt(y);
    const slopeN = (rAt(y + 0.01) - rAt(y - 0.01)) / 0.02;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + off;
      if (Math.abs(Math.cos(a)) > 0.8) continue; // keep clear of spout and handle
      const nrm = new THREE.Vector3(Math.cos(a), -slopeN, Math.sin(a)).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(up, nrm);
      const e = new THREE.Euler().setFromQuaternion(q);
      dotParts.push(part(new THREE.CylinderGeometry(0.034, 0.034, 0.012, 7), '#fff8ee', {
        x: Math.cos(a) * (r + 0.002), y, z: Math.sin(a) * (r + 0.002), rx: e.x, ry: e.y, rz: e.z,
      }));
    }
  }
  const spoutPts = [[0.17, 0.1, 0], [0.26, 0.13, 0], [0.31, 0.2, 0], [0.36, 0.28, 0]].map((p) => new THREE.Vector3(...p));
  const L = [
    bodyG,
    ...dotParts,
    part(puck(0.13, 0.03, 0.01, 14), shade(c, -0.2), { y: 0.015 }),
    part(tube(spoutPts, 0.042, 8, 8), c),
    part(puck(0.048, 0.03, 0.01, 10), shade(c, -0.15), { x: 0.365, y: 0.29, rz: -0.6 }),
    part(arc(0.1, 0.03, Math.PI * 1.15, 6, 10), c, { x: -0.21, y: 0.16, rz: Math.PI * 0.43 }),
  ];
  const g = new THREE.Group();
  const body = mesh(L, materials.glossy, 'body');
  g.add(body);
  const lid = pivot('lid', 0, 0.295, 0);
  lid.add(mesh([
    part(lathe([[0, 0], [0.135, 0], [0.135, 0.02], [0.1, 0.05], [0, 0.065]], 14), '#fff8ee'),
    part(ball(0.035, 1), c, { y: 0.085 }),
  ], materials.glossy, 'lidMesh'));
  g.add(lid);
  const spout = pivot('spout', 0.37, 0.3, 0);
  g.add(spout);
  g.add(boxCollider(0.66, 0.42, 0.46, { x: 0.05, y: 0.2 }));
  g.scale.setScalar(size / 0.4);
  let rattling = false;
  finish(g, {
    name: 'teapot', parts: { lid, spout, body }, surface: 'glass',
    tick: (dt, t) => {
      if (!rattling) return;
      lid.position.y = 0.295 + Math.abs(Math.sin(t * 24)) * 0.025;
      lid.rotation.z = Math.sin(t * 17) * 0.08;
      lid.rotation.x = Math.cos(t * 13) * 0.06;
    },
  });
  g.userData.rattle = (on) => {
    rattling = !!on;
    if (!rattling) { lid.position.y = 0.295; lid.rotation.set(0, 0, 0); }
  };
  return g;
}

// ---------------------------------------------------------------- firework rocket

const SPARK_COLORS = [P.tomato, P.sunflower, P.teal, P.bubblegum, P.cobalt, '#8ad14f', P.violet];

/**
 * fireworkRocket({ seed, colors, onBurst }) — rocket in a sand bucket.
 * parts: { rocket (pivot), stand, particles }. userData: launch() -> Promise (fuse, climb with
 * trail, star burst at ~20 m; onBurst(worldPos) fires at the burst), reset(), launched.
 */
export function fireworkRocket({ seed = 1, colors = SPARK_COLORS, onBurst } = {}) {
  const rng = new Rng(`rocket-${seed}`);
  const body = rng.pick([[P.tomato, '#fff8ee'], [P.cobalt, P.sunflower], [P.violet, '#fff8ee'], [P.teal, P.sunflower]]);
  const S = [
    latheBands([[0, 0], [0.16, 0], [0.2, 0.3], [0.215, 0.31], [0.215, 0.34], [0.195, 0.34], [0.19, 0.3], [0, 0.3]], 12,
      (y, i) => (i === 6 ? '#e8d29a' : i >= 2 ? shade(P.tomato, 0.2) : P.tomato)),
  ];
  const g = new THREE.Group();
  const stand = mesh(S, materials.toy, 'stand');
  g.add(stand);
  const rocket = pivot('rocket', 0, 0.55, 0);
  const R = [
    latheBands([[0, 0], [0.085, 0], [0.085, 0.12], [0.085, 0.24], [0.085, 0.36], [0.085, 0.48], [0, 0.48]], 12, (y, i) => (i % 2 ? body[1] : body[0])),
    part(new THREE.ConeGeometry(0.1, 0.24, 12), P.gold, { y: 0.6 }),
    part(puck(0.1, 0.03, 0.01, 12), shade(P.gold, -0.15), { y: 0.48 }),
    part(rod([0.1, -0.5, 0], [0.1, 0.15, 0], 0.022, 5), P.woodLight),
    part(rod([0, 0, 0], [0.03, -0.08, 0.02], 0.012, 4), INK),
  ];
  rocket.add(mesh(R, materials.glossy, 'rocketMesh'));
  rocket.add(boxCollider(0.35, 0.9, 0.35, { y: 0.3 }));
  g.add(rocket);
  // particles: trail puffs + sparks + burst stars (instanced, unlit, hidden when idle)
  const N = 150;
  const pm = new THREE.InstancedMesh(part(new THREE.IcosahedronGeometry(1, 0), '#ffffff'), materials.unlit, N);
  pm.name = 'particles';
  pm.raycast = () => {}; // sparks are never shootable
  pm.frustumCulled = false;
  pm.castShadow = false;
  pm.visible = false;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < N; i++) { pm.setMatrixAt(i, zero); pm.setColorAt(i, new THREE.Color(1, 1, 1)); }
  g.add(pm);
  const parts = Array.from({ length: N }, () => ({ life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), s: 0.1, grow: 0, drag: 1, grav: 0, col: new THREE.Color() }));
  let cursor = 0;
  const emit = (p, v, s, life, col, { drag = 1, grav = 0, intensity = 1, grow = 0 } = {}) => {
    const q = parts[cursor];
    cursor = (cursor + 1) % N;
    q.p.copy(p); q.v.copy(v); q.s = s; q.life = life; q.max = life; q.drag = drag; q.grav = grav; q.grow = grow;
    q.col.set(col).multiplyScalar(intensity);
  };
  const anims = new Anims();
  let state = 'idle';
  let tState = 0;
  let emitT = 0;
  const m4 = new THREE.Matrix4();
  const tmp = new THREE.Vector3();
  const y0 = rocket.position.y;
  let resolveLaunch = null;
  const tick = (dt, t) => {
    tState += dt;
    if (state === 'fuse') {
      emitT += dt;
      while (emitT > 0.03) {
        emitT -= 0.03;
        tmp.set(0.03, y0 - 0.08, 0.02);
        emit(tmp, new THREE.Vector3(rng.range(-1, 1), rng.range(0.5, 2), rng.range(-1, 1)), 0.03, 0.35, rng.pick(['#ffd84a', '#ff9f1c']), { intensity: 3, grav: 6 });
      }
      rocket.position.x = Math.sin(t * 60) * 0.004;
      if (tState > 0.7) { state = 'climb'; tState = 0; }
    } else if (state === 'climb') {
      const h = 0.5 * 26 * tState * tState;
      rocket.position.set(Math.sin(tState * 7) * 0.12 * tState, y0 + h, Math.cos(tState * 5) * 0.08 * tState);
      rocket.rotation.set(Math.sin(tState * 9) * 0.06, tState * 14, Math.cos(tState * 8) * 0.06);
      emitT += dt;
      while (emitT > 0.03) {
        emitT -= 0.03;
        tmp.copy(rocket.position).add(new THREE.Vector3(0, -0.05, 0));
        emit(tmp, new THREE.Vector3(rng.range(-0.3, 0.3), rng.range(-1.2, -0.4), rng.range(-0.3, 0.3)), rng.range(0.14, 0.2), rng.range(0.9, 1.3), rng.chance(0.5) ? '#f4f5f8' : '#dfe3ea', { drag: 2.5, grow: 2.2 });
        emit(tmp, new THREE.Vector3(rng.range(-0.8, 0.8), rng.range(-2, -0.5), rng.range(-0.8, 0.8)), 0.06, 0.35, rng.pick(['#ffd84a', '#ff9f1c']), { intensity: 3, grav: 4 });
      }
      if (tState > 1.25) {
        state = 'burst';
        tState = 0;
        rocket.visible = false;
        const c = rocket.position.clone();
        emit(c, new THREE.Vector3(), 1.1, 0.25, '#fff6d8', { intensity: 4, grow: -2 });
        for (let i = 0; i < 70; i++) {
          const yy = 1 - ((i + 0.5) / 70) * 2;
          const r = Math.sqrt(Math.max(0, 1 - yy * yy));
          const a = i * 2.39996;
          const dir = new THREE.Vector3(Math.cos(a) * r, yy, Math.sin(a) * r);
          emit(c, dir.multiplyScalar(rng.range(8, 10)), rng.range(0.28, 0.36), rng.range(1.4, 2.0), colors[i % colors.length], { drag: 1.5, grav: 2.2, intensity: 3.2 });
        }
        const wp = c.clone();
        g.localToWorld(wp);
        (onBurst || g.userData.onBurst)?.(wp);
      }
    } else if (state === 'burst' && tState > 2.0) {
      state = 'done';
      g.userData.launched = true;
      resolveLaunch?.(true);
      resolveLaunch = null;
    }
    // integrate particles
    let alive = 0;
    for (let i = 0; i < N; i++) {
      const q = parts[i];
      if (q.life <= 0) { pm.setMatrixAt(i, zero); continue; }
      alive++;
      q.life -= dt;
      q.v.multiplyScalar(Math.exp(-q.drag * dt));
      q.v.y -= q.grav * dt;
      q.p.addScaledVector(q.v, dt);
      const k = Math.max(0, q.life / q.max);
      const s = q.grow ? q.s * Math.max(0.05, 1 + q.grow * (1 - k)) * Math.min(1, k / 0.25) : q.s * (0.3 + 0.7 * Math.sqrt(k));
      m4.makeScale(s, s, s).setPosition(q.p);
      pm.setMatrixAt(i, k > 0 ? m4 : zero);
      pm.setColorAt(i, q.col);
    }
    pm.visible = alive > 0;
    if (alive || pm.visible) {
      pm.instanceMatrix.needsUpdate = true;
      pm.instanceColor.needsUpdate = true;
    }
  };
  finish(g, { name: 'fireworkRocket', parts: { rocket, stand, particles: pm }, surface: 'wood', anims, tick });
  g.userData.launch = () => {
    if (state !== 'idle') return Promise.resolve(false);
    state = 'fuse';
    tState = 0;
    return new Promise((res) => { resolveLaunch = res; });
  };
  g.userData.reset = () => {
    state = 'idle';
    tState = 0;
    rocket.visible = true;
    rocket.position.set(0, y0, 0);
    rocket.rotation.set(0, 0, 0);
    g.userData.launched = false;
  };
  return g;
}

// ---------------------------------------------------------------- trophy

const METALS = { gold: [P.gold, '#ffe07a'], silver: ['#c9d2de', '#eef2f7'], bronze: ['#d98a4a', '#f0b27a'] };

/** trophy({ seed, metal: 'gold'|'silver'|'bronze', size = 0.7 }) — two-handled cup on a plinth. parts: { cup, plinth }. */
export function trophy({ seed = 1, metal = 'gold', size = 0.7 } = {}) {
  const [m1, m2] = METALS[metal] || METALS.gold;
  const Pl = [
    part(bev(0.34, 0.12, 0.34, 0.03), P.woodDark, { y: 0.06 }),
    part(bev(0.26, 0.1, 0.26, 0.025), shade(P.woodDark, 0.15), { y: 0.17 }),
    part(bev(0.14, 0.06, 0.012, 0.005), m1, { y: 0.07, z: 0.172 }),
  ];
  const g = new THREE.Group();
  const plinth = mesh(Pl, materials.toy, 'plinth');
  g.add(plinth);
  const C = [
    latheBands([[0, 0.22], [0.1, 0.22], [0.1, 0.25], [0.045, 0.28], [0.035, 0.38], [0.06, 0.42], [0.15, 0.5], [0.19, 0.62], [0.2, 0.68], [0.18, 0.69], [0.14, 0.6], [0, 0.56]], 18,
      (y, i) => (i === 5 || i === 8 ? m2 : m1)),
    part(ball(0.03, 1), m2, { y: 0.4 }),
  ];
  for (const s of [-1, 1]) C.push(part(arc(0.08, 0.02, Math.PI * 1.15, 5, 10), m1, { x: s * 0.2, y: 0.56, rz: s > 0 ? -Math.PI * 0.57 : Math.PI * 0.43 }));
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
    const r = i % 2 ? 0.03 : 0.07;
    if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r); else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  C.push(part(slab(star, 0.015, 0.006, 1), m2, { y: 0.56, z: 0.18, rx: -0.3 }));
  const cup = mesh(C, goldMaterial, 'cup');
  g.add(cup);
  g.add(boxCollider(0.5, 0.75, 0.4, { y: 0.36 }));
  g.scale.setScalar(size / 0.7);
  return finish(g, { name: 'trophy', parts: { cup, plinth }, surface: 'metal' });
}

// ---------------------------------------------------------------- golden spanner

const sparkleMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff4c8').multiplyScalar(3), side: THREE.DoubleSide });
sparkleMaterial.name = 'kit-sparkle';

function spannerShape() {
  const s = new THREE.Shape();
  s.moveTo(-0.17, 0.034);
  s.lineTo(0.16, 0.042);
  s.absarc(0.25, 0, 0.1, 2.62, 0.4, true);
  s.lineTo(0.205, 0.036);
  s.absarc(0.205, 0, 0.036, Math.PI / 2, Math.PI * 1.5, false);
  s.lineTo(0.25 + Math.cos(-0.4) * 0.1, Math.sin(-0.4) * 0.1);
  s.absarc(0.25, 0, 0.1, -0.4, -2.62, true);
  s.lineTo(-0.17, -0.034);
  s.absarc(-0.25, 0, 0.088, -0.4, 0.4, true);
  const hole = new THREE.Path();
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    if (i === 0) hole.moveTo(-0.25 + Math.cos(a) * 0.042, Math.sin(a) * 0.042); else hole.lineTo(-0.25 + Math.cos(a) * 0.042, Math.sin(a) * 0.042);
  }
  s.holes.push(hole);
  return s;
}

/**
 * goldenSpanner({ seed, sparkle = true, size = 0.75 }) — the collectible. Spins + bobs in update and
 * twinkles now and then. parts: { spanner (pivot), sparkle }. userData: collect() -> Promise, collected.
 */
export function goldenSpanner({ seed = 1, sparkle = true, size = 0.75 } = {}) {
  const rng = new Rng(`spanner-${seed}`);
  const geo = new THREE.ExtrudeGeometry(spannerShape(), {
    depth: 0.035, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.014, bevelSegments: 2, curveSegments: 10,
  });
  geo.translate(0, 0, -0.0175);
  geo.deleteAttribute('uv');
  geo.computeVertexNormals();
  const g = new THREE.Group();
  const sp = pivot('spanner', 0, 0.45, 0);
  const s = size / 0.75;
  const inner = mesh([part(geo, P.gold, { s: 1.08 * s, rz: 0.5 })], goldMaterial, 'spannerMesh');
  sp.add(inner);
  sp.add(ballCollider(0.42 * s, {}));
  g.add(sp);
  let star = null;
  if (sparkle) {
    const pts = [];
    const quad = (ax, ay) => {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2, b = a + Math.PI / 4, c2 = a - Math.PI / 4;
        const P1 = [0, 0], P2 = [Math.cos(a) * 1, Math.sin(a) * 1], P3 = [Math.cos(b) * 0.22, Math.sin(b) * 0.22], P4 = [Math.cos(c2) * 0.22, Math.sin(c2) * 0.22];
        for (const [u, v] of [P1, P3, P2, P1, P2, P4]) pts.push(ax === 'z' ? [u, v, 0] : ax === 'x' ? [0, v, u] : [u, 0, v]);
      }
    };
    quad('z'); quad('x'); quad('y');
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
    sg.computeVertexNormals();
    star = new THREE.Mesh(sg, sparkleMaterial);
    star.name = 'sparkle';
    star.castShadow = false;
    star.visible = false;
    g.add(star);
  }
  const anims = new Anims();
  let collected = false;
  let twinkle = rng.range(0.5, 2);
  finish(g, {
    name: 'goldenSpanner', parts: { spanner: sp, sparkle: star }, surface: 'metal', anims,
    tick: (dt, t) => {
      if (collected) return;
      sp.rotation.y += dt * 1.6;
      sp.position.y = 0.45 + Math.sin(t * 2.2) * 0.06;
      if (star) {
        twinkle -= dt;
        if (twinkle < 0) {
          twinkle = rng.range(1.6, 3.2);
          star.position.set(rng.range(-0.25, 0.25) * s, sp.position.y + rng.range(-0.15, 0.2) * s, rng.range(-0.1, 0.1));
          star.visible = true;
          anims.play(0.45, (k) => { const q = Math.sin(k * Math.PI) * 0.16 * s + 0.001; star.scale.setScalar(q); star.rotation.z = k * 1.5; }, { key: 'twinkle' })
            .then(() => { star.visible = false; });
        }
      }
    },
  });
  g.userData.collect = () => {
    if (collected) return Promise.resolve(false);
    collected = true;
    g.userData.collected = true;
    const y0 = sp.position.y;
    return anims.play(0.9, (k) => {
      sp.rotation.y += 0.5;
      sp.position.y = y0 + ease.outCubic(k) * 1.4;
      sp.scale.setScalar(Math.max(0.001, 1 + Math.sin(k * Math.PI) * 0.4 - k));
    }, { key: 'collect' }).then((d) => { sp.visible = false; if (star) star.visible = false; return d; });
  };
  return g;
}
