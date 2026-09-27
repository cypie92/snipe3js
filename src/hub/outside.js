// The world outside Jack's HQ, seen over the cutaway walls by the long-lens hub camera.
// The office sits at the foot of a gentle bank; a sandy lane runs along the terrace above it with
// Jack's van parked on the verge (mast stowed); patchwork fields and hedgerows roll away to
// Puddleby's rooftops, a church spire and a windmill, then soft hills. Everything is toy-scaled so it
// fits the band above the walls. Cheap by design: ~18 draw calls (terrain, garden, garden hedges, far toy,
// hedgerows, tree trunks + crowns, sails, van x3, flowers x2, clouds, 4 sheep); only the garden casts
// shadows. The establishing shot of the office's entry push-in shows all of it.
// Space: room space (floor top y = 0, open side +Z); the ground is at ROOM ground level GY.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { part, merge, xform, jitter } from '../world/geo.js';
import { materials } from '../gfx/materials.js';
import { P } from '../gfx/palette.js';
import { Rng, hash3 } from '../core/rng.js';
import { bev, puck, ball, paintFaces } from '../world/kit/props/lib.js';
import { hedgeBlock, scatterFlowers } from '../world/kit/nature/index.js';
import { createPerch } from '../world/perch/index.js';
import { Sheep } from '../world/characters/index.js';
import { ROOM } from './room.js';

const GY = -ROOM.slab - 0.06;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

/** Smooth value noise in [0,1). */
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const fx = x - xi, fz = z - zi;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash3(xi, 0, zi), b = hash3(xi + 1, 0, zi), c = hash3(xi, 0, zi + 1), d = hash3(xi + 1, 0, zi + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

// Lane centreline (xz): along the terrace behind the office, then winding up to the village.
const LANE = [[-420, -72], [-160, -72.5], [-60, -73], [-17, -73.2], [22, -73.6], [48, -84], [62, -110], [63, -150], [56, -200], [48, -245], [42, -278]];
// Footpath from the garden gate up the bank to the lane gate.
const PATH = [[-5.6, -1.2], [-7.5, -8], [-10, -20], [-15, -36], [-20, -52], [-23.5, -64], [-24, -70.5]];
export const OUTSIDE = {
  van: { x: -15.5, z: -73.1, ry: -2.3 },
  village: [50, -312],
  windmill: [72, -352],
  church: [30, -300],
  gate: -24,
};
const BACK = ROOM.z0 - ROOM.t; // outer face of the back wall

function segments(pts) {
  const segs = [];
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    segs.push({ ax, az, dx: bx - ax, dz: bz - az, len, s0: acc });
    acc += len;
  }
  return segs;
}
const SEGS = segments(LANE);
const PATH_SEGS = segments(PATH);

/** Nearest point on the lane (or another polyline): { d, x, z, s (arc length) }. */
function laneAt(x, z, list = SEGS) {
  let best = { d: Infinity, x: 0, z: 0, s: 0 };
  for (const g of list) {
    const t = Math.min(1, Math.max(0, ((x - g.ax) * g.dx + (z - g.az) * g.dz) / (g.len * g.len)));
    const px = g.ax + g.dx * t, pz = g.az + g.dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, x: px, z: pz, s: g.s0 + g.len * t };
  }
  return best;
}

/** Terrain height above GY before the lane is cut in. */
function baseHeight(x, z) {
  const s = BACK - z; // metres behind the back wall
  let h = 2.2 * smooth(8, 62, s) + 1.0 * smooth(80, 320, s);
  h += (vnoise(x * 0.02 + 3, z * 0.02 + 7) - 0.5) * 0.9 * smooth(85, 170, s);
  const d = Math.hypot(x - 20, z + 60);
  h += smooth(440, 860, d) * (5 + 14 * vnoise(x * 0.0042 + 11, z * 0.0042 + 5)); // soft far hills in the haze
  const [wx, wz] = OUTSIDE.windmill;
  h += 1.1 * Math.exp(-((x - wx) ** 2 + (z - wz) ** 2) / 500);
  return h;
}

/** Terrain height above GY (lane flattened across its width). */
export function heightAt(x, z) {
  const h = baseHeight(x, z);
  const L = laneAt(x, z);
  if (L.d > 7) return h;
  return lerp(h, baseHeight(L.x, L.z) - 0.04, smooth(6.5, 2.6, L.d));
}

// --------------------------------------------------------------------------- terrain
/** Grid coordinates from control points [[value, step], ...]: the spacing eases between them. */
function spaced(ctrl) {
  const out = [ctrl[0][0]];
  const end = ctrl.at(-1)[0];
  let v = ctrl[0][0], i = 0;
  while (v < end - 1e-6) {
    while (i < ctrl.length - 2 && v >= ctrl[i + 1][0]) i++;
    const [a, sa] = ctrl[i], [b, sb] = ctrl[i + 1];
    v = Math.min(end, v + sa + (sb - sa) * Math.min(1, Math.max(0, (v - a) / (b - a))));
    out.push(v);
  }
  return out;
}

