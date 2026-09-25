// Puddleby Green: shared helpers (placement, static batching, sprites, small bespoke meshes).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { part, merge, xform } from '../../world/geo.js';
import { materials } from '../../gfx/materials.js';
import { iconMaterial } from '../../world/characters/icons.js';

export const PERCH = new THREE.Vector3(0, 12, 62);
export const TAU = Math.PI * 2;
export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Add obj to parent at (x, y, z) with yaw ry. */
export function put(parent, obj, x, z, ry = 0, y = 0) {
  obj.position.set(x, y, z);
  obj.rotation.y = ry;
  parent.add(obj);
  return obj;
}

/** Yaw that turns an object's +Z toward a world point. */
export const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
/** Yaw that turns an object's +Z toward the perch. */
export const facePerch = (x, z) => Math.atan2(PERCH.x - x, PERCH.z - z);

/** Local (x, z) offset rotated by yaw, added to (cx, cz). Returns [x, z]. */
export function local(cx, cz, ry, lx, lz) {
  const c = Math.cos(ry), s = Math.sin(ry);
  return [cx + lx * c + lz * s, cz - lx * s + lz * c];
}

export function worldPos(obj, out = new THREE.Vector3()) {
  obj.updateWorldMatrix(true, false);
  return out.setFromMatrixPosition(obj.matrixWorld);
}

/** Closed circle path of n points. */
export function circlePath(cx, cz, r, n = 12, a0 = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU;
    pts.push([cx + Math.sin(a) * r, cz + Math.cos(a) * r]);
  }
  return pts;
}

/** Point in polygon ([[x, z], ...]). */
export function inPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance from point to segment in XZ. */
export function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/** Vertex-coloured merged mesh from part() geometries (shadows on). */
export function meshFrom(parts, material = materials.toy, name) {
  const m = new THREE.Mesh(merge(parts), material);
  m.castShadow = true;
  m.receiveShadow = true;
  if (name) m.name = name;
  return m;
}

export { part, merge, xform };

// ------------------------------------------------------------------ static batching
const KEEP = ['position', 'normal', 'color', 'uv'];

function hiddenUp(o, stop) {
  for (let p = o; p && p !== stop; p = p.parent) if (!p.visible) return true;
  return false;
}

function surfaceOf(o) {
  for (let p = o; p; p = p.parent) if (p.userData?.surface) return p.userData.surface;
  return null;
}

/**
 * Collects static meshes from kit props/buildings and merges them per (material, shadow, surface,
 * cell) into a few big meshes. Gameplay sub-objects stay untouched: `add(obj)` takes a whole static
 * group; `addMeshes(group)` takes only the group's direct mesh children (the kit's merged static
 * body) and leaves hinged/animated/hittable sub-objects in place.
 */
export class StaticBatcher {
  constructor({ cell = 45 } = {}) {
    this.items = [];
    this.cell = cell;
    this.stats = { meshes: 0, batches: 0 };
  }

  /** Whole static object tree (removed from its parent when built). */
  add(obj, surface) {
    this.items.push({ obj, surface, whole: true });
    return obj;
  }

  /** Only the direct Mesh children of `group` (kit static body). */
  addMeshes(group, surface, filter) {
    this.items.push({ obj: group, surface, whole: false, filter });
    return group;
  }

