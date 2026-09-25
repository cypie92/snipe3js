// Shared helpers for the props + nature kits:
//  - cheap soft primitives (bev = 44-tri bevelled box, puck, lathe, blob)
//  - colour painting of merged geometry (per-vertex / per-face)
//  - invisible colliders, a tiny animation runner (Anims) and springy wobble
//  - LiveMesh / InstancedPieces: many separately-movable pivots drawn in ONE draw call
import * as THREE from 'three';
import { part, merge, xform, jitter } from '../../geo.js';
import { materials } from '../../../gfx/materials.js';
import { hash3 } from '../../../core/rng.js';

// ---------------------------------------------------------------- primitives

/** Bevelled box (44 tris). Normals interpolate across the bevel so edges read soft/rounded. */
export function bev(w, h, d, r = 0.06) {
  const H = [w / 2, h / 2, d / 2];
  r = Math.max(0, Math.min(r, H[0] * 0.98, H[1] * 0.98, H[2] * 0.98));
  const pos = [];
  const nor = [];
  const V = (a, s, sg) => {
    const p = [0, 0, 0];
    for (let k = 0; k < 3; k++) p[k] = k === a ? s * H[k] : sg[k] * (H[k] - r);
    const n = [0, 0, 0];
    n[a] = s;
    return [p, n];
  };
  const tri = (A, B, C) => {
    const a = A[0], b = B[0], c = C[0];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * (a[0] + b[0] + c[0]) + ny * (a[1] + b[1] + c[1]) + nz * (a[2] + b[2] + c[2]) < 0) [B, C] = [C, B];
    for (const [p, n] of [A, B, C]) { pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]); }
  };
  const quad = (A, B, C, D) => { tri(A, B, C); tri(A, C, D); };
  const S = [-1, 1];
  for (let a = 0; a < 3; a++) {
    for (const s of S) {
      const b = (a + 1) % 3, c = (a + 2) % 3;
      const sg = (i, j) => { const g = [0, 0, 0]; g[a] = s; g[b] = i; g[c] = j; return g; };
      quad(V(a, s, sg(-1, -1)), V(a, s, sg(1, -1)), V(a, s, sg(1, 1)), V(a, s, sg(-1, 1)));
    }
  }
  if (r > 0) {
    for (let a = 0; a < 3; a++) {
      for (let b = a + 1; b < 3; b++) {
        const c = 3 - a - b;
        for (const sa of S) {
          for (const sb of S) {
            const sg = (k) => { const g = [0, 0, 0]; g[a] = sa; g[b] = sb; g[c] = k; return g; };
            quad(V(a, sa, sg(-1)), V(a, sa, sg(1)), V(b, sb, sg(1)), V(b, sb, sg(-1)));
          }
        }
      }
    }
    for (const sx of S) for (const sy of S) for (const sz of S) {
      const g = [sx, sy, sz];
      tri(V(0, sx, g), V(1, sy, g), V(2, sz, g));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return geo;
}

/** Lathe around Y from [[radius, y], ...]. */
export function lathe(pts, seg = 12, phiStart = 0, phiLength = Math.PI * 2) {
  return new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(Math.max(x, 1e-4), y)), seg, phiStart, phiLength);
}

/** Chamfered disc / fat cylinder, centred. */
export function puck(r, h, b = 0.04, seg = 14) {
  b = Math.min(b, r * 0.5, h * 0.5);
  return lathe([[0, -h / 2], [r - b, -h / 2], [r, -h / 2 + b], [r, h / 2 - b], [r - b, h / 2], [0, h / 2]], seg);
}

/** Smooth-normal low-poly ball (icosphere). detail 0 = 20 tris, 1 = 80, 2 = 180. */
export const ball = (r, detail = 1) => new THREE.IcosahedronGeometry(r, detail);

/** Organic lumpy blob for foliage/rocks (position-hash jitter, crack free). */
export const blob = (r, detail = 1, amount = 0.15, seed = 0) => jitter(new THREE.IcosahedronGeometry(r, detail), r * amount, seed);

/** Low-poly prism rod between two points (for legs, rails, spokes). */
export function rod(a, b, r = 0.03, seg = 6, rTop = r) {
  const A = a.isVector3 ? a : new THREE.Vector3(...a);
  const B = b.isVector3 ? b : new THREE.Vector3(...b);
  const dir = new THREE.Vector3().subVectors(B, A);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(rTop, r, len, seg, 1, false);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  g.applyQuaternion(q);
  g.translate(A.x, A.y, A.z);
  return g;
}