const FIELDS = [['#7cc653', 5], ['#8fd35e', 3.4], ['#68b548', 3], ['#a6da6c', 2.4], ['#e9d267', 1.6], ['#d8c071', 1.1], ['#c79a64', 1.1], ['#b9d26a', 1.4], ['#b6a4d2', 0.35]];
const FIELD_SUM = FIELDS.reduce((s, f) => s + f[1], 0);
function fieldAt(x, z) {
  const jx = (vnoise(z * 0.03, 4.1) - 0.5) * 16, jz = (vnoise(x * 0.03, 9.7) - 0.5) * 12;
  const cx = Math.floor((x + 2000 + jx) / 46), cz = Math.floor((z + 2000 + jz) / 34);
  let r = hash3(cx, 3, cz) * FIELD_SUM;
  for (const [col, w] of FIELDS) { r -= w; if (r <= 0) return { col, cx, cz }; }
  return { col: FIELDS[0][0], cx, cz };
}

const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 });
terrainMat.name = 'office-terrain';

function terrain() {
  // fine where the hub camera looks (the bank, the lane, the fields up to the village), coarse beyond
  const xs = spaced([[-1300, 100], [-300, 22], [-100, 3.5], [-90, 3], [130, 3], [150, 4], [400, 24], [1300, 100]]);
  const zs = spaced([[-1500, 100], [-700, 36], [-380, 6], [-80, 2.5], [14, 2.5], [80, 10], [420, 60]]);
  const nx = xs.length, nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = (j * nx + i) * 3;
    pos[k] = xs[i];
    pos[k + 1] = heightAt(xs[i], zs[j]);
    pos[k + 2] = zs[j];
  }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    // alternate the diagonal for a softer facet pattern; CCW seen from above
    if ((i + j) % 2) idx.push(a, c, b, b, c, d);
    else idx.push(a, c, d, a, d, b);
  }
  const g0 = new THREE.BufferGeometry();
  g0.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g0.setIndex(idx);
  const g = part(g0, '#7cc653');
  const { x: vx, z: vz, ry } = OUTSIDE.van;
  const cr = Math.cos(ry), sr = Math.sin(ry);
  const col = new THREE.Color();
  paintFaces(g, (x, y, z, fnx, fny, fnz, c) => {
    const s = BACK - z;
    const L = laneAt(x, z);
    const fp = s > 0 && s < 72 ? laneAt(x, z, PATH_SEGS).d : 9;
    if (L.d < 1.9) c.set((hash3(Math.floor(x), 1, Math.floor(z)) > 0.5) ? '#e6d3a3' : '#dcc794');
    else if (L.d < 2.7) c.set('#9ccf60');
    else if (fp < 1.1) c.set('#9ccb62'); // worn grass along the stepping stones
    else if (s < 44 && Math.abs(x) < 120) {
      // garden lawn with mowing stripes near the office, a plain meadow bank behind
      if (s < 2 && Math.abs(x) < 16) c.set(Math.floor((x + 100) / 1.6) % 2 ? '#7fc957' : '#76bf50');
      else if (s < 2) c.set('#7cc653');
      else c.set(vnoise(x * 0.12, z * 0.12) > 0.62 ? '#86cd5c' : '#7ac452'); // meadow bank, a few lighter patches
    } else {
      const f = fieldAt(x, z);
      c.set(f.col);
      // crop rows on the yellow/brown fields
      if (f.col === '#e9d267' || f.col === '#c79a64' || f.col === '#d8c071') {
        if (Math.floor((x + 2000) / 3.2) % 2) c.multiplyScalar(0.93);
      }
      c.lerp(col.set('#9fbfd6'), smooth(260, 900, Math.hypot(x, z)) * 0.25);
    }
    // soft contact shadow under the van
    const lx = (x - vx) * cr - (z - vz) * sr, lz = (x - vx) * sr + (z - vz) * cr;
    const e = Math.hypot(lx / 1.9, (lz + 1.7) / 3.6);
    if (e < 1) c.multiplyScalar(0.62 + 0.38 * smooth(0.35, 1, e));
    c.multiplyScalar(0.93 + fny * 0.07);
  });
  // baked per-face normals + smooth shading (derivative flat shading NaNs on grazing far triangles)
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, terrainMat);
  mesh.name = 'officeTerrain';
  mesh.position.y = GY;
  mesh.receiveShadow = true;
  return mesh;
}

// --------------------------------------------------------------------------- foliage
const LEAF = ['#3f8f3a', '#5aaa45', '#86cc58', '#b0e078'];
const LEAF_DARK = ['#2f7a3a', '#428f40', '#63ad4c', '#8cc862'];
const _c2 = new THREE.Color();
function rampCol(stops, t, out) {
  t = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t));
  return out.set(stops[i]).lerp(_c2.set(stops[i + 1]), t - i);
}
function leafy(geo, stops, seed = 0) {
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  const h = Math.max(0.01, max.y - min.y);
  return paintFaces(geo, (x, y, z, nx, ny, nz, c) => {
    rampCol(stops, ((y - min.y) / h) * 0.7 + Math.max(0, ny) * 0.35 + (hash3(x * 3 + seed, y * 3, z * 3) - 0.5) * 0.3, c);
  });
}

