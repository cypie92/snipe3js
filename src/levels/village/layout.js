// Puddleby Green: terrain, roads, the cobbled square, buildings, trees and the backdrop.
// Compact "toy box" plan: Jack's van sits at (0, 44) with the fête green right under it, the square
// (55 x 40 m) beyond, buildings hugging three sides, and the hills closing in round the edges.
// Everything static is handed to the StaticBatcher; gameplay pieces are returned in `L`.
import * as THREE from 'three';
import * as B from '../../world/kit/buildings/index.js';
import * as N from '../../world/kit/nature/index.js';
import { materials } from '../../gfx/materials.js';
import { P } from '../../gfx/palette.js';
import { hash3 } from '../../core/rng.js';
import { put, local, facePerch, inPoly, segDist, v3, PERCH } from './util.js';
import { gravelPad } from './custom.js';

// ---------------------------------------------------------------- key coordinates (x, z)
export const WORLD_C = [0, -4]; // centre of the diorama (the backdrop's hills ring it)
export const SQUARE = [[-25.5, -24.5], [25.5, -24.5], [29, -6], [30, 16], [-30, 16], [-29, -6]];
export const FOUNTAIN = [0, -5];
export const GREEN = [[-27, 19], [27, 19], [29, 38], [-29, 38]]; // the fête green under the van
export const ALLOT = [[-45, 23], [-26, 23], [-26, 41], [-45, 41]];
export const VAN = [0, 44];
// village cricket on the east meadow over the ring road (an oval outfield, the pitch runs N-S)
export const CRICKET = [64.5, 11];
// the road: a U round the village, passing behind the van
export const ROAD_PTS = [[-40, -78], [-50, -50], [-54, -15], [-54, 20], [-50, 42], [-34, 53], [0, 56], [34, 53], [50, 42], [54, 20], [54, -15], [50, -50], [40, -78]];
// west row fronts face ROT_W (east, turned a touch toward the perch); east row mirrors it
export const ROT_W = 1.4;
export const ROT_E = -1.4;
const DIR_W = [-Math.cos(ROT_W), Math.sin(ROT_W)]; // along the west row (north -> south)
const N_W = [Math.sin(ROT_W), Math.cos(ROT_W)]; // west row front normal
const DIR_E = [Math.cos(ROT_W), Math.sin(ROT_W)]; // along the east row (north -> south)
const N_E = [Math.sin(ROT_E), Math.cos(ROT_E)];

/** Centre of a building whose front midpoint is at (fx, fz), facing yaw ry, depth d. */
function behind(fx, fz, ry, d) {
  return [fx - Math.sin(ry) * d / 2, fz - Math.cos(ry) * d / 2];
}

// ---------------------------------------------------------------- ground
/**
 * Lawn: a fine 1.5 m grid over the diorama core and a coarse 4.5 m ring out to the hills, flat
 * shaded per triangle so mowing stripes, worn tracks and darker grass under trees and along walls
 * stay crisp. `shade(x, z)` returns the colour (see buildLayout).
 */
function groundMesh(ctx, colorAt) {
  const R = 94, [wx, wz] = WORLD_C;
  const core = { x0: -58.5, x1: 58.5, z0: -49.5, z1: 58.5 };
  const pos = [], col = [];
  const c = new THREE.Color();
  const quad = (x0, z0, s) => {
    const cx = x0 + s / 2, cz = z0 + s / 2;
    if (Math.hypot(cx - wx, cz - wz) > R) return;
    // two triangles, each flat-coloured from its own centroid
    const tris = [[[x0, z0], [x0, z0 + s], [x0 + s, z0]], [[x0 + s, z0], [x0, z0 + s], [x0 + s, z0 + s]]];
    for (const t of tris) {
      const tx = (t[0][0] + t[1][0] + t[2][0]) / 3, tz = (t[0][1] + t[1][1] + t[2][1]) / 3;
      colorAt(tx, tz, c);
      for (const [x, z] of t) { pos.push(x, 0, z); col.push(c.r, c.g, c.b); }
    }
  };
  for (let x = core.x0; x < core.x1 - 1e-6; x += 1.5) for (let z = core.z0; z < core.z1 - 1e-6; z += 1.5) quad(x, z, 1.5);
  for (let x = -99; x < 99; x += 4.5) {
    for (let z = -103.5; z < 94.5; z += 4.5) {
      if (x >= core.x0 - 1e-6 && x + 4.5 <= core.x1 + 1e-6 && z >= core.z0 - 1e-6 && z + 4.5 <= core.z1 + 1e-6) continue;
      quad(x, z, 4.5);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, materials.toy);
  m.receiveShadow = true;
  m.castShadow = false;
  m.name = 'ground';
  ctx.surface(m, 'grass');
  return m;
}

function roundedPoly(pts, r = 4, seg = 4) {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = new THREE.Vector2(...pts[i]);
    const a = new THREE.Vector2(...pts[(i - 1 + n) % n]);
    const b = new THREE.Vector2(...pts[(i + 1) % n]);
    const da = a.clone().sub(p), db = b.clone().sub(p);
    const rr = Math.min(r, da.length() * 0.45, db.length() * 0.45);
    const p0 = p.clone().add(da.normalize().multiplyScalar(rr));
    const p1 = p.clone().add(db.normalize().multiplyScalar(rr));
    for (let k = 0; k <= seg; k++) {
      const t = k / seg;
      const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p.x + t * t * p1.x;
      const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p.y + t * t * p1.y;
      out.push([x, y]);
    }
  }
  return out;
}