/** Torus arc (for scrolls, handles, hoops). Lies in the XY plane, arc starts at +X. */
export const arc = (r, tube, arcLen = Math.PI, rs = 6, ts = 10) => new THREE.TorusGeometry(r, tube, rs, ts, arcLen);

/** Flat extruded silhouette from a THREE.Shape (depth along Z, centred). */
export function slab(shape, depth = 0.05, bevel = 0.015, curveSegments = 6) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments,
  });
  g.translate(0, 0, -depth / 2);
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

/**
 * Lathe split into uniformly coloured bands (crisp stripes): colorFn(yMid, i) -> hex per profile
 * segment. Returns merged part geometry (already vertex coloured).
 */
export function latheBands(pts, seg, colorFn, t) {
  const list = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (Math.abs(a[0] - b[0]) < 1e-5 && Math.abs(a[1] - b[1]) < 1e-5) continue;
    list.push(part(lathe([a, b], seg), colorFn((a[1] + b[1]) / 2, i), t));
  }
  return merge(list);
}

/** Reverse triangle winding + normals of a non-indexed geometry (undersides / insides). */
export function inside(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const name of ['position', 'normal', 'color']) {
    const a = g.attributes[name];
    if (!a) continue;
    const arr = a.array;
    for (let f = 0; f < arr.length; f += 9) {
      for (let k = 0; k < 3; k++) { const t = arr[f + 3 + k]; arr[f + 3 + k] = arr[f + 6 + k]; arr[f + 6 + k] = t; }
    }
    if (name === 'normal') for (let i = 0; i < arr.length; i++) arr[i] = -arr[i];
    a.needsUpdate = true;
  }
  return g;
}

/**
 * Fake lettering: `lines` rows of thin bars (reads as text at a distance) on a plane facing +Z.
 * Centred at t; w/h = text block size.
 */
export function lettering(w, h, lines, color, t = {}, rng = null, depth = 0.012) {
  const list = [];
  const lh = h / lines;
  let k = 0;
  for (let i = 0; i < lines; i++) {
    let x = -w / 2;
    const y = h / 2 - lh * (i + 0.5);
    const rowW = w * (i === lines - 1 && lines > 1 ? 0.62 : 1);
    while (x < -w / 2 + rowW - 0.02) {
      const f = rng ? rng.range(0.12, 0.3) : [0.22, 0.14, 0.3, 0.18][k++ % 4];
      const ww = Math.min(rowW - (x + w / 2), f * w);
      if (ww < 0.015) break;
      list.push(part(new THREE.BoxGeometry(ww, lh * 0.34, depth), color, { x: x + ww / 2, y }));
      x += ww + Math.max(0.02, lh * 0.3);
    }
  }
  const g = merge(list);
  return g.applyMatrix4(xform(t));
}

/** Shiny gold (trophies, collectible). Metal with a warm self-glow so it never goes muddy. */
export const goldMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true, metalness: 0.55, roughness: 0.2, emissive: '#c07a10', emissiveIntensity: 0.5, envMapIntensity: 2.2,
});
goldMaterial.name = 'kit-gold';

// ---------------------------------------------------------------- colour

const _ca = new THREE.Color();
const _cb = new THREE.Color();
/** Linear mix of two hex colours -> THREE.Color. */
export function mix(a, b, t, out = new THREE.Color()) {
  return out.copy(_ca.set(a)).lerp(_cb.set(b), t);
}
/** Lighter (k>0) / darker (k<0) hex. */
export function shade(hex, k) {
  const c = new THREE.Color(hex);
  if (k >= 0) c.lerp(_ca.set('#fffaf0'), k);
  else c.multiplyScalar(1 + k);
  return `#${c.getHexString()}`;
}

/** Recolour a (non-indexed) geometry per vertex: fn(x, y, z, nx, ny, nz, color). */
export function paint(geo, fn) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  let col = geo.attributes.color;
  if (!col) { col = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3); geo.setAttribute('color', col); }
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    c.setRGB(col.getX(i), col.getY(i), col.getZ(i));
    fn(pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), nor.getY(i), nor.getZ(i), c);
    col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
  return geo;
}

