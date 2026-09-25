// Bushes, hedges, flower patches, grass tufts, meadow flower scatter. All foliage uses
// materials.foliage (the wind pass patches it later); dense things are InstancedMesh.
import * as THREE from 'three';
import { part, merge, jitter, xform } from '../../geo.js';
import { materials } from '../../../gfx/materials.js';
import { P } from '../../../gfx/palette.js';
import { Rng } from '../../../core/rng.js';
import { paintFaces, noise3, finish, mesh, Anims } from '../props/lib.js';

export const FLOWER_COLORS = ['#ff5a4e', '#ffc93c', '#ff7eb6', '#fff4e6', '#9b6cf0', '#ff9f1c', '#3a6ee8', '#ff4f7b'];

const LEAF = ['#3f8f3a', '#5aaa45', '#86cc58', '#b0e078'];
const _c = new THREE.Color();
function ramp(stops, t, out) {
  t = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t));
  return out.set(stops[i]).lerp(_c.set(stops[i + 1]), t - i);
}
function paintLeafy(geo, stops = LEAF, seed = 0) {
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  const h = Math.max(0.01, max.y - min.y);
  return paintFaces(geo, (x, y, z, nx, ny, nz, c) => {
    ramp(stops, (y - min.y) / h * 0.7 + Math.max(0, ny) * 0.35 + (noise3(x * 3 + seed, y * 3, z * 3) - 0.5) * 0.3, c);
  });
}

// ---------------------------------------------------------------- bush

/** Round lumpy bush (1 draw call). flowers: hex colour to dot it with blooms, or null. */
export function bush({ seed = 1, size = 1, flowers = null, stops = LEAF } = {}) {
  const rng = new Rng(`bush-${seed}`);
  const parts = [part(jitter(new THREE.IcosahedronGeometry(0.75, 1), 0.1, seed), '#fff', { y: 0.55, sy: 0.85 })];
  const n = rng.int(2, 4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.4, 0.4);
    const r = rng.range(0.42, 0.58);
    parts.push(part(jitter(new THREE.IcosahedronGeometry(r, 1), 0.08, seed + i + 1), '#fff', {
      x: Math.cos(a) * 0.62, y: r * 0.8, z: Math.sin(a) * 0.62, sy: 0.9,
    }));
  }
  const geo = paintLeafy(merge(parts), stops, seed);
  const all = [geo];
  if (flowers) {
    for (let i = 0; i < 12; i++) {
      const a = rng.range(0, Math.PI * 2);
      const e = rng.range(0.1, 1.0);
      all.push(part(new THREE.IcosahedronGeometry(0.1, 0), i % 4 ? flowers : '#fff4e6', {
        x: Math.cos(a) * Math.cos(e) * 0.8, y: 0.5 + Math.sin(e) * 0.62, z: Math.sin(a) * Math.cos(e) * 0.8,
      }));
    }
  }
  const g = new THREE.Group();
  const m = mesh(all.length > 1 ? merge(all) : geo, materials.foliage, 'leaves');
  m.scale.setScalar(size);
  g.add(m);
  return finish(g, { name: 'bush', parts: { leaves: m }, surface: 'grass' });
}

// ---------------------------------------------------------------- hedge

/** Clipped hedge block, lumpy rounded box sitting on y=0 (1 draw call). */
export function hedgeBlock({ w = 3, h = 1.3, d = 1.1, seed = 1, round = 0.3, flowers = null } = {}) {
  const sx = Math.max(2, Math.ceil(w / 0.4));
  const sy = Math.max(2, Math.ceil(h / 0.4));
  const sz = Math.max(2, Math.ceil(d / 0.4));
  const g = new THREE.BoxGeometry(w, h, d, sx, sy, sz);
  const pos = g.attributes.position;
  const inner = new THREE.Vector3(w / 2 - round, h / 2 - round, d / 2 - round);
  const p = new THREE.Vector3(), q = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    q.set(THREE.MathUtils.clamp(p.x, -inner.x, inner.x), THREE.MathUtils.clamp(p.y, -inner.y, inner.y), THREE.MathUtils.clamp(p.z, -inner.z, inner.z));
    const dd = p.clone().sub(q);
    if (dd.lengthSq() > 1e-8) p.copy(q).add(dd.setLength(round));
    // soft bulge on top
    if (p.y > 0) p.y += Math.cos((p.x / w) * Math.PI) * 0.06;
    pos.setXYZ(i, p.x, p.y + h / 2, p.z);
  }
  g.computeVertexNormals();
  jitter(g, 0.055, seed);
  const geo = paintLeafy(part(g, '#fff'), ['#3a8638', '#4f9a3c', '#74bb4e', '#9fd46a'], seed);
  const list = [geo];
  if (flowers) {
    const rng = new Rng(`hedgeflw-${seed}`);
    const n = Math.round(w * 4);
    for (let i = 0; i < n; i++) {
      const side = rng.sign();
      list.push(part(new THREE.IcosahedronGeometry(0.07, 0), rng.chance(0.75) ? flowers : '#fff4e6', {
        x: rng.range(-w / 2 + 0.15, w / 2 - 0.15), y: rng.range(0.35, h - 0.05), z: side * (d / 2 + 0.02),
      }));
    }
  }
  const grp = new THREE.Group();
  const m = mesh(list.length > 1 ? merge(list) : geo, materials.foliage, 'hedge');
  grp.add(m);
  return finish(grp, { name: 'hedgeBlock', parts: { hedge: m }, surface: 'grass' });
}

