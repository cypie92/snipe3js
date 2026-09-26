// Jack's Odd Jobs HQ, the shell: a cutaway doll's-house room (back + side walls, open front and
// top) with wallpaper, wainscot, skirting, a window, a door and a planked floor on a chunky slab,
// sitting in a little garden with hedges, trees, far hills and clouds.
// Room space: floor top at y = 0, interior x in [-5, 5], z in [-3.2, 2.8]; the open side faces +Z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { part, merge, xform } from '../world/geo.js';
import { materials } from '../gfx/materials.js';
import { P } from '../gfx/palette.js';
import { Rng } from '../core/rng.js';
import { bev, ball, rod, puck, paintFaces } from '../world/kit/props/lib.js';
import { forest, hedgeBlock, scatterFlowers, grassTufts } from '../world/kit/nature/index.js';
import { decalQuad } from '../world/perch/paint.js';
import { liveryAtlas } from '../world/perch/livery.js';
import { decorAtlas, wallpaperTexture } from './textures.js';
import { hash3 } from '../core/rng.js';

export const ROOM = {
  x0: -4.6, x1: 4.6, z0: -3.0, z1: 2.4, h: 3.4, t: 0.3, slab: 0.42,
  dado: 1.0, skirting: 0.16,
  window: { x0: -4.12, x1: -2.86, y0: 1.12, y1: 2.5 },
  door: { z0: 0.12, z1: 1.28, h: 2.3 },
};

const CUT = '#fff4e2'; // the "cut" edge of the playset walls
const OUTSIDE = '#e98a5e';
const WAINSCOT = '#7fc4b4';
const WAINSCOT_HI = '#96d3c4';
const RAIL = '#fff1d6';

/** Geometry with only position/normal/uv, transformed: for textured (non vertex-colour) meshes. */
export function uvPart(geo, t) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (t) g.applyMatrix4(t.isMatrix4 ? t : xform(t));
  return g;
}

export function mergeUV(list) {
  const g = mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x)), false);
  g.computeBoundingSphere();
  return g;
}

/** A wall box: exterior colour, cut-edge (cream) on the top and on faces pointing to `cutDir`. */
function wallBox(w, h, d, t, cutFaces) {
  const g = part(new THREE.BoxGeometry(w, h, d), OUTSIDE, t);
  paintFaces(g, (x, y, z, nx, ny, nz, c) => {
    if (ny > 0.9) c.set(CUT);
    for (const [ax, ay, az] of cutFaces || []) if (nx * ax + ny * ay + nz * az > 0.9) c.set(CUT);
  });
  return g;
}

function wallpaperPlane(w, h, t) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  const TILE = 0.86;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / TILE, (uv.getY(i) * h) / TILE);
  return uvPart(g, t);
}

/**
 * Build the shell. Returns { group, pickables: [meshes that stop darts], window: {...} }.
 */
