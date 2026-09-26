// The crow's nest: a round planked platform with a chunky candy-striped railing, a hatch where the
// ladder comes up, a circus-tent skirt with the JACK'S ODD JOBS band, a little side shelf (thermos,
// binoculars, tiny radio), some clutter behind Jack and a waving pennant on a flagpole.
// Local space: y = 0 is the floor's top surface, the eye is at (0, EYE, 0), -Z = forward.
import * as THREE from 'three';
import { part, merge, xform } from '../geo.js';
import { materials } from '../../gfx/materials.js';
import { P } from '../../gfx/palette.js';
import { Rng } from '../../core/rng.js';
import { bev, lathe, puck, ball, rod, arc, latheBands, paintFaces } from '../kit/props/lib.js';
import { liveryAtlas } from './livery.js';

export const NEST = {
  // eye height above the floor. Raised so the railing (top at 0.67) only enters the view when the
  // player deliberately looks down (~52 deg), instead of filling the bottom of the default view.
  eye: 2.2,
  railR: 1.1, railTop: 0.67, floorR: 1.17, rimR: 1.2, coneH: 0.42,
  hatch: { x: 0.28, z0: -0.98, z1: -0.62 },
};

const CREAM = '#fff4e0';
const WOODS = ['#d9a066', '#c98f55', '#e2ad72', '#cf9860', '#d49a5e'];

/** Direction on the floor for an angle measured from -Z (forward) toward +X (right). */
const dir = (phi, r, y = 0) => ({ x: Math.sin(phi) * r, y, z: -Math.cos(phi) * r });

function floor(rng) {
  const L = [];
  const { floorR: R, hatch: H } = NEST;
  const w = 0.2, gap = 0.014;
  for (let zc = -R + w / 2; zc < R; zc += w + gap) {
    const edge = Math.abs(zc) + w / 2;
    if (edge >= R) continue;
    const xm = Math.sqrt(R * R - edge * edge) + 0.02;
    const inHatch = zc + w / 2 > H.z0 && zc - w / 2 < H.z1;
    const spans = inHatch ? [[-xm, -H.x - 0.01], [H.x + 0.01, xm]] : [[-xm, xm]];
    for (const [a, b] of spans) {
      if (b - a < 0.05) continue;
      L.push(part(bev(b - a, 0.1, w, 0.014), rng.pick(WOODS), { x: (a + b) / 2, y: -0.05, z: zc, ry: rng.range(-0.004, 0.004) }));
    }
  }
  // dark sub-floor disc (with the hatch hole) so plank gaps never show daylight
  const s = new THREE.Shape();
  s.absarc(0, 0, R, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.moveTo(-H.x, H.z0);
  hole.lineTo(-H.x, H.z1);
  hole.lineTo(H.x, H.z1);
  hole.lineTo(H.x, H.z0);
  hole.closePath();
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false, curveSegments: 36 });
  g.deleteAttribute('uv');
  g.rotateX(Math.PI / 2); // (x, y, z) -> (x, -z, y): shape y becomes world z, extrusion goes down
  L.push(part(g, P.woodDark, { y: -0.1 }));
  return L;
}

function railing() {
  const L = [];
  const { railR: R, railTop: T } = NEST;
  const N = 16;
  for (let i = 0; i < N; i++) {
    const phi = ((i + 0.5) / N) * Math.PI * 2;
    const p = dir(phi, R);
    L.push(part(new THREE.CylinderGeometry(0.048, 0.056, T - 0.05, 10), i % 2 ? P.sunflower : CREAM, { x: p.x, y: (T - 0.05) / 2 + 0.01, z: p.z }));
    L.push(part(puck(0.075, 0.05, 0.018, 12), P.cobalt, { x: p.x, y: 0.035, z: p.z }));
  }
  // 28 stripes x 3 tubular segments each: stripe edges fall on segment seams (crisp, no zigzag)
  const top = part(new THREE.TorusGeometry(R, 0.075, 12, 84), P.white);
  paintFaces(top, (x, y, z, nx, ny, nz, c) => {
    const a = Math.atan2(y, x);
    c.set(Math.floor(((a + Math.PI) / (Math.PI * 2)) * 28 + 1e-3) % 2 ? P.tomato : '#fff8ee');
  });
  L.push(top.applyMatrix4(xform({ y: T - 0.075, rx: Math.PI / 2 })));
  L.push(part(new THREE.TorusGeometry(R, 0.036, 8, 72), P.cobalt, { y: 0.3, rx: Math.PI / 2 }));
  return L;
}