/** Recolour per triangle (crisp low-poly facets): fn(cx, cy, cz, nx, ny, nz, color, faceIndex). */
export function paintFaces(geo, fn) {
  const pos = geo.attributes.position.array;
  let col = geo.attributes.color;
  if (!col) { col = new THREE.BufferAttribute(new Float32Array(pos.length), 3); geo.setAttribute('color', col); }
  const ca = col.array;
  const c = new THREE.Color();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();
  for (let f = 0; f < pos.length / 9; f++) {
    const o = f * 9;
    a.set(pos[o + 3] - pos[o], pos[o + 4] - pos[o + 1], pos[o + 5] - pos[o + 2]);
    b.set(pos[o + 6] - pos[o], pos[o + 7] - pos[o + 1], pos[o + 8] - pos[o + 2]);
    d.crossVectors(a, b).normalize();
    c.setRGB(ca[o], ca[o + 1], ca[o + 2]);
    fn((pos[o] + pos[o + 3] + pos[o + 6]) / 3, (pos[o + 1] + pos[o + 4] + pos[o + 7]) / 3, (pos[o + 2] + pos[o + 5] + pos[o + 8]) / 3,
      d.x, d.y, d.z, c, f);
    for (let k = 0; k < 3; k++) { ca[o + k * 3] = c.r; ca[o + k * 3 + 1] = c.g; ca[o + k * 3 + 2] = c.b; }
  }
  col.needsUpdate = true;
  return geo;
}

/** Deterministic 0..1 noise from a position (re-export for kit code). */
export const noise3 = hash3;

// ---------------------------------------------------------------- meshes & colliders

/** Merged static mesh (shadows on). parts = list of part() geometries. */
export function mesh(parts, material = materials.toy, name) {
  const m = new THREE.Mesh(Array.isArray(parts) ? merge(parts) : parts, material);
  m.castShadow = true;
  m.receiveShadow = true;
  if (name) m.name = name;
  return m;
}

/** Empty named pivot at a position. */
export function pivot(name, x = 0, y = 0, z = 0) {
  const o = new THREE.Group();
  o.name = name;
  o.position.set(x, y, z);
  return o;
}

const colliderMat = new THREE.MeshBasicMaterial({ color: '#ff2bd6', wireframe: true });
colliderMat.name = 'collider';
/** Invisible (still raycastable) collider mesh. Show all with ?colliders=1 in the sandbox. */
export function collider(geo, t) {
  if (t) geo.applyMatrix4(xform(t));
  const m = new THREE.Mesh(geo, colliderMat);
  m.visible = false;
  m.name = 'collider';
  m.userData.collider = true;
  // Colliders are always invisible; they only switch off when an ancestor is hidden
  // (popped balloon, stowed coil...), so hidden pieces never steal shots.
  m.raycast = function (raycaster, intersects) {
    for (let o = this.parent; o; o = o.parent) if (!o.visible) return;
    THREE.Mesh.prototype.raycast.call(this, raycaster, intersects);
  };
  return m;
}
export const boxCollider = (w, h, d, t) => collider(new THREE.BoxGeometry(w, h, d), t);
export const ballCollider = (r, t) => collider(new THREE.IcosahedronGeometry(r, 1), t);

// ---------------------------------------------------------------- animation

export const ease = {
  linear: (k) => k,
  inQuad: (k) => k * k,
  outQuad: (k) => 1 - (1 - k) * (1 - k),
  inCubic: (k) => k * k * k,
  outCubic: (k) => 1 - (1 - k) ** 3,
  inOutSine: (k) => 0.5 - 0.5 * Math.cos(Math.PI * k),
  inOutCubic: (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2),
  outBack: (k) => 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2,
  outElastic: (k) => (k <= 0 ? 0 : k >= 1 ? 1 : 2 ** (-10 * k) * Math.sin((k * 10 - 0.75) * (2 * Math.PI / 3)) + 1),
  outBounce: (k) => {
    const n = 7.5625, d = 2.75;
    if (k < 1 / d) return n * k * k;
    if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75;
    if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375;
    return n * (k -= 2.625 / d) * k + 0.984375;
  },
};

/** Minimal per-prop animation runner. play() resolves true when finished, false if cancelled. */
export class Anims {
  constructor() { this.list = []; }
  play(dur, fn, { ease: e = ease.linear, delay = 0, key } = {}) {
    if (key) this.cancel(key);
    return new Promise((resolve) => {
      this.list.push({ dur: Math.max(1e-4, dur), t: -delay, fn, e, key, resolve });
    });
  }
  cancel(key) {
    this.list = this.list.filter((a) => {
      if (a.key !== key) return true;
      a.resolve(false);
      return false;
    });
  }
  has(key) { return this.list.some((a) => a.key === key); }
  get busy() { return this.list.length > 0; }
  update(dt) {
    if (!this.list.length) return;
    for (const a of this.list.slice()) {
      if (!this.list.includes(a)) continue;
      a.t += dt;
      if (a.t < 0) continue;
      const k = Math.min(1, a.t / a.dur);
      a.fn(a.e(k), k, dt);
      if (k >= 1) {
        const i = this.list.indexOf(a);
        if (i >= 0) this.list.splice(i, 1);
        a.resolve(true);
      }
    }
  }
}

