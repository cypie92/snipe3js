// Office furniture & decor. Static pieces are merged per material; every interactive object is a
// Group with its own meshes plus `hub` info (collider, anchor, reactions) that Office.js registers.
import * as THREE from 'three';
import { part, merge, xform, rbox } from '../world/geo.js';
import { materials } from '../gfx/materials.js';
import { P } from '../gfx/palette.js';
import { Rng } from '../core/rng.js';
import { bev, lathe, puck, ball, rod, arc, slab, latheBands, paintFaces, boxCollider, goldMaterial } from '../world/kit/props/lib.js';
import { bush } from '../world/kit/nature/index.js';
import { decalQuad } from '../world/perch/paint.js';
import { liveryAtlas } from '../world/perch/livery.js';
import { decorAtlas } from './textures.js';
import { mergeUV } from './room.js';

const CREAM = '#fff4e0';
const DARK = '#3b3f4f';
const CHROME = '#e4e8ee';

/** Group of merged meshes: lists = { toy, glossy, metal, gold, decal, emissive: [geos, material] }. */
export function meshGroup(name, { toy, glossy, metal, gold, decal, extra } = {}, { cast = true } = {}) {
  const g = new THREE.Group();
  g.name = name;
  const add = (geos, mat, n, uv = false) => {
    if (!geos || !geos.length) return null;
    const m = new THREE.Mesh(uv ? mergeUV(geos) : merge(geos), mat);
    m.name = `${name}-${n}`;
    m.castShadow = cast && !uv;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  g.userData.meshes = {
    toy: add(toy, materials.toy, 'toy'),
    glossy: add(glossy, materials.glossy, 'glossy'),
    metal: add(metal, materials.metal, 'metal'),
    gold: add(gold, goldMaterial, 'gold'),
    decal: add(decal, decorAtlas().material, 'decal', true),
  };
  for (const [geos, mat, n] of extra || []) add(geos, mat, n, !geos[0]?.attributes?.color);
  return g;
}

export const decal = (name, w, h, t) => decalQuad(w, h, decorAtlas().uv(name), xform(t));

// ------------------------------------------------------------------ desk + chair (static)
export function desk() {
  const T = [], G = [], D = [];
  T.push(part(bev(1.9, 0.09, 0.9, 0.035), P.woodLight, { y: 0.84 }));
  T.push(part(bev(1.84, 0.7, 0.06, 0.025), P.wood, { y: 0.44, z: 0.36 })); // front modesty panel
  T.push(part(bev(0.52, 0.8, 0.8, 0.04), P.wood, { x: -0.64, y: 0.4, z: -0.02 }));
  T.push(part(bev(0.08, 0.8, 0.8, 0.03), P.woodDark, { x: 0.88, y: 0.4, z: -0.02 }));
  for (let i = 0; i < 3; i++) {
    T.push(part(bev(0.44, 0.2, 0.04, 0.02), P.woodLight, { x: -0.64, y: 0.17 + i * 0.24, z: -0.43 }));
    G.push(part(ball(0.03, 1), P.sunflower, { x: -0.64, y: 0.17 + i * 0.24, z: -0.46 }));
  }
  const LA = liveryAtlas();
  const badge = decalQuad(0.42, 0.42, LA.uv('roundel'), xform({ x: 0.1, y: 0.48, z: 0.395 }));
  // papers, pencil pot, name plate
  for (let i = 0; i < 5; i++) T.push(part(bev(0.34, 0.012, 0.44, 0.004), i % 2 ? '#fff8ee' : '#f2ead8', { x: -0.3 + i * 0.006, y: 0.895 + i * 0.013, z: 0.05, ry: 0.1 + i * 0.07 }));
  T.push(part(lathe([[0.07, 0], [0.075, 0.18], [0.07, 0.18], [0.065, 0.02], [0, 0.02]], 14), P.cobalt, { x: -0.72, y: 0.885, z: 0.2 }));
  for (const [c, dx, dz, a] of [[P.sunflower, 0.02, 0, 0.1], [P.tomato, -0.02, 0.02, -0.12], [P.teal, 0, -0.03, 0.05]]) {
    T.push(part(rod([-0.72 + dx, 0.9, 0.2 + dz], [-0.72 + dx + a * 0.3, 1.17, 0.2 + dz + a * 0.2], 0.012, 6), c));
  }
  T.push(part(new THREE.CylinderGeometry(0.085, 0.085, 0.36, 3), '#7a4a26', { y: 0.93, z: 0.3, rz: Math.PI / 2, ry: 0, rx: Math.PI }));
  const LAq = decorAtlas();
  const plate = decalQuad(0.32, 0.08, LAq.uv('nameplate'), xform({ y: 0.945, z: 0.345, rx: -0.52 }));
  const g = meshGroup('desk', { toy: T, glossy: G });
  const dm = new THREE.Mesh(mergeUV([badge]), LA.material);
  dm.name = 'desk-badge';
  dm.receiveShadow = true;
  g.add(dm);
  const pm = new THREE.Mesh(mergeUV([plate]), LAq.material);
  pm.name = 'desk-plate';
  g.add(pm);
  return g;
}

export function chair() {
  const T = [], G = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    T.push(part(rod([0, 0.1, 0], [Math.sin(a) * 0.32, 0.07, Math.cos(a) * 0.32], 0.028, 6), DARK));
    T.push(part(ball(0.045, 1), DARK, { x: Math.sin(a) * 0.32, y: 0.045, z: Math.cos(a) * 0.32 }));
  }
  T.push(part(new THREE.CylinderGeometry(0.035, 0.045, 0.34, 10), CHROME, { y: 0.27 }));
  G.push(part(rbox(0.56, 0.12, 0.52, 0.05), P.tomato, { y: 0.49 }));
  G.push(part(rbox(0.52, 0.5, 0.1, 0.05), P.tomato, { y: 0.84, z: -0.24, rx: -0.12 }));
  T.push(part(bev(0.06, 0.3, 0.06, 0.02), DARK, { y: 0.62, z: -0.25 }));
  return meshGroup('chair', { toy: T, glossy: G });
}