/** Hedgerow bush lump (instanced). */
function hedgeLump() {
  const g = part(jitter(new THREE.IcosahedronGeometry(0.8, 1), 0.12, 3), '#fff', { y: 0.55, sy: 0.75, sx: 1.25 });
  return leafy(g, LEAF_DARK, 2);
}

/** Lollipop tree parts: { trunk, crown } (merged later). */
function lollipop(rng, type, t) {
  const m = xform(t);
  const trunk = part(new THREE.CylinderGeometry(0.16, 0.24, 1.9, 6, 1, true), '#7a4a26', { y: 0.95 });
  let crown;
  if (type === 'conifer') {
    crown = merge([
      part(new THREE.ConeGeometry(1.25, 2.1, 7), '#fff', { y: 2.2 }),
      part(new THREE.ConeGeometry(0.95, 1.7, 7), '#fff', { y: 3.2 }),
      part(new THREE.ConeGeometry(0.6, 1.3, 7), '#fff', { y: 4.1 }),
    ]);
    leafy(crown, ['#24704a', '#2f8a52', '#4fa85e', '#86c96e'], rng.int(0, 99));
  } else {
    const L = [part(jitter(new THREE.IcosahedronGeometry(1.35, 1), 0.14, rng.int(0, 99)), '#fff', { y: 2.9, sy: 0.9 })];
    for (let i = 0; i < 2; i++) {
      const a = rng.range(0, Math.PI * 2);
      L.push(part(jitter(new THREE.IcosahedronGeometry(0.85, 1), 0.1, rng.int(0, 99)), '#fff', { x: Math.cos(a) * 0.8, y: 2.6 + rng.range(-0.2, 0.3), z: Math.sin(a) * 0.8 }));
    }
    crown = merge(L);
    leafy(crown, type === 'blossom' ? ['#dd6f98', '#f491b8', '#ffb3cf', '#ffcfe1'] : type === 'dark' ? LEAF_DARK : LEAF, rng.int(0, 99));
    if (type === 'fruit') { // a few red apples dotted on the crown
      const apples = [];
      for (let i = 0; i < 9; i++) {
        const a = rng.range(0, Math.PI * 2), e = rng.range(-0.2, 0.9);
        apples.push(part(new THREE.IcosahedronGeometry(0.13, 0), P.tomato, { x: Math.cos(a) * Math.cos(e) * 1.35, y: 2.9 + Math.sin(e) * 1.2, z: Math.sin(a) * Math.cos(e) * 1.35 }));
      }
      crown = merge([crown, ...apples]);
    }
  }
  return { trunk: trunk.applyMatrix4(m), crown: crown.applyMatrix4(m) };
}

// --------------------------------------------------------------------------- village + windmill
function house(K, rng, x, z, ry, s = 1) {
  const y = GY + heightAt(x, z) - 0.3;
  const w = rng.range(3.2, 4.6) * s, d = rng.range(2.8, 3.4) * s, h = rng.range(2.5, 3.2) * s;
  const wall = rng.pick(['#fff1d6', '#ffc9a3', '#fff8ee', '#ffe590', '#dccbf3', '#bfe8cc', '#ffb8c2']);
  const roof = rng.pick([P.roofTerracotta, P.roofBrick, P.roofSlate, '#2f9e91']);
  const t = xform({ x, y, z, ry });
  const at = (geo, c, tt) => K.push(part(geo, c, t.clone().multiply(xform(tt))));
  at(new THREE.BoxGeometry(w, h + 0.3, d), wall, { y: (h + 0.3) / 2 });
  const tri = new THREE.Shape();
  tri.moveTo(-d / 2 - 0.35, 0); tri.lineTo(d / 2 + 0.35, 0); tri.lineTo(0, d * 0.62); tri.closePath();
  const roofG = new THREE.ExtrudeGeometry(tri, { depth: w + 0.4, bevelEnabled: false });
  roofG.translate(0, 0, -(w + 0.4) / 2);
  at(roofG, roof, { y: h + 0.3, ry: Math.PI / 2 });
  at(new THREE.BoxGeometry(0.5, 1.3, 0.5), P.brick, { x: w * 0.28, y: h + d * 0.45 });
  // a door and two windows on the front (+Z)
  at(new THREE.BoxGeometry(0.7, 1.3, 0.08), P.cobalt, { y: 0.65, z: d / 2 + 0.04 });
  for (const sx of [-1, 1]) at(new THREE.BoxGeometry(0.75, 0.7, 0.08), '#bfe3ff', { x: sx * w * 0.3, y: h * 0.62, z: d / 2 + 0.04 });
}