  build(root) {
    root.updateMatrixWorld(true);
    const inv = root.matrixWorld.clone().invert();
    const buckets = new Map();
    const m = new THREE.Matrix4();
    const c = new THREE.Vector3();
    const take = (o, surface, top) => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.userData.collider || o.userData.live) return false;
      if (o.geometry?.morphAttributes && Object.keys(o.geometry.morphAttributes).length) return false;
      if (Array.isArray(o.material) || o.material.transparent || !o.geometry?.attributes?.position) return false;
      if (hiddenUp(o, top.parent)) return false;
      const mat = o.material;
      const surf = surface || surfaceOf(o) || 'stone';
      m.multiplyMatrices(inv, o.matrixWorld);
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k)) g.deleteAttribute(k);
      if (!mat.vertexColors && g.attributes.color) g.deleteAttribute('color');
      if (!mat.map && g.attributes.uv) g.deleteAttribute('uv');
      if (mat.vertexColors && !g.attributes.color) return false;
      if (mat.map && !g.attributes.uv) return false;
      if (!g.attributes.normal) g.computeVertexNormals();
      g.clearGroups();
      g.applyMatrix4(m);
      g.computeBoundingSphere();
      c.copy(g.boundingSphere.center);
      const cx = Math.floor(c.x / this.cell), cz = Math.floor(c.z / this.cell);
      const key = `${mat.uuid}|${o.castShadow ? 1 : 0}|${surf}|${cx},${cz}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { mat, cast: o.castShadow, surf, geos: [], attrs: Object.keys(g.attributes).sort().join() }));
      if (Object.keys(g.attributes).sort().join() !== b.attrs) return false;
      b.geos.push(g);
      this.stats.meshes++;
      return true;
    };
    for (const it of this.items) {
      const { obj } = it;
      obj.updateWorldMatrix(true, true);
      if (it.whole) {
        const taken = [];
        obj.traverse((o) => { if (take(o, it.surface, obj)) taken.push(o); });
        // drop the whole tree if every mesh was absorbed, else just the absorbed meshes
        let rest = 0;
        obj.traverse((o) => { if (o.isMesh && !taken.includes(o) && !o.userData.collider) rest++; });
        if (!rest) obj.removeFromParent();
        else for (const o of taken) o.removeFromParent();
      } else {
        for (const o of [...obj.children]) {
          if (it.filter && !it.filter(o)) continue;
          if (take(o, it.surface, obj)) o.removeFromParent();
        }
      }
    }
    const out = new THREE.Group();
    out.name = 'static-batches';
    for (const b of buckets.values()) {
      const g = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
      if (!g) continue;
      g.computeBoundingSphere();
      g.computeBoundingBox();
      const mesh = new THREE.Mesh(g, b.mat);
      mesh.castShadow = b.cast;
      mesh.receiveShadow = true;
      mesh.userData.surface = b.surf;
      mesh.name = `batch:${b.mat.name || 'mat'}:${b.surf}`;
      out.add(mesh);
      for (const x of b.geos) if (x !== g) x.dispose();
    }
    this.stats.batches = out.children.length;
    root.add(out);
    this.items = [];
    return out;
  }
}

// ------------------------------------------------------------------ sprites
/** Floating music notes rising from an object (the ice-cream van jingle tell). */
export class NoteFountain {
  constructor(parent, anchor, { count = 4, color, size = 0.7, height = 2.4 } = {}) {
    this.group = new THREE.Group();
    this.group.name = 'notes';
    this.anchor = anchor;
    this.height = height;
    this.size = size;
    this.on = true;
    this.sprites = [];
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(iconMaterial('note'));
      s.raycast = () => {};
      s.renderOrder = 10;
      s.userData.phase = i / count;
      this.group.add(s);
      this.sprites.push(s);
    }
    parent.add(this.group);
    void color;
  }

  update(dt, t) {
    const vis = this.on;
    this.group.visible = vis;
    if (!vis) return;
    this.anchor.updateWorldMatrix(true, false);
    this.group.position.setFromMatrixPosition(this.anchor.matrixWorld);
    for (const s of this.sprites) {
      const k = ((t * 0.45 + s.userData.phase) % 1 + 1) % 1;
      const sz = this.size * Math.min(1, k * 6) * Math.min(1, (1 - k) * 4);
      s.scale.set(sz, sz, 1);
      s.position.set(Math.sin(k * 9 + s.userData.phase * 20) * 0.5, 0.3 + k * this.height, Math.cos(k * 7 + s.userData.phase * 11) * 0.3);
      s.material.rotation = 0;
    }
  }
}

/** A sticker icon ("!", "?", heart...) that can pop over any object (non-character props). */
export class PropIcon {
  constructor(parent, y = 1.5, size = 0.7) {
    this.sprite = new THREE.Sprite(iconMaterial('bang'));
    this.sprite.raycast = () => {};
    this.sprite.renderOrder = 10;
    this.sprite.visible = false;
    this.sprite.position.y = y;
    this.y = y;
    this.size = size;
    this.t = 0;
    this.dur = 0;
    parent.add(this.sprite);
  }

  show(type, dur = 1.6) {
    this.sprite.material = iconMaterial(type);
    this.sprite.visible = true;
    this.t = 0;
    this.dur = dur;
  }

  update(dt, t) {
    if (!this.sprite.visible) return;
    this.t += dt;
    const k = Math.min(1, this.t / 0.25) * Math.min(1, Math.max(0, (this.dur - this.t) / 0.25));
    const s = this.size * (k < 1 && this.t < 0.25 ? 1.15 * k : k) * (1 + Math.sin(t * 8) * 0.04);
    this.sprite.scale.set(s, s, 1);
    this.sprite.position.y = this.y + Math.sin(t * 3.4) * 0.06;
    this.sprite.material.rotation = 0;
    if (this.t >= this.dur) this.sprite.visible = false;
  }
}

// ------------------------------------------------------------------ small bespoke meshes
const CAN = '#6fb5e8';
/** Watering can held in a hand (hand-bone space: roughly -Y = along the arm). */
export function wateringCan() {
  const g = merge([
    part(new THREE.CylinderGeometry(0.11, 0.12, 0.2, 12), CAN, { y: -0.14, z: 0.08 }),
    part(new THREE.CylinderGeometry(0.02, 0.028, 0.3, 6), CAN, { y: -0.12, z: 0.27, rx: 1.0 }),
    part(new THREE.CylinderGeometry(0.045, 0.02, 0.05, 8), CAN, { y: -0.02, z: 0.4, rx: 1.0 }),
    part(new THREE.TorusGeometry(0.08, 0.018, 4, 10, Math.PI), '#4a8fc4', { y: -0.04, z: 0.02, ry: Math.PI / 2 }),
  ]);
  const m = new THREE.Mesh(g, materials.glossy);
  m.castShadow = true;
  m.name = 'wateringCan';
  return m;
}

/** A floppy sun hat (the runaway hat gag). Origin at the brim centre. */
export function sunHat(color = '#f2d27a', band = '#ff7eb6') {
  const g = merge([
    part(new THREE.CylinderGeometry(0.34, 0.36, 0.035, 18), color, { y: 0.02 }),
    part(new THREE.SphereGeometry(0.17, 14, 8, 0, TAU, 0, Math.PI / 2), color, { y: 0.03, sy: 0.9 }),
    part(new THREE.CylinderGeometry(0.175, 0.178, 0.05, 16), band, { y: 0.06 }),
    part(new THREE.IcosahedronGeometry(0.05, 0), band, { x: 0.15, y: 0.08, z: 0.08 }),
  ]);
  const m = new THREE.Mesh(g, materials.toy);
  m.castShadow = true;
  m.name = 'sunHat';
  return m;
}

/** Soft rope/leash between two moving points: a thin cylinder updated every frame. */
export class Leash {
  constructor(parent, color = '#ff5a4e', radius = 0.018) {
    this.mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 5).translate(0, 0.5, 0).rotateX(Math.PI / 2), materials.solid(color));
    this.mesh.castShadow = false;
    this.mesh.raycast = () => {};
    this.mesh.name = 'leash';
    parent.add(this.mesh);
  }

  set(a, b) {
    const d = a.distanceTo(b);
    this.mesh.position.copy(a);
    this.mesh.lookAt(b);
    this.mesh.scale.set(1, 1, Math.max(0.01, d));
  }
}