// ---------------------------------------------------------------- flower geometry (shared protos)

let _flowerProto = null;
/** { head, stem } geometries. head: 5-petal puffy star (white petals -> tinted per instance, gold eye). */
function flowerProto() {
  if (_flowerProto) return _flowerProto;
  const petals = 5;
  const R = 0.17, r = 0.075;
  const top = [], bot = [];
  const ring = [];
  for (let i = 0; i < petals * 2; i++) {
    const a = (i / (petals * 2)) * Math.PI * 2;
    const rr = i % 2 ? r : R;
    ring.push([Math.cos(a) * rr, i % 2 ? 0.0 : 0.02, Math.sin(a) * rr]);
  }
  const pos = [];
  const col = [];
  const white = [1, 1, 1];
  const eye = new THREE.Color('#ffc21a');
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    // top (raised eye)
    pos.push(0, 0.05, 0, b[0], b[1], b[2], a[0], a[1], a[2]);
    col.push(eye.r, eye.g, eye.b, ...white, ...white);
    // bottom
    pos.push(0, -0.015, 0, a[0], a[1] - 0.02, a[2], b[0], b[1] - 0.02, b[2]);
    col.push(...white, ...white, ...white);
  }
  const head = new THREE.BufferGeometry();
  head.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  head.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  head.computeVertexNormals();
  // stem + a leaf, stem top at y = 0 (head sits there)
  const stem = merge([
    part(new THREE.CylinderGeometry(0.014, 0.02, 0.34, 4, 1, true), '#4c9a3a', { y: -0.17 }),
    part(new THREE.ConeGeometry(0.05, 0.16, 3), '#5fae44', { x: 0.05, y: -0.22, rz: -1.1 }),
  ]);
  _flowerProto = { head, stem, height: 0.34 };
  return _flowerProto;
}

function flowerInstances(list, colors, rng, name) {
  const { head, stem, height } = flowerProto();
  const heads = new THREE.InstancedMesh(head, materials.foliage, list.length);
  const stems = new THREE.InstancedMesh(stem, materials.foliage, list.length);
  heads.name = `${name}-heads`;
  stems.name = `${name}-stems`;
  const c = new THREE.Color();
  list.forEach((p, i) => {
    const s = p.s;
    const y = p.y + height * s;
    const tilt = { rx: rng.range(-0.25, 0.25), rz: rng.range(-0.25, 0.25) };
    heads.setMatrixAt(i, xform({ x: p.x, y, z: p.z, ry: rng.range(0, 6.28), ...tilt, s: s * rng.range(0.9, 1.25) }));
    stems.setMatrixAt(i, xform({ x: p.x, y, z: p.z, ry: rng.range(0, 6.28), ...tilt, s }));
    heads.setColorAt(i, c.set(rng.pick(colors)));
    const g = rng.range(0.85, 1.12);
    stems.setColorAt(i, c.setRGB(g, g, g));
  });
  for (const m of [heads, stems]) {
    m.instanceMatrix.needsUpdate = true;
    m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    m.castShadow = false;
    m.receiveShadow = true;
  }
  return [stems, heads];
}

/** A round bed of flowers on a leafy mound (3 draw calls; heads/stems instanced). */
export function flowerPatch({ seed = 1, radius = 1, count, colors = null, mound = true } = {}) {
  const rng = new Rng(`fpatch-${seed}`);
  const n = count ?? Math.round(radius * radius * 22);
  const pal = colors || rng.shuffle(FLOWER_COLORS).slice(0, rng.int(1, 3));
  const list = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996 + rng.range(-0.3, 0.3);
    const r = Math.sqrt((i + 0.5) / n) * radius * 0.92;
    const k = 1 - r / radius;
    list.push({ x: Math.cos(a) * r, y: mound ? 0.05 + k * 0.18 : 0, z: Math.sin(a) * r, s: rng.range(0.85, 1.2) * (0.8 + k * 0.35) });
  }
  const g = new THREE.Group();
  if (mound) {
    const m = new THREE.SphereGeometry(radius * 1.02, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    m.scale(1, 0.26 / radius, 1);
    jitter(m, 0.04, seed);
    g.add(mesh(paintLeafy(part(m, '#fff'), ['#3f8a36', '#4f9a3c', '#62ab48', '#79bd55'], seed), materials.foliage, 'mound'));
  }
  const [stems, heads] = flowerInstances(list, pal, rng, 'patch');
  g.add(stems, heads);
  return finish(g, { name: 'flowerPatch', parts: { heads, stems }, surface: 'grass' });
}