function church(K, x, z, ry, sc = 1) {
  const y = GY + heightAt(x, z) - 0.3;
  const t = xform({ x, y, z, ry, s: sc });
  const at = (geo, c, tt) => K.push(part(geo, c, t.clone().multiply(xform(tt))));
  const stone = '#e2bf86';
  at(new THREE.BoxGeometry(3.6, 3.4, 7), stone, { y: 1.7, z: -3.2 });
  const tri = new THREE.Shape();
  tri.moveTo(-2.1, 0); tri.lineTo(2.1, 0); tri.lineTo(0, 2.1); tri.closePath();
  const r = new THREE.ExtrudeGeometry(tri, { depth: 7.4, bevelEnabled: false });
  r.translate(0, 0, -3.7);
  at(r, P.roofSlate, { y: 3.4, z: -3.2 });
  at(new THREE.BoxGeometry(2.6, 6.4, 2.6), stone, { y: 3.2 });
  at(new THREE.BoxGeometry(2.9, 0.4, 2.9), '#e2c998', { y: 6.4 });
  at(new THREE.ConeGeometry(1.75, 4.2, 4), P.roofSlate, { y: 8.7, ry: Math.PI / 4 });
  at(new THREE.OctahedronGeometry(0.3, 0), P.gold, { y: 11.0 });
  at(new THREE.CylinderGeometry(0.55, 0.55, 0.1, 16), '#fff8ee', { y: 4.6, z: 1.33, rx: Math.PI / 2 });
}

function windmill(K, x, z, faceA, sc = 1) {
  const y = GY + heightAt(x, z) - 0.4;
  const t = xform({ x, y, z, ry: faceA, s: sc });
  const at = (geo, c, tt) => K.push(part(geo, c, t.clone().multiply(xform(tt))));
  // brick-red tower + dark cap: reads against the hazy sky (a cream one vanished)
  at(new THREE.CylinderGeometry(1.45, 2.1, 5.6, 8), ['#b8483a', '#d45f45'], { y: 2.8 });
  at(new THREE.CylinderGeometry(2.3, 2.3, 0.3, 8), P.woodDark, { y: 2.4 });
  at(new THREE.ConeGeometry(1.75, 1.9, 8), '#4a3a44', { y: 6.5 });
  at(new THREE.BoxGeometry(0.9, 1.5, 0.3), P.woodDark, { y: 0.75, z: 1.95 });
  at(new THREE.BoxGeometry(0.6, 0.7, 0.3), '#3a78bd', { y: 4.1, z: 1.6 });
  // the sails' hub sits at local (0, 6.4, 1.9); returned for the rotor
  return new THREE.Vector3(0, 6.35, 1.95).applyMatrix4(t);
}

function sails() {
  const L = [part(new THREE.CylinderGeometry(0.28, 0.28, 0.6, 8), P.woodDark, { rx: Math.PI / 2 })];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.35;
    const m = xform({ rz: a });
    const at = (geo, c, tt) => L.push(part(geo, c, m.clone().multiply(xform(tt))));
    at(new THREE.BoxGeometry(0.2, 4.4, 0.14), '#4a3a44', { y: 2.3, z: 0.1 });
    at(new THREE.BoxGeometry(1.0, 3.3, 0.06), '#fff8ee', { x: 0.55, y: 2.65, z: 0.13 });
    for (let k = 0; k < 3; k++) at(new THREE.BoxGeometry(1.05, 0.1, 0.08), '#6b4a3a', { x: 0.55, y: 1.45 + k * 1.1, z: 0.17 });
  }
  const mesh = new THREE.Mesh(merge(L), materials.toy);
  mesh.name = 'windmillSails';
  return mesh;
}

