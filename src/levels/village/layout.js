// Puddleby Green: terrain, roads, the cobbled square, buildings, trees and the backdrop.
// Everything static is handed to the StaticBatcher; gameplay pieces are returned in `L`.
import * as THREE from 'three';
import * as B from '../../world/kit/buildings/index.js';
import * as N from '../../world/kit/nature/index.js';
import { materials } from '../../gfx/materials.js';
import { P } from '../../gfx/palette.js';
import { hash3 } from '../../core/rng.js';
import { put, local, facePerch, inPoly, segDist, v3 } from './util.js';
import { gravelPad } from './custom.js';

// ---------------------------------------------------------------- key coordinates (x, z)
export const SQUARE = [[-30, -44.5], [30, -44.5], [35, -10], [37, 14.5], [-50.5, 14.5], [-44.6, -3], [-33, -29], [-31, -38]];
export const FOUNTAIN = [0, -12];
export const ROAD_PTS = [[-104, 26], [-88, 41], [-66, 46.4], [-20, 47], [20, 47], [58, 46.6], [82, 44.2], [100, 37]];
export const LANE_PTS = [[53.2, 43.2], [55.6, 34], [56.5, 10], [56.4, -40], [57.6, -72], [62, -96]];
export const ROAD_Z = 47;
export const ALLOT = [[-53, 18.5], [-17, 18.5], [-17, 39], [-53, 39]];
export const FETE = [[13, 18.5], [49, 18.5], [49, 39], [13, 39]];
export const GREEN_NE = [[23, -68], [54, -68], [54, -41], [23, -41]];
// west row: fronts along a line facing ROT_W (toward the square, turned toward the perch)
export const ROT_W = 1.15;
export const ROT_E = -0.95;
const DIR_W = [-Math.cos(ROT_W), Math.sin(ROT_W)]; // along the row (north -> south)
const N_W = [Math.sin(ROT_W), Math.cos(ROT_W)]; // front normal

/** Centre of a building whose front midpoint is at (fx, fz), facing yaw ry, depth d. */
function behind(fx, fz, ry, d) {
  return [fx - Math.sin(ry) * d / 2, fz - Math.cos(ry) * d / 2];
}