export function buildRoom({ seed = 7 } = {}) {
  const R = ROOM;
  const rng = new Rng(`office-${seed}`);
  const group = new THREE.Group();
  group.name = 'officeRoom';
  const toy = [];
  const glossy = [];
  const paper = [];
  const decals = [];
  const D = decorAtlas();

  // ---------------------------------------------------------------- slab + floor planks
  const sx0 = R.x0 - R.t, sx1 = R.x1 + R.t, sz0 = R.z0 - R.t, sz1 = R.z1 + 0.18;
  const slab = part(new THREE.BoxGeometry(sx1 - sx0, R.slab, sz1 - sz0), '#b9794a', { x: (sx0 + sx1) / 2, y: -R.slab / 2 - 0.06, z: (sz0 + sz1) / 2 });
  paintFaces(slab, (x, y, z, nx, ny, nz, c) => { if (ny > 0.9) c.set('#8a5a34'); });
  toy.push(slab);
  toy.push(part(bev(sx1 - sx0 + 0.08, 0.1, 0.1, 0.04), CUT, { x: (sx0 + sx1) / 2, y: -0.06, z: sz1 }));
  const woods = ['#e0a768', '#d59a5b', '#e8b47a', '#cf9153', '#dca263'];
  const pw = 0.3;
  for (let x = R.x0; x < R.x1 - 1e-3; x += pw) {
    let z = R.z0;
    let k = 0;
    while (z < sz1 - 1e-3) {
      const len = Math.min(sz1 - z, rng.range(1.4, 2.6) * (k === 0 ? rng.range(0.4, 1) : 1));
      toy.push(part(bev(pw - 0.012, 0.06, len - 0.012, 0.012), rng.pick(woods), { x: x + pw / 2, y: -0.03, z: z + len / 2 }));
      z += len;
      k++;
    }
  }

  // ---------------------------------------------------------------- walls
  const H = R.h, T = R.t, W = R.window, Dr = R.door;
  // back wall (window opening)
  const bz = R.z0 - T / 2;
  toy.push(wallBox(W.x0 - sx0, H, T, { x: (sx0 + W.x0) / 2, y: H / 2, z: bz }));
  toy.push(wallBox(sx1 - W.x1, H, T, { x: (W.x1 + sx1) / 2, y: H / 2, z: bz }));
  toy.push(wallBox(W.x1 - W.x0, W.y0, T, { x: (W.x0 + W.x1) / 2, y: W.y0 / 2, z: bz }));
  toy.push(wallBox(W.x1 - W.x0, H - W.y1, T, { x: (W.x0 + W.x1) / 2, y: (H + W.y1) / 2, z: bz }));
  // side walls (cut edge faces +Z at the front)
  const sideLen = R.z1 - R.z0;
  toy.push(wallBox(T, H, sideLen, { x: R.x0 - T / 2, y: H / 2, z: (R.z0 + R.z1) / 2 }, [[0, 0, 1]]));
  toy.push(wallBox(T, H, sideLen, { x: R.x1 + T / 2, y: H / 2, z: (R.z0 + R.z1) / 2 }, [[0, 0, 1]]));
  // chunky trim cap on the cut edges (reads as a toy playset)
  const cap = (w, d, t) => part(bev(w, 0.08, d, 0.035), CUT, t);
  toy.push(cap(sx1 - sx0 + 0.02, T + 0.06, { x: (sx0 + sx1) / 2, y: H + 0.04, z: bz }));
  toy.push(cap(T + 0.06, sideLen + 0.02, { x: R.x0 - T / 2, y: H + 0.04, z: (R.z0 + R.z1) / 2 }));
  toy.push(cap(T + 0.06, sideLen + 0.02, { x: R.x1 + T / 2, y: H + 0.04, z: (R.z0 + R.z1) / 2 }));
  for (const x of [R.x0 - T / 2, R.x1 + T / 2]) toy.push(part(bev(T + 0.06, H + 0.02, 0.06, 0.025), CUT, { x, y: H / 2, z: R.z1 + 0.01 }));

  // wallpaper above the dado (inset 2 mm), wainscot + rails below
  const wp = [];
  const above = H - R.dado;
  const yA = R.dado + above / 2;
  // back wall wallpaper split around the window
  wp.push(wallpaperPlane(W.x0 - R.x0, above, { x: (R.x0 + W.x0) / 2, y: yA, z: R.z0 + 0.002 }));
  wp.push(wallpaperPlane(R.x1 - W.x1, above, { x: (W.x1 + R.x1) / 2, y: yA, z: R.z0 + 0.002 }));
  wp.push(wallpaperPlane(W.x1 - W.x0, H - W.y1, { x: (W.x0 + W.x1) / 2, y: (H + W.y1) / 2, z: R.z0 + 0.002 }));
  wp.push(wallpaperPlane(W.x1 - W.x0, W.y0 - R.dado, { x: (W.x0 + W.x1) / 2, y: (W.y0 + R.dado) / 2, z: R.z0 + 0.002 }));
  wp.push(wallpaperPlane(sideLen, above, { x: R.x0 + 0.002, y: yA, z: (R.z0 + R.z1) / 2, ry: Math.PI / 2 }));
  wp.push(wallpaperPlane(sideLen, above, { x: R.x1 - 0.002, y: yA, z: (R.z0 + R.z1) / 2, ry: -Math.PI / 2 }));
  const wainscot = (len, t) => {
    const L = [part(bev(len, R.dado - R.skirting, 0.04, 0.01), WAINSCOT, { y: (R.dado + R.skirting) / 2, z: 0.02 })];
    const n = Math.max(1, Math.round(len / 0.9));
    const pw2 = len / n;
    for (let i = 0; i < n; i++) L.push(part(bev(pw2 - 0.16, R.dado - R.skirting - 0.2, 0.03, 0.012), WAINSCOT_HI, { x: -len / 2 + pw2 * (i + 0.5), y: (R.dado + R.skirting) / 2, z: 0.045 }));
    L.push(part(bev(len, 0.07, 0.07, 0.025), RAIL, { y: R.dado, z: 0.035 }));
    L.push(part(bev(len, R.skirting, 0.05, 0.015), '#8a5a34', { y: R.skirting / 2, z: 0.025 }));
    return merge(L).applyMatrix4(xform(t));
  };
  toy.push(wainscot(R.x1 - R.x0, { x: 0, z: R.z0 }));
  toy.push(wainscot(sideLen, { x: R.x0, z: (R.z0 + R.z1) / 2, ry: Math.PI / 2 }));
  toy.push(wainscot(sideLen, { x: R.x1, z: (R.z0 + R.z1) / 2, ry: -Math.PI / 2 }));
  // picture rail near the top
  toy.push(part(bev(R.x1 - R.x0, 0.05, 0.05, 0.02), RAIL, { y: H - 0.28, z: R.z0 + 0.025 }));
  toy.push(part(bev(0.05, 0.05, sideLen, 0.02), RAIL, { x: R.x0 + 0.025, y: H - 0.28, z: (R.z0 + R.z1) / 2 }));
  toy.push(part(bev(0.05, 0.05, sideLen, 0.02), RAIL, { x: R.x1 - 0.025, y: H - 0.28, z: (R.z0 + R.z1) / 2 }));

  // ---------------------------------------------------------------- window (back wall, left)
  const wx = (W.x0 + W.x1) / 2, wy = (W.y0 + W.y1) / 2, ww = W.x1 - W.x0, wh = W.y1 - W.y0;
  const frame = '#fff8ee';
  toy.push(part(bev(ww + 0.22, 0.1, 0.14, 0.03), frame, { x: wx, y: W.y1 + 0.05, z: R.z0 + 0.03 }));
  for (const s of [-1, 1]) toy.push(part(bev(0.1, wh, 0.14, 0.03), frame, { x: wx + s * (ww / 2 + 0.05), y: wy, z: R.z0 + 0.03 }));
  toy.push(part(bev(ww + 0.36, 0.08, 0.34, 0.03), P.woodLight, { x: wx, y: W.y0 - 0.02, z: R.z0 + 0.1 })); // sill (Pidge sits here)
  toy.push(part(bev(0.06, wh, 0.06, 0.02), frame, { x: wx, y: wy, z: R.z0 - T / 2 }));
  toy.push(part(bev(ww, 0.06, 0.06, 0.02), frame, { x: wx, y: wy + 0.12, z: R.z0 - T / 2 }));
  // reveal (inside faces of the opening) in cut cream
  toy.push(part(bev(ww, 0.02, T, 0.005), CUT, { x: wx, y: W.y0 + 0.012, z: R.z0 - T / 2 }));
  // curtain rod + gingham curtains
  toy.push(part(rod([W.x0 - 0.4, W.y1 + 0.24, R.z0 + 0.12], [W.x1 + 0.4, W.y1 + 0.24, R.z0 + 0.12], 0.025, 8), P.woodDark));
  for (const x of [W.x0 - 0.4, W.x1 + 0.4]) toy.push(part(ball(0.05, 1), P.woodDark, { x, y: W.y1 + 0.24, z: R.z0 + 0.12 }));
  for (const s of [-1, 1]) {
    const cw = 0.44, ch = wh + 0.2;
    const g = new THREE.PlaneGeometry(cw, ch, 12, 6);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const tie = 1 - Math.max(0, Math.min(1, (y + ch * 0.1) / (ch * 0.5))) * 0; // straight hang
      pos.setZ(i, Math.sin((x / cw) * Math.PI * 5) * 0.035 * tie);
    }
    g.computeVertexNormals();
    const cg = part(g, P.tomato);
    paintFaces(cg, (x, y, z, nx, ny, nz, c) => {
      const a = Math.floor((x + 5) / 0.09) % 2, b = Math.floor((y + 5) / 0.09) % 2;
      c.set(a && b ? '#d9433a' : a || b ? '#ff8a7e' : '#fff3ea');
    });
    const cx = s < 0 ? W.x0 - 0.16 : W.x1 + 0.16;
    toy.push(cg.applyMatrix4(xform({ x: cx, y: W.y1 + 0.2 - ch / 2, z: R.z0 + 0.1 })));
    toy.push(part(new THREE.TorusGeometry(0.1, 0.022, 6, 12), P.sunflower, { x: cx, y: wy - 0.1, z: R.z0 + 0.13, rx: Math.PI / 2, sx: 1.4 }));
  }

  // ---------------------------------------------------------------- door (left wall) + mat
  const dz = (Dr.z0 + Dr.z1) / 2, dw = Dr.z1 - Dr.z0;
  const dx = R.x0 + 0.01;
  toy.push(part(bev(0.08, Dr.h + 0.12, dw + 0.24, 0.03), frame, { x: dx + 0.03, y: (Dr.h + 0.12) / 2, z: dz }));
  glossy.push(part(bev(0.08, Dr.h, dw, 0.04), P.teal, { x: dx + 0.07, y: Dr.h / 2, z: dz }));
  for (const [y, h] of [[0.62, 0.8], [1.62, 0.5]]) glossy.push(part(bev(0.03, h, dw - 0.34, 0.02), '#3fd4c4', { x: dx + 0.115, y, z: dz }));
  glossy.push(part(puck(0.2, 0.05, 0.02, 20), '#9fdcf7', { x: dx + 0.12, y: 1.72, z: dz, rz: Math.PI / 2 }));
  glossy.push(part(new THREE.TorusGeometry(0.2, 0.035, 8, 22), P.sunflower, { x: dx + 0.13, y: 1.72, z: dz, ry: Math.PI / 2 }));
  glossy.push(part(ball(0.05, 1), P.gold, { x: dx + 0.15, y: 1.05, z: Dr.z1 - 0.14 }));
  decals.push(decalQuad(0.42, 0.21, D.uv('door'), xform({ x: dx + 0.16, y: 1.28, z: dz, ry: Math.PI / 2 })));
  toy.push(part(rod([dx + 0.14, 1.39, dz - 0.14], [dx + 0.14, 1.5, dz], 0.008, 4), P.ink));
  toy.push(part(rod([dx + 0.14, 1.39, dz + 0.14], [dx + 0.14, 1.5, dz], 0.008, 4), P.ink));
  const mat = part(bev(0.7, 0.03, 1.1, 0.012), '#c8894a', { x: R.x0 + 0.5, y: 0.015, z: dz });
  paintFaces(mat, (x, y, z, nx, ny, nz, c) => { if (Math.floor((z + 9) / 0.12) % 2) c.set('#b87842'); });
  toy.push(mat);

  // ---------------------------------------------------------------- slab front sign (livery atlas)
  const LA = liveryAtlas();
  const signGeo = mergeUV([decalQuad(2.6, 0.45, LA.uv('front'), xform({ x: 0, y: -0.27, z: sz1 + 0.052 }))]);
  const slabSign = new THREE.Mesh(signGeo, LA.material);
  slabSign.name = 'hqSign';

  // ---------------------------------------------------------------- meshes
  const toyMesh = new THREE.Mesh(merge(toy), materials.toy);
  toyMesh.name = 'roomShell';
  const glossyMesh = new THREE.Mesh(merge(glossy), materials.glossy);
  glossyMesh.name = 'roomGlossy';
  const wallMat = new THREE.MeshStandardMaterial({ map: wallpaperTexture(), roughness: 0.85, metalness: 0 });
  wallMat.name = 'office-wallpaper';
  const wallMesh = new THREE.Mesh(mergeUV(wp), wallMat);
  wallMesh.name = 'wallpaper';
  const decalMesh = new THREE.Mesh(mergeUV(decals), D.material);
  decalMesh.name = 'roomDecals';
  for (const m of [toyMesh, glossyMesh, wallMesh, decalMesh, slabSign]) {
    m.castShadow = m !== decalMesh && m !== slabSign && m !== wallMesh;
    m.receiveShadow = true;
    group.add(m);
  }
  return { group, pickables: [toyMesh, glossyMesh, wallMesh, decalMesh] };
}

