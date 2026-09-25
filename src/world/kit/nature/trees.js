// Trees: chunky toy canopies (faceted, foliage material) on faceted trunks.
// tree() = one tree (2 draw calls). forest() = hundreds of trees in <= 2 draw calls per type.
import * as THREE from 'three';
import { part, merge, jitter, xform } from '../../geo.js';
import { materials } from '../../../gfx/materials.js';
import { Rng } from '../../../core/rng.js';
import { paintFaces, noise3, finish, mesh, rod, Anims } from '../props/lib.js';

export const TREE_TYPES = ['round', 'tall', 'conifer', 'fruit', 'blossom', 'willow'];

// Canopy colour ramps (deep -> mid -> light -> highlight), sRGB.
const RAMPS = {
  round: ['#3b8a3c', '#5aaa45', '#86cc58', '#b4e27a'],
  tall: ['#3a8440', '#56a448', '#8acb5c', '#b9e07c'],
  conifer: ['#24704a', '#2f8a52', '#4fa85e', '#86c96e'],
  fruit: ['#3f8f3a', '#5eae46', '#8dcf5c', '#b8e27c'],
  blossom: ['#d9648f', '#f58cb4', '#ffb6d0', '#ffe3ee'],
  willow: ['#5c9c38', '#7cb94a', '#a6d662', '#d0ea8a'],
};
const TRUNK = ['#5e3a20', '#7a4a26', '#9a6236'];

const _c = new THREE.Color();
function ramp(stops, t, out) {
  t = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t));
  return out.set(stops[i]).lerp(_c.set(stops[i + 1]), t - i);
}

/** Paint a merged canopy: height ramp + top light + per-facet noise and warm/cool flecks. */
function paintCrown(geo, stops, { speckle = null, speckleRate = 0, seed = 0 } = {}) {
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  const h = Math.max(0.01, max.y - min.y);
  return paintFaces(geo, (x, y, z, nx, ny, nz, c) => {
    const n = noise3(x * 2.3 + seed, y * 2.3, z * 2.3);
    let t = (y - min.y) / h * 0.75 + Math.max(0, ny) * 0.35 + Math.max(0, nx * 0.35 + nz * 0.35) * 0.12;
    t += (n - 0.5) * 0.28;
    ramp(stops, t, c);
    if (speckle && noise3(x * 7.1, y * 5.3 + seed, z * 6.7) < speckleRate) c.set(speckle);
  });
}

function paintTrunk(geo, seed = 0) {
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  const h = Math.max(0.01, max.y - min.y);
  return paintFaces(geo, (x, y, z, nx, ny, nz, c) => {
    ramp(TRUNK, (y - min.y) / h * 0.8 + (noise3(x * 5 + seed, y * 3, z * 5) - 0.5) * 0.35 + 0.1, c);
  });
}

/** Tapered, bent, flared open trunk. */
function trunkGeo(rng, { h = 2.2, r0 = 0.3, r1 = 0.18, lean = 0.2, seg = 7, flare = 1.35, y0 = 0 } = {}) {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, 4, true);
  const a = rng.range(0, Math.PI * 2);
  const dx = Math.cos(a) * lean, dz = Math.sin(a) * lean;
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = (pos.getY(i) + h / 2) / h;
    const f = k < 0.25 ? 1 + (flare - 1) * (1 - k / 0.25) ** 2 : 1;
    pos.setXYZ(i, pos.getX(i) * f + dx * k * k, pos.getY(i) + h / 2 + y0, pos.getZ(i) * f + dz * k * k);
  }
  g.computeVertexNormals();
  return { geo: g, top: new THREE.Vector3(dx, h + y0, dz) };
}

function lump(r, detail, amt, seed, t) {
  return part(jitter(new THREE.IcosahedronGeometry(r, detail), r * amt, seed), '#ffffff', t);
}

// ---- per-type designs: return { trunk: BufferGeometry, crown: BufferGeometry }