// ---------------------------------------------------------------- ground
function groundMesh(ctx) {
  const size = 270, segs = 90, R = 132;
  const g = new THREE.PlaneGeometry(size, size, segs, segs).rotateX(-Math.PI / 2).toNonIndexed();
  const pos = g.attributes.position;
  const keep = [];
  const cz = -8;
  for (let i = 0; i < pos.count; i += 3) {
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3 + cz;
    if (Math.hypot(x, z - cz) < R) keep.push(i);
  }
  const out = new Float32Array(keep.length * 9);
  const col = new Float32Array(keep.length * 9);
  const c = new THREE.Color(), base = new THREE.Color(P.grass), light = new THREE.Color(P.grassLight), dark = new THREE.Color(P.grassDark);
  keep.forEach((i, k) => {
    for (let v = 0; v < 3; v++) {
      const x = pos.getX(i + v), z = pos.getZ(i + v) + cz;
      out.set([x, 0, z], k * 9 + v * 3);
      // soft patchy variation + mowing stripes on the greens
      const n = hash3(Math.floor(x / 9), 1.7, Math.floor(z / 9)) * 0.5 + hash3(Math.floor(x / 23), 4.2, Math.floor(z / 23)) * 0.5;
      c.copy(base).lerp(n > 0.55 ? light : dark, Math.abs(n - 0.55) * 0.55);
      const mow = inPoly(x, z, FETE) || inPoly(x, z, GREEN_NE) || (x > -12 && x < 12 && z > 16 && z < 41);
      if (mow) c.lerp(Math.floor((x + 200) / 3.2) % 2 ? light : dark, 0.16);
      if (inPoly(x, z, ALLOT)) c.lerp(new THREE.Color('#9bb85a'), 0.35);
      col.set([c.r, c.g, c.b], k * 9 + v * 3);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(out, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, materials.toy);
  m.receiveShadow = true;
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
      // quadratic bezier p0 -> p -> p1
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

// ---------------------------------------------------------------- the layout
export function buildLayout(ctx, S) {
  const root = ctx.root;
  const L = { anchors: {}, rotW: ROT_W, rotE: ROT_E };
  const batch = S.batch;
  const add = (obj, x, z, ry = 0, y = 0) => put(root, obj, x, z, ry, y);

  // ---- ground, roads, pavements
  root.add(groundMesh(ctx));
  const square = cobblePlaza(SQUARE, { seed: 5 });
  root.add(square);
  ctx.surface(square, 'stone');
  L.square = square;

  const road = B.road({ points: ROAD_PTS, width: 7, edgeLines: false, seed: 2 });
  root.add(road);
  ctx.surface(road, 'stone');
  L.roadPath = road.userData.path;
  const lane = B.road({ points: LANE_PTS, width: 6, kerbs: false, dashes: true, seed: 3 });
  lane.position.y = -0.012;
  root.add(lane);
  ctx.surface(lane, 'stone');
  L.lanePath = lane.userData.path;
  batch.add(road, 'stone');
  batch.add(lane, 'stone');
  const paveS = B.pavement({ points: [[-86, 38.2], [-66, 42.2], [-20, 42.8], [20, 42.8], [44, 42.5], [50.4, 42.3]], width: 2.6, kerbSide: 1, seed: 3 });
  const paveE = B.pavement({ points: [[50.9, 40.6], [52.3, 29.5], [52.3, 0], [52.1, -40], [53.4, -72]], width: 2.4, kerbSide: -1, seed: 4 });
  const paveSouth = B.pavement({ points: [[-60, 51.4], [-20, 51.2], [20, 51.2], [58, 50.9], [80, 48.6]], width: 1.8, kerbSide: -1, seed: 6 });
  for (const p of [paveS, paveE, paveSouth]) { root.add(p); ctx.surface(p, 'stone'); batch.add(p, 'stone'); }
  // paths: square -> road, church door, allotments, fête field
  const paths = [
    B.pavement({ points: [[0, 14], [0.4, 28], [0, 41.8]], width: 3.2, seed: 7 }),
    B.pavement({ points: [[-31, -38.5], [-35.5, -38.8], [-39.2, -39.4]], width: 2.6, seed: 8 }),
    B.pavement({ points: [[-16, 14], [-16.4, 24], [-17.6, 29]], width: 2, seed: 9 }),
    B.pavement({ points: [[12, 14], [12.6, 21]], width: 2.4, seed: 10 }),
    B.pavement({ points: [[26, -41], [29, -44.5], [31, -47]], width: 2, seed: 11 }),
  ];
  for (const p of paths) { root.add(p); ctx.surface(p, 'stone'); batch.add(p, 'stone'); }
  const layby = gravelPad(15, 22);
  add(layby, 0, 61.5);
  batch.add(layby, 'dust');

  // ---- backdrop (hills, fields, windmill, spire, sea)
  const bd = B.backdrop({ seed: 7, inner: 114, radius: 820, windmillAngle: -0.55, spireAngle: 0.3, seaAngle: 0.75 });
  bd.position.z = -8;
  root.add(bd);
  ctx.surface(bd, 'grass');
  ctx.onUpdate(bd.userData.update);
  L.backdrop = bd;

  // ---- fountain (centre of the square)
  const fountain = B.fountain({ seed: 'puddleby', radius: 3.6, valveSide: 1 });
  add(fountain, FOUNTAIN[0], FOUNTAIN[1]);
  ctx.surface(fountain, 'stone');
  ctx.onUpdate(fountain.userData.update);
  L.fountain = fountain;

  // ---- church (NW) with the wedding
  const church = B.church({ seed: 'st-puddle', graves: 8, time: 10 * 3600 + 52 * 60 });
  const CH = [-47.5, -48.5], CHR = 0.8;
  add(church, CH[0], CH[1], CHR);
  ctx.surface(church, 'stone');
  ctx.onUpdate((dt, t) => church.userData.update(dt, t));
  batch.addMeshes(church, 'stone');
  L.church = church;
  L.churchAt = { x: CH[0], z: CH[1], ry: CHR };
  // churchyard wall + yews + gate
  const cw = (lx, lz) => local(CH[0], CH[1], CHR, lx, lz);
  const wall = B.lowWall([cw(-12, 10.2), cw(-12, -11), cw(12, -11), cw(12, 10.2), cw(3.2, 10.2)], { seed: 4, height: 0.85 });
  root.add(wall);
  batch.add(wall, 'stone');
  const wall2 = B.lowWall([cw(-3.2, 10.2), cw(-12, 10.2)], { seed: 5, height: 0.85 });
  root.add(wall2);
  batch.add(wall2, 'stone');
  L.anchors.churchDoor = church.userData.parts.door.getWorldPosition(new THREE.Vector3());

  // ---- terrace of five (N)
  const terrace = B.terrace(5, { seed: 'puddle-row', startNumber: 1, numberStep: 2, floors: [2, 3], walls: [P.wallButter, P.wallMint, P.wallRose, P.wallSky, P.wallCream, P.wallLilac] });
  add(terrace, 0, -47.6);
  ctx.surface(terrace, 'stone');
  L.terrace = terrace;
  L.anchors.terraceChimneys = terrace.userData.parts.chimneyTops.map((o) => o.getWorldPosition(new THREE.Vector3()));
  L.anchors.terraceDoors = terrace.userData.parts.doors.map((o) => o.getWorldPosition(new THREE.Vector3()));
  batch.add(terrace, 'stone');

  // NW cottage + NE gnome house
  const cottageNW = B.house({ seed: 'nw-cottage', floors: 2, roofStyle: 'hip', wall: P.wallPeach, number: 12 });
  add(cottageNW, -22.5, -49.4, 0.12);
  L.anchors.cottageNWChimneys = cottageNW.userData.parts.chimneyTops.map((o) => o.getWorldPosition(new THREE.Vector3()));
  batch.add(cottageNW, 'stone');
  const gnomeHouse = B.house({ seed: 'gnome-house', floors: 2, roofStyle: 'gable', gag: 'gnome', wall: P.wallSky, number: 14, roof: P.roofTerracotta });
  add(gnomeHouse, 21.8, -49, -0.12);
  L.gnomeHouse = gnomeHouse;
  L.anchors.gnomeChimneys = gnomeHouse.userData.parts.chimneyTops.map((o) => o.getWorldPosition(new THREE.Vector3()));
  batch.addMeshes(gnomeHouse, 'stone');

  // ---- west row: house, bakery, post office, hardware, house
  const west = [
    { mk: () => B.house({ seed: 'w1', floors: 3, wall: P.wallLilac, roofStyle: 'mansard', number: 2 }), w: 6, s: 0 },
    { mk: () => B.shop({ kind: 'bakery', seed: 31, floors: 2, width: 7, depth: 6, text: 'CRUMB & SONS', sub: 'BAKERS' }), w: 7, s: 7.1 },
    { mk: () => B.shop({ kind: 'post', seed: 32, floors: 2, width: 7.2, depth: 6, roofStyle: 'hip' }), w: 7.2, s: 14.6 },
    { mk: () => B.shop({ kind: 'hardware', seed: 33, floors: 2, width: 6.8, depth: 6, text: 'NUTS & BOLTS' }), w: 6.8, s: 21.9 },
    { mk: () => B.house({ seed: 'w5', floors: 2, wall: P.wallMint, style: 'tudor', number: 10 }), w: 6, s: 28.7 },
  ];
  const F0 = [-32.6, -29.4];
  L.west = west.map((b, i) => {
    const fx = F0[0] + DIR_W[0] * b.s, fz = F0[1] + DIR_W[1] * b.s;
    const obj = b.mk();
    const d = obj.userData.size?.depth ?? 6;
    const [cx, cz] = behind(fx, fz, ROT_W, d);
    add(obj, cx, cz, ROT_W + (i === 4 ? -0.05 : 0));
    ctx.surface(obj, 'stone');
    const rec = { obj, front: [fx, fz], centre: [cx, cz], chimneys: (obj.userData.parts.chimneyTops || []).map((o) => o.getWorldPosition(new THREE.Vector3())) };
    batch.add(obj, 'stone');
    return rec;
  });
  L.postOffice = L.west[2];

  // ---- east side: cafe + house turned to the square, then the pub
  const east = [
    { mk: () => B.shop({ kind: 'cafe', seed: 41, floors: 2, width: 7, depth: 6, text: 'THE TEAPOT', sub: 'CAFE' }), f: [34.2, -31.5] },
    { mk: () => B.shop({ kind: 'sweets', seed: 42, floors: 3, width: 6.4, depth: 6, roofStyle: 'mansard', text: 'SUGAR MICE' }), f: [38.4, -22.6] },
  ];
  L.east = east.map((b) => {
    const obj = b.mk();
    const [cx, cz] = behind(b.f[0], b.f[1], ROT_E, 6);
    add(obj, cx, cz, ROT_E);
    ctx.surface(obj, 'stone');
    const rec = { obj, front: b.f, chimneys: (obj.userData.parts.chimneyTops || []).map((o) => o.getWorldPosition(new THREE.Vector3())) };
    batch.add(obj, 'stone');
    return rec;
  });

  const pub = B.pub({ crooked: true, seed: 'wonky', tables: 2, signSide: -1 });
  const PUB = [42.5, 0.5], PUBR = -0.62;
  add(pub, PUB[0], PUB[1], PUBR);
  ctx.surface(pub, 'wood');
  ctx.onUpdate(pub.userData.update);
  batch.addMeshes(pub, 'stone');
  L.pub = pub;
  L.pubAt = { x: PUB[0], z: PUB[1], ry: PUBR };
  L.anchors.pubChimneys = pub.userData.parts.chimneyTops.map((o) => o.getWorldPosition(new THREE.Vector3()));
  L.anchors.pubDoor = pub.userData.parts.door.getWorldPosition(new THREE.Vector3());
  L.anchors.pubTables = pub.userData.parts.tables.map((o) => o.getWorldPosition(new THREE.Vector3()));

  // ---- south-west: Mr Grubb's cottage (the tap is on its front wall)
  const grubb = B.house({ seed: 'grubb', floors: 1, roofStyle: 'gable', gableFront: false, wall: '#fff1d6', roof: P.roofTeal, style: 'plain', number: 3, porch: 'hood', climber: true, width: 6.4, depth: 5.4 });
  const GR = [-47.5, 25.5], GRR = facePerch(-47.5, 25.5) - 0.12;
  add(grubb, GR[0], GR[1], GRR);
  ctx.surface(grubb, 'stone');
  batch.add(grubb, 'stone');
  L.grubb = { obj: grubb, x: GR[0], z: GR[1], ry: GRR, w: 6.4, d: 5.4 };
  L.anchors.grubbChimneys = grubb.userData.parts.chimneyTops.map((o) => o.getWorldPosition(new THREE.Vector3()));

  // more houses around the edges so the world never thins out
  const extras = [
    { o: B.house({ seed: 'e-1', floors: 2, roofStyle: 'hip', wall: P.wallButter }), x: -60, z: -24, ry: 1.2 },
    { o: B.house({ seed: 'e-2', floors: 1, roofStyle: 'gable', wall: P.wallRose, gag: 'birdhouse' }), x: -61, z: 4, ry: 1.0 },
    { o: B.house({ seed: 'e-3', floors: 2, wall: P.wallCream, style: 'brick' }), x: 8, z: -62, ry: 0.05 },
    { o: B.house({ seed: 'e-4', floors: 2, roofStyle: 'mansard', wall: P.wallMint }), x: -10, z: -63, ry: -0.05 },
    { o: B.house({ seed: 'e-5', floors: 2, wall: P.wallPeach, roofStyle: 'gable', gableFront: true }), x: 66, z: -14, ry: -1.35 },
    { o: B.house({ seed: 'e-6', floors: 1, wall: P.wallLilac }), x: 67, z: 8, ry: -1.2 },
    { o: B.house({ seed: 'e-7', floors: 2, wall: P.wallSky, roofStyle: 'hip' }), x: 65, z: -40, ry: -1.4 },
  ];
  L.extraChimneys = [];
  for (const e of extras) {
    add(e.o, e.x, e.z, e.ry);
    ctx.surface(e.o, 'stone');
    L.extraChimneys.push(...e.o.userData.parts.chimneyTops.map((o) => o.getWorldPosition(new THREE.Vector3())));
    batch.add(e.o, 'stone');
  }

  // ---- trees: hero oak (NE green) + instanced woods around the edges
  const oak = N.tree({ type: 'round', seed: 11, scale: 1.95 });
  const OAK = [35.5, -53];
  add(oak, OAK[0], OAK[1], 0.4);
  ctx.surface(oak, 'leaves');
  oak.userData.parts.trunk.userData.surface = 'wood';
  ctx.onUpdate(oak.userData.update);
  L.oak = oak;
  L.oakAt = { x: OAK[0], z: OAK[1] };
  ctx.prop(oak, { surface: 'leaves', onHit: () => oak.userData.wobble(0.6) });

  const rng = ctx.rng;
  const treePts = [];
  const clear = (x, z) => {
    if (inPoly(x, z, SQUARE) || inPoly(x, z, ALLOT) || inPoly(x, z, FETE)) return false;
    if (Math.abs(z - ROAD_Z) < 9 && x > -80 && x < 50) return false;
    if (x > 49 && x < 62 && z < 42 && z > -100) return false; // east lane
    if (Math.hypot(x - CH[0], z - CH[1]) < 16) return false;
    if (Math.hypot(x - OAK[0], z - OAK[1]) < 9) return false;
    if (z > 44) return false;
    return true;
  };
  // back woods (north), west belt, east belt
  for (let i = 0; i < 70; i++) {
    const a = rng.range(-1.15, 1.15);
    const r = rng.range(70, 104);
    const x = Math.sin(a) * r, z = -8 - Math.cos(a) * r;
    if (clear(x, z)) treePts.push({ x, z, type: rng.pick(['round', 'round', 'tall', 'conifer', 'fruit']) });
  }
  for (let i = 0; i < 26; i++) {
    const x = rng.range(-95, -64), z = rng.range(-60, 36);
    if (clear(x, z)) treePts.push({ x, z, type: rng.pick(['round', 'tall', 'conifer']) });
  }
  for (let i = 0; i < 22; i++) {
    const x = rng.range(66, 96), z = rng.range(-70, 36);
    if (clear(x, z)) treePts.push({ x, z, type: rng.pick(['round', 'tall', 'round', 'fruit']) });
  }
  // copses hiding the road ends
  for (let i = 0; i < 12; i++) treePts.push({ x: -96 + rng.range(-9, 9), z: 32 + rng.range(-9, 7), type: rng.pick(['round', 'conifer']) });
  for (let i = 0; i < 10; i++) treePts.push({ x: 60 + rng.range(-8, 8), z: -86 + rng.range(-8, 8), type: rng.pick(['round', 'tall']) });
  for (let i = 0; i < 12; i++) treePts.push({ x: 96 + rng.range(-9, 9), z: 40 + rng.range(-8, 6), type: rng.pick(['round', 'conifer', 'tall']) });
  // gaps between buildings + yews in the churchyard + a few in the square's corners
  const accents = [
    { x: -28, z: -53, type: 'round' }, { x: -15, z: -56, type: 'tall' }, { x: 15.5, z: -56, type: 'round' }, { x: 28, z: -60, type: 'fruit' },
    { x: -56, z: -8, type: 'round' }, { x: -58, z: 14, type: 'fruit' }, { x: -52, z: -34, type: 'tall' },
    { x: cw(-9, -5)[0], z: cw(-9, -5)[1], type: 'conifer', scale: 0.8 }, { x: cw(9.5, -8)[0], z: cw(9.5, -8)[1], type: 'conifer', scale: 0.9 },
    { x: cw(-10, 6)[0], z: cw(-10, 6)[1], type: 'conifer', scale: 0.7 },
    { x: 49, z: -30, type: 'round' }, { x: 50, z: -8, type: 'tall' }, { x: 47.5, z: -55, type: 'blossom' }, { x: 26, z: -62, type: 'blossom' },
    { x: -9, z: 55, type: 'round' }, { x: 12, z: 57, type: 'round' }, { x: -30, z: 56, type: 'tall' }, { x: 30, z: 56, type: 'round' },
    { x: -44, z: 56, type: 'round' }, { x: 46, z: 58, type: 'fruit' },
  ];
  for (const a of accents) treePts.push(a);
  const woods = N.forest(treePts, { types: ['round', 'tall', 'conifer'], seed: 21, scale: [0.9, 1.25], tint: 0.14 });
  for (const m of woods.children) m.userData.surface = m.name.includes('crown') ? 'leaves' : 'wood';
  root.add(woods);
  L.treePts = treePts;
  return L;
}

export { behind, DIR_W, N_W, segDist, v3 };