// --------------------------------------------------------------------------- Jack's van (baked)
/** A stowed perch baked into one mesh per material (it never moves here): 3 draw calls instead of 10. */
function bakedVan() {
  const perch = createPerch({ seed: 1, raise: 0 });
  perch.setRaise(0);
  perch.update(0.016, 0);
  const root = perch.root;
  root.updateMatrixWorld(true);
  const groups = new Map();
  const add = (mat, geo) => {
    const key = mat.map ? mat.uuid : mat.name === 'glossy' || mat.name === 'perch-beacon' ? 'glossy' : 'toy';
    if (!groups.has(key)) groups.set(key, { mat: mat.map ? mat : key === 'glossy' ? materials.glossy : materials.toy, geos: [] });
    groups.get(key).geos.push(geo);
  };
  const m = new THREE.Matrix4();
  root.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    const prep = (src, mm) => {
      const g = src.index ? src.toNonIndexed() : src.clone();
      const keep = mat.map ? ['position', 'normal', 'uv'] : ['position', 'normal', 'color'];
      for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!mat.map && !g.attributes.color) {
        const c = new THREE.Color(mat.color || '#ffffff');
        const n = g.attributes.position.count;
        const a = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
        g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      }
      if (mat.name === 'perch-beacon') {
        const c = new THREE.Color('#ffb03a');
        const a = g.attributes.color.array;
        for (let i = 0; i < a.length; i += 3) a.set([c.r, c.g, c.b], i);
      }
      g.applyMatrix4(mm);
      return g;
    };
    if (o.isInstancedMesh) {
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m);
        add(mat, prep(o.geometry, o.matrixWorld.clone().multiply(m)));
      }
    } else add(mat, prep(o.geometry, o.matrixWorld));
  });
  const group = new THREE.Group();
  group.name = 'jacksVan';
  for (const [key, { mat, geos }] of groups) {
    const g = mergeGeometries(geos, false);
    if (!g) continue;
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = `van-${key.length > 12 ? 'decal' : key}`;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

// --------------------------------------------------------------------------- clouds
function clouds(rng) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true, emissive: '#7584a8', emissiveIntensity: 0.35, fog: false });
  mat.name = 'office-clouds';
  const L = [];
  const spots = [[-150, 30, -560, 1], [70, 36, -700, 1.2], [230, 27, -520, 0.8], [-330, 40, -760, 1.3], [380, 44, -820, 1.1]];
  for (const [cx, cy, cz, s] of spots) {
    const puffs = rng.int(4, 6);
    for (let i = 0; i < puffs; i++) {
      const r = rng.range(7, 12) * s * (1 - Math.abs(i - puffs / 2) / (puffs + 1));
      const g = new THREE.IcosahedronGeometry(r + 3, 1);
      const pos = g.attributes.position;
      for (let v = 0; v < pos.count; v++) if (pos.getY(v) < -r * 0.25) pos.setY(v, -r * 0.25);
      g.computeVertexNormals();
      L.push(part(g, ['#c9d6ec', '#ffffff'], { x: cx + (i - puffs / 2) * 9 * s, y: cy + rng.range(-2, 3), z: cz + rng.range(-4, 4) }));
    }
  }
  const m = new THREE.Mesh(merge(L), mat);
  m.name = 'officeClouds';
  return m;
}