// ------------------------------------------------------------------ desk lamp (fun target)
export function deskLamp() {
  const T = [], G = [];
  G.push(part(puck(0.14, 0.05, 0.02, 16), P.cobalt, { y: 0.025 }));
  G.push(part(rod([0, 0.05, 0], [0.08, 0.42, -0.02], 0.022, 8), P.cobalt));
  G.push(part(ball(0.035, 1), P.sunflower, { x: 0.08, y: 0.42, z: -0.02 }));
  G.push(part(rod([0.08, 0.42, -0.02], [-0.12, 0.62, 0.02], 0.02, 8), P.cobalt));
  G.push(part(ball(0.035, 1), P.sunflower, { x: -0.12, y: 0.62, z: 0.02 }));
  const shade = latheBands([[0.04, 0.0], [0.07, -0.05], [0.13, -0.16], [0.14, -0.17], [0.12, -0.16], [0.06, -0.06], [0.03, -0.02]], 18,
    (y, i) => (i >= 4 ? '#fff3c4' : P.sunflower));
  G.push(shade.applyMatrix4(xform({ x: -0.16, y: 0.63, z: 0.06, rz: 0.55 })));
  const g = meshGroup('lamp', { glossy: G });
  const bulbMat = new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: '#ffd27a', emissiveIntensity: 2.2, roughness: 0.4 });
  bulbMat.name = 'office-bulb';
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), bulbMat);
  bulb.position.set(-0.22, 0.54, 0.06);
  g.add(bulb);
  g.userData.bulb = bulbMat;
  g.userData.on = true;
  return g;
}

// ------------------------------------------------------------------ rotary phone (fun target)
export function phone() {
  const G = [], T = [];
  const base = rbox(0.3, 0.14, 0.26, 0.06);
  G.push(part(base, P.tomato, { y: 0.07 }));
  G.push(part(puck(0.1, 0.03, 0.01, 18), CREAM, { y: 0.12, z: 0.07, rx: -0.5 }));
  for (let i = 0; i < 8; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.6;
    T.push(part(ball(0.013, 0), DARK, { x: Math.cos(a) * 0.07, y: 0.135 + Math.sin(a) * 0.07 * Math.sin(0.5) * 0.4, z: 0.075 + Math.sin(a) * 0.06, s: 1 }));
  }
  const g = meshGroup('phone', { glossy: G, toy: T });
  const handset = new THREE.Group();
  handset.position.set(0, 0.17, -0.04);
  const H = [
    part(new THREE.CapsuleGeometry(0.035, 0.24, 4, 10), P.tomato, { rz: Math.PI / 2 }),
    part(rbox(0.09, 0.07, 0.1, 0.03), P.tomato, { x: -0.15, y: -0.02 }),
    part(rbox(0.09, 0.07, 0.1, 0.03), P.tomato, { x: 0.15, y: -0.02 }),
  ];
  const hm = new THREE.Mesh(merge(H), materials.glossy);
  hm.castShadow = true;
  handset.add(hm);
  g.add(handset);
  // coiled cord
  const pts = [];
  for (let i = 0; i <= 60; i++) {
    const k = i / 60;
    const a = k * Math.PI * 2 * 9;
    pts.push(new THREE.Vector3(0.17 + k * 0.1 + Math.cos(a) * 0.018, 0.06 - Math.sin(k * Math.PI) * 0.03 + Math.sin(a) * 0.018, -0.02 + k * 0.12));
  }
  const cord = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.007, 5), materials.solid(P.tomato));
  g.add(cord);
  g.userData.handset = handset;
  return g;
}