function skirtAndUnderside() {
  const L = [];
  const { rimR, coneH } = NEST;
  L.push(part(new THREE.TorusGeometry(rimR, 0.088, 10, 80), P.cobalt, { y: -0.05, rx: Math.PI / 2 }));
  L.push(part(new THREE.CylinderGeometry(rimR - 0.01, rimR - 0.01, coneH - 0.1, 48, 1, true), P.tomato, { y: -0.12 - (coneH - 0.1) / 2 }));
  // bobble fringe along the skirt's hem (circus-tent valance)
  const n = 30;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    L.push(part(ball(0.06, 1), i % 2 ? P.sunflower : CREAM, { x: Math.sin(a) * rimR, y: -coneH - 0.01, z: Math.cos(a) * rimR, sy: 0.8 }));
  }
  // underside bowl + gussets down to the top mast section
  L.push(part(lathe([[0.15, -coneH - 0.005], [0.35, -coneH + 0.01], [0.8, -coneH + 0.08], [rimR - 0.03, -0.16], [rimR - 0.03, -0.12]], 36), CREAM));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    L.push(part(bev(0.05, 0.22, 0.5, 0.02), P.cobalt, { x: Math.sin(a) * 0.42, y: -coneH + 0.08, z: Math.cos(a) * 0.42, ry: a, rx: -0.28 }));
  }
  return L;
}

function hatchCoaming() {
  const L = [];
  const { x, z0, z1 } = NEST.hatch;
  const stripe = (w, d, t) => {
    const g = part(new THREE.BoxGeometry(w, 0.07, d, Math.max(1, Math.round(w / 0.07)), 1, Math.max(1, Math.round(d / 0.07))), P.sunflower);
    paintFaces(g, (cx, cy, cz, nx, ny, nz, c) => { if (Math.floor((cx + cz + 5) / 0.07) % 2 === 0) c.set(P.ink); });
    return g.applyMatrix4(xform(t));
  };
  L.push(stripe(2 * x + 0.1, 0.05, { y: 0.035, z: z0 - 0.025 }));
  L.push(stripe(2 * x + 0.1, 0.05, { y: 0.035, z: z1 + 0.025 }));
  L.push(stripe(0.05, z1 - z0, { x: -x - 0.025, y: 0.035, z: (z0 + z1) / 2 }));
  L.push(stripe(0.05, z1 - z0, { x: x + 0.025, y: 0.035, z: (z0 + z1) / 2 }));
  return L;
}

function thermos(t) {
  const g = latheBands([[0, 0], [0.066, 0], [0.07, 0.015], [0.07, 0.05], [0.07, 0.1], [0.07, 0.15], [0.07, 0.2], [0.066, 0.25], [0.05, 0.27], [0, 0.27]], 16,
    (y, i) => (i === 3 || i === 5 ? '#fff8ee' : i === 4 ? P.ink : P.tomato));
  return [
    g.applyMatrix4(xform(t)),
    part(puck(0.074, 0.08, 0.02, 16), P.cobalt, { ...t, y: t.y + 0.3 }),
    part(arc(0.045, 0.012, Math.PI, 5, 8), P.ink, { ...t, x: t.x + 0.07, y: t.y + 0.14, rz: -Math.PI / 2, ry: 0 }),
  ];
}

function binoculars(t) {
  const L = [];
  for (const s of [-1, 1]) {
    L.push(part(new THREE.CylinderGeometry(0.046, 0.05, 0.15, 12), P.ink, { x: s * 0.06, z: 0, rx: Math.PI / 2 }));
    L.push(part(new THREE.CylinderGeometry(0.056, 0.056, 0.03, 12), P.cobalt, { x: s * 0.06, z: -0.085, rx: Math.PI / 2 }));
    L.push(part(new THREE.CylinderGeometry(0.03, 0.036, 0.05, 10), '#4a4e62', { x: s * 0.06, z: 0.09, rx: Math.PI / 2 }));
  }
  L.push(part(bev(0.08, 0.04, 0.06, 0.015), '#4a4e62', { y: 0.02, z: 0.02 }));
  return merge(L).applyMatrix4(xform(t));
}