function designRound(rng, seed, stops = RAMPS.round, extra) {
  const tr = trunkGeo(rng, { h: 2.4, r0: 0.3, r1: 0.19, lean: rng.range(0.1, 0.3) });
  const top = tr.top;
  const trunk = [part(tr.geo, '#fff')];
  const cy = top.y + 1.7;
  const crown = [lump(2.2, 2, 0.075, seed, { x: top.x, y: cy, z: top.z, sy: 0.92 })];
  const n = rng.int(3, 4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.4, 0.4);
    const r = rng.range(1.15, 1.5);
    crown.push(lump(r, 1, 0.08, seed + i + 1, {
      x: top.x + Math.cos(a) * rng.range(1.3, 1.7), y: cy + rng.range(-0.7, 0.5), z: top.z + Math.sin(a) * rng.range(1.3, 1.7),
    }));
    if (i < 2) trunk.push(part(rod([top.x * 0.6, top.y - 0.5, top.z * 0.6], [top.x + Math.cos(a) * 1.1, top.y + 0.5, top.z + Math.sin(a) * 1.1], 0.1, 5, 0.06), '#fff'));
  }
  if (extra) extra({ crown, trunk, top, cy, rng });
  return { trunk: paintTrunk(merge(trunk), seed), crown: paintCrown(merge(crown), stops, { seed }) };
}

function designTall(rng, seed) {
  const tr = trunkGeo(rng, { h: 2.2, r0: 0.25, r1: 0.16, lean: rng.range(0.05, 0.15) });
  const top = tr.top;
  const crown = [
    lump(1.55, 2, 0.12, seed, { x: top.x, y: top.y + 2.6, z: top.z, sx: 1, sy: 2.1, sz: 1 }),
    lump(1.05, 1, 0.14, seed + 1, { x: top.x + 0.55, y: top.y + 1.2, z: top.z + 0.3, sy: 1.5 }),
    lump(0.95, 1, 0.14, seed + 2, { x: top.x - 0.5, y: top.y + 1.6, z: top.z - 0.35, sy: 1.6 }),
    lump(0.7, 1, 0.14, seed + 3, { x: top.x + 0.1, y: top.y + 5.6, z: top.z, sy: 1.5 }),
  ];
  return { trunk: paintTrunk(merge([part(tr.geo, '#fff')]), seed), crown: paintCrown(merge(crown), RAMPS.tall, { seed }) };
}

function designConifer(rng, seed) {
  const tr = trunkGeo(rng, { h: 1.6, r0: 0.3, r1: 0.2, lean: 0.03, seg: 6 });
  const tiers = 4;
  const crown = [];
  let y = 1.2;
  for (let i = 0; i < tiers; i++) {
    const k = i / (tiers - 1);
    const r = 2.1 - k * 1.25 + rng.range(-0.1, 0.1);
    const h = 2.3 - k * 0.5;
    const seg = 10;
    const g = new THREE.ConeGeometry(r, h, seg, 2, false);
    const pos = g.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const px = pos.getX(v), py = pos.getY(v), pz = pos.getZ(v);
      const rr = Math.hypot(px, pz);
      if (py < -h / 2 + 1e-3 && rr > r * 0.9) {
        let th = Math.atan2(px, pz);
        if (th < 0) th += Math.PI * 2;
        const idx = Math.round(th / (Math.PI * 2 / seg)) % seg;
        if (idx % 2) pos.setXYZ(v, px * 0.82, py + 0.32, pz * 0.82);
        else pos.setXYZ(v, px * 1.06, py - 0.08, pz * 1.06);
      }
    }
    g.computeVertexNormals();
    crown.push(part(jitter(g, 0.06, seed + i), '#fff', { y: y + h / 2, ry: rng.range(0, Math.PI) }));
    y += h * 0.52;
  }
  crown.push(part(new THREE.ConeGeometry(0.35, 1.0, 6), '#fff', { y: y + 0.9 }));
  return { trunk: paintTrunk(merge([part(tr.geo, '#fff')]), seed), crown: paintCrown(merge(crown), RAMPS.conifer, { seed }) };
}