// ------------------------------------------------------------------ mug with steam (fun target)
export function mug() {
  const G = latheBands([[0, 0.005], [0.07, 0.005], [0.075, 0.02], [0.075, 0.07], [0.075, 0.11], [0.078, 0.14], [0.066, 0.14], [0.062, 0.03], [0, 0.03]], 18,
    (y, i) => (i === 3 ? P.sunflower : P.teal));
  const H = part(arc(0.045, 0.014, Math.PI * 1.2, 6, 12), P.teal, { x: 0.075, y: 0.075, rz: -Math.PI * 0.6 });
  const tea = part(puck(0.063, 0.01, 0.003, 16), '#b0703a', { y: 0.12 });
  const g = meshGroup('mug', { glossy: [G, H], toy: [tea] });
  const steamMat = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, roughness: 1, depthWrite: false });
  steamMat.name = 'office-steam';
  const puffs = [];
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Mesh(new THREE.IcosahedronGeometry(0.03, 1), steamMat);
    p.userData.phase = i / 4;
    p.raycast = () => {};
    g.add(p);
    puffs.push(p);
  }
  g.userData.tick = (dt, t) => {
    for (const p of puffs) {
      const k = (t * 0.35 + p.userData.phase) % 1;
      p.position.set(Math.sin(k * 9 + p.userData.phase * 6) * 0.03, 0.15 + k * 0.32, Math.cos(k * 7) * 0.02);
      p.scale.setScalar(0.6 + k * 1.2);
      p.visible = k < 0.95;
    }
    steamMat.opacity = 0.35;
  };
  return g;
}

// ------------------------------------------------------------------ radio (action target)
export function radio() {
  const T = [], G = [];
  // arched wooden cabinet
  const s = new THREE.Shape();
  s.moveTo(-0.26, 0);
  s.lineTo(0.26, 0);
  s.lineTo(0.26, 0.22);
  s.absarc(0, 0.22, 0.26, 0, Math.PI, false);
  s.lineTo(-0.26, 0);
  const cab = slab(s, 0.22, 0.02, 14);
  G.push(part(cab, '#b86a36'));
  G.push(part(slab(s, 0.012, 0.004, 14), '#8a4b22', { z: 0.116, s: 0.93, y: 0.01 }));
  const grille = new THREE.Shape();
  grille.moveTo(-0.19, 0.2);
  grille.lineTo(0.19, 0.2);
  grille.lineTo(0.19, 0.25);
  grille.absarc(0, 0.25, 0.19, 0, Math.PI, false);
  const gg = part(new THREE.ShapeGeometry(grille, 16), '#e9d3a8', { z: 0.126 });
  paintFaces(gg, (x, y, z, nx, ny, nz, c) => {
    const a = Math.atan2(y - 0.2, x);
    if (Math.floor(a / (Math.PI / 9)) % 2) c.set('#d9bb88');
  });
  T.push(gg);
  for (const x of [-0.14, 0.14]) G.push(part(puck(0.035, 0.04, 0.012, 14), CREAM, { x, y: 0.07, z: 0.125, rx: Math.PI / 2 }));
  T.push(part(rod([0.18, 0.44, -0.05], [0.34, 0.7, -0.08], 0.008, 5), P.metal));
  T.push(part(ball(0.016, 1), P.tomato, { x: 0.34, y: 0.7, z: -0.08 }));
  const g = meshGroup('radio', { toy: T, glossy: G });
  const dial = new THREE.Mesh(mergeUV([decal('dial', 0.2, 0.056, { y: 0.075, z: 0.127 })]), new THREE.MeshStandardMaterial({ map: decorAtlas().texture, emissive: '#ffb640', emissiveMap: decorAtlas().texture, emissiveIntensity: 0.0, roughness: 0.5 }));
  const [u0, v0, u1, v1] = decorAtlas().uv('dial');
  dial.material.name = 'radio-dial';
  dial.name = 'radio-dial';
  g.add(dial);
  g.userData.dialMat = dial.material;
  g.userData.grille = g.userData.meshes.toy;
  // floating music notes (pool)
  const noteShape = new THREE.Shape();
  noteShape.absellipse(0, 0, 0.045, 0.034, 0, Math.PI * 2, false, -0.4);
  const ng = new THREE.ExtrudeGeometry(noteShape, { depth: 0.015, bevelEnabled: false, curveSegments: 10 });
  ng.deleteAttribute('uv');
  const stem = new THREE.BoxGeometry(0.014, 0.13, 0.015).translate(0.038, 0.06, 0.0075);
  const flag = new THREE.BoxGeometry(0.05, 0.016, 0.015).translate(0.06, 0.12, 0.0075).rotateZ(-0.35);
  const noteGeo = merge([part(ng, '#fff'), part(stem, '#fff'), part(flag, '#fff')]);
  const notes = [];
  const cols = [P.tomato, P.cobalt, P.bubblegum, P.teal, P.tangerine];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(noteGeo, new THREE.MeshStandardMaterial({ color: cols[i], roughness: 0.5, transparent: true }));
    m.raycast = () => {};
    m.visible = false;
    m.userData.t = -i * 0.55;
    g.add(m);
    notes.push(m);
  }
  g.userData.notes = notes;
  return g;
}