function tinyRadio(t) {
  const L = [
    part(bev(0.19, 0.13, 0.09, 0.03), P.sunflower, { y: 0.065 }),
    part(puck(0.042, 0.02, 0.008, 14), P.ink, { x: -0.04, y: 0.065, z: 0.046, rx: Math.PI / 2 }),
    part(bev(0.06, 0.035, 0.02, 0.008), '#ffe6a0', { x: 0.05, y: 0.08, z: 0.045 }),
    part(puck(0.014, 0.02, 0.006, 8), P.tomato, { x: 0.05, y: 0.035, z: 0.047, rx: Math.PI / 2 }),
    part(rod([0.07, 0.12, -0.02], [0.13, 0.36, -0.1], 0.008, 5), P.metal),
    part(ball(0.015, 1), P.tomato, { x: 0.13, y: 0.365, z: -0.1 }),
  ];
  return merge(L).applyMatrix4(xform(t));
}

function shelf() {
  // front-left, hooked onto the railing; items face the player
  const phi = -0.74;
  const L = [];
  const r = 0.88, y = 0.46;
  L.push(part(bev(0.6, 0.05, 0.25, 0.018), P.wood, { y: y - 0.025, z: -r }));
  L.push(part(bev(0.6, 0.07, 0.03, 0.012), P.woodDark, { y: y + 0.01, z: -r + 0.14 }));
  for (const s of [-1, 1]) {
    L.push(part(bev(0.04, 0.2, 0.18, 0.012), P.woodDark, { x: s * 0.24, y: y - 0.14, z: -r - 0.04 }));
    L.push(part(rod([s * 0.24, y - 0.02, -r - 0.12], [s * 0.24, y + 0.12, -1.06], 0.014, 5), P.metalDark));
  }
  L.push(...thermos({ x: -0.19, y, z: -r - 0.02 }));
  L.push(binoculars({ x: 0.03, y: y + 0.052, z: -r + 0.01, ry: 0.35 }));
  L.push(tinyRadio({ x: 0.2, y, z: -r - 0.02, ry: -0.25 }));
  return merge(L).applyMatrix4(xform({ ry: -phi }));
}

function clutter(rng) {
  const L = [];
  // rope coil (back-right)
  const rc = dir(2.35, 0.72);
  for (let i = 0; i < 3; i++) L.push(part(new THREE.TorusGeometry(0.2 - i * 0.015, 0.042, 8, 20), i === 1 ? '#caa46c' : '#d8b37a', { x: rc.x, y: 0.045 + i * 0.07, z: rc.z, rx: Math.PI / 2 }));
  // crate with a lunchbox (back-left)
  const cc = dir(-2.3, 0.7);
  L.push(part(bev(0.42, 0.32, 0.42, 0.04), P.wood, { x: cc.x, y: 0.16, z: cc.z, ry: 0.5 }));
  for (const dy of [0.08, 0.24]) L.push(part(bev(0.44, 0.05, 0.44, 0.02), P.woodDark, { x: cc.x, y: dy, z: cc.z, ry: 0.5 }));
  L.push(part(bev(0.3, 0.14, 0.2, 0.04), P.tomato, { x: cc.x, y: 0.39, z: cc.z, ry: 0.2 }));
  L.push(part(arc(0.06, 0.014, Math.PI, 5, 8), P.ink, { x: cc.x, y: 0.46, z: cc.z, ry: 0.2 }));
  // tin mug on the floor (right)
  const mc = dir(1.75, 0.8);
  L.push(latheBands([[0, 0], [0.06, 0], [0.065, 0.12], [0.055, 0.12], [0.05, 0.02], [0, 0.02]], 14, () => P.cobalt, { x: mc.x, y: 0, z: mc.z }));
  L.push(part(arc(0.035, 0.01, Math.PI, 5, 8), P.cobalt, { x: mc.x + 0.065, y: 0.06, z: mc.z, rz: -Math.PI / 2 }));
  return L;
}