// ------------------------------------------------------------------ outside world
/** Smooth value noise in [0,1). */
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const fx = x - xi, fz = z - zi;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash3(xi, 0, zi), b = hash3(xi + 1, 0, zi), c = hash3(xi, 0, zi + 1), d = hash3(xi + 1, 0, zi + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
terrainMat.name = 'office-terrain';

/** One seamless faceted terrain: flat lawn around the office, patchwork fields rolling into hills. */
function terrain() {
  const size = 900, seg = 96;
  const heightAt = (x, z) => {
    const r = Math.hypot(x, z);
    const k = THREE.MathUtils.smoothstep(r, 70, 250);
    const n = vnoise(x * 0.008 + 3, z * 0.008 + 7) * 0.65 + vnoise(x * 0.021, z * 0.021) * 0.35;
    return k * (2 + 15 * n) - THREE.MathUtils.smoothstep(r, 380, 450) * 6;
  };
  const g0 = new THREE.PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI / 2);
  const pos = g0.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  const g = part(g0, '#7cc653');
  const fields = ['#7cc653', '#8fd06a', '#6fbf4a', '#a3d468', '#c3d66a', '#5fae44', '#94cf5c'];
  paintFaces(g, (x, y, z, nx, ny, nz, c) => {
    const r = Math.hypot(x, z);
    if (r < 60) return c.set('#7cc653');
    const fx = Math.floor((x + 2000) / 52), fz = Math.floor((z + 2000) / 38);
    const pick = fields[Math.floor(hash3(fx, 1, fz) * fields.length)];
    c.set(pick);
    // hedgerow-ish darker seams along field borders
    const ex = ((x + 2000) / 52) % 1, ez = ((z + 2000) / 38) % 1;
    if (r > 90 && (ex < 0.07 || ez < 0.08)) c.set('#4f9a3c');
    c.multiplyScalar(0.94 + ny * 0.06);
  });
  // baked per-face normals + smooth shading: derivative-based flat shading turns NaN on grazing,
  // far-away triangles and the post stack (bloom mips) smears those NaNs across the screen
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, terrainMat);
  mesh.name = 'officeTerrain';
  mesh.receiveShadow = true;
  return { mesh, heightAt };
}