// ------------------------------------------------------------------ coat rack + Jack's cap (fun target)
export function coatRack() {
  const T = [], G = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    T.push(part(rod([0, 0.12, 0], [Math.sin(a) * 0.32, 0.02, Math.cos(a) * 0.32], 0.035, 6), P.woodDark));
    T.push(part(ball(0.045, 1), P.woodDark, { x: Math.sin(a) * 0.32, y: 0.03, z: Math.cos(a) * 0.32 }));
  }
  T.push(part(new THREE.CylinderGeometry(0.035, 0.045, 1.85, 10), P.wood, { y: 0.95 }));
  T.push(part(ball(0.07, 1), P.woodDark, { y: 1.9 }));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    T.push(part(rod([0, 1.72, 0], [Math.sin(a) * 0.2, 1.84, Math.cos(a) * 0.2], 0.018, 6), P.woodDark));
    T.push(part(ball(0.03, 1), P.woodDark, { x: Math.sin(a) * 0.2, y: 1.84, z: Math.cos(a) * 0.2 }));
  }
  // striped scarf draped on a hook
  for (let i = 0; i < 9; i++) {
    T.push(part(bev(0.16, 0.1, 0.05, 0.02), i % 2 ? '#fff8ee' : P.tomato, { x: 0.18 + Math.sin(i * 0.2) * 0.02, y: 1.66 - i * 0.1, z: 0.12 + i * 0.004, rz: 0.05 }));
  }
  // hi-vis vest hanging on the other side
  const vest = part(new THREE.BoxGeometry(0.42, 0.62, 0.1, 4, 6, 1), P.tangerine, { x: -0.16, y: 1.38, z: -0.12, ry: 0.4 });
  paintFaces(vest, (x, y, z, nx, ny, nz, c) => { if (Math.abs(y - 1.3) < 0.05 || Math.abs(y - 1.46) < 0.04) c.set('#e8eef6'); });
  T.push(vest);
  const g = meshGroup('coatRack', { toy: T });
  // Jack's cap on the top hook (its own pivot: it hops when shot)
  const cap = new THREE.Group();
  cap.position.set(0.02, 1.96, 0.02);
  const C = [
    part(new THREE.SphereGeometry(0.14, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), P.cobalt, { sy: 0.8 }),
    part(puck(0.14, 0.03, 0.01, 18), '#2c55c2', { y: 0.005 }),
    part(new THREE.CylinderGeometry(0.13, 0.13, 0.02, 18, 1, false, -Math.PI * 0.42, Math.PI * 0.84), '#2c55c2', { y: 0.005, z: 0.1, sz: 1.25 }),
    part(ball(0.025, 1), P.sunflower, { y: 0.115 }),
    part(puck(0.045, 0.012, 0.004, 14), P.sunflower, { y: 0.07, z: 0.118, rx: Math.PI / 2 - 0.5 }),
  ];
  const cm = new THREE.Mesh(merge(C), materials.toy);
  cm.castShadow = true;
  cap.add(cm);
  cap.rotation.set(-0.15, 0.6, 0.1);
  g.add(cap);
  g.userData.cap = cap;
  return g;
}

// ------------------------------------------------------------------ potted plant (static)
export function pottedPlant({ seed = 1, size = 1, pot = P.roofTerracotta } = {}) {
  const T = [latheBands([[0, 0], [0.2, 0], [0.24, 0.36], [0.28, 0.38], [0.28, 0.46], [0.24, 0.46], [0.22, 0.42], [0, 0.42]], 16, (y, i) => (i >= 3 ? '#f08a5e' : pot))];
  T.push(part(puck(0.22, 0.03, 0.01, 16), '#6b4a30', { y: 0.43 }));
  const g = meshGroup('plant', { toy: T.map((x) => x.applyMatrix4(xform({ s: size }))) });
  const b = bush({ seed, size: 0.62 * size });
  b.position.y = 0.36 * size;
  b.scale.set(0.9, 1.25, 0.9);
  g.add(b);
  return g;
}