/** Springy squash & stretch of an object around its origin (fun prop-hit reaction). */
export function wobble(obj, anims, strength = 1, key = 'wobble') {
  const ud = obj.userData;
  if (!ud._wobbleBase) ud._wobbleBase = obj.scale.clone();
  const base = ud._wobbleBase;
  return anims.play(0.75, (k) => {
    const s = Math.sin(k * Math.PI * 4.5) * (1 - k) ** 1.5 * 0.2 * strength;
    obj.scale.set(base.x * (1 + s * 0.55), base.y * (1 - s), base.z * (1 + s * 0.55));
  }, { key }).then((done) => {
    if (done) { obj.scale.copy(base); ud._wobbleBase = null; }
    return done;
  });
}

/**
 * Standard finishing for every kit builder: name, parts, surface hint, update + wobble.
 * tick(dt, t) is called every frame from group.userData.update.
 */
export function finish(g, { name, parts = {}, surface = 'wood', anims = new Anims(), tick, bodyForWobble } = {}) {
  g.name = name;
  g.userData.kind = name;
  g.userData.parts = parts;
  g.userData.surface = surface;
  g.userData.anims = anims;
  const ticks = [];
  if (tick) ticks.push(tick);
  g.userData.addTick = (fn) => ticks.push(fn);
  g.userData.update = (dt, t) => {
    anims.update(dt);
    for (let i = 0; i < ticks.length; i++) ticks[i](dt, t);
  };
  const target = bodyForWobble || g;
  g.userData.wobble = (strength = 1) => wobble(target, anims, strength);
  return g;
}

/**
 * Hand-made irregularity (ART_BIBLE): wrap the group's children in an inner 'lean' node tilted by a
 * few degrees (seeded). Parts keep working (relative transforms are unchanged).
 */
export function lean(g, rng, amount = 0.035) {
  if (!amount) return g;
  const inner = new THREE.Group();
  inner.name = 'lean';
  for (const c of [...g.children]) inner.add(c);
  inner.rotation.set(rng.range(-amount, amount), 0, rng.range(-amount, amount));
  g.add(inner);
  return g;
}

// ---------------------------------------------------------------- live pieces

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _nm = new THREE.Matrix3();

/** Matrix of obj relative to root (root excluded). Returns false if hidden or not under root. */
export function relMatrix(obj, root, out) {
  out.identity();
  let o = obj;
  while (o && o !== root) {
    if (!o.visible) return false;
    if (o.matrixAutoUpdate) o.updateMatrix();
    out.premultiply(o.matrix);
    o = o.parent;
  }
  return o === root;
}

/**
 * One Mesh drawing many "pieces"; each piece follows its own pivot Object3D (hide the pivot to
 * hide the piece). Optional per-vertex deform(v: Vector3, t, piece) in pivot space for cloth/flags
 * (flat normals are rebuilt for deformed pieces). Raycasts are disabled: give pivots colliders.
 */