/** Cobbled plaza from a world XZ polygon (top at y = 0.1) + kerb. */
function cobblePlaza(poly, { seed = 3, base = P.cobble, name = 'square' } = {}) {
  const pts = roundedPoly(poly, 5);
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const surf = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false, curveSegments: 4 });
  surf.rotateX(-Math.PI / 2).translate(0, -0.1, 0);
  const mesh = new THREE.Mesh(surf, B.cobbleTexture({ seed, base, tile: 3.2 }));
  mesh.receiveShadow = true;
  mesh.name = name;
  const kerbPath = pts.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const kerb = B.sweep([[-0.24, -0.05], [-0.24, 0.13], [-0.18, 0.2], [0.14, 0.2], [0.2, 0.13], [0.2, -0.05]], kerbPath, { closed: true, hard: false });
  const kit = new B.Kit('kerb');
  kit.add(kerb, P.kerb);
  const grp = kit.build(new THREE.Group());
  grp.add(mesh);
  grp.name = name;
  return grp;
}

/** A flat inlay on the plaza (a different cobble, a stone band...) from a shape in world XZ. */
function inlay(shape, mat, y = 0.104, tile = 3.2) {
  const g = new THREE.ShapeGeometry(shape, 24);
  g.rotateX(-Math.PI / 2); // shapes are drawn in (x, -z): this lays them flat, facing up
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / tile; uv[i * 2 + 1] = p.getZ(i) / tile; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.translate(0, y, 0);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  m.castShadow = false;
  return m;
}

const circleShape = (cx, cz, r, r0 = 0, n = 48) => {
  const s = new THREE.Shape();
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; if (i) s.lineTo(x, -z); else s.moveTo(x, -z); }
  if (r0 > 0) {
    const hole = new THREE.Path();
    for (let i = 0; i <= n; i++) { const a = -(i / n) * Math.PI * 2; const x = cx + Math.cos(a) * r0, z = cz + Math.sin(a) * r0; if (i) hole.lineTo(x, -z); else hole.moveTo(x, -z); }
    s.holes.push(hole);
  }
  return s;
};
const rectShape = (cx, cz, w, d, ry = 0) => {
  const s = new THREE.Shape();
  const c = Math.cos(ry), sn = Math.sin(ry);
  [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].forEach(([lx, lz], i) => {
    const x = cx + lx * c + lz * sn, z = cz - lx * sn + lz * c;
    if (i) s.lineTo(x, -z); else s.moveTo(x, -z);
  });
  return s;
};

/**
 * Backdrop terrain colour pass: per-triangle colours become per-vertex averages of the triangles that
 * share each corner (soft field edges, calmer speckle), lavender fields turn sage, the brightest
 * yellows lose a little saturation, and `band(x, y, z, colour)` (backdrop-local position) may blend
 * the level's own patchwork in per vertex.
 */