// ------------------------------------------------------------------ filing cabinet = SETTINGS (action)
export function filingCabinet() {
  const G = [], T = [];
  const col = '#8fd3b8';
  G.push(part(rbox(0.66, 1.32, 0.7, 0.05), col, { y: 0.66 }));
  for (let i = 1; i < 3; i++) {
    G.push(part(bev(0.58, 0.38, 0.04, 0.02), '#a6e0c9', { y: 0.2 + i * 0.42 - 0.36 + 0.02, z: 0.35 }));
    G.push(part(bev(0.2, 0.04, 0.05, 0.02), CHROME, { y: 0.2 + i * 0.42 - 0.36 + 0.02 - 0.1, z: 0.38 }));
  }
  const D = [decal('drawer1', 0.2, 0.066, { y: 0.52 + 0.02 + 0.07 - 0.36 + 0.42 - 0.42 + 0.0, z: 0.372 })];
  const g = meshGroup('filingCabinet', { glossy: G, decal: [] });
  // labels for the two lower drawers
  const labels = new THREE.Mesh(mergeUV([
    decal('drawer2', 0.2, 0.066, { y: 0.14, z: 0.373 }),
    decal('drawer1', 0.2, 0.066, { y: 0.56, z: 0.373 }),
  ]), decorAtlas().material);
  labels.name = 'cabinet-labels';
  g.add(labels);
  // top drawer = settings (slides out when shot)
  const drawer = new THREE.Group();
  drawer.position.set(0, 1.04, 0.35);
  const DG = [
    part(bev(0.58, 0.38, 0.04, 0.02), '#a6e0c9'),
    part(bev(0.24, 0.05, 0.06, 0.02), CHROME, { y: -0.1, z: 0.03 }),
    part(bev(0.56, 0.34, 0.5, 0.02), '#7cc2a6', { z: -0.26 }),
  ];
  for (let i = 0; i < 5; i++) DG.push(part(bev(0.5, 0.3, 0.012, 0.004), i % 2 ? '#fff8ee' : '#ffe590', { y: 0.06, z: -0.1 - i * 0.07, rx: -0.1 }));
  const dm = new THREE.Mesh(merge(DG), materials.glossy);
  dm.castShadow = true;
  drawer.add(dm);
  const lab = new THREE.Mesh(mergeUV([decal('drawer0', 0.3, 0.1, { y: 0.06, z: 0.022 })]), decorAtlas().material);
  drawer.add(lab);
  g.add(drawer);
  g.userData.drawer = drawer;
  // cactus on top
  const C = [
    latheBands([[0, 0], [0.09, 0], [0.11, 0.14], [0.12, 0.15], [0, 0.15]], 12, (y, i) => (i === 2 ? '#f08a5e' : P.roofTerracotta), { y: 1.32 }),
    part(new THREE.CapsuleGeometry(0.055, 0.16, 4, 10), '#4fae5a', { y: 1.58 }),
    part(new THREE.CapsuleGeometry(0.03, 0.07, 3, 8), '#4fae5a', { x: 0.07, y: 1.57, rz: -0.8 }),
    part(ball(0.03, 1), P.bubblegum, { y: 1.72 }),
  ];
  const cact = new THREE.Mesh(merge(C), materials.toy);
  cact.castShadow = true;
  g.add(cact);
  return g;
}

// ------------------------------------------------------------------ chalkboard easel = MODES
export function chalkEasel() {
  const T = [];
  const bw = 1.2, bh = 0.8, lean = -0.18;
  // legs
  for (const s of [-1, 1]) T.push(part(bev(0.06, 1.75, 0.06, 0.02), P.wood, { x: s * 0.55, y: 0.86, z: 0.02, rx: lean, rz: -s * 0.04 }));
  T.push(part(bev(0.06, 1.7, 0.06, 0.02), P.woodDark, { y: 0.8, z: -0.42, rx: 0.3 }));
  // frame + tray + chalk + eraser
  const fy = 1.12;
  const frame = [part(bev(bw + 0.12, 0.08, 0.06, 0.025), P.woodLight, { y: bh / 2 + 0.04 }), part(bev(bw + 0.12, 0.08, 0.06, 0.025), P.woodLight, { y: -bh / 2 - 0.04 })];
  for (const s of [-1, 1]) frame.push(part(bev(0.08, bh + 0.16, 0.06, 0.025), P.woodLight, { x: s * (bw / 2 + 0.04) }));
  frame.push(part(bev(bw, bh, 0.03, 0.01), '#2f5a4e', { z: -0.01 }));
  frame.push(part(bev(bw + 0.1, 0.03, 0.12, 0.01), P.woodLight, { y: -bh / 2 - 0.08, z: 0.06 }));
  for (const [x, c] of [[-0.3, '#fff8ee'], [-0.22, '#ffe590'], [-0.15, '#ffb3c7']]) frame.push(part(new THREE.CapsuleGeometry(0.012, 0.07, 3, 6), c, { x, y: -bh / 2 - 0.05, z: 0.07, rz: Math.PI / 2 + 0.1 }));
  frame.push(part(bev(0.14, 0.05, 0.06, 0.015), P.cobalt, { x: 0.35, y: -bh / 2 - 0.04, z: 0.07 }));
  frame.push(part(bev(0.14, 0.03, 0.06, 0.01), '#e8e1d0', { x: 0.35, y: -bh / 2 - 0.075, z: 0.07 }));
  const t = { y: fy, z: 0.07, rx: lean };
  for (const f of frame) T.push(f.applyMatrix4(xform(t)));
  const D = [decal('chalk', bw - 0.02, bh - 0.02, { y: 0.0, z: 0.007 }).applyMatrix4(xform(t))];
  return meshGroup('chalkboard', { toy: T, decal: D });
}