export class LiveMesh extends THREE.Mesh {
  constructor(material = materials.toy) {
    super(new THREE.BufferGeometry(), material);
    this.pieces = [];
    this.castShadow = true;
    this.receiveShadow = true;
    this.name = 'live';
    this.userData.live = true;
  }
  raycast() {}
  addPiece(pivotObj, geo, deform) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const piece = {
      pivot: pivotObj, deform, count: g.attributes.position.count,
      pos: g.attributes.position.array, nor: g.attributes.normal.array, col: g.attributes.color.array,
      last: new THREE.Matrix4(), hidden: false, fresh: true, offset: 0,
    };
    this.pieces.push(piece);
    return piece;
  }
  build() {
    let n = 0;
    for (const p of this.pieces) { p.offset = n; n += p.count; }
    const geo = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const nor = new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const col = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    for (const p of this.pieces) col.array.set(p.col, p.offset * 3);
    geo.setAttribute('position', pos);
    geo.setAttribute('normal', nor);
    geo.setAttribute('color', col);
    this.geometry.dispose();
    this.geometry = geo;
    this.sync(0, true);
    return this;
  }
  sync(t = 0, force = false) {
    const root = this.parent;
    const P = this.geometry.attributes.position;
    const N = this.geometry.attributes.normal;
    if (!P) return;
    const pa = P.array, na = N.array;
    let dirty = false;
    for (const p of this.pieces) {
      const o = p.offset * 3;
      const vis = relMatrix(p.pivot, root, _m);
      if (!vis) {
        if (!p.hidden || force) { pa.fill(0, o, o + p.count * 3); p.hidden = true; dirty = true; }
        continue;
      }
      if (!force && !p.hidden && !p.fresh && (p.frozen || !p.deform) && _m.equals(p.last)) continue;
      p.hidden = false;
      p.fresh = false;
      p.last.copy(_m);
      const src = p.pos;
      if (p.deform) {
        for (let i = 0; i < p.count; i++) {
          _v.set(src[i * 3], src[i * 3 + 1], src[i * 3 + 2]);
          p.deform(_v, t, p);
          _v.applyMatrix4(_m);
          pa[o + i * 3] = _v.x; pa[o + i * 3 + 1] = _v.y; pa[o + i * 3 + 2] = _v.z;
        }
        flatNormals(pa, na, o, p.count);
      } else {
        _nm.getNormalMatrix(_m);
        const sn = p.nor;
        for (let i = 0; i < p.count; i++) {
          _v.set(src[i * 3], src[i * 3 + 1], src[i * 3 + 2]).applyMatrix4(_m);
          pa[o + i * 3] = _v.x; pa[o + i * 3 + 1] = _v.y; pa[o + i * 3 + 2] = _v.z;
          _v.set(sn[i * 3], sn[i * 3 + 1], sn[i * 3 + 2]).applyMatrix3(_nm).normalize();
          na[o + i * 3] = _v.x; na[o + i * 3 + 1] = _v.y; na[o + i * 3 + 2] = _v.z;
        }
      }
      dirty = true;
    }
    if (dirty) {
      P.needsUpdate = true;
      N.needsUpdate = true;
      this.geometry.computeBoundingSphere();
      this.geometry.computeBoundingBox();
    }
  }
}

function flatNormals(pa, na, o, count) {
  for (let f = 0; f < count / 3; f++) {
    const i = o + f * 9;
    const ux = pa[i + 3] - pa[i], uy = pa[i + 4] - pa[i + 1], uz = pa[i + 5] - pa[i + 2];
    const vx = pa[i + 6] - pa[i], vy = pa[i + 7] - pa[i + 1], vz = pa[i + 8] - pa[i + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    for (let k = 0; k < 3; k++) { na[i + k * 3] = nx; na[i + k * 3 + 1] = ny; na[i + k * 3 + 2] = nz; }
  }
}

/**
 * InstancedMesh whose instances follow pivot Object3Ds (wheels, balloons...). Rotate/move/hide the
 * pivots; call sync() each frame (kit updates do this). shapes[i] = optional extra local Matrix4.
 */
export class InstancedPieces extends THREE.InstancedMesh {
  constructor(geo, material, pivots, shapes = []) {
    super(geo, material, pivots.length);
    this.pivots = pivots;
    this.shapes = shapes;
    this.castShadow = true;
    this.receiveShadow = true;
    this.name = 'pieces';
    this._last = pivots.map(() => new THREE.Matrix4().makeScale(0, 0, 0));
    for (let i = 0; i < pivots.length; i++) this.setMatrixAt(i, this._last[i]);
  }
  sync(force = false) {
    let dirty = false;
    for (let i = 0; i < this.pivots.length; i++) {
      if (!relMatrix(this.pivots[i], this.parent, _m)) _m.makeScale(0, 0, 0);
      else if (this.shapes[i]) _m.multiply(this.shapes[i]);
      if (!force && _m.equals(this._last[i])) continue;
      this._last[i].copy(_m);
      this.setMatrixAt(i, _m);
      dirty = true;
    }
    if (dirty) {
      this.instanceMatrix.needsUpdate = true;
      this.computeBoundingSphere();
      this.computeBoundingBox();
    }
  }
}

// ---------------------------------------------------------------- misc

/** Accept Vector3 | [x,y,z] | {x,y,z}. */
export function vec(p, def = [0, 0, 0]) {
  if (!p) return new THREE.Vector3(...def);
  if (p.isVector3) return p.clone();
  if (Array.isArray(p)) return new THREE.Vector3(p[0] || 0, p[1] || 0, p[2] || 0);
  return new THREE.Vector3(p.x || 0, p.y || 0, p.z || 0);
}

/** Triangle / draw-call stats of an object tree (visible, non-collider meshes). */
export function stats(root) {
  let tris = 0;
  let calls = 0;
  root.traverseVisible((o) => {
    if (!o.isMesh || o.userData.collider) return;
    const g = o.geometry;
    const n = (g.index ? g.index.count : g.attributes.position?.count || 0) / 3;
    tris += n * (o.isInstancedMesh ? o.count : 1);
    calls += 1;
  });
  return { tris: Math.round(tris), calls };
}

export { THREE, part, merge, xform, materials };