function flagPole() {
  const phi = Math.PI * 0.88;
  const p = dir(phi, NEST.railR + 0.06);
  const L = [
    part(new THREE.CylinderGeometry(0.045, 0.052, 2.3, 12), '#fff8ee', { x: p.x, y: 1.15, z: p.z }),
    part(ball(0.09, 1), P.sunflower, { x: p.x, y: 2.34, z: p.z }),
  ];
  for (const y of [0.3, 0.6]) L.push(part(puck(0.06, 0.07, 0.015, 10), P.metalDark, { x: p.x, y, z: p.z }));
  return { parts: L, base: new THREE.Vector3(p.x, 0, p.z) };
}

/** Pennant: dynamic triangle mesh, waving in tick(t). */
function pennant(base) {
  const Lx = 1.3, H = 0.56, nx = 16, ny = 4;
  const g = new THREE.PlaneGeometry(Lx, H, nx, ny);
  g.translate(Lx / 2, 0, 0);
  const pos = g.attributes.position;
  const rest = new Float32Array(pos.array.length);
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const k = 1 - (x / Lx) * 0.94;
    pos.setY(i, y * k);
    const hoist = x < 0.16;
    const stripe = Math.abs(y) < H * 0.12 && x > 0.2;
    c.set(hoist ? P.sunflower : stripe ? '#fff8ee' : P.tomato);
    col.set([c.r, c.g, c.b], i * 3);
  }
  rest.set(pos.array);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  const mat = materials.toy.clone();
  mat.side = THREE.DoubleSide;
  mat.name = 'perch-pennant';
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'pennant';
  mesh.castShadow = true;
  mesh.position.set(base.x, 2.0, base.z);
  mesh.rotation.y = -0.35;
  const tick = (t, wind = 1) => {
    const a = pos.array;
    for (let i = 0; i < pos.count; i++) {
      const x = rest[i * 3], y = rest[i * 3 + 1];
      const u = x / Lx;
      a[i * 3 + 2] = Math.sin(t * 6.5 - x * 6) * 0.09 * u * wind + Math.sin(t * 3.1 - x * 3) * 0.03 * u;
      a[i * 3 + 1] = y - u * u * 0.06 + Math.sin(t * 4 - x * 5) * 0.015 * u;
      a[i * 3] = x - Math.abs(a[i * 3 + 2]) * 0.3;
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
  };
  tick(0);
  return { mesh, tick };
}

function skirtBand() {
  const A = liveryAtlas();
  const [u0, v0, u1, v1] = A.uv('nest');
  const list = [];
  const r = NEST.rimR + 0.004, h = 0.25;
  for (let q = 0; q < 4; q++) {
    const g = new THREE.CylinderGeometry(r, r, h, 16, 1, true, q * Math.PI / 2 - Math.PI / 4 + 0.06, Math.PI / 2 - 0.12);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + (u1 - u0) * uv.getX(i), 1 - (v1 - (v1 - v0) * uv.getY(i)));
    g.translate(0, -0.14 - h / 2 - 0.02, 0);
    list.push(g);
  }
  const g = list.length > 1 ? mergeUV(list) : list[0];
  const m = new THREE.Mesh(g, A.material);
  m.name = 'nestBand';
  m.receiveShadow = true;
  return m;
}

function mergeUV(list) {
  const geos = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const n = geos.reduce((s, g) => s + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

/** Build the nest. Returns { group, eye (Object3D), tick(dt, t) }. */
export function buildNest({ seed = 1 } = {}) {
  const rng = new Rng(`nest-${seed}`);
  const group = new THREE.Group();
  group.name = 'crowsNest';
  const fp = flagPole();
  const L = [...floor(rng), ...railing(), ...skirtAndUnderside(), ...hatchCoaming(), shelf(), ...clutter(rng), ...fp.parts];
  const mesh = new THREE.Mesh(merge(L), materials.toy);
  mesh.name = 'nestMesh';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  group.add(skirtBand());
  const flag = pennant(fp.base);
  group.add(flag.mesh);
  const eye = new THREE.Object3D();
  eye.name = 'eye';
  eye.position.set(0, NEST.eye, 0);
  group.add(eye);
  return { group, eye, mesh, pennant: flag.mesh, tick: (dt, t) => flag.tick(t) };
}