// ------------------------------------------------------------------ workbench + pegboard + rifle = WORKSHOP
function toolParts(L) {
  // hammer
  L.push(part(bev(0.05, 0.36, 0.04, 0.015), P.woodLight, { x: -0.72, y: 0.02 }));
  L.push(part(bev(0.18, 0.07, 0.07, 0.02), P.metalDark, { x: -0.72, y: 0.2 }));
  // spanner
  const sp = new THREE.Shape();
  sp.moveTo(-0.02, -0.16);
  sp.lineTo(0.02, -0.16);
  sp.lineTo(0.02, 0.1);
  sp.absarc(0, 0.14, 0.055, -0.6, Math.PI + 0.6, false);
  sp.lineTo(-0.02, 0.1);
  sp.closePath();
  L.push(part(slab(sp, 0.02, 0.006, 6), '#aab4c4', { x: -0.42, y: 0.04 }));
  // saw
  const saw = new THREE.Shape();
  saw.moveTo(-0.02, 0.12);
  saw.lineTo(0.06, 0.12);
  saw.lineTo(0.03, -0.3);
  saw.lineTo(-0.02, -0.3);
  L.push(part(slab(saw, 0.01, 0.003, 2), '#d8dee8', { x: -0.08, y: 0.04 }));
  L.push(part(bev(0.12, 0.14, 0.04, 0.03), P.tomato, { x: -0.06, y: 0.2 }));
  // screwdrivers
  for (const [x, c] of [[0.2, P.sunflower], [0.3, P.teal], [0.4, P.tomato]]) {
    L.push(part(rod([x, -0.2, 0], [x, 0.0, 0], 0.01, 6), '#c9d2de'));
    L.push(part(new THREE.CapsuleGeometry(0.025, 0.08, 3, 8), c, { x, y: 0.07 }));
  }
  // pliers + tape measure
  L.push(part(rod([0.6, -0.14, 0], [0.64, 0.12, 0], 0.016, 6), P.cobalt));
  L.push(part(rod([0.68, -0.14, 0], [0.64, 0.12, 0], 0.016, 6), P.cobalt));
  L.push(part(puck(0.07, 0.04, 0.012, 14), P.sunflower, { x: 0.86, y: 0.02, rx: Math.PI / 2 }));
}

