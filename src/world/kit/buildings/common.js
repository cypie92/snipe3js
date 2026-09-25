// Shared helpers for the buildings kit: cheap chunky primitives, a part accumulator with a
// transform stack (Kit), colour tweaks and triangle / draw-call stats.
import * as THREE from 'three';
import { part, merge, xform } from '../../geo.js';
import { materials } from '../../../gfx/materials.js';
import { Rng } from '../../../core/rng.js';

export { THREE, materials, Rng, part, merge, xform };

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rngOf = (seed, salt = '') => (seed instanceof Rng ? seed : new Rng(`${seed ?? 1}${salt}`));

// ---------------------------------------------------------------- colour
const _c = new THREE.Color();
const _c2 = new THREE.Color();
const _hsl = { h: 0, s: 0, l: 0 };

/** Shift a hex colour in sRGB HSL space. Returns '#rrggbb'. */
export function hsl(hex, dh = 0, ds = 0, dl = 0) {
  _c.set(hex).getHSL(_hsl, THREE.SRGBColorSpace);
  _c.setHSL((_hsl.h + dh + 1) % 1, clamp(_hsl.s + ds, 0, 1), clamp(_hsl.l + dl, 0, 1), THREE.SRGBColorSpace);
  return `#${_c.getHexString(THREE.SRGBColorSpace)}`;
}
export const shade = (hex, dl) => hsl(hex, 0, 0, dl);
/** Mix two hex colours in sRGB. */
export function mix(a, b, t) {
  _c.set(a).convertLinearToSRGB();
  _c2.set(b).convertLinearToSRGB();
  _c.lerp(_c2, t).convertSRGBToLinear();
  return `#${_c.getHexString(THREE.SRGBColorSpace)}`;
}
/** Small random tint so repeated colours never look copy-pasted. */
export const wobbleColor = (rng, hex, l = 0.03, s = 0.03, h = 0.008) =>
  hsl(hex, rng.range(-h, h), rng.range(-s, s), rng.range(-l, l));

// ---------------------------------------------------------------- geometry
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

/**
 * Chamfered box with smooth "rounded" edge normals. 44 triangles (a RoundedBoxGeometry is 108-300),
 * reads as a soft toy block from any distance. Centred on the origin.
 */