function designFruit(rng, seed) {
  let fruitParts = [];
  let fallen = [];
  const d = designRound(rng, seed, RAMPS.fruit, ({ crown, top, cy, rng: r2 }) => {
    const colour = r2.chance(0.7) ? '#ff3b30' : '#ffa01c';
    for (let i = 0; i < 13; i++) {
      const a = (i / 13) * Math.PI * 2 * 2.618 + r2.range(-0.3, 0.3);
      const e = r2.range(-0.3, 0.85);
      const R = 2.18;
      fruitParts.push(part(new THREE.IcosahedronGeometry(0.3, 0), colour, {
        x: top.x + Math.cos(a) * Math.cos(e) * R, y: cy + Math.sin(e) * R * 0.9, z: top.z + Math.sin(a) * Math.cos(e) * R,
      }));
    }
    for (let i = 0; i < 3; i++) {
      const a = r2.range(0, Math.PI * 2);
      fallen.push(part(new THREE.IcosahedronGeometry(0.24, 0), colour, { x: Math.cos(a) * r2.range(0.9, 1.9), y: 0.2, z: Math.sin(a) * r2.range(0.9, 1.9) }));
    }
    crown.push(...fruitParts);
  });
  // paintCrown recoloured everything: restore the fruit (merged last) to their own colours
  const crown = d.crown;
  const fruitVerts = fruitParts.reduce((s, g) => s + g.attributes.position.count, 0);
  const col = crown.attributes.color;
  let o = col.count - fruitVerts;
  for (const g of fruitParts) {
    const c = g.attributes.color;
    for (let i = 0; i < c.count; i++, o++) col.setXYZ(o, c.getX(i), c.getY(i), c.getZ(i));
  }
  const trunk = merge([d.trunk, ...fallen]);
  return { trunk, crown };
}

function designBlossom(rng, seed) {
  const tr = trunkGeo(rng, { h: 2.1, r0: 0.3, r1: 0.18, lean: rng.range(0.2, 0.4) });
  const top = tr.top;
  const trunk = [part(tr.geo, '#fff')];
  const cy = top.y + 1.2;
  const crown = [lump(2.3, 2, 0.075, seed, { x: top.x, y: cy, z: top.z, sy: 0.72 })];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rng.range(-0.3, 0.3);
    crown.push(lump(rng.range(1.0, 1.35), 1, 0.09, seed + i + 1, {
      x: top.x + Math.cos(a) * 1.9, y: cy + rng.range(-0.4, 0.4), z: top.z + Math.sin(a) * 1.9, sy: 0.8,
    }));
    trunk.push(part(rod([top.x * 0.6, top.y - 0.4, top.z * 0.6], [top.x + Math.cos(a) * 1.3, top.y + 0.3, top.z + Math.sin(a) * 1.3], 0.09, 5, 0.05), '#fff'));
  }
  const t = paintTrunk(merge(trunk), seed);
  // fallen petals: a flat, slightly domed pink carpet
  const carpet = new THREE.CircleGeometry(2.1, 18).rotateX(-Math.PI / 2);
  const cp = carpet.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const r = Math.hypot(cp.getX(i), cp.getZ(i));
    const w = r > 0.1 ? (i % 2 ? 0.55 : 0.85) + noise3(cp.getX(i), 0, cp.getZ(i) + seed) * 0.4 : 1;
    cp.setXYZ(i, cp.getX(i) * w + top.x * 0.5, 0.05 + (1 - r / 2.1) * 0.03, cp.getZ(i) * w + top.z * 0.5);
  }
  const petals = part(carpet, '#ffd6e6');
  return {
    trunk: merge([t, petals]),
    crown: paintCrown(merge(crown), RAMPS.blossom, { speckle: '#fff2f6', speckleRate: 0.1, seed }),
  };
}

function designWillow(rng, seed) {
  const tr = trunkGeo(rng, { h: 2.6, r0: 0.4, r1: 0.24, lean: rng.range(0.3, 0.5), flare: 1.5 });
  const top = tr.top;
  const cy = top.y + 1.0;
  const crown = [lump(2.3, 2, 0.07, seed, { x: top.x, y: cy + 0.3, z: top.z, sy: 0.7 })];
  const n = 13;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.15, 0.15);
    const R = rng.range(1.9, 2.2);
    const len = rng.range(1.0, 1.35);
    // long drooping fronds hanging from the rim of the dome (trunk stays visible)
    crown.push(lump(0.42, 1, 0.1, seed + i + 3, {
      x: top.x + Math.cos(a) * R, y: cy - len * 0.55, z: top.z + Math.sin(a) * R,
      sx: 1, sy: len * 2.3, sz: 0.8, ry: -a,
    }));
  }
  return { trunk: paintTrunk(merge([part(tr.geo, '#fff')]), seed), crown: paintCrown(merge(crown), RAMPS.willow, { seed }) };
}

const DESIGNS = { round: designRound, tall: designTall, conifer: designConifer, fruit: designFruit, blossom: designBlossom, willow: designWillow };