export function workbench() {
  const T = [], G = [], M = [];
  const w = 2.2, d = 0.8, h = 0.95;
  T.push(part(bev(w, 0.1, d, 0.035), P.woodLight, { y: h - 0.05 }));
  for (let i = 0; i < 6; i++) T.push(part(bev(0.012, 0.101, d - 0.02, 0.002), '#c78e53', { x: -w / 2 + (i + 1) * (w / 7), y: h - 0.05 }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) T.push(part(bev(0.1, h - 0.1, 0.1, 0.02), P.wood, { x: sx * (w / 2 - 0.1), y: (h - 0.1) / 2, z: sz * (d / 2 - 0.1) }));
  T.push(part(bev(w - 0.1, 0.05, d - 0.1, 0.015), P.wood, { y: 0.22 }));
  // under-shelf: toolbox + paint tins
  G.push(part(bev(0.6, 0.28, 0.32, 0.05), P.tomato, { x: -0.5, y: 0.39 }));
  G.push(part(bev(0.62, 0.05, 0.34, 0.02), '#d9443a', { x: -0.5, y: 0.53 }));
  T.push(part(arc(0.1, 0.018, Math.PI, 5, 8), DARK, { x: -0.5, y: 0.555 }));
  for (const [x, c] of [[0.3, P.cobalt], [0.55, P.sunflower], [0.8, P.teal]]) {
    G.push(latheBands([[0, 0], [0.1, 0], [0.1, 0.18], [0.08, 0.2], [0, 0.2]], 14, (y, i) => (i === 2 ? CHROME : c), { x, y: 0.245 }));
  }
  // vice at the front-left corner
  G.push(part(bev(0.24, 0.16, 0.22, 0.03), P.cobalt, { x: -0.85, y: h + 0.08, z: d / 2 - 0.1 }));
  G.push(part(bev(0.2, 0.14, 0.06, 0.02), P.cobalt, { x: -0.85, y: h + 0.07, z: d / 2 + 0.04 }));
  M.push(part(rod([-0.85, h + 0.06, d / 2 + 0.08], [-0.85, h + 0.06, d / 2 + 0.22], 0.018, 6), CHROME));
  M.push(part(rod([-0.97, h + 0.06, d / 2 + 0.22], [-0.73, h + 0.06, d / 2 + 0.22], 0.014, 6), CHROME));
  // bits on the top: jar of screws, hammer, a birdhouse in progress
  G.push(latheBands([[0, 0], [0.07, 0], [0.07, 0.14], [0.05, 0.16], [0.05, 0.18], [0, 0.18]], 12, (y, i) => (i >= 3 ? P.tomato : '#bfe3ff'), { x: 0.75, y: h, z: 0.1 }));
  T.push(part(bev(0.3, 0.22, 0.26, 0.03), P.woodLight, { x: 0.2, y: h + 0.11, z: 0.0, ry: 0.3 }));
  T.push(part(new THREE.ConeGeometry(0.24, 0.16, 4), P.tomato, { x: 0.2, y: h + 0.3, z: 0.0, ry: 0.3 + Math.PI / 4 }));
  T.push(part(puck(0.05, 0.02, 0.006, 12), DARK, { x: 0.2 + Math.sin(0.3) * 0.13, y: h + 0.13, z: Math.cos(0.3) * 0.13, rx: Math.PI / 2, ry: 0.3 }));
  // pegboard on the wall behind (z = -d/2 side is the wall)
  const pz = -d / 2 - 0.02;
  T.push(part(bev(2.1, 1.2, 0.04, 0.02), '#d9b77e', { y: h + 0.75, z: pz }));
  for (let r = 0; r < 9; r++) for (let c = 0; c < 16; c++) T.push(part(new THREE.CircleGeometry(0.012, 5), '#a88450', { x: -0.95 + c * 0.127, y: h + 0.23 + r * 0.13, z: pz + 0.021 }));
  const tools = [];
  toolParts(tools);
  for (const tp of tools) T.push(tp.applyMatrix4(xform({ y: h + 0.8, z: pz + 0.05 })));
  // rifle rack: two pegs + Jack's spare rifle
  const ry = h + 1.6;
  for (const x of [-0.45, 0.45]) {
    T.push(part(rod([x, ry, pz], [x, ry + 0.04, pz + 0.16], 0.03, 8), P.woodDark));
    T.push(part(ball(0.04, 1), P.woodDark, { x, y: ry + 0.05, z: pz + 0.17 }));
  }
  const R = [];
  R.push(part(rbox(0.36, 0.14, 0.07, 0.03), '#9a5b2e', { x: 0.62, y: -0.02 }));
  R.push(part(rbox(0.5, 0.07, 0.07, 0.025), '#b8743f', { x: -0.3 }));
  R.push(part(rbox(0.3, 0.08, 0.075, 0.02), '#4b5b82', { x: 0.24, y: 0.03 }));
  R.push(part(new THREE.CylinderGeometry(0.02, 0.024, 0.66, 10), '#4b5b82', { x: -0.72, y: 0.03, rz: Math.PI / 2 }));
  R.push(part(new THREE.CylinderGeometry(0.036, 0.036, 0.34, 14), P.cobalt, { x: 0.2, y: 0.12, rz: Math.PI / 2 }));
  R.push(part(new THREE.CylinderGeometry(0.05, 0.036, 0.09, 14), P.cobalt, { x: -0.01, y: 0.12, rz: Math.PI / 2 }));
  for (const x of [-0.05, 0.38]) R.push(part(new THREE.CylinderGeometry(0.052, 0.052, 0.025, 14), P.sunflower, { x, y: 0.12, rz: Math.PI / 2 }));
  G.push(...R.map((x) => x.applyMatrix4(xform({ y: ry + 0.1, z: pz + 0.12 }))));
  const D = [decal('workshop', 1.1, 0.275, { y: h + 1.98, z: pz + 0.03 })];
  const g = meshGroup('workbench', { toy: T, glossy: G, metal: M, decal: D });
  return g;
}

// ------------------------------------------------------------------ wall clock (fun target, live hands)
export function wallClock() {
  const T = [], G = [];
  G.push(part(new THREE.TorusGeometry(0.3, 0.05, 10, 32), P.tomato));
  T.push(part(puck(0.3, 0.03, 0.01, 32), '#fff8ee', { rx: Math.PI / 2, z: -0.01 }));
  G.push(part(ball(0.04, 1), P.sunflower, { y: 0.36 }));
  const g = meshGroup('clock', { toy: T, glossy: G, decal: [decal('clock', 0.54, 0.54, { z: 0.008 })] });
  const handMat = materials.toy;
  const mk = (len, w, c) => {
    const p = new THREE.Group();
    const m = new THREE.Mesh(merge([part(bev(w, len, 0.015, 0.006), c, { y: len / 2 - 0.03 })]), handMat);
    p.add(m);
    p.position.z = 0.025;
    g.add(p);
    return p;
  };
  const hour = mk(0.16, 0.035, P.ink);
  const minute = mk(0.24, 0.025, P.ink);
  const sec = mk(0.25, 0.01, P.tomato);
  sec.position.z = 0.032;
  g.userData.hands = { hour, minute, sec };
  g.userData.spin = 0;
  g.userData.tick = (dt) => {
    const d = new Date();
    const s = d.getSeconds() + d.getMilliseconds() / 1000;
    const m = d.getMinutes() + s / 60;
    const h = (d.getHours() % 12) + m / 60;
    g.userData.spin = Math.max(0, g.userData.spin - dt);
    const extra = g.userData.spin > 0 ? (2 - g.userData.spin) * 40 : 0;
    hour.rotation.z = -(h / 12) * Math.PI * 2 - extra * 0.1;
    minute.rotation.z = -(m / 60) * Math.PI * 2 - extra;
    sec.rotation.z = -(s / 60) * Math.PI * 2;
  };
  return g;
}

// ------------------------------------------------------------------ static decor bundle
export function rug() {
  const rings = [P.tomato, '#fff4e0', P.sunflower, P.teal, '#fff4e0', P.tomato, P.cobalt, P.sunflower];
  const L = [];
  const n = rings.length;
  for (let i = 0; i < n; i++) {
    const r0 = (i / n), r1 = ((i + 1) / n);
    const g = new THREE.RingGeometry(r0, r1, 48, 1).rotateX(-Math.PI / 2);
    L.push(part(g, rings[n - 1 - i], { y: 0.012 + i * 0.0006, sx: 1.9, sz: 1.3 }));
  }
  L.push(part(new THREE.CylinderGeometry(1, 1, 0.012, 48), '#e8a855', { y: 0.006, sx: 1.92, sz: 1.32 }));
  return L;
}

export function bin() {
  const L = [latheBands([[0, 0], [0.17, 0], [0.2, 0.36], [0.21, 0.37], [0.19, 0.37], [0.18, 0.02], [0, 0.02]], 16, (y, i) => (i === 2 ? P.sunflower : P.cobalt))];
  const rng = new Rng('bin');
  for (let i = 0; i < 5; i++) L.push(part(new THREE.IcosahedronGeometry(0.07, 0), '#fff8ee', { x: rng.range(-0.08, 0.08), y: 0.3 + rng.range(0, 0.08), z: rng.range(-0.08, 0.08), ry: rng.range(0, 3) }));
  L.push(part(new THREE.IcosahedronGeometry(0.07, 0), '#fff8ee', { x: 0.3, y: 0.05, z: 0.12 }));
  return L;
}

export function radiator() {
  const L = [];
  for (let i = 0; i < 9; i++) L.push(part(rbox(0.12, 0.62, 0.12, 0.05), '#f4f6fa', { x: -0.5 + i * 0.125, y: 0.46 }));
  L.push(part(rod([-0.58, 0.2, 0], [0.58, 0.2, 0], 0.025, 8), '#e2e6ee'));
  L.push(part(rod([-0.58, 0.72, 0], [0.58, 0.72, 0], 0.025, 8), '#e2e6ee'));
  L.push(part(puck(0.04, 0.05, 0.01, 10), P.tomato, { x: 0.62, y: 0.2, rz: Math.PI / 2 }));
  return L;
}

export function frame(w, h, color = P.woodDark, depth = 0.04) {
  const b = 0.05;
  return [
    part(bev(w + b * 2, b, depth, 0.015), color, { y: h / 2 + b / 2 }),
    part(bev(w + b * 2, b, depth, 0.015), color, { y: -h / 2 - b / 2 }),
    part(bev(b, h, depth, 0.015), color, { x: -w / 2 - b / 2 }),
    part(bev(b, h, depth, 0.015), color, { x: w / 2 + b / 2 }),
    part(bev(w + 0.02, h + 0.02, 0.012, 0.004), '#e8dcc3', { z: -depth / 2 + 0.005 }),
  ];
}

export function extinguisher() {
  return [
    part(new THREE.CapsuleGeometry(0.09, 0.36, 4, 12), P.tomato, { y: 0.28 }),
    part(new THREE.CylinderGeometry(0.04, 0.05, 0.08, 10), DARK, { y: 0.54 }),
    part(bev(0.16, 0.03, 0.04, 0.01), DARK, { x: 0.04, y: 0.6 }),
    part(new THREE.TorusGeometry(0.06, 0.012, 5, 10, Math.PI), DARK, { x: -0.07, y: 0.48, rz: Math.PI / 2 }),
    part(bev(0.12, 0.1, 0.012, 0.004), '#fff8ee', { y: 0.3, z: 0.09 }),
  ];
}

export function bunting(from, to, n = 13, sag = 0.22) {
  const L = [];
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const k = i / 20;
    const p = new THREE.Vector3().lerpVectors(from, to, k);
    p.y -= Math.sin(Math.PI * k) * sag;
    pts.push(p);
  }
  L.push(part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.01, 4), '#fff8ee'));
  const cols = [P.tomato, P.sunflower, P.teal, P.bubblegum, P.cobalt, P.tangerine];
  const dir = new THREE.Vector3().subVectors(to, from);
  const ry = -Math.atan2(dir.z, dir.x);
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) / n;
    const p = new THREE.Vector3().lerpVectors(from, to, k);
    p.y -= Math.sin(Math.PI * k) * sag;
    const tri = new THREE.Shape();
    tri.moveTo(-0.11, 0);
    tri.lineTo(0.11, 0);
    tri.lineTo(0, -0.24);
    tri.closePath();
    const g = new THREE.ShapeGeometry(tri);
    L.push(part(g, cols[i % cols.length], { x: p.x, y: p.y, z: p.z, ry, rx: 0.08 }));
    L.push(part(g, cols[i % cols.length], { x: p.x, y: p.y, z: p.z - 0.004 * Math.cos(ry), ry: ry + Math.PI, rx: -0.08 }));
  }
  return L;
}

/** Collider box (invisible, raycastable) in the parent's space. */
export const hitBox = (w, h, d, t) => boxCollider(w, h, d, t);