export function cbox(w, h, d, r = 0.08) {
  const hx = w / 2, hy = h / 2, hz = d / 2;
  r = Math.max(1e-3, Math.min(r, hx * 0.96, hy * 0.96, hz * 0.96));
  const inn = [hx - r, hy - r, hz - r];
  const pos = [];
  const nor = [];
  const V = (p, n) => ({ p: [p[0] + n[0] * r, p[1] + n[1] * r, p[2] + n[2] * r], n });
  const tri = (a, b, c) => {
    const fn = cross(sub(b.p, a.p), sub(c.p, a.p));
    const avg = [a.n[0] + b.n[0] + c.n[0], a.n[1] + b.n[1] + c.n[1], a.n[2] + b.n[2] + c.n[2]];
    if (dot(fn, avg) < 0) [b, c] = [c, b];
    for (const v of [a, b, c]) { pos.push(v.p[0], v.p[1], v.p[2]); nor.push(v.n[0], v.n[1], v.n[2]); }
  };
  const quad = (a, b, c, d) => { tri(a, b, c); tri(a, c, d); };
  for (let ax = 0; ax < 3; ax++) {
    for (const s of [-1, 1]) {
      const n = [0, 0, 0]; n[ax] = s;
      const a1 = (ax + 1) % 3, a2 = (ax + 2) % 3;
      const corner = (u, v) => { const p = [0, 0, 0]; p[ax] = s * inn[ax]; p[a1] = u * inn[a1]; p[a2] = v * inn[a2]; return V(p, n); };
      quad(corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1));
    }
  }
  for (let a = 0; a < 3; a++) {
    for (let b = a + 1; b < 3; b++) {
      const c = 3 - a - b;
      for (const sa of [-1, 1]) {
        for (const sb of [-1, 1]) {
          const na = [0, 0, 0]; na[a] = sa;
          const nb = [0, 0, 0]; nb[b] = sb;
          const P = (sc) => { const p = [0, 0, 0]; p[a] = sa * inn[a]; p[b] = sb * inn[b]; p[c] = sc * inn[c]; return p; };
          quad(V(P(-1), na), V(P(1), na), V(P(1), nb), V(P(-1), nb));
        }
      }
    }
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const p = [sx * inn[0], sy * inn[1], sz * inn[2]];
    tri(V(p, [sx, 0, 0]), V(p, [0, sy, 0]), V(p, [0, 0, sz]));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

/**
 * Flat-shaded solid from convex polygons (arrays of [x,y,z]). Faces are oriented away from
 * `centre` automatically; degenerate triangles are dropped.
 */
export function polySolid(polys, centre) {
  if (!centre) {
    const c = [0, 0, 0];
    let n = 0;
    for (const p of polys) for (const v of p) { c[0] += v[0]; c[1] += v[1]; c[2] += v[2]; n++; }
    centre = [c[0] / n, c[1] / n, c[2] / n];
  }
  const pos = [];
  const nor = [];
  for (const poly of polys) {
    const fc = [0, 0, 0];
    for (const v of poly) { fc[0] += v[0] / poly.length; fc[1] += v[1] / poly.length; fc[2] += v[2] / poly.length; }
    const out = sub(fc, centre);
    for (let i = 1; i < poly.length - 1; i++) {
      let a = poly[0], b = poly[i], c = poly[i + 1];
      let fn = cross(sub(b, a), sub(c, a));
      const len = Math.hypot(fn[0], fn[1], fn[2]);
      if (len < 1e-7) continue;
      if (dot(fn, out) < 0) { [b, c] = [c, b]; fn = [-fn[0], -fn[1], -fn[2]]; }
      const n = [fn[0] / len, fn[1] / len, fn[2] / len];
      for (const v of [a, b, c]) { pos.push(v[0], v[1], v[2]); nor.push(n[0], n[1], n[2]); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

/** Truncated rectangular pyramid: bottom w0 x d0 at y=0, top w1 x d1 at y=h (top may be offset). */
export function frustum(w0, d0, w1, d1, h, ox = 0, oz = 0) {
  const b = [[-w0 / 2, 0, -d0 / 2], [w0 / 2, 0, -d0 / 2], [w0 / 2, 0, d0 / 2], [-w0 / 2, 0, d0 / 2]];
  const t = [[-w1 / 2 + ox, h, -d1 / 2 + oz], [w1 / 2 + ox, h, -d1 / 2 + oz], [w1 / 2 + ox, h, d1 / 2 + oz], [-w1 / 2 + ox, h, d1 / 2 + oz]];
  const polys = [b, t];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    polys.push([b[i], b[j], t[j], t[i]]);
  }
  return polySolid(polys, [ox / 2, h * 0.4, oz / 2]);
}

/** Regular n-gon frustum (octagonal roofs, spires, plinths). Bottom radius r0 at y=0, top r1 at y=h. */
export function ngonFrustum(n, r0, r1, h, rot = 0) {
  const b = [], t = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    b.push([Math.cos(a) * r0, 0, Math.sin(a) * r0]);
    t.push([Math.cos(a) * r1, h, Math.sin(a) * r1]);
  }
  const polys = [b, t];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    polys.push([b[i], b[j], t[j], t[i]]);
  }
  return polySolid(polys, [0, h * 0.3, 0]);
}

/** Extrude a convex 2D polygon [[x,y],...] along +Z by `depth`, centred on z=0. Flat shaded. */
export function prism(pts, depth) {
  const f = pts.map(([x, y]) => [x, y, depth / 2]);
  const k = pts.map(([x, y]) => [x, y, -depth / 2]);
  const polys = [f, k];
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    polys.push([f[i], f[j], k[j], k[i]]);
  }
  return polySolid(polys);
}

/** Extrude any THREE.Shape (arches, rings with holes). Flat normals, no uv. */
export function extrude(shape, depth, { bevel = 0, bevelSegments = 1, curveSegments = 6 } = {}) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments, curveSegments,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Round-top (semicircular arch) outline, bottom-centre at origin: width w, total height h. */
export function archPath(w, h, target = new THREE.Shape(), seg = 10) {
  const r = w / 2;
  const hs = Math.max(0.001, h - r);
  target.moveTo(-r, 0);
  target.lineTo(r, 0);
  target.lineTo(r, hs);
  for (let i = 1; i <= seg; i++) {
    const a = (i / seg) * Math.PI;
    target.lineTo(Math.cos(a) * r, hs + Math.sin(a) * r);
  }
  target.lineTo(-r, 0);
  return target;
}

/** Pointed (gothic lancet) arch outline, bottom-centre at origin. */
export function lancetPath(w, h, target = new THREE.Shape(), seg = 6) {
  const r = w / 2;
  const R = w * 0.85; // arc radius > half-width -> pointed
  const hs = Math.max(0.001, h - Math.sqrt(R * R - (R - r) * (R - r)));
  const apexY = hs + Math.sqrt(R * R - (R - r) * (R - r));
  target.moveTo(-r, 0);
  target.lineTo(r, 0);
  target.lineTo(r, hs);
  // right arc centred at (r - R, hs)
  const a0 = 0, a1 = Math.acos((R - r) / R);
  for (let i = 1; i <= seg; i++) {
    const a = a0 + (a1 - a0) * (i / seg);
    target.lineTo(r - R + Math.cos(a) * R, hs + Math.sin(a) * R);
  }
  target.lineTo(0, apexY);
  for (let i = seg - 1; i >= 0; i--) {
    const a = a0 + (a1 - a0) * (i / seg);
    target.lineTo(-(r - R + Math.cos(a) * R), hs + Math.sin(a) * R);
  }
  target.lineTo(-r, 0);
  return target;
}

/** Rounded rectangle outline centred at origin. */
export function roundRectPath(w, h, r, target = new THREE.Shape(), seg = 4) {
  r = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3);
  const pts = [];
  const corners = [[w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, 0.5], [-w / 2 + r, -h / 2 + r, 1], [w / 2 - r, -h / 2 + r, 1.5]];
  for (const [cx, cy, q] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = (q + (i / seg) * 0.5) * Math.PI;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  }
  target.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) target.lineTo(pts[i][0], pts[i][1]);
  target.lineTo(pts[0][0], pts[0][1]);
  return target;
}