const protoCache = new Map();
/** Cached {trunk, crown} geometries for a type/seed (shared by forest instancing). */
export function treeGeometry(type = 'round', seed = 1) {
  const key = `${type}|${seed}`;
  if (!protoCache.has(key)) {
    const fn = DESIGNS[type] || DESIGNS.round;
    protoCache.set(key, fn(new Rng(`tree-${type}-${seed}`), seed));
  }
  return protoCache.get(key);
}

/**
 * One tree. 2 draw calls (trunk: facet, crown: foliage). parts: { trunk, crown }.
 * userData.wobble(s) sways the tree (fun hit reaction).
 */
export function tree({ type = 'round', seed = 1, scale = 1 } = {}) {
  const { trunk, crown } = treeGeometry(type, seed);
  const g = new THREE.Group();
  const sway = new THREE.Group();
  sway.name = 'sway';
  g.add(sway);
  const t = mesh(trunk, materials.facet, 'trunk');
  const c = mesh(crown, materials.foliage, 'crown');
  sway.add(t, c);
  g.scale.setScalar(scale);
  const anims = new Anims();
  finish(g, { name: `tree-${type}`, parts: { trunk: t, crown: c }, surface: 'wood', anims });
  g.userData.wobble = (s = 1) => anims.play(1.4, (k) => {
    const a = Math.sin(k * Math.PI * 5) * (1 - k) ** 1.4 * 0.06 * s;
    sway.rotation.set(a * 0.4, 0, a);
  }, { key: 'wobble' });
  return g;
}

function toPoint(p) {
  if (p.isVector3) return { x: p.x, y: p.y, z: p.z };
  if (Array.isArray(p)) return p.length === 2 ? { x: p[0], y: 0, z: p[1] } : { x: p[0], y: p[1], z: p[2] };
  return { x: p.x || 0, y: p.y || 0, z: p.z || 0, type: p.type, scale: p.scale, ry: p.ry };
}

/**
 * Instanced forest. points: Vector3 | [x,z] | [x,y,z] | {x,y,z,type,scale,ry}.
 * opts: { types = ['round','conifer','tall'] (random per point unless the point names one),
 *         seed, scale: [min,max], tint: colour variation 0..0.3, variants: prototypes per type (1) }
 * Draw calls = 2 x (types x variants actually used).
 */
export function forest(points, { types = ['round', 'conifer', 'tall'], seed = 1, scale = [0.85, 1.2], tint = 0.12, variants = 1 } = {}) {
  const rng = new Rng(`forest-${seed}`);
  const buckets = new Map();
  for (const raw of points) {
    const p = toPoint(raw);
    const type = p.type || rng.pick(types);
    const v = rng.int(0, Math.max(1, variants) - 1);
    const key = `${type}|${v}`;
    if (!buckets.has(key)) buckets.set(key, { type, v, list: [] });
    const s = p.scale ?? rng.range(scale[0], scale[1]);
    const sy = s * rng.range(0.92, 1.1);
    buckets.get(key).list.push({
      x: p.x, y: p.y, z: p.z, ry: p.ry ?? rng.range(0, Math.PI * 2), sx: s, sy, sz: s * rng.range(0.92, 1.08),
      rx: rng.range(-0.03, 0.03), rz: rng.range(-0.03, 0.03),
    });
  }
  const group = new THREE.Group();
  group.name = 'forest';
  const col = new THREE.Color();
  for (const { type, v, list } of buckets.values()) {
    const proto = treeGeometry(type, 1 + v * 17);
    const trunk = new THREE.InstancedMesh(proto.trunk, materials.facet, list.length);
    const crown = new THREE.InstancedMesh(proto.crown, materials.foliage, list.length);
    trunk.name = `forest-trunk-${type}`;
    crown.name = `forest-crown-${type}`;
    list.forEach((t, i) => {
      const m = xform(t);
      trunk.setMatrixAt(i, m);
      crown.setMatrixAt(i, m);
      const b = 1 + rng.range(-tint, tint * 0.6);
      const warm = rng.range(-tint, tint) * 0.8;
      col.setRGB(b * (1 + warm), b * (1 + warm * 0.25), b * (1 - warm * 0.9));
      crown.setColorAt(i, col);
      const tb = rng.range(0.85, 1.1);
      trunk.setColorAt(i, col.setRGB(tb, tb, tb));
    });
    for (const m of [trunk, crown]) {
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }
  }
  group.userData.count = points.length;
  group.userData.kind = 'forest';
  group.userData.surface = 'wood';
  return group;
}