// --------------------------------------------------------------------------- assembly
/** The diorama around the room. Returns { group, update(dt, t) }. */
export function buildOutside({ seed = 3 } = {}) {
  const rng = new Rng(`office-out-${seed}`);
  const R = ROOM;
  const group = new THREE.Group();
  group.name = 'officeOutside';
  group.add(terrain());

  // ---- near garden (inside the shadow frustum): paths, fences, postbox, signpost
  const near = [];
  for (let i = 0; i < 5; i++) {
    near.push(part(puck(rng.range(0.36, 0.46), 0.08, 0.03, 10), rng.pick(['#d9ccb4', '#cfc2a8', '#e3d7c0']), { x: rng.range(-0.3, 0.3), y: GY + 0.03, z: R.z1 + 1.1 + i * 1.05 }));
  }
  for (let i = 0; i < 46; i++) {
    const x = rng.range(-8, 8), z = rng.range(R.z1 + 0.6, R.z1 + 6);
    if (Math.abs(x) < 1) continue;
    near.push(part(ball(rng.range(0.05, 0.1), 0), rng.pick(['#9aa39a', '#b7b0a2', '#8f998d']), { x, y: GY + 0.02, z, sy: 0.5 }));
  }
  for (const s of [-1, 1]) {
    for (let z = R.z0 - 1.5; z < R.z1 + 6.5; z += 0.34) {
      near.push(part(bev(0.12, 0.9 + rng.range(-0.05, 0.05), 0.05, 0.03), '#fff8ee', { x: s * 8.6, y: GY + 0.45, z, rz: rng.range(-0.04, 0.04) }));
    }
    for (const y of [0.3, 0.7]) near.push(part(bev(0.05, 0.08, R.z1 - R.z0 + 8, 0.02), '#f0e6d0', { x: s * 8.6 - s * 0.04, y: GY + y, z: (R.z0 + R.z1) / 2 + 2.5 }));
  }
  // red pillar box by the door side + a signpost to the village
  {
    const x = -7.2, z = R.z1 + 1.6;
    near.push(part(new THREE.CylinderGeometry(0.28, 0.3, 1.25, 16), P.tomato, { x, y: GY + 0.62, z }));
    near.push(part(new THREE.SphereGeometry(0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#e0443a', { x, y: GY + 1.24, z }));
    near.push(part(bev(0.3, 0.05, 0.06, 0.02), P.ink, { x, y: GY + 0.98, z: z + 0.27 }));
    near.push(part(bev(0.44, 0.1, 0.44, 0.03), '#2b2b3a', { x, y: GY + 0.05, z }));
    const sx = 7.3, sz = R.z1 + 2.2;
    near.push(part(bev(0.14, 2.2, 0.14, 0.04), P.woodDark, { x: sx, y: GY + 1.1, z: sz }));
    near.push(part(bev(1.3, 0.3, 0.07, 0.05), '#fff8ee', { x: sx - 0.45, y: GY + 1.9, z: sz, ry: 0.25 }));
    near.push(part(bev(1.1, 0.26, 0.07, 0.05), P.sunflower, { x: sx + 0.35, y: GY + 1.5, z: sz, ry: -0.35 }));
  }
  // garden shed (back right) and a washing line (back left) for the establishing shot
  {
    const t = xform({ x: 10.2, y: GY, z: -9.5, ry: -0.35 });
    const at = (geo, c, tt) => near.push(part(geo, c, t.clone().multiply(xform(tt))));
    at(bev(2.6, 2.1, 2.0, 0.08), '#7fc4b4', { y: 1.05 });
    for (let i = 0; i < 7; i++) at(bev(0.05, 2.0, 0.04, 0.01), '#6aae9f', { x: -1.2 + i * 0.4, y: 1.05, z: 1.01 });
    const tri = new THREE.Shape();
    tri.moveTo(-1.35, 0); tri.lineTo(1.35, 0); tri.lineTo(0, 0.8); tri.closePath();
    const roofG = new THREE.ExtrudeGeometry(tri, { depth: 2.4, bevelEnabled: false });
    roofG.translate(0, 0, -1.2);
    at(roofG, P.roofBrick, { y: 2.1 });
    at(bev(0.8, 1.6, 0.06, 0.03), '#fff8ee', { x: 0.5, y: 0.8, z: 1.03 });
    at(bev(0.5, 0.4, 0.05, 0.02), '#bfe3ff', { x: -0.6, y: 1.35, z: 1.03 });
    const w = xform({ x: -9.6, y: GY, z: -8.5, ry: 0.25 });
    const wat = (geo, c, tt) => near.push(part(geo, c, w.clone().multiply(xform(tt))));
    for (const x of [-2.2, 2.2]) wat(new THREE.CylinderGeometry(0.05, 0.06, 2.0, 6), P.woodDark, { x, y: 1.0 });
    wat(new THREE.CylinderGeometry(0.012, 0.012, 4.4, 4), '#fff8ee', { y: 1.9, rz: Math.PI / 2 });
    const cols = [P.tomato, '#fff8ee', P.cobalt, P.sunflower, P.bubblegum, P.teal];
    for (let i = 0; i < 6; i++) wat(bev(0.5 + (i % 2) * 0.15, 0.62 - (i % 3) * 0.1, 0.03, 0.01), cols[i], { x: -1.7 + i * 0.68, y: 1.55 - (i % 3) * 0.05, rz: (i % 2 ? 1 : -1) * 0.04 });
  }
  const nearMesh = new THREE.Mesh(merge(near), materials.toy);
  nearMesh.name = 'garden';
  nearMesh.castShadow = true;
  nearMesh.receiveShadow = true;
  group.add(nearMesh);
  // hedges hugging the building (baked into one mesh)
  {
    const L = [];
    for (const [x, z, w, ry, s] of [[-6.4, -1.4, 3.4, Math.PI / 2, 1], [6.4, -1.2, 3.2, Math.PI / 2, 2], [-6.9, -5.4, 3.0, 0.2, 5], [6.8, -5.6, 3.2, -0.25, 6]]) {
      const h = hedgeBlock({ w, h: 1.2, d: 1.0, seed: s, flowers: s % 2 ? '#fff4e6' : '#ff9ec4' });
      h.position.set(x, GY, z);
      h.rotation.y = ry;
      h.updateMatrixWorld(true);
      h.traverse((o) => { if (o.isMesh) L.push(o.geometry.clone().applyMatrix4(o.matrixWorld)); });
    }
    const hm = new THREE.Mesh(mergeGeometries(L.map((g) => (g.index ? g.toNonIndexed() : g)), false), materials.foliage);
    hm.name = 'gardenHedges';
    hm.castShadow = true;
    hm.receiveShadow = true;
    group.add(hm);
  }
  const beds = scatterFlowers({ minX: -8, maxX: 8, minZ: R.z1 + 0.8, maxZ: R.z1 + 7 }, 150, { seed: 6, filter: (x) => Math.abs(x) > 1.3 });
  beds.position.y = GY;
  group.add(beds);

  // ---- far toy (no shadows): lane wall + gate, stepping stones, boulders, the village, church and windmill
  const far = [];
  const WALL_Z = -70.3, gx = OUTSIDE.gate;
  for (let x = -92; x < 24; x += 1.1) {
    if (x > gx - 2 && x < gx + 2) continue; // the gate gap
    const z = WALL_Z + (hash3(x, 2, 1) - 0.5) * 0.1;
    const y = GY + heightAt(x, z);
    far.push(part(bev(1.12, 0.62 + hash3(x, 5, 1) * 0.1, 0.5, 0.12), hash3(x, 7, 2) > 0.5 ? '#d9cdb4' : '#c8bb9f', { x, y: y + 0.28, z, ry: (hash3(x, 1, 1) - 0.5) * 0.08 }));
  }
  for (const px of [gx - 2.1, gx + 2.1]) far.push(part(bev(0.26, 1.2, 0.26, 0.06), '#c8bb9f', { x: px, y: GY + heightAt(px, WALL_Z) + 0.55, z: WALL_Z }));
  for (let k = 0; k < 4; k++) far.push(part(bev(3.4, 0.12, 0.08, 0.03), '#fff8ee', { x: gx - 1.1, y: GY + heightAt(gx, WALL_Z) + 0.35 + k * 0.24, z: WALL_Z + 1.2, ry: 1.0 }));
  // stepping stones up the bank from the garden to the lane gate
  {
    const total = PATH_SEGS.at(-1).s0 + PATH_SEGS.at(-1).len;
    for (let d = 3.5; d < total - 1; d += 1.25) {
      let g = PATH_SEGS[0];
      for (const q of PATH_SEGS) if (d >= q.s0) g = q;
      const u = (d - g.s0) / g.len;
      const x = g.ax + g.dx * u + (hash3(d, 3, 1) - 0.5) * 0.3, z = g.az + g.dz * u;
      far.push(part(puck(0.34 + hash3(d, 1, 7) * 0.1, 0.07, 0.025, 9), hash3(d, 5, 5) > 0.5 ? '#e3d7c0' : '#d4c6aa', { x, y: GY + heightAt(x, z) + 0.02, z, ry: d, sz: 0.8 }));
    }
  }
  // a few boulders and flower clumps on the bank (seen in the establishing shot)
  for (const [x, z, s] of [[-2, -18, 0.9], [9, -26, 0.7], [-16, -28, 0.6], [22, -40, 1.0], [-35, -44, 0.8], [4, -48, 0.6]]) {
    const y = GY + heightAt(x, z);
    far.push(part(jitter(new THREE.IcosahedronGeometry(0.7 * s, 0), 0.12, x), '#c9c2b4', { x, y: y + 0.25 * s, z, sy: 0.6, ry: x }));
    far.push(part(jitter(new THREE.IcosahedronGeometry(0.4 * s, 0), 0.08, z), '#b5ad9d', { x: x + 0.7 * s, y: y + 0.12 * s, z: z + 0.3, sy: 0.6 }));
  }
  // Puddleby on its gentle rise: cottages round a green, the church, the windmill on its mound
  const [vx0, vz0] = OUTSIDE.village;
  const spots = [[-12, 6, 0.3], [-6, -3, -0.2], [0, 7, 0.1], [6, -2, 0.4], [12, 6, -0.3], [-2, -12, 0.2], [9, -11, -0.3], [16, -5, 0.2], [-13, -7, -0.1], [19, 4, 0.15]];
  for (const [dx, dz, ry] of spots) house(far, rng, vx0 + dx, vz0 + dz, ry - 0.08, 0.85);
  church(far, OUTSIDE.church[0], OUTSIDE.church[1], 0.3, 0.82);
  const [wx, wz] = OUTSIDE.windmill;
  const faceA = Math.atan2(-wx, -wz) * 0.7 + 0.25; // faces the office (and the camera)
  const WM = 0.85;
  const hub = windmill(far, wx, wz, faceA, WM);
  const farMesh = new THREE.Mesh(merge(far), materials.toy);
  farMesh.name = 'officeFar';
  farMesh.receiveShadow = true;
  group.add(farMesh);
  const rotor = sails();
  rotor.position.copy(hub);
  rotor.rotation.y = faceA;
  rotor.scale.setScalar(WM);
  group.add(rotor);

  // ---- hedgerows: lumps along the lane and the field borders (one InstancedMesh)
  const hedge = [];
  const push = (x, z, s = 1) => hedge.push({ x, z, s: s * (0.85 + hash3(x, 9, z) * 0.35), ry: hash3(z, 3, x) * 6.28 });
  for (let x = -120; x < 30; x += 1.8) push(x, -76.4 - hash3(x, 1, 2) * 0.3, 0.85);
  for (let i = 0; i < 70; i++) { const p = pointOnLane(0.665 + (i / 70) * 0.3); push(p[0] + 2.7, p[1], 0.8); }
  // field borders sit where fieldAt() changes cell: x + jx = 46k - 2000, z + jz = 34k - 2000
  const lineX = [], lineZ = [];
  for (let k = -3; k <= 4; k++) lineX.push(k * 46 - (2000 % 46));
  for (let k = -2; k >= -12; k--) lineZ.push(k * 34 - (2000 % 34));
  // (sparse: from the hub's low, long view every hedge row stacks up, so most borders stay open)
  const clearOfVillage = (x, z) => Math.hypot(x - vx0, z - vz0) > 30 && Math.hypot(x - OUTSIDE.windmill[0], z - OUTSIDE.windmill[1]) > 16;
  for (const x0 of lineX) {
    for (let z = -82; z > -440; z -= 2.3) {
      const x = x0 - (vnoise(z * 0.03, 4.1) - 0.5) * 16;
      if (hash3(Math.floor(z / 34), 11, x0) < 0.45) continue; // gaps
      if (laneAt(x, z).d < 3.5 || !clearOfVillage(x, z)) continue;
      push(x, z, 0.7);
    }
  }
  for (const z0 of lineZ) {
    if (hash3(z0, 17, 3) < 0.4) continue; // skip whole rows
    for (let x = -140; x < 190; x += 2.3) {
      const z = z0 - (vnoise(x * 0.03, 9.7) - 0.5) * 12;
      if (hash3(Math.floor(x / 46), 13, z0) < 0.45) continue;
      if (laneAt(x, z).d < 3.5 || !clearOfVillage(x, z)) continue;
      push(x, z, 0.7);
    }
  }
  {
    const geo = hedgeLump();
    const im = new THREE.InstancedMesh(geo, materials.foliage, hedge.length);
    im.name = 'hedgerows';
    const c = new THREE.Color();
    hedge.forEach((b, i) => {
      im.setMatrixAt(i, xform({ x: b.x, y: GY + heightAt(b.x, b.z) - 0.1, z: b.z, ry: b.ry, s: b.s }));
      const k = 0.88 + hash3(b.x, 4, b.z) * 0.24;
      im.setColorAt(i, c.setRGB(k, k * (0.98 + hash3(b.z, 8, b.x) * 0.06), k * 0.95));
    });
    im.instanceMatrix.needsUpdate = true;
    im.instanceColor.needsUpdate = true;
    im.computeBoundingSphere();
    im.receiveShadow = true;
    group.add(im);
  }

  // ---- trees: a copse behind the van, trees along the hedgerows, a few round the village
  const trees = [];
  const tree = (x, z, type, s) => trees.push({ x, z, type, s });
  tree(-27, -80, 'round', 1.0); tree(-31, -83, 'conifer', 1.0); tree(-24, -86, 'dark', 0.9); tree(-36, -79, 'round', 0.9);
  tree(9, -81, 'blossom', 0.8); tree(36, -90, 'round', 0.85); tree(-60, -84, 'dark', 0.9); tree(-70, -79, 'round', 1.0);
  tree(-30, -26, 'round', 1.1); tree(26, -22, 'fruit', 1.0); tree(34, -47, 'dark', 0.95); tree(-44, -58, 'blossom', 0.9);
  for (let i = 0; i < 24; i++) {
    const x = rng.range(-140, 180), z = rng.range(-95, -390);
    if (laneAt(x, z).d < 5 || !clearOfVillage(x, z)) continue;
    // keep the sightline to the village and windmill clear
    if (x > 18 && z < -200) continue;
    tree(x, z, rng.pick(['round', 'round', 'dark', 'conifer', 'blossom']), rng.range(0.6, 0.85));
  }
  for (const [dx, dz, type] of [[-26, -6, 'round'], [26, -14, 'conifer'], [4, -26, 'round'], [-20, -24, 'dark'], [-8, -30, 'blossom']]) tree(vx0 + dx, vz0 + dz, type, 0.7);
  // big garden trees beside the office (they frame the establishing shot)
  tree(-12.5, -3, 'round', 1.45); tree(12.8, -4.5, 'blossom', 1.35); tree(-14, 5, 'conifer', 1.3); tree(14.5, 6, 'round', 1.2);
  {
    const tr = [], cr = [];
    for (const t of trees) {
      const p = lollipop(rng, t.type, { x: t.x, y: GY + heightAt(t.x, t.z) - 0.15, z: t.z, s: t.s, ry: rng.range(0, 6.28) });
      tr.push(p.trunk);
      cr.push(p.crown);
    }
    const trunks = new THREE.Mesh(merge(tr), materials.facet);
    trunks.name = 'outsideTrunks';
    const crowns = new THREE.Mesh(merge(cr), materials.foliage);
    crowns.name = 'outsideCrowns';
    for (const m of [trunks, crowns]) { m.receiveShadow = true; group.add(m); }
  }

  // ---- Jack's van, parked on the lane verge, nose toward the office
  const van = bakedVan();
  const { x: px, z: pz, ry } = OUTSIDE.van;
  van.position.set(px, GY + heightAt(px, pz), pz);
  van.rotation.y = ry;
  group.add(van);

  // ---- a few sheep grazing on the bank (just visible over the back wall)
  const sheep = [];
  for (const [x, z, ry, seed] of [[-7, -62, 0.9, 3], [4.5, -60.5, -0.6, 7], [15, -66, 2.2, 11], [-2, -67, -2.4, 5]]) {
    const sh = new Sheep({ seed, action: seed === 5 ? 'idle' : 'graze', shadow: false, scale: 1.35 });
    sh.root.position.set(x, GY + heightAt(x, z), z);
    sh.root.rotation.y = ry;
    sh.root.traverse((o) => { o.raycast = () => {}; });
    group.add(sh.root);
    sheep.push(sh);
  }

  group.add(clouds(rng));
  group.traverse((o) => { if (o.isMesh) o.userData.noPick = true; });
  return {
    group,
    van,
    sheep,
    update(dt, t) {
      rotor.rotation.z -= dt * 0.7;
      for (const sh of sheep) sh.update(dt, t);
    },
  };
}

/** Point on the lane at arc fraction k (0..1): [x, z]. */
function pointOnLane(k) {
  const total = SEGS.at(-1).s0 + SEGS.at(-1).len;
  const s = k * total;
  for (const g of SEGS) {
    if (s <= g.s0 + g.len) {
      const t = (s - g.s0) / g.len;
      return [g.ax + g.dx * t, g.az + g.dz * t];
    }
  }
  return LANE.at(-1);
}