function clouds(rng) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true, emissive: '#6e7fa6', emissiveIntensity: 0.3, fog: false });
  mat.name = 'office-clouds';
  const L = [];
  for (let k = 0; k < 7; k++) {
    const a = rng.range(-1.6, 1.6) + Math.PI;
    const d = rng.range(180, 320);
    const cx = Math.sin(a) * d, cz = Math.cos(a) * d, cy = rng.range(55, 95);
    const puffs = rng.int(4, 6);
    for (let i = 0; i < puffs; i++) {
      const r = rng.range(7, 13) * (1 - Math.abs(i - puffs / 2) / puffs);
      const g = new THREE.IcosahedronGeometry(r + 3, 1);
      const pos = g.attributes.position;
      for (let v = 0; v < pos.count; v++) if (pos.getY(v) < -r * 0.25) pos.setY(v, -r * 0.25);
      g.computeVertexNormals();
      L.push(part(g, ['#c9d6ec', '#ffffff'], { x: cx + (i - puffs / 2) * 9, y: cy + rng.range(-2, 3), z: cz + rng.range(-4, 4) }));
    }
  }
  const m = new THREE.Mesh(merge(L), mat);
  m.name = 'officeClouds';
  return m;
}

/** Garden, hedges, trees, hills and clouds around the room. Returns { group, update }. */
export function buildOutside({ seed = 3 } = {}) {
  const rng = new Rng(`office-out-${seed}`);
  const R = ROOM;
  const group = new THREE.Group();
  group.name = 'officeOutside';
  const gy = -R.slab - 0.06;
  const land = terrain();
  land.mesh.position.y = gy;
  group.add(land.mesh);
  // stepping-stone path + gravel apron in front of the slab
  const toy = [];
  for (let i = 0; i < 5; i++) {
    toy.push(part(puck(rng.range(0.35, 0.45), 0.08, 0.03, 10), rng.pick(['#d9ccb4', '#cfc2a8', '#e3d7c0']), { x: rng.range(-0.3, 0.3), y: gy + 0.03, z: R.z1 + 1.1 + i * 1.05 }));
  }
  for (let i = 0; i < 40; i++) {
    const x = rng.range(-7, 7), z = rng.range(R.z1 + 0.6, R.z1 + 6);
    if (Math.abs(x) < 1) continue;
    toy.push(part(ball(rng.range(0.05, 0.1), 0), rng.pick(['#9aa39a', '#b7b0a2', '#8f998d']), { x, y: gy + 0.02, z, sy: 0.5 }));
  }
  // garden fence posts at the sides
  const fence = [];
  for (const s of [-1, 1]) {
    for (let z = R.z0 - 1.5; z < R.z1 + 5.5; z += 0.34) {
      fence.push(part(bev(0.12, 0.9 + rng.range(-0.05, 0.05), 0.05, 0.03), '#fff8ee', { x: s * 8.4, y: gy + 0.45, z, rz: rng.range(-0.04, 0.04) }));
    }
    for (const y of [0.3, 0.7]) fence.push(part(bev(0.05, 0.08, R.z1 - R.z0 + 7, 0.02), '#f0e6d0', { x: s * 8.4 - s * 0.04, y: gy + y, z: (R.z0 + R.z1) / 2 + 2 }));
  }
  const gm = new THREE.Mesh(merge([...toy, ...fence]), materials.toy);
  gm.castShadow = true;
  gm.receiveShadow = true;
  gm.name = 'garden';
  group.add(gm);
  // hedges hugging the building + flower beds
  const hedgeAt = (x, z, w, ry = 0, seedN = 1) => {
    const h = hedgeBlock({ w, h: 1.2, d: 1.0, seed: seedN, flowers: seedN % 2 ? '#fff4e6' : '#ff9ec4' });
    h.position.set(x, gy, z);
    h.rotation.y = ry;
    group.add(h);
  };
  hedgeAt(-6.4, -1.6, 3.2, Math.PI / 2, 1);
  hedgeAt(6.4, -1.4, 3.0, Math.PI / 2, 2);
  hedgeAt(1.2, R.z0 - 2.2, 4.2, 0, 4);
  const beds = scatterFlowers({ minX: -8, maxX: 8, minZ: R.z1 + 0.8, maxZ: R.z1 + 7 }, 160, { seed: 6, filter: (x) => Math.abs(x) > 1.3 });
  beds.position.y = gy;
  group.add(beds);
  const tufts = grassTufts({ seed: 5, area: { x: 0, z: R.z1 + 3.5, w: 16, d: 6 }, count: 50, filter: (x, z) => Math.abs(x) > 1.2 });
  tufts.position.y = gy;
  group.add(tufts);
  // a few trees in the paddock behind the office + copses dotted over the far hills
  const pts = [[-24, -42, 'round', 1.1], [21, -50, 'blossom', 1.05], [36, -30, 'round', 1.15], [-42, -26, 'conifer', 1.2]]
    .map(([x, z, type, scale]) => ({ x, y: gy, z, type, scale }));
  // (kept within ~130 m: tiny far flat-shaded foliage triangles give NaN normals that bloom smears)
  for (let i = 0; i < 7; i++) {
    const a = Math.PI + (i % 2 ? 1 : -1) * rng.range(0.45, 1.3), d = rng.range(80, 130);
    const cx = Math.sin(a) * d, cz = Math.cos(a) * d;
    for (let k = rng.int(2, 4); k > 0; k--) {
      const x = cx + rng.range(-7, 7), z = cz + rng.range(-7, 7);
      pts.push({ x, y: gy + land.heightAt(x, z) - 0.3, z, scale: rng.range(1.2, 1.7) });
    }
  }
  group.add(forest(pts, { types: ['round', 'blossom', 'conifer', 'tall'], seed: 9 }));
  group.add(clouds(rng));
  group.traverse((o) => { if (o.isMesh) o.userData.noPick = true; });
  return { group, update: () => {} };
}