/** Lathe from [[r, y], ...] points, smooth normals. */
export function lathe(points, seg = 20, phiStart = 0, phiLength = TAU) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)), seg, phiStart, phiLength);
}

/** Box stretched between two points (beams, braces, rails). */
export function beamBetween(a, b, w, h, r = 0.03) {
  const A = a.isVector3 ? a : new THREE.Vector3(...a);
  const B = b.isVector3 ? b : new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = r > 0 ? cbox(w, h, len, r) : new THREE.BoxGeometry(w, h, len);
  // local +Z runs from A to B
  const dir = B.clone().sub(A).normalize();
  const up = Math.abs(dir.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const x = new THREE.Vector3().crossVectors(up, dir).normalize();
  const y = new THREE.Vector3().crossVectors(dir, x).normalize();
  const m = new THREE.Matrix4().makeBasis(x, y, dir).setPosition(A.clone().add(B).multiplyScalar(0.5));
  if (g.index) return g.toNonIndexed().applyMatrix4(m);
  return g.applyMatrix4(m);
}

/** Cylinder between two points. */
export function cylBetween(a, b, r0, r1 = r0, seg = 8) {
  const A = a.isVector3 ? a : new THREE.Vector3(...a);
  const B = b.isVector3 ? b : new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, false);
  const dir = B.clone().sub(A).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const m = new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  return g.applyMatrix4(m);
}

/**
 * Sweep a 2D profile [[x, y], ...] (x = lateral/left-right, y = up) along a 3D polyline.
 * Used for kerbs, walls, rails. Smooth normals along the path, flat across profile corners
 * when `hard` is true (duplicated profile verts).
 */