/** Area helper: {x,z,w,d} (centre+size) or {minX,maxX,minZ,maxZ}. */
function areaBounds(a) {
  if (a.minX !== undefined) return a;
  const w = a.w ?? a.width ?? 10, d = a.d ?? a.depth ?? 10;
  const x = a.x ?? 0, z = a.z ?? 0;
  return { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 };
}

/**
 * Meadow flowers scattered in an area (2 draw calls). area: {x,z,w,d} | {minX,maxX,minZ,maxZ}.
 * opts: { seed, colors, filter(x,z) => bool, y(x,z) => height, clump: 0..1 }
 */
export function scatterFlowers(area, count = 200, { seed = 1, colors = FLOWER_COLORS, filter, y: yAt, clump = 0.6, scale = 1 } = {}) {
  const rng = new Rng(`scatter-${seed}`);
  const b = areaBounds(area);
  const centres = [];
  const nc = Math.max(1, Math.round(count / 14));
  for (let i = 0; i < nc; i++) centres.push({ x: rng.range(b.minX, b.maxX), z: rng.range(b.minZ, b.maxZ), c: rng.pick(colors) });
  const list = [];
  const cols = [];
  let guard = 0;
  while (list.length < count && guard++ < count * 20) {
    let x, z, col;
    if (rng.chance(clump)) {
      const c = rng.pick(centres);
      const r = Math.abs(rng.range(-1, 1) * rng.range(0, 1)) * 2.2;
      const a = rng.range(0, Math.PI * 2);
      x = c.x + Math.cos(a) * r; z = c.z + Math.sin(a) * r; col = rng.chance(0.85) ? c.c : rng.pick(colors);
    } else {
      x = rng.range(b.minX, b.maxX); z = rng.range(b.minZ, b.maxZ); col = rng.pick(colors);
    }
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
    if (filter && !filter(x, z)) continue;
    list.push({ x, y: yAt ? yAt(x, z) : 0, z, s: rng.range(0.8, 1.25) * scale });
    cols.push(col);
  }
  const g = new THREE.Group();
  let i = 0;
  const pick = { pick: () => cols[i++] };
  const [stems, heads] = flowerInstances(list, colors, { range: rng.range.bind(rng), pick: pick.pick }, 'meadow');
  g.add(stems, heads);
  g.name = 'scatterFlowers';
  g.userData.kind = 'scatterFlowers';
  g.userData.count = list.length;
  g.userData.surface = 'grass';
  return g;
}

// ---------------------------------------------------------------- grass

let _tuftProto = null;
function tuftProto() {
  if (_tuftProto) return _tuftProto;
  const blades = [];
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (i % 2) * 0.3;
    const h = 0.36 + (i % 3) * 0.1;
    const lean = 0.4 + (i % 2) * 0.18;
    blades.push(part(new THREE.ConeGeometry(0.075, h, 3, 1), ['#5aa843', '#c6ec88'], {
      x: Math.cos(a) * 0.07, y: h / 2 - 0.03, z: Math.sin(a) * 0.07,
      rx: Math.sin(a) * lean, rz: -Math.cos(a) * lean, order: 'XYZ',
    }));
  }
  blades.push(part(new THREE.ConeGeometry(0.085, 0.55, 3, 1), ['#5aa843', '#d0f094'], { y: 0.25 }));
  _tuftProto = merge(blades);
  return _tuftProto;
}

/** Instanced grass tufts (1 draw call). area: radius number (around origin) or {x,z,w,d}. */
export function grassTufts({ seed = 1, radius = 2, area = null, count = 30, scale = 1, filter } = {}) {
  const rng = new Rng(`tufts-${seed}`);
  const list = [];
  const c = new THREE.Color();
  const cols = [];
  const b = area ? areaBounds(area) : null;
  let guard = 0;
  while (list.length < count && guard++ < count * 20) {
    let x, z;
    if (b) { x = rng.range(b.minX, b.maxX); z = rng.range(b.minZ, b.maxZ); } else {
      const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.random()) * radius;
      x = Math.cos(a) * r; z = Math.sin(a) * r;
    }
    if (filter && !filter(x, z)) continue;
    const s = rng.range(0.75, 1.3) * scale;
    list.push({ x, z, ry: rng.range(0, 6.28), sx: s, sy: s * rng.range(0.8, 1.3), sz: s });
    const g = rng.range(0.85, 1.12);
    cols.push(c.setRGB(g * rng.range(0.95, 1.08), g, g * rng.range(0.85, 1)).getHex());
  }
  const m = new THREE.InstancedMesh(tuftProto(), materials.foliage, list.length);
  list.forEach((t, i) => { m.setMatrixAt(i, xform(t)); m.setColorAt(i, c.setHex(cols[i])); });
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.computeBoundingSphere();
  m.castShadow = false;
  m.receiveShadow = true;
  m.name = 'tufts';
  const g = new THREE.Group();
  g.add(m);
  return finish(g, { name: 'grassTufts', parts: { tufts: m }, surface: 'grass' });
}

export { LEAF as LEAF_RAMP, P as PALETTE };