function calmTerrain(geo, band) {
  const pos = geo.attributes.position, col = geo.attributes.color;
  const n = pos.count;
  const tri = new Float32Array(n); // per-vertex slot, filled per triangle (rgb of triangle i at i*3)
  const c = new THREE.Color(), hsl = { h: 0, s: 0, l: 0 };
  for (let i = 0; i + 2 < n; i += 3) {
    c.setRGB(col.getX(i), col.getY(i), col.getZ(i)).getHSL(hsl);
    if (hsl.h > 0.66 && hsl.h < 0.9 && hsl.s > 0.2) c.setHSL(0.235, 0.36, Math.min(0.68, Math.max(0.56, hsl.l)));
    else if (hsl.h > 0.095 && hsl.h < 0.17 && hsl.s > 0.5) c.setHSL(hsl.h, hsl.s * 0.8, hsl.l * 0.98);
    tri[i] = c.r; tri[i + 1] = c.g; tri[i + 2] = c.b;
  }
  const key = (i) => `${Math.round(pos.getX(i) * 50)},${Math.round(pos.getY(i) * 50)},${Math.round(pos.getZ(i) * 50)}`;
  const acc = new Map();
  for (let i = 0; i < n; i++) {
    const k = key(i), t = i - (i % 3);
    let a = acc.get(k);
    if (!a) acc.set(k, (a = [0, 0, 0, 0]));
    a[0] += tri[t]; a[1] += tri[t + 1]; a[2] += tri[t + 2]; a[3]++;
  }
  for (let i = 0; i < n; i++) {
    const a = acc.get(key(i));
    c.setRGB(a[0] / a[3], a[1] / a[3], a[2] / a[3]);
    band?.(pos.getX(i), pos.getY(i), pos.getZ(i), c);
    col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
}

/** Flat ground pieces (roads, paving, kerbs) cast no visible shadow: skip them in the shadow pass. */
function noShadow(obj) {
  obj.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return obj;
}

/**
 * Kit workaround (the kit now flags these itself; kept as a harmless guard): the buildings kit's
 * addCollider() meshes are invisible and must carry userData.collider for Shooting to hit them.
 */
export function flagColliders(obj) {
  obj.traverse((o) => { if (o.isMesh && o.name === 'collider' && !o.visible) o.userData.collider = true; });
  return obj;
}

// ---------------------------------------------------------------- the layout
export function buildLayout(ctx, S) {
  const root = ctx.root;
  const L = { anchors: {}, rotW: ROT_W, rotE: ROT_E, footprints: [], shade: [] };
  const batch = S.batch;
  const rng = ctx.rng;
  const add = (obj, x, z, ry = 0, y = 0) => put(root, obj, x, z, ry, y);
  /** Remember a building's footprint (world rect) for ground shading + tree clearance. */
  const foot = (x, z, ry, w, d, pad = 0) => L.footprints.push({ x, z, ry, w: w + pad * 2, d: d + pad * 2 });

  // ---- square (cobbles + colour zones)
  const square = cobblePlaza(SQUARE, { seed: 5 });
  root.add(noShadow(square));
  ctx.surface(square, 'stone');
  L.square = square;
  const [FX, FZ] = FOUNTAIN;
  const warm = B.cobbleTexture({ seed: 8, base: '#e2c7a0', tile: 2.4 });
  const setts = B.cobbleTexture({ seed: 9, base: '#bdb4a6', tile: 2.2 });
  const brick = B.cobbleTexture({ seed: 10, base: '#d99a78', tile: 1.8 });
  const stone = materials.solid('#f1e8d8', { roughness: 0.8 });
  const zones = new THREE.Group();
  zones.name = 'squareZones';
  // fountain rosette: warm cobbles in a pale stone ring with eight spokes
  zones.add(inlay(circleShape(FX, FZ, 8.2, 4.1), warm, 0.103, 2.4));
  zones.add(inlay(circleShape(FX, FZ, 8.8, 8.2), stone, 0.106));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const r0 = 4.4, r1 = 8.2;
    zones.add(inlay(rectShape(FX + Math.cos(a) * (r0 + r1) / 2, FZ + Math.sin(a) * (r0 + r1) / 2, 0.36, r1 - r0, Math.PI / 2 - a), stone, 0.107));
  }
  // darker setts: the cart track from the fête gate to the fountain and on to the terrace
  zones.add(inlay(rectShape(0, 12.4, 4.2, 7.4), setts, 0.102, 2.2));
  zones.add(inlay(rectShape(0, -20.4, 4.2, 7.6), setts, 0.102, 2.2));
  // brick paving under the two market rows
  for (const [x, z, w] of [[-17.5, 9, 13.5], [17.5, 9, 13.5], [-16, -15.5, 12.5], [16, -15.5, 12.5]]) zones.add(inlay(rectShape(x, z, w, 4.6), brick, 0.102, 1.8));
  root.add(zones);
  batch.add(zones, 'stone');

  // ---- road (a U round the village behind the van), pavements, paths
  const road = B.road({ points: ROAD_PTS, width: 6.6, edgeLines: false, seed: 2 });
  root.add(noShadow(road));
  ctx.surface(road, 'stone');
  L.roadPath = road.userData.path;
  batch.add(road, 'stone');
  const pave = [
    // north pavement in front of the terrace
    B.pavement({ points: [[-16.5, -26.1], [16.5, -26.1]], width: 2.6, seed: 3 }),
    // west row + east row fronts
    B.pavement({ points: [[-27.7, -22.6], [-31.9, 12.6]], width: 2.4, seed: 4 }),
    B.pavement({ points: [[27.7, -22.6], [30.4, -8.6]], width: 2.4, seed: 5 }),
    // church path: square corner -> lych gate
    B.pavement({ points: [[-24.2, -23.2], [-25.8, -27.8], [-27.4, -31.2]], width: 2.2, seed: 6 }),
    // van -> fête gate
    B.pavement({ points: [[0, 38.2], [0.3, 31], [-0.2, 19.2]], width: 2.6, seed: 7 }),
    // allotment path + pub garden path
    B.pavement({ points: [[-29.5, 17.5], [-33.5, 24.5], [-39.5, 26.5]], width: 1.8, seed: 8 }),
    B.pavement({ points: [[29.5, 15.5], [33.5, 21], [38.5, 24]], width: 1.8, seed: 9 }),
    // oak green path to Pete's bench
    B.pavement({ points: [[18.6, -24.8], [20.6, -27.6]], width: 1.8, seed: 10 }),
  ];
  for (const p of pave) { root.add(noShadow(p)); ctx.surface(p, 'stone'); batch.add(p, 'stone'); }
  const layby = gravelPad(9, 15);
  add(noShadow(layby), VAN[0], VAN[1] + 2.5);
  batch.add(layby, 'dust');

  // ---- backdrop: the hills close in right behind the village
  const bd = B.backdrop({ seed: 7, inner: 72, radius: 820, windmillAngle: -0.62, spireAngle: 0.32, seaAngle: 0.78, hedgeRange: 300, loneTrees: 40 });
  bd.position.set(WORLD_C[0], 0, WORLD_C[1]);
  root.add(bd);
  ctx.surface(bd, 'grass');
  ctx.onUpdate(bd.userData.update);
  L.backdrop = bd;

  // ---- fountain (centre of the square)
  const fountain = flagColliders(B.fountain({ seed: 'puddleby', radius: 3.6, valveSide: 1 }));
  add(fountain, FX, FZ);
  ctx.surface(fountain, 'stone');
  ctx.onUpdate(fountain.userData.update);
  // let Game's post-build compile() see the flowing-water shaders (the kit hides them while dry;
  // its first update hides them again) so the job reaction doesn't hitch on a shader compile
  fountain.userData.parts.jets.visible = true;
  fountain.userData.parts.droplets.visible = true;
  L.fountain = fountain;

  // ---- church (NW) with the wedding at its gate
  const church = flagColliders(B.church({ seed: 'st-puddle', graves: 8, time: 10 * 3600 + 52 * 60 }));
  const CH = [-31.5, -43], CHR = 0.5;
  add(church, CH[0], CH[1], CHR);
  ctx.surface(church, 'stone');
  ctx.onUpdate((dt, t) => church.userData.update(dt, t));
  batch.addMeshes(church, 'stone');
  L.church = church;
  L.churchAt = { x: CH[0], z: CH[1], ry: CHR };
  foot(CH[0], CH[1], CHR, 19, 19);
  const cw = (lx, lz) => local(CH[0], CH[1], CHR, lx, lz);
  const walls = [
    B.lowWall([cw(-3.2, 11.4), cw(-11, 11.4), cw(-11, -10.4), cw(11.5, -10.4), cw(11.5, 11.4), cw(3.2, 11.4)], { seed: 4, height: 0.85 }),
  ];
  for (const w of walls) { root.add(w); batch.add(w, 'stone'); }
  L.anchors.churchDoor = church.userData.parts.door.getWorldPosition(new THREE.Vector3());
  L.churchGate = cw(0, 11.4);

  // ---- terrace of five (N)
  const terrace = B.terrace(5, { seed: 'puddle-row', startNumber: 1, numberStep: 2, floors: [2, 3], house: { backDetail: false }, walls: [P.wallButter, P.wallMint, P.wallRose, P.wallSky, P.wallCream, P.wallLilac] });
  const TZ = -31.5;
  add(terrace, 0, TZ);
  ctx.surface(terrace, 'stone');
  L.terrace = terrace;
  L.terraceAt = { x: 0, z: TZ };
  foot(0, TZ + 0.3, 0, 27.6, 7.7);
  L.anchors.terraceChimneys = terrace.userData.parts.chimneyTops.map((o) => o.getWorldPosition(new THREE.Vector3()));
  L.anchors.terraceDoors = terrace.userData.parts.doors.map((o) => o.getWorldPosition(new THREE.Vector3()));
  batch.add(terrace, 'stone');

  // NE: the gnome house behind the oak
  const gnomeHouse = B.house({ backDetail: false, seed: 'gnome-house', floors: 2, roofStyle: 'gable', gag: 'gnome', wall: P.wallSky, number: 14, roof: P.roofTerracotta });
  const GH = [37.5, -35], GHR = -0.55;
  add(gnomeHouse, GH[0], GH[1], GHR);
  foot(GH[0], GH[1], GHR, 7.4, 7);
  L.gnomeHouse = gnomeHouse;
  L.anchors.gnomeChimneys = gnomeHouse.userData.parts.chimneyTops.map((o) => o.getWorldPosition(new THREE.Vector3()));
  batch.addMeshes(gnomeHouse, 'stone');

  // ---- west row: house, bakery, post office, hardware, house
  const west = [
    { mk: () => B.house({ backDetail: false, seed: 'w1', floors: 2, wall: P.wallLilac, roofStyle: 'mansard', number: 2 }), s: 0 },
    { mk: () => B.shop({ kind: 'bakery', seed: 31, floors: 2, width: 7, depth: 6, text: 'CRUMB & SONS', sub: 'BAKERS' }), s: 7.5 },
    { mk: () => B.shop({ kind: 'post', seed: 32, floors: 2, width: 7.2, depth: 6, roofStyle: 'hip' }), s: 15.1 },
    { mk: () => B.shop({ kind: 'hardware', seed: 33, floors: 2, width: 6.8, depth: 6, text: 'NUTS & BOLTS' }), s: 22.4 },
    { mk: () => B.house({ backDetail: false, seed: 'w5', floors: 2, wall: P.wallMint, style: 'tudor', number: 10 }), s: 29.4 },
  ];
  const F0 = [-28.3, -20.4];
  L.west = west.map((b, i) => {
    const fx = F0[0] + DIR_W[0] * b.s, fz = F0[1] + DIR_W[1] * b.s;
    const obj = b.mk();
    const d = 6.6;
    const [cx, cz] = behind(fx, fz, ROT_W, d);
    add(obj, cx, cz, ROT_W + (i === 4 ? -0.04 : 0));
    ctx.surface(obj, 'stone');
    foot(cx, cz, ROT_W, 7.4, 7.2);
    const rec = { obj, front: [fx, fz], centre: [cx, cz], chimneys: (obj.userData.parts.chimneyTops || []).map((o) => o.getWorldPosition(new THREE.Vector3())) };
    batch.add(obj, 'stone');
    return rec;
  });
  L.postOffice = L.west[2];

  // ---- east row: café + sweet shop, then the Wonky Pint
  const east = [
    { mk: () => B.shop({ kind: 'cafe', seed: 41, floors: 2, width: 7, depth: 6, text: 'THE TEAPOT', sub: 'CAFE' }), s: 0 },
    { mk: () => B.shop({ kind: 'sweets', seed: 42, floors: 3, width: 6.4, depth: 6, roofStyle: 'mansard', text: 'SUGAR MICE' }), s: 7.4 },
  ];
  const E0 = [28.3, -20.4];
  L.east = east.map((b) => {
    const fx = E0[0] + DIR_E[0] * b.s, fz = E0[1] + DIR_E[1] * b.s;
    const obj = b.mk();
    const [cx, cz] = behind(fx, fz, ROT_E, 6.6);
    add(obj, cx, cz, ROT_E);
    ctx.surface(obj, 'stone');
    foot(cx, cz, ROT_E, 7.4, 7.2);
    const rec = { obj, front: [fx, fz], chimneys: (obj.userData.parts.chimneyTops || []).map((o) => o.getWorldPosition(new THREE.Vector3())) };
    batch.add(obj, 'stone');
    return rec;
  });

  const pub = flagColliders(B.pub({ crooked: true, seed: 'wonky', tables: 2, signSide: 1 }));
  const PUB = [37.2, 3.6], PUBR = -1.25;
  add(pub, PUB[0], PUB[1], PUBR);
  ctx.surface(pub, 'wood');
  ctx.onUpdate(pub.userData.update);
  batch.addMeshes(pub, 'stone');
  foot(PUB[0] - Math.sin(PUBR) * 0, PUB[1], PUBR, 12, 8.6);
  L.pub = pub;
  L.pubAt = { x: PUB[0], z: PUB[1], ry: PUBR };
  L.anchors.pubChimneys = pub.userData.parts.chimneyTops.map((o) => o.getWorldPosition(new THREE.Vector3()));
  L.anchors.pubDoor = pub.userData.parts.door.getWorldPosition(new THREE.Vector3());
  L.anchors.pubTables = pub.userData.parts.tables.map((o) => o.getWorldPosition(new THREE.Vector3()));

  // ---- south-west: Mr Grubb's cottage (the tap is by its front door) beside the allotments
  const grubb = B.house({ backDetail: false, seed: 'grubb', floors: 1, roofStyle: 'gable', gableFront: false, wall: '#fff1d6', roof: P.roofTeal, style: 'plain', number: 3, porch: 'hood', climber: true, pots: false, width: 6.4, depth: 5.4 });
  const GR = [-42.5, 17.5], GRR = facePerch(-42.5, 17.5) - 0.18;
  add(grubb, GR[0], GR[1], GRR);
  ctx.surface(grubb, 'stone');
  batch.add(grubb, 'stone');
  foot(GR[0], GR[1], GRR, 7.1, 7);
  L.grubb = { obj: grubb, x: GR[0], z: GR[1], ry: GRR, w: 6.4, d: 5.4 };
  L.anchors.grubbChimneys = grubb.userData.parts.chimneyTops.map((o) => o.getWorldPosition(new THREE.Vector3()));

  // more houses round the edges so the village never thins out (flanks + behind the terrace)
  const extras = [
    { o: B.house({ backDetail: false, seed: 'e-1', floors: 2, roofStyle: 'hip', wall: P.wallButter }), x: -44, z: -21, ry: 1.25 },
    { o: B.house({ backDetail: false, seed: 'e-2', floors: 1, roofStyle: 'gable', wall: P.wallRose, gag: 'birdhouse' }), x: -44.5, z: -5.5, ry: 1.3 },
    { o: B.house({ backDetail: false, seed: 'e-3', floors: 2, wall: P.wallCream, style: 'brick' }), x: 9, z: -46, ry: 0.05 },
    { o: B.house({ backDetail: false, seed: 'e-4', floors: 2, roofStyle: 'mansard', wall: P.wallMint }), x: -8.5, z: -46.5, ry: -0.05 },
    { o: B.house({ backDetail: false, seed: 'e-5', floors: 2, wall: P.wallPeach, roofStyle: 'gable', gableFront: true }), x: 45.5, z: -17.5, ry: -1.3 },
    { o: B.house({ backDetail: false, seed: 'e-6', floors: 1, wall: P.wallLilac }), x: 70.5, z: -7.5, ry: -1.3 }, // behind the wicketkeeper
    { o: B.house({ backDetail: false, seed: 'e-7', floors: 2, wall: P.wallSky, roofStyle: 'hip' }), x: 61, z: -24, ry: -1.35 },
    { o: B.house({ backDetail: false, seed: 'e-8', floors: 1, wall: P.wallButter, roofStyle: 'gable', gag: 'gnome' }), x: -62.5, z: -2, ry: 1.45 },
  ];
  L.extraChimneys = [];
  for (const e of extras) {
    add(e.o, e.x, e.z, e.ry);
    ctx.surface(e.o, 'stone');
    foot(e.x, e.z, e.ry, 7.4, 7);
    L.extraChimneys.push(...e.o.userData.parts.chimneyTops.map((o) => o.getWorldPosition(new THREE.Vector3())));
    batch.add(e.o, 'stone');
  }

  // ---- trees: the hero oak (NE, the kite's up it) + instanced woods round the edges
  const oak = N.tree({ type: 'round', seed: 11, scale: 1.9 });
  const OAK = [25.5, -35.5];
  add(oak, OAK[0], OAK[1], 0.4);
  ctx.surface(oak, 'leaves');
  oak.userData.parts.trunk.userData.surface = 'wood';
  ctx.onUpdate(oak.userData.update);
  L.oak = oak;
  L.oakAt = { x: OAK[0], z: OAK[1] };
  ctx.prop(oak, { surface: 'leaves', onHit: () => oak.userData.wobble(0.6) });

  const inFoot = (x, z, pad = 0) => L.footprints.some((f) => {
    const dx = x - f.x, dz = z - f.z, c = Math.cos(f.ry), s = Math.sin(f.ry);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.abs(lx) < f.w / 2 + pad && Math.abs(lz) < f.d / 2 + pad;
  });
  const onRoad = (x, z, pad = 5.5) => { for (let i = 0; i < ROAD_PTS.length - 1; i++) if (segDist(x, z, ...ROAD_PTS[i], ...ROAD_PTS[i + 1]) < pad) return true; return false; };
  // ---- patchwork fields over the ring road (what the flanks show at the yaw limits): 18 x 22.5 m
  // plots on the coarse ground ring, hedged along their borders; the east meadow is a mown cricket
  // field and the sheep paddock stays pasture
  const inLoop = (x, z) => inPoly(x, z, ROAD_PTS);
  const inCricket = (x, z, pad = 0) => ((x - CRICKET[0]) / (7.5 + pad)) ** 2 + ((z - CRICKET[1]) / (19 + pad)) ** 2 < 1;
  const inPaddock = (x, z) => x > -71 && x < -57.5 && z > 3 && z < 31;
  const rim = (x, z) => Math.hypot(x - WORLD_C[0], z - WORLD_C[1]);
  const FX0 = -99, FZ0 = -103.5, FW = 18, FD = 22.5;
  const isField = (x, z, pad = 0) => !inLoop(x, z) && !onRoad(x, z, 6.2 + pad) && rim(x, z) < 86 - pad && !inCricket(x, z, 2 + pad) && !inPaddock(x, z) && !inFoot(x, z, 2 + pad);
  // [colour, furrow colour (subtle rows on the flat ground), weight]: pasture, wheat, rapeseed,
  // ploughed, hay, clover. Golds stay calm and furrows soft (loud ones read as noise at 100 m).
  const CROPS = [['#86c95a', null, 2.6], ['#e0c46e', '#d6b862', 1.6], ['#e8d466', null, 1.1], ['#b08a5e', '#a37f55', 1.4], ['#c6dc84', '#bcd379', 1.7], ['#6fb84a', null, 1.4]];
  const cropW = CROPS.reduce((a, k) => a + k[2], 0);
  const cropAt = (ix, iz) => { let h = hash3(ix * 1.3, 9.1, iz * 0.7) * cropW; for (const k of CROPS) if ((h -= k[2]) <= 0) return k; return CROPS[0]; };
  const fieldColor = (x, z, c, rows = true) => {
    const ix = Math.floor((x - FX0) / FW), iz = Math.floor((z - FZ0) / FD);
    const [a, b] = cropAt(ix, iz);
    c.set(rows && b && Math.floor((x - FX0) / 4.5) % 2 ? b : a).offsetHSL(0, 0, (hash3(ix, 2.3, iz) - 0.5) * 0.04);
  };
  const treePts = [];
  const clear = (x, z) => {
    if (inPoly(x, z, SQUARE) || inPoly(x, z, ALLOT) || inPoly(x, z, GREEN)) return false;
    if (Math.hypot(x - WORLD_C[0], z - WORLD_C[1]) > 84) return false;
    if (onRoad(x, z) || inFoot(x, z, 3)) return false;
    if (Math.hypot(x - OAK[0], z - OAK[1]) < 9 || Math.hypot(x - CH[0], z - CH[1]) < 13) return false;
    if (inCricket(x, z, 3)) return false;
    if (z > 30 && Math.abs(x) < 40) return false; // keep the green and the lay-by open
    return true;
  };
  // back woods (north), and belts down both flanks in front of the hills
  for (let i = 0; i < 44; i++) {
    const a = rng.range(-1.2, 1.2), r = rng.range(52, 78);
    const x = WORLD_C[0] + Math.sin(a) * r, z = WORLD_C[1] - Math.cos(a) * r;
    if (clear(x, z)) treePts.push({ x, z, type: rng.pick(['round', 'round', 'tall', 'conifer', 'conifer']) });
  }
  for (let i = 0; i < 26; i++) {
    const x = rng.range(-78, -58), z = rng.range(-40, 40);
    if (clear(x, z)) treePts.push({ x, z, type: rng.pick(['round', 'tall', 'conifer']) });
  }
  for (let i = 0; i < 26; i++) {
    const x = rng.range(58, 78), z = rng.range(-40, 40);
    if (clear(x, z)) treePts.push({ x, z, type: rng.pick(['round', 'tall', 'round', 'conifer']) });
  }
  // gaps between buildings + yews in the churchyard + orchard trees on the flanks
  const accents = [
    { x: -17.5, z: -38.5, type: 'tall' }, { x: 17.5, z: -39, type: 'round' }, { x: 29.5, z: -45, type: 'fruit' },
    { x: -37, z: -12.5, type: 'round' }, { x: -38.5, z: 2.5, type: 'fruit' }, { x: -52, z: 6, type: 'fruit' }, { x: -55, z: -12, type: 'tall' },
    { x: cw(-8.5, -6)[0], z: cw(-8.5, -6)[1], type: 'conifer', scale: 0.8 }, { x: cw(9, -7.5)[0], z: cw(9, -7.5)[1], type: 'conifer', scale: 0.9 },
    { x: cw(-8.5, 7.5)[0], z: cw(-8.5, 7.5)[1], type: 'conifer', scale: 0.7 },
    { x: 45, z: -4.5, type: 'round' }, { x: 44.5, z: -30, type: 'tall' }, { x: 46.2, z: 4.4, type: 'blossom' }, { x: 19.5, z: -45.5, type: 'blossom' },
    { x: 58.5, z: 14, type: 'fruit' }, { x: 47, z: 32.5, type: 'round' },
  ];
  for (const a of accents) if (!inFoot(a.x, a.z, 1) && !inCricket(a.x, a.z, 2)) treePts.push(a);
  const nearT = treePts.filter((p) => Math.hypot(p.x - PERCH.x, p.z - PERCH.z) < 70);
  const farT = treePts.filter((p) => Math.hypot(p.x - PERCH.x, p.z - PERCH.z) >= 70);
  for (const [pts, cast, seed] of [[nearT, true, 21], [farT, false, 22]]) {
    const woods = N.forest(pts, { types: ['round', 'tall', 'conifer'], seed, scale: [0.9, 1.25], tint: 0.14 });
    for (const m of woods.children) { m.userData.surface = m.name.includes('crown') ? 'leaves' : 'wood'; m.castShadow = cast; }
    root.add(woods);
  }
  L.treePts = treePts;
  L.inFoot = inFoot;
  L.onRoad = onRoad;

  // ---- ground: stripes, worn tracks, darker grass under trees and along walls
  const base = new THREE.Color(P.grass), light = new THREE.Color(P.grassLight), dark = new THREE.Color(P.grassDark);
  const worn = new THREE.Color('#c9b77e'), soil = new THREE.Color('#9bb85a'), deep = new THREE.Color('#4c9038');
  const tracks = [
    [[0, 38], [0.4, 19]], [[-6, 27], [-2.5, 21]], [[7, 25.5], [2.5, 21]], [[-17, 30], [-8, 25]], [[20, 25], [9, 22]],
    [[27.5, 26], [33, 22]], [[-30, 18], [-24, 21]],
  ];
  const wornRings = [{ x: 8.5, z: 25.5, r0: 2.4, r1: 4.3 }];
  const colorAt = (x, z, c) => {
    const n = hash3(Math.floor(x / 7), 1.7, Math.floor(z / 7)) * 0.5 + hash3(Math.floor(x / 19), 4.2, Math.floor(z / 19)) * 0.5;
    c.copy(base).lerp(n > 0.5 ? light : dark, Math.abs(n - 0.5) * 0.7);
    // mowing stripes on the green (N-S, toward the van) and the lawns round the square (E-W)
    if (inPoly(x, z, GREEN)) c.lerp(Math.floor((x + 300) / 3) % 2 ? light : dark, 0.32);
    else if (Math.hypot(x - WORLD_C[0], z - WORLD_C[1]) < 60 && !inPoly(x, z, ALLOT)) c.lerp(Math.floor((z + 300) / 3) % 2 ? light : dark, 0.16);
    if (inPoly(x, z, ALLOT)) c.lerp(soil, 0.4);
    if (isField(x, z)) fieldColor(x, z, c);
    else if (inCricket(x, z)) c.copy(base).lerp(Math.floor((z - FZ0) / 4.5) % 2 ? light : dark, 0.4);
    // darker, lusher grass under trees and hugging walls
    let shadeK = 0;
    for (const t of treePts) { const d = Math.hypot(x - t.x, z - t.z); if (d < 5.5) shadeK = Math.max(shadeK, (1 - d / 5.5) * 0.5); }
    if (Math.hypot(x - OAK[0], z - OAK[1]) < 8) shadeK = Math.max(shadeK, 0.55);
    if (inFoot(x, z, 1.4)) shadeK = Math.max(shadeK, 0.35);
    if (shadeK) c.lerp(deep, shadeK);
    // worn tracks across the green (where everyone cuts across) + a ring round the maypole
    for (const [a, b] of tracks) { const d = segDist(x, z, a[0], a[1], b[0], b[1]); if (d < 1.3) c.lerp(worn, (1 - d / 1.3) * 0.55); }
    for (const w of wornRings) { const d = Math.hypot(x - w.x, z - w.z); if (d > w.r0 && d < w.r1) c.lerp(worn, 0.35); }
    // soften into the hills' grass at the rim
    const rr = Math.hypot(x - WORLD_C[0], z - WORLD_C[1]);
    if (rr > 74) c.lerp(new THREE.Color('#86c25a'), Math.min(1, (rr - 74) / 12) * 0.6);
    return c;
  };
  root.add(groundMesh(ctx, colorAt));
  // hedges along the plot borders (a few gaps for gates); only where both sides are fields
  const hedgeOk = (x, z) => !inLoop(x, z) && !onRoad(x, z, 7) && rim(x, z) < 83 && !inCricket(x, z, 4) && !inPaddock(x, z) && !inFoot(x, z, 3);
  let hedgeSegs = 0;
  const hedgeGroup = new THREE.Group();
  hedgeGroup.name = 'fieldHedges';
  const tryHedge = (x0, z0, x1, z1, k) => {
    const n = 3;
    for (let i = 0; i <= n; i++) if (!hedgeOk(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n)) return;
    if (hash3(x0 * 0.3, z0 * 0.7, k) < 0.16) return; // a gap / gate
    hedgeGroup.add(B.hedgeRow([[x0, z0], [x1, z1]], { seed: 500 + hedgeSegs, height: 1.25, width: 1.1, flowers: 0.35 }));
    hedgeSegs++;
  };
  for (let x = FX0; x <= 99; x += FW) for (let z = FZ0; z < 94; z += FD) tryHedge(x, z, x, z + FD, 1.7);
  for (let z = FZ0; z <= 94; z += FD) for (let x = FX0; x < 99; x += FW) tryHedge(x, z, x + FW, z, 2.9);
  root.add(hedgeGroup);
  ctx.surface(hedgeGroup, 'leaves');
  batch.add(hedgeGroup, 'leaves');
  // ...and carry the patchwork out over the hills' plain inner band (the backdrop kit fades its own
  // fields to lawn there), so the flanks read as farmland all the way to the horizon. The backdrop
  // terrain is recoloured per VERTEX (shared corners average their triangles), so field
  // edges are soft instead of sawtooth, the per-triangle speckle calms down, the lavender slab that
  // dominated the title/intro aerials becomes a sage meadow and the loudest golds soften. Then the
  // hedges carry on up the slopes at terrain height.
  {
    const terrain = bd.getObjectByName('backdropTerrain');
    const heightAt = bd.userData.heightAt;
    const [ox, oz] = WORLD_C;
    if (terrain?.geometry?.attributes?.color) {
      const f = new THREE.Color();
      calmTerrain(terrain.geometry, (x, y, z, c) => {
        const wx = x + ox, wz = z + oz, r = rim(wx, wz);
        if (r > 124 || y < 0.4 || (!isField(wx, wz) && r < 86)) return;
        fieldColor(wx, wz, f, false);
        c.lerp(f, 0.85 * Math.min(1, Math.max(0, (124 - r) / 22)));
      });
    }
    if (heightAt) {
      const hillOk = (x, z) => { const r = rim(x, z); return r > 78 && r < 104 && !inLoop(x, z) && !onRoad(x, z, 7) && heightAt(x - ox, z - oz) > 0.5; };
      const hill = (x0, z0, x1, z1, k) => {
        const n = 3;
        for (let i = 0; i <= n; i++) if (!hillOk(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n)) return;
        if (hash3(x0 * 0.3, z0 * 0.7, k) < 0.16) return;
        for (let i = 0; i < n; i++) { // short pieces, each sat on the slope
          const ax = x0 + (x1 - x0) * i / n, az = z0 + (z1 - z0) * i / n, bx = x0 + (x1 - x0) * (i + 1) / n, bz = z0 + (z1 - z0) * (i + 1) / n;
          const y = Math.min(heightAt(ax - ox, az - oz), heightAt(bx - ox, bz - oz), heightAt((ax + bx) / 2 - ox, (az + bz) / 2 - oz)) - 0.12;
          hedgeGroup.add(B.hedgeRow([[ax, y, az], [bx, y, bz]], { seed: 900 + hedgeSegs * 3 + i, height: 1.5, width: 1.2, flowers: 0.2 }));
        }
        hedgeSegs++;
      };
      for (let x = FX0 - 2 * FW; x <= 140; x += FW) for (let z = FZ0 - FD; z < 120; z += FD) hill(x, z, x, z + FD, 3.7);
      for (let z = FZ0 - FD; z <= 120; z += FD) for (let x = FX0 - 2 * FW; x < 140; x += FW) hill(x, z, x + FW, z, 4.1);
    }
  }
  L.fieldHedges = hedgeSegs;

  // puddles (after last night's rain) on the cobbles, the lay-by and the green's worn track
  const puddleMat = new THREE.MeshStandardMaterial({ color: '#8fb1d6', roughness: 0.04, metalness: 0.35, envMapIntensity: 1.6 });
  puddleMat.name = 'puddle';
  const puddles = new THREE.Group();
  puddles.name = 'puddles';
  for (const [x, z, sx, sz, y] of [[-4.6, 12.8, 1.5, 0.9, 0.108], [13.2, -21.2, 1.1, 0.7, 0.108], [-22.5, 1.5, 0.9, 1.3, 0.108], [1.6, 33.6, 1.3, 0.8, 0.02], [2.6, 41.6, 1.6, 1.0, 0.1], [-35.5, 22.5, 1.0, 0.7, 0.2]]) {
    const g = new THREE.CircleGeometry(1, 14);
    const p = g.attributes.position;
    for (let i = 1; i < p.count; i++) { const k = 0.82 + hash3(i, x, z) * 0.3; p.setXY(i, p.getX(i) * k, p.getY(i) * k); }
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, puddleMat);
    m.scale.set(sx, 1, sz);
    m.position.set(x, y, z);
    m.rotation.y = hash3(x, z, 3) * 3;
    m.receiveShadow = true;
    m.castShadow = false;
    puddles.add(m);
  }
  root.add(puddles);
  ctx.surface(puddles, 'water');
  batch.add(puddles, 'water');
  return L;
}

export { behind, DIR_W, N_W, DIR_E, N_E, segDist, v3 };