export function sweep(profile, path, { closed = false, hard = true, caps = true } = {}) {
  const P = path.map((p) => (p.isVector3 ? p : new THREE.Vector3(p[0], p[1] ?? 0, p[2] ?? p[1])));
  const n = P.length;
  const frames = [];
  for (let i = 0; i < n; i++) {
    const prev = P[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const next = P[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const t = next.clone().sub(prev).setY(0).normalize();
    const side = new THREE.Vector3(t.z, 0, -t.x); // right-hand lateral (x of the profile)
    // mitre scale so the profile keeps its width at corners
    let scale = 1;
    if (i > 0 && i < n - 1 || closed) {
      const t0 = P[i].clone().sub(prev).setY(0).normalize();
      const t1 = next.clone().sub(P[i]).setY(0).normalize();
      const c = t0.dot(t1);
      scale = 1 / Math.max(0.5, Math.sqrt((1 + c) / 2));
    }
    frames.push({ side, scale });
  }
  const pos = [];
  const addQuad = (a, b, c, d) => { pos.push(...a, ...b, ...c, ...a, ...c, ...d); };
  const ring = (i) => profile.map(([x, y]) => {
    const f = frames[i];
    const p = P[i];
    return [p.x + f.side.x * x * f.scale, p.y + y, p.z + f.side.z * x * f.scale];
  });
  const rings = P.map((_, i) => ring(i));
  const segs = closed ? n : n - 1;
  const m = profile.length;
  for (let i = 0; i < segs; i++) {
    const r0 = rings[i], r1 = rings[(i + 1) % n];
    for (let j = 0; j < m - 1; j++) addQuad(r0[j], r1[j], r1[j + 1], r0[j + 1]);
  }
  if (caps && !closed) {
    // fan caps (profile assumed convex-ish, listed bottom-left -> top -> bottom-right)
    for (const [ri, flip] of [[0, true], [n - 1, false]]) {
      const r = rings[ri];
      for (let j = 1; j < m - 1; j++) {
        if (flip) pos.push(...r[0], ...r[j + 1], ...r[j]);
        else pos.push(...r[0], ...r[j], ...r[j + 1]);
      }
    }
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  if (!hard) {
    g = mergeVerts(g);
  }
  return g;
}

function mergeVerts(g) {
  // cheap smooth-normal pass: average normals of coincident positions
  const pos = g.attributes.position;
  const map = new Map();
  const key = (i) => `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
  const nor = g.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    const a = map.get(k) || [0, 0, 0];
    a[0] += nor.getX(i); a[1] += nor.getY(i); a[2] += nor.getZ(i);
    map.set(k, a);
  }
  for (let i = 0; i < pos.count; i++) {
    const a = map.get(key(i));
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    nor.setXYZ(i, a[0] / l, a[1] / l, a[2] / l);
  }
  return g;
}

/** Resample a polyline/curve through XZ points at ~`step` metres (CatmullRom when smooth). */
export function resample(points, step = 1, { smooth = true, closed = false, y = 0 } = {}) {
  const V = points.map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(p[0], p.length > 2 ? p[1] : y, p.length > 2 ? p[2] : p[1])));
  if (V.length < 2) return V;
  if (smooth && V.length > 2) {
    const curve = new THREE.CatmullRomCurve3(V, closed, 'centripetal');
    const n = Math.max(2, Math.ceil(curve.getLength() / step));
    return curve.getSpacedPoints(n).slice(0, closed ? n : n + 1);
  }
  const out = [];
  const segs = closed ? V.length : V.length - 1;
  for (let i = 0; i < segs; i++) {
    const a = V[i], b = V[(i + 1) % V.length];
    const k = Math.max(1, Math.ceil(a.distanceTo(b) / step));
    for (let j = 0; j < k; j++) out.push(a.clone().lerp(b, j / k));
  }
  if (!closed) out.push(V[V.length - 1].clone());
  return out;
}

/**
 * Frames along a polyline of XZ points: { p, t (unit tangent), left (unit, Y-up left of travel), s (arc length) }.
 * `left` matches sweep()'s +x profile axis.
 */
export function pathFrames(points, { closed = false, y = 0 } = {}) {
  const P = points.map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(p[0], p.length > 2 ? p[1] : y, p.length > 2 ? p[2] : p[1])));
  const n = P.length;
  let s = 0;
  return P.map((p, i) => {
    const prev = P[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const next = P[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const t = next.clone().sub(prev).setY(0).normalize();
    if (i > 0) s += p.distanceTo(P[i - 1]);
    return { p, t, left: new THREE.Vector3(t.z, 0, -t.x), s };
  });
}

/** Point + tangent at arc length `s` along frames from pathFrames(). */
export function alongPath(frames, s) {
  s = clamp(s, 0, frames[frames.length - 1].s);
  let i = 1;
  while (i < frames.length - 1 && frames[i].s < s) i++;
  const a = frames[i - 1], b = frames[i];
  const k = (s - a.s) / Math.max(1e-6, b.s - a.s);
  const p = a.p.clone().lerp(b.p, k);
  const t = b.p.clone().sub(a.p).setY(0).normalize();
  return { p, t, left: new THREE.Vector3(t.z, 0, -t.x), ry: Math.atan2(t.x, t.z) };
}

// ---------------------------------------------------------------- the Kit accumulator
/**
 * Collects vertex-coloured parts per material under a transform stack, then merges them into
 * one mesh per material. `kit.add(geo, colour, t, mat)`; `kit.at(t, () => ...)` nests transforms.
 */
export class Kit {
  constructor(name = 'kit') {
    this.name = name;
    this.buckets = new Map();
    this.raws = new Map();
    this.stack = [new THREE.Matrix4()];
    this.anchors = [];
    this.warps = [];
  }

  get m() { return this.stack[this.stack.length - 1]; }
  mat(t) { return t ? this.m.clone().multiply(t.isMatrix4 ? t : xform(t)) : this.m.clone(); }
  push(t) { this.stack.push(this.mat(t)); return this; }
  pop() { if (this.stack.length > 1) this.stack.pop(); return this; }
  at(t, fn) { this.push(t); try { fn(); } finally { this.pop(); } return this; }

  /** Add a vertex-coloured part (colour: hex | [bottom, top] | fn) to material bucket `mat`. */
  add(geo, color, t, mat = materials.toy) {
    const g = part(geo, color, this.mat(t));
    if (!this.buckets.has(mat)) this.buckets.set(mat, []);
    this.buckets.get(mat).push(g);
    return g;
  }

  /**
   * Add geometry coloured per triangle: faceFn(cx, cy, cz, colour, i) gets each face centroid (local
   * space, before `t`) and sets the colour. Gives crisp bands / blocks (masonry, slabs, fields).
   */
  addFaces(geo, faceFn, t, mat = materials.toy) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 3) {
      const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
      const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
      const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      c.set(0xffffff);
      faceFn(cx, cy, cz, c, i / 3);
      for (let k = 0; k < 3; k++) { col[(i + k) * 3] = c.r; col[(i + k) * 3 + 1] = c.g; col[(i + k) * 3 + 2] = c.b; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.applyMatrix4(this.mat(t));
    if (!this.buckets.has(mat)) this.buckets.set(mat, []);
    this.buckets.get(mat).push(g);
    return g;
  }

  /** Add textured geometry (keeps uv) for a dedicated material (signs, numbers, clock faces). */
  raw(geo, mat, t) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    g.applyMatrix4(this.mat(t));
    if (!this.raws.has(mat)) this.raws.set(mat, []);
    this.raws.get(mat).push(g);
    return g;
  }

  /** Invisible marker Object3D (spawn points, attach points). */
  anchor(name, t) {
    const o = new THREE.Object3D();
    o.name = name;
    this.mat(t).decompose(o.position, o.quaternion, o.scale);
    this.anchors.push(o);
    return o;
  }

  /** Remember the current world transform of a separately built object (hinged parts). */
  place(obj, t) {
    this.mat(t).decompose(obj.position, obj.quaternion, obj.scale);
    this.anchors.push(obj);
    return obj;
  }

  /** Position warp applied at build time to every vertex and anchor (lean, sag...). */
  warp(fn) { this.warps.push(fn); return this; }

  /** Merge another kit's contents into this one (terraces), optionally transformed by `matrix`. */
  absorb(other, matrix) {
    other.bake();
    const tx = (g) => (matrix ? g.applyMatrix4(matrix) : g);
    for (const [m, list] of other.buckets) { if (!this.buckets.has(m)) this.buckets.set(m, []); this.buckets.get(m).push(...list.map(tx)); }
    for (const [m, list] of other.raws) { if (!this.raws.has(m)) this.raws.set(m, []); this.raws.get(m).push(...list.map(tx)); }
    for (const a of other.anchors) { if (matrix) a.applyMatrix4(matrix); this.anchors.push(a); }
    other.buckets = new Map(); other.raws = new Map(); other.anchors = [];
    return this;
  }

  /** Apply pending warps to all geometry and anchors collected so far. */
  bake() {
    if (!this.warps.length) return this;
    const v = new THREE.Vector3();
    const all = [...this.buckets.values(), ...this.raws.values()].flat();
    for (const g of all) {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        for (const fn of this.warps) fn(v);
        p.setXYZ(i, v.x, v.y, v.z);
      }
      p.needsUpdate = true;
    }
    for (const a of this.anchors) for (const fn of this.warps) fn(a.position);
    this.warps = [];
    return this;
  }

  /** Build meshes into `group` (created if omitted). Returns the group. */
  build(group = new THREE.Group(), { shadows = true } = {}) {
    group.name ||= this.name;
    this.bake();
    for (const [m, list] of this.buckets) {
      if (!list.length) continue;
      const mesh = new THREE.Mesh(merge(list), m);
      mesh.name = `${this.name}:${m.name || 'mat'}`;
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    for (const [m, list] of this.raws) {
      if (!list.length) continue;
      const mesh = new THREE.Mesh(merge(list), m);
      mesh.name = `${this.name}:${m.name || 'decal'}`;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    for (const a of this.anchors) if (!a.parent) group.add(a);
    this.buckets = new Map();
    this.raws = new Map();
    return group;
  }
}

/** Make a separately-animated sub-object from a kit: returns a Group containing its meshes. */
export function subObject(name, fill) {
  const kit = new Kit(name);
  fill(kit);
  const g = kit.build(new THREE.Group());
  g.name = name;
  return g;
}

// ---------------------------------------------------------------- stats
/** Draw calls and triangles of a (visible) object tree. InstancedMesh = 1 call, tris x count. */
export function stats(root) {
  let draws = 0, tris = 0, meshes = 0;
  root.traverseVisible((o) => {
    if (!(o.isMesh || o.isPoints || o.isLine)) return;
    const g = o.geometry;
    if (!g) return;
    draws++;
    if (o.isMesh) {
      meshes++;
      const count = g.index ? g.index.count : g.attributes.position.count;
      const drawn = Math.min(count, g.drawRange.count ?? Infinity) / 3;
      tris += drawn * (o.isInstancedMesh ? o.count : 1);
    }
  });
  return { draws, tris: Math.round(tris), meshes };
}

/** Invisible, raycastable enlarged collider for tiny gameplay targets. */
export function addCollider(obj, radius = 0.5, offset = [0, 0, 0]) {
  const c = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 6), materials.solid('#ff00ff'));
  c.name = 'collider';
  c.visible = false;
  c.position.set(...offset);
  obj.add(c);
  return c;
}

// ---------------------------------------------------------------- tiny animation helper
export const ease = {
  linear: (t) => t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; },
  outElastic: (t) => (t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  outBounce: (t) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
};

/**
 * Promise-based tweens advanced by a builder's userData.update(dt). Starting a tween on a `key`
 * that is already running cancels the old one (its promise resolves false).
 */
export class Tweens {
  constructor() { this.list = []; }
  run(key, duration, step, easing = ease.outCubic) {
    for (const tw of this.list) if (tw.key === key && !tw.done) { tw.done = true; tw.resolve(false); }
    return new Promise((resolve) => {
      this.list.push({ key, t: 0, duration: Math.max(1e-3, duration), step, easing, resolve, done: false });
    });
  }
  update(dt) {
    for (const tw of this.list) {
      if (tw.done) continue;
      tw.t = Math.min(tw.duration, tw.t + dt);
      const k = tw.t / tw.duration;
      tw.step(tw.easing(k), k);
      if (k >= 1) { tw.done = true; tw.resolve(true); }
    }
    if (this.list.length > 16) this.list = this.list.filter((tw) => !tw.done);
  }
}
