// Skinned "toy rig" builder. A character is authored as many vertex-coloured primitive parts,
// each bound to a bone (rigidly, or with blended weights for bendy rubber-hose limbs), then merged
// into ONE indexed geometry drawn by ONE SkinnedMesh (1 draw call + 1 shadow draw per character).
// Geometry is cached per config and shared; every instance gets its own lightweight skeleton.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _c = new THREE.Color();
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();

/** Transform shorthand -> Matrix4. t = { x, y, z, rx, ry, rz, order, s, sx, sy, sz } */
export function tf(t = {}) {
  if (t.isMatrix4) return t;
  _v.set(t.x || 0, t.y || 0, t.z || 0);
  _e.set(t.rx || 0, t.ry || 0, t.rz || 0, t.order || 'XYZ');
  _q.setFromEuler(_e);
  const s = t.s ?? 1;
  _s.set(t.sx ?? s, t.sy ?? s, t.sz ?? s);
  return new THREE.Matrix4().compose(_v, _q, _s);
}

const protoCache = new Map();
/** Cached primitive prototypes (never mutated; parts clone them). */
export function proto(key, make) {
  let g = protoCache.get(key);
  if (!g) { g = make(); protoCache.set(key, g); }
  return g;
}
export const G = {
  sphere: (ws = 12, hs = 8) => proto(`s${ws}.${hs}`, () => new THREE.SphereGeometry(1, ws, hs)),
  hemi: (ws = 12, hs = 4) => proto(`h${ws}.${hs}`, () => new THREE.SphereGeometry(1, ws, hs, 0, Math.PI * 2, 0, Math.PI / 2)),
  capsule: (r, len, cap = 3, rad = 8, hseg = 1) => proto(`c${r}.${len}.${cap}.${rad}.${hseg}`, () => new THREE.CapsuleGeometry(r, len, cap, rad, hseg)),
  cyl: (rt, rb, h, seg = 10, open = false) => proto(`y${rt}.${rb}.${h}.${seg}.${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)),
  cone: (r, h, seg = 8) => proto(`k${r}.${h}.${seg}`, () => new THREE.ConeGeometry(r, h, seg)),
  torus: (r, tube, rs = 4, ts = 10, arc = Math.PI * 2) => proto(`t${r}.${tube}.${rs}.${ts}.${arc}`, () => new THREE.TorusGeometry(r, tube, rs, ts, arc)),
  box: (w, h, d) => proto(`b${w}.${h}.${d}`, () => new THREE.BoxGeometry(w, h, d)),
  ico: (detail = 1) => proto(`i${detail}`, () => new THREE.IcosahedronGeometry(1, detail)),
  /** Unit disc facing DOWN (-Y): closes the bottom of hemispheres (hat linings). */
  disc: (seg = 12) => proto(`d${seg}`, () => new THREE.CircleGeometry(1, seg).rotateX(Math.PI / 2)),
};

/** Lathe from (r, y) pairs; `cuts` inserts extra rings so colour bands get crisp edges. */
export function lathe(profile, seg = 14, cuts = [], phiStart = 0, phiLength = Math.PI * 2) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  for (const cy of cuts) {
    for (const off of [-0.0015, 0.0015]) {
      const y = cy + off;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        if ((a.y < y && b.y > y) || (a.y > y && b.y < y)) {
          const k = (y - a.y) / (b.y - a.y);
          pts.splice(i + 1, 0, new THREE.Vector2(a.x + (b.x - a.x) * k, y));
          break;
        }
      }
    }
  }
  return new THREE.LatheGeometry(pts, seg, phiStart, phiLength);
}

/** Colour helper: '#hex' | [bottom, top] gradient | fn(x,y,z,color) in part-local space. */
function paint(g, color) {
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
    const a = new THREE.Color(color[0]);
    const b = new THREE.Color(color[1]);
    for (let i = 0; i < n; i++) {
      _c.copy(a).lerp(b, (pos.getY(i) - min.y) / h);
      col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
    }
  } else {
    _c.set(color);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

/**
 * Collects bones + parts, then builds one skinned, vertex-coloured, indexed geometry.
 *   const rb = new RigBuilder();
 *   const hips = rb.bone('hips', null, [0, 0.35, 0]);
 *   rb.add(G.sphere(), '#f00', { y: 0.5, s: 0.2 }, hips);                 // rigid
 *   rb.add(geo, '#0f0', m, (x, y, z) => [a, 1 - k, b, k]);               // blended weights
 */
export class RigBuilder {
  constructor() {
    this.bones = [];
    this.byName = {};
    this.parts = [];
  }

  /** pos = bind position in model space. rot = [rx, ry, rz(, order)], scl = [sx, sy, sz]. */
  bone(name, parent, pos, rot, scl) {
    const i = this.bones.length;
    const p = parent == null ? null : (typeof parent === 'string' ? this.byName[parent] : parent);
    const q = new THREE.Quaternion();
    if (rot) q.setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], rot[3] || 'XYZ'));
    const s = scl ? new THREE.Vector3(...scl) : new THREE.Vector3(1, 1, 1);
    const world = new THREE.Matrix4().compose(new THREE.Vector3(...pos), q, s);
    this.bones.push({ name, parent: p, world });
    this.byName[name] = i;
    return i;
  }

  /** World (model-space) bind matrix of a bone, e.g. to author parts in a bone's local frame. */
  boneMatrix(b) {
    return this.bones[typeof b === 'string' ? this.byName[b] : b].world;
  }

  /**
   * Add a part. geometry is cloned. t: transform shorthand or Matrix4 (applied after `pre`).
   * bind: bone index/name (rigid) or fn(x,y,z) -> [b0, w0, b1, w1] evaluated in model space.
   */
  add(geometry, color, t, bind, pre) {
    let g = geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    if (!g.index) {
      const n = g.attributes.position.count;
      const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
      for (let i = 0; i < n; i++) idx[i] = i;
      g.setIndex(new THREE.BufferAttribute(idx, 1));
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    paint(g, color);
    if (pre) g.applyMatrix4(pre.isMatrix4 ? pre : tf(pre));
    if (t) g.applyMatrix4(t.isMatrix4 ? t : tf(t));
    const n = g.attributes.position.count;
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    const pos = g.attributes.position;
    const fixed = typeof bind === 'function' ? null : (typeof bind === 'string' ? this.byName[bind] : bind);
    for (let i = 0; i < n; i++) {
      if (fixed != null) { si[i * 4] = fixed; sw[i * 4] = 1; continue; }
      const w = bind(pos.getX(i), pos.getY(i), pos.getZ(i));
      si[i * 4] = w[0]; sw[i * 4] = w[1];
      if (w.length > 2 && w[3] > 0) { si[i * 4 + 1] = w[2]; sw[i * 4 + 1] = w[3]; }
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    this.parts.push(g);
    return g;
  }

  /** Build the shared blueprint: { geometry, bones:[{name,parent,local,inverse}] }. */
  build() {
    const geometry = mergeGeometries(this.parts, false);
    if (!geometry) throw new Error('RigBuilder: merge failed');
    for (const p of this.parts) p.dispose();
    this.parts = [];
    geometry.computeBoundingSphere();
    const bones = this.bones.map((b) => {
      const local = b.parent == null ? b.world.clone() : this.bones[b.parent].world.clone().invert().multiply(b.world);
      const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scale = new THREE.Vector3();
      local.decompose(pos, quat, scale);
      return { name: b.name, parent: b.parent, pos, quat, scale, inverse: b.world.clone().invert() };
    });
    return { geometry, bones, tris: geometry.index.count / 3 };
  }
}

/** Instantiate a blueprint: a SkinnedMesh with its own skeleton. Returns { mesh, bones: {name: Bone}, list }. */
export function instantiate(blueprint, material) {
  const list = blueprint.bones.map((d) => {
    const b = new THREE.Bone();
    b.name = d.name;
    b.position.copy(d.pos);
    b.quaternion.copy(d.quat);
    b.scale.copy(d.scale);
    b.userData.rest = { pos: d.pos.clone(), quat: d.quat.clone(), scale: d.scale.clone() };
    return b;
  });
  const mesh = new THREE.SkinnedMesh(blueprint.geometry, material);
  blueprint.bones.forEach((d, i) => {
    if (d.parent == null) mesh.add(list[i]);
    else list[d.parent].add(list[i]);
  });
  const skeleton = new THREE.Skeleton(list, blueprint.bones.map((d) => d.inverse.clone()));
  mesh.bind(skeleton, new THREE.Matrix4());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const bones = {};
  for (const b of list) bones[b.name] = b;
  return { mesh, bones, list, skeleton };
}

/** Weight helper: blend from bone a (at/above ya) to bone b (at/below yb) along model-space y. */
export function blendY(a, b, ya, yb) {
  return (x, y) => {
    const k = THREE.MathUtils.clamp((ya - y) / (ya - yb), 0, 1);
    const s = k * k * (3 - 2 * k);
    return [a, 1 - s, b, s];
  };
}

/** Weight helper along an arbitrary segment p0 -> p1 (model space): bone a near p0, b near p1. */
export function blendSeg(a, b, p0, p1, k0 = 0.4, k1 = 0.6) {
  const d = new THREE.Vector3().subVectors(p1, p0);
  const len2 = d.lengthSq();
  return (x, y, z) => {
    const t = ((x - p0.x) * d.x + (y - p0.y) * d.y + (z - p0.z) * d.z) / len2;
    const k = THREE.MathUtils.clamp((t - k0) / (k1 - k0), 0, 1);
    const s = k * k * (3 - 2 * k);
    return [a, 1 - s, b, s];
  };
}

export const color = (hex) => new THREE.Color(hex);
/** Multiply a hex colour's lightness (k<1 darker) and return hex. */
export function shade(hex, k = 0.8, sat = 0) {
  _c.set(hex);
  const hsl = {};
  _c.getHSL(hsl);
  _c.setHSL(hsl.h, THREE.MathUtils.clamp(hsl.s + sat, 0, 1), THREE.MathUtils.clamp(hsl.l * k, 0, 1));
  return `#${_c.getHexString()}`;
}
export function mix(a, b, k) {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString()}`;
}
