// Vertex-coloured "part" helpers. Static props = many parts merged into ONE geometry that
// shares a single material (materials.toy / materials.facet). Cheap to draw, easy to author.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash3 } from '../core/rng.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _c2 = new THREE.Color();

/** Transform shorthand -> Matrix4. t = { x, y, z, rx, ry, rz, s, sx, sy, sz } */
export function xform(t = {}) {
  _p.set(t.x || 0, t.y || 0, t.z || 0);
  _e.set(t.rx || 0, t.ry || 0, t.rz || 0, t.order || 'XYZ');
  _q.setFromEuler(_e);
  const s = t.s ?? 1;
  _s.set(t.sx ?? s, t.sy ?? s, t.sz ?? s);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

/**
 * Clone a geometry into a mergeable, vertex-coloured part.
 * color: '#hex' | [bottomHex, topHex] (vertical gradient in local space) | (x,y,z,color)=>void
 * t: transform shorthand (see xform) or a Matrix4.
 */
export function part(geometry, color, t) {
  let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  const pos = g.attributes.position;
  const n = pos.count;
  const col = new Float32Array(n * 3);
  if (typeof color === 'function') {
    for (let i = 0; i < n; i++) {
      _c.set(0xffffff);
      color(pos.getX(i), pos.getY(i), pos.getZ(i), _c);
      col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
    }
  } else if (Array.isArray(color)) {
    g.computeBoundingBox();
    const { min, max } = g.boundingBox;
    const h = Math.max(1e-6, max.y - min.y);
    _c.set(color[0]);
    _c2.set(color[1]);
    const tmp = new THREE.Color();
    for (let i = 0; i < n; i++) {
      tmp.copy(_c).lerp(_c2, (pos.getY(i) - min.y) / h);
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
  } else {
    _c.set(color);
    for (let i = 0; i < n; i++) {
      col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (t) g.applyMatrix4(t.isMatrix4 ? t : xform(t));
  return g;
}

/** Merge parts (all produced by part()) into one geometry. */
export function merge(parts) {
  const list = parts.flat().filter(Boolean);
  const g = mergeGeometries(list, false);
  if (!g) throw new Error('merge(): incompatible parts');
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/** Apply a transform to a finished (merged) geometry copy. */
export function transformed(geometry, t) {
  return geometry.clone().applyMatrix4(t.isMatrix4 ? t : xform(t));
}

/** Deterministic position-hash vertex jitter: organic low-poly look with no cracks. */
export function jitter(geometry, amount = 0.1, seed = 0) {
  const g = geometry.index ? geometry : geometry; // hash is position-based -> shared verts move together
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = seed * 0.137;
    pos.setXYZ(
      i,
      x + (hash3(x + k, y, z) - 0.5) * 2 * amount,
      y + (hash3(y + k, z, x) - 0.5) * 2 * amount,
      z + (hash3(z + k, x, y) - 0.5) * 2 * amount,
    );
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

// ---- primitive shorthands (sizes in metres) ----
export const rbox = (w, h, d, r = 0.08, seg = 2) =>
  new RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) / 2 - 1e-4));
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt, rb, h, seg = 16, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
export const sphere = (r, ws = 16, hs = 12) => new THREE.SphereGeometry(r, ws, hs);
export const cone = (r, h, seg = 16) => new THREE.ConeGeometry(r, h, seg);
export const capsule = (r, len, cap = 6, rad = 12) => new THREE.CapsuleGeometry(r, len, cap, rad);
export const torus = (r, tube, rs = 8, ts = 20, arc = Math.PI * 2) => new THREE.TorusGeometry(r, tube, rs, ts, arc);
export const ico = (r, detail = 1) => new THREE.IcosahedronGeometry(r, detail);
export const plane = (w, h) => new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2);

/** A tube along points (ropes, bunting lines, hoses). */
export function tube(points, radius = 0.03, seg = 24, radial = 6) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))));
  return new THREE.TubeGeometry(curve, seg, radius, radial, false);
}

/** A sagging catenary-ish curve between two points (for ropes/bunting). */
export function sagPoints(a, b, sag = 0.5, n = 12) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= Math.sin(Math.PI * t) * sag;
    pts.push(p);
  }
  return pts;
}

/**
 * Build an InstancedMesh from a list of transform shorthands.
 * colors: optional per-instance hex list (multiplies vertex colour).
 */
export function instanced(geometry, material, transforms, colors) {
  const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
  transforms.forEach((t, i) => mesh.setMatrixAt(i, xform(t)));
  if (colors) {
    colors.forEach((c, i) => mesh.setColorAt(i, _c.set(c)));
    mesh.instanceColor.needsUpdate = true;
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Convenience: mesh from parts with shadows on. */
export function meshOf(parts, material) {
  const m = new THREE.Mesh(Array.isArray(parts) ? merge(parts) : parts, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
