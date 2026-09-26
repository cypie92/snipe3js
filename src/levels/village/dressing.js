// Puddleby Green: set dressing — market, street furniture, allotments, the fête field, flowers,
// hedges and fences. Static pieces are batched; animated kit props get their update() registered.
import * as THREE from 'three';
import * as B from '../../world/kit/buildings/index.js';
import * as K from '../../world/kit/props/index.js';
import * as N from '../../world/kit/nature/index.js';
import { P } from '../../gfx/palette.js';
import { put, facePerch, inPoly, local, segDist, v3 } from './util.js';
import { SQUARE, ALLOT, FOUNTAIN, ROT_W } from './layout.js';
import * as C from './custom.js';

export function buildDressing(ctx, S, L) {
  const root = ctx.root;
  const rng = ctx.rng;
  const D = { lamps: {}, anchors: {} };
  /** Add a prop; static ones go to the batcher, animated ones get an updater. */
  const add = (obj, x, z, ry = 0, { y = 0, animate = false, batch = !animate, surface } = {}) => {
    put(root, obj, x, z, ry, y);
    const surf = surface || obj.userData.surface;
    if (surf) ctx.surface(obj, surf);
    if (animate && obj.userData.update) ctx.onUpdate(obj.userData.update);
    if (batch) S.batch.add(obj, surf);
    return obj;
  };

  // ------------------------------------------------------------ lamp posts
  const lampSpots = {
    NW: [-11, -22.5], NE: [11, -22.5], SW: [-11.5, -1.2], SE: [11.5, -1.2],
    sqW1: [-37.5, -21], sqW2: [-44, 8], sqE1: [31, -34], sqE2: [33.5, 6.5], sqN1: [-19, -41.8], sqN2: [19.5, -40.5],
    path1: [-2.6, 16], path2: [2.8, 16], road1: [-40, 41], road2: [-12, 41.4], road3: [12.5, 41.4], road4: [36, 41],
    east1: [50.2, 20], east2: [50.6, -12],
  };
  for (const [k, [x, z]] of Object.entries(lampSpots)) {
    const tall = ['NW', 'NE', 'SW', 'SE'].includes(k);
    const lamp = K.lampPost({ seed: x * 7 + z, height: tall ? 4.6 : 4.2, arms: tall ? 2 : 1, color: tall ? '#2f4858' : undefined, tilt: tall ? 0 : undefined });
    add(lamp, x, z, facePerch(x, z), { surface: 'metal' });
    D.lamps[k] = { x, z, top: tall ? 4.62 : 4.4 };
  }

  // ------------------------------------------------------------ market (south of the fountain)
  const stalls = [
    { goods: 'fruit', awning: [P.tomato, '#fff8ee'], x: -17.2, z: 1.2, ry: 0.22 },
    { goods: 'veg', awning: ['#4fa83c', '#fff8ee'], x: -10.4, z: 2.6, ry: 0.14 },
    { goods: 'flowers', awning: [P.bubblegum, '#fff8ee'], x: 10.4, z: 2.6, ry: -0.14 },
    { goods: 'cakes', awning: [P.teal, '#fff8ee'], x: 17.2, z: 1.2, ry: -0.22 },
  ];
  D.stalls = stalls.map((s, i) => {
    const st = K.marketStall({ goods: s.goods, awning: s.awning, seed: 60 + i });
    add(st, s.x, s.z, s.ry, { surface: 'wood' });
    return { ...s, obj: st };
  });
  // crates, sacks and baskets around the stalls
  const clutter = [
    [K.crate({ seed: 71, contents: 'apples' }), -19.6, 2.8, 0.3], [K.crate({ seed: 72, contents: 'oranges' }), -15.4, 3.3, -0.2],
    [K.sack({ seed: 73, label: P.tomato }), -12.6, 4.2, 0.4], [K.crate({ seed: 74 }), -8.2, 3.9, 0.1],
    [K.crate({ seed: 75, contents: 'apples' }), 8.3, 4.1, -0.3], [K.sack({ seed: 76, color: '#e8d2a0' }), 12.7, 4.3, 0.2],
    [K.crate({ seed: 77 }), 15.1, 3.4, 0.25], [K.crate({ seed: 78, size: 0.7 }), 15.2, 3.4, 0.6],
    [K.barrel({ seed: 79 }), 19.9, 2.4, 0], [K.crate({ seed: 80, size: 0.7, contents: 'oranges' }), -21.4, -0.6, 0.5],
  ];
  for (const [o, x, z, ry] of clutter) add(o, x, z, ry, { surface: 'wood' });
  // fête stalls along the square's south edge (the fête spills into the square)
  const southStalls = [
    { goods: 'veg', awning: [P.violet, '#fff8ee'], x: -34.2, z: 8.6, ry: 0.3 },
    { goods: 'flowers', awning: [P.sunflower, '#fff8ee'], x: -28.3, z: 9.6, ry: 0.22 },
    { goods: 'cakes', awning: [P.tangerine, '#fff8ee'], x: 19.6, z: 9.7, ry: -0.16 },
    { goods: 'fruit', awning: [P.cobalt, '#fff8ee'], x: 25.6, z: 9.2, ry: -0.22 },
  ];
  D.southStalls = southStalls.map((st, i) => {
    const o = K.marketStall({ goods: st.goods, awning: st.awning, seed: 80 + i });
    add(o, st.x, st.z, st.ry, { surface: 'wood' });
    return st;
  });
  for (const [o, x, z, ry] of [
    [K.crate({ seed: 84, contents: 'apples' }), -31.2, 10.9, 0.4], [K.sack({ seed: 85, color: '#e6d3a8' }), -25.6, 11.2, -0.3],
    [K.crate({ seed: 86 }), 22.6, 11.1, -0.2], [K.barrel({ seed: 87 }), 28.4, 10.2, 0],
  ]) add(o, x, z, ry, { surface: 'wood' });
  // a stack of crates on crates for silhouette
  add(K.crate({ seed: 81, size: 0.7 }), 15.15, 3.4, 0.1, { y: 0.9, surface: 'wood' });

  // ------------------------------------------------------------ benches, bins, planters in the square
  const benches = [
    [-7.5, -20.5, 0.72], [7.5, -20.5, -0.72], [-24, -12, 1.4], [24, -14, -1.4],
    [-31, 3.5, 0.9], [31.2, 3.2, -0.9], [-4, -38.5, 0.05], [6, -38.5, -0.05],
  ];
  for (const [x, z, ry] of benches) add(K.bench({ seed: x * 3 + z }), x, z, ry, { surface: 'wood' });
  const bins = [[-9.8, -19.6], [9.6, -19.4], [-25.2, -10], [3.6, 12.6], [-32, 6.5], [26, -38.5], [1.8, 40.5]];
  for (const [x, z] of bins) add(K.bin({ seed: x + z * 3, overflow: rng.chance(0.3) }), x, z, facePerch(x, z), { surface: 'metal' });
  const planters = [
    [-28.5, -30.5, ROT_W, 'flowers'], [-41.8, -0.2, ROT_W, 'flowers'],
    [29.5, -27.5, -0.9, 'flowers'], [-12.5, -41.5, 0, 'shrub'], [12.5, -41.5, 0, 'flowers'],
    [31.2, 1.4, -0.6, 'topiary'],
  ];
  for (const [x, z, ry, plant] of planters) add(K.planter({ seed: x * 13 + z, plant, w: 1.6 }), x, z, ry, { surface: 'wood' });
  // bollards at the square's south edge (between the road path and the market)
  for (const x of [-6, -3.4, 3.4, 6]) add(K.bollard({ seed: x * 11 }), x, 15.2, 0, { surface: 'metal' });
  // signpost by the fountain
  add(K.signpost({ seed: 5, arrows: [{ yaw: 2.3, color: P.teal, len: 1.0 }, { yaw: -0.9, color: P.tomato, len: 0.95 }, { yaw: 0.6, color: P.sunflower, len: 0.9 }] }), -6.5, -3.5, 0.1, { batch: false, surface: 'wood' });
  // notice board with the LOST CAT poster (the cat is on Mr Grubb's wall...)
  add(K.noticeBoard({ seed: 3 }), -34.2, -24.8, ROT_W, { surface: 'wood' });
  // bike rack + bikes by the post office; a bike leaning at the pub
  add(K.bikeRack({ seed: 2, n: 4 }), -38.2, -8.4, ROT_W, { surface: 'metal' });
  add(K.bicycle({ seed: 3, color: P.cobalt }), -38.6, -9.2, ROT_W + Math.PI / 2 + 0.1, { surface: 'metal' });
  add(K.bicycle({ seed: 4, color: P.sunflower }), -39.4, -7.2, ROT_W + Math.PI / 2 - 0.1, { surface: 'metal' });
  add(K.bicycle({ seed: 5, color: P.bubblegum, basket: true }), 36.2, -3.2, -2.2, { surface: 'metal' });
  // hydrant + a cone gag (cone on the lamp post... a traffic cone on the terrace chimney is too mean)
  add(K.hydrant({ seed: 1 }), 27.8, -41.2, 0.2, { surface: 'metal' });
  // café tables in front of THE TEAPOT
  const cafe = L.east[0];
  for (const [lx, lz] of [[-2, 2.3], [1.7, 2.8]]) {
    const [x, z] = local(cafe.front[0], cafe.front[1], -0.95, lx, lz);
    add(K.parasolTable({ seed: lx * 5 + 3, colors: [P.teal, '#fff8ee'], chairs: 2 }), x, z, -0.95 + 0.3, { surface: 'wood' });
  }
  // barrels outside the hardware shop; sacks outside the bakery
  const hw = L.west[3];
  for (const [lx, lz, kind] of [[-2.3, 1.2, 'barrel'], [-3.0, 1.6, 'crate'], [2.8, 1.1, 'wheelbarrow']]) {
    const [x, z] = local(hw.front[0], hw.front[1], ROT_W, lx, lz);
    const o = kind === 'barrel' ? K.barrel({ seed: 90, style: 'drum', color: P.teal }) : kind === 'crate' ? K.crate({ seed: 91 }) : K.wheelbarrow({ seed: 92, load: 'bricks' });
    add(o, x, z, ROT_W + (kind === 'wheelbarrow' ? 1.2 : 0.3), { surface: 'metal' });
  }
  const bk = L.west[1];
  for (const [lx, lz] of [[2.4, 1.3], [2.9, 1.6]]) {
    const [x, z] = local(bk.front[0], bk.front[1], ROT_W, lx, lz);
    add(K.sack({ seed: 93 + lx, color: '#f4efe4', label: P.cobalt }), x, z, ROT_W + lx, { surface: 'soft' });
  }
  // the post box + phone kiosk in front of the terrace
  add(B.postBox({}), -16.6, -43.1, 0.1, { surface: 'metal' });
  const kiosk = C.phoneKiosk({ open: 1.75 });
  const KX = [16.6, -42.6];
  put(root, kiosk, KX[0], KX[1], facePerch(KX[0], KX[1]) + 0.15);
  ctx.surface(kiosk, 'metal');
  S.batch.addMeshes(kiosk, 'metal');
  D.kiosk = kiosk;

  // ------------------------------------------------------------ south strip: path, village sign, bus stop
  add(C.villageSign(), -8.6, 38.6, 0.04, { surface: 'wood' });
  const busStop = B.busStop({ seed: 'puddleby', side: -1, color: P.teal });
  add(busStop, -24, 41.4, 0, { surface: 'glass' });
  D.busStopAt = { x: -24, z: 45 };
  D.busBench = busStop.userData.parts.bench.getWorldPosition(new THREE.Vector3());
  for (const [x, z, ry] of [[-3.1, 33.8, Math.PI / 2], [3.1, 21.6, -Math.PI / 2], [-3.1, 20.4, Math.PI / 2]]) add(K.bench({ seed: x + z }), x, z, ry, { surface: 'wood' });

  // ------------------------------------------------------------ allotments (SW)
  const G = L.grubb;
  const allot = B.picketFence([[-39.5, 18.8], [-17, 18.8], [-17, 26.5]], { seed: 21, height: 1.0 });
  const allot2 = B.picketFence([[-17, 30], [-17, 39], [-39.5, 39]], { seed: 22, height: 1.0 });
  for (const f of [allot, allot2]) { root.add(f); S.batch.add(f, 'wood'); }
  // Mr Grubb's front garden wall (the cat's wall)
  const gw = (lx, lz) => local(G.x, G.z, G.ry, lx, lz);
  const gwall = B.lowWall([gw(-5.5, 7.6), gw(-1.1, 7.6)], { seed: 23, height: 0.95, style: 'brick' });
  const gwall2 = B.lowWall([gw(1.1, 7.6), gw(6, 7.6), gw(6.8, 2.5)], { seed: 24, height: 0.95, style: 'brick' });
  for (const w of [gwall, gwall2]) { root.add(w); S.batch.add(w, 'stone'); }
  D.catWall = { a: gw(2.4, 7.6), b: gw(5.4, 7.6), ry: G.ry, y: 0.95 };
  const beds = [
    [-35.5, 22.6, 'cabbage', 4.2, 2.4], [-29.5, 22.6, 'carrot', 4.2, 2.4], [-23.2, 22.6, 'lettuce', 4.0, 2.4],
    [-35.5, 28.8, 'leek', 4.2, 2.2], [-23.2, 29.2, 'pumpkin', 4.0, 3.0], [-35.5, 34.6, 'strawberry', 4.2, 2.2],
  ];
  beds.forEach(([x, z, crop, w, d], i) => add(C.vegBed(w, d, crop, { seed: i + 1 }), x, z, 0.02 * (i % 3 - 1), { surface: 'dust' }));
  add(C.shed({ color: '#8fbf9f' }), -21.2, 35.8, facePerch(-21.2, 35.8) - 0.2, { surface: 'wood' });
  add(C.greenhouse({}), -29.6, 36.2, 0.2, { surface: 'glass' });
  add(C.scarecrow({ coat: P.cobalt }), -29.3, 29.4, 0.5, { surface: 'soft' });
  for (const [x, z] of [[-39, 27.4], [-38.8, 32.2], [-26.4, 33.6]]) add(C.beanWigwam({ seed: x * z }), x, z, 0, { surface: 'leaves' });
  add(C.sunflowers(7, { seed: 2 }), -28, 38.3, 0, { surface: 'leaves' });
  add(C.sunflowers(4, { seed: 3 }), -17.6, 22, Math.PI / 2, { surface: 'leaves' });
  add(C.compost(), -38.6, 36.8, 0.3, { surface: 'dust' });
  add(K.giantMarrow({ seed: 1 }), -25.8, 26.6, 0.6, { surface: 'soft' });
  add(K.wheelbarrow({ seed: 5, load: 'pumpkins' }), -31.5, 25.8, 1.1, { surface: 'metal' });
  add(K.gnome({ seed: 7, pose: 'fishing' }), gw(-3.4, 5.2)[0], gw(-3.4, 5.2)[1], G.ry + 0.3, { surface: 'stone' });
  add(K.gnome({ seed: 8, pose: 'toadstool' }), gw(4.3, 5.8)[0], gw(4.3, 5.8)[1], G.ry - 0.2, { surface: 'stone' });
  const line = K.washingLine({ from: [-52.6, 0, 31.2], to: [-44.8, 0, 36.6], seed: 3, items: ['shirt', 'sock', 'trousers', 'dress', 'towel', 'pants', 'sock'] });
  root.add(line);
  ctx.surface(line, 'soft');
  ctx.onUpdate(line.userData.update);

  // ------------------------------------------------------------ fête field (SE)
  add(C.feteBanner({ w: 7.2, h: 4.4 }), 13.6, 21.2, facePerch(13.6, 21.2), { surface: 'soft' });
  add(C.marquee({ w: 9, d: 6, seed: 2, sign: 'TEA & CAKES' }), 37.6, 31.5, facePerch(37.6, 31.5), { surface: 'soft' });
  const castle = C.bouncyCastle({});
  add(castle, 22.5, 32, -0.34, { surface: 'soft' });
  D.castle = { x: 22.5, z: 32, ry: -0.34, deck: castle.userData.deck };
  add(C.coconutShy({}), 29.6, 21.4, -0.45, { surface: 'wood' });
  add(C.tombola({}), 43.4, 21.6, -0.8, { surface: 'wood' });
  add(C.prizeTable({}), 45.8, 29.6, -1.05, { surface: 'wood' });
  add(C.hayBales([[0, 0, 0, 0.1], [1.25, 0, 0.05, 0.05], [0.6, 0.55, 0, 0.12]], { seed: 1 }), 16.2, 26.6, 0.4);
  add(C.hayBales([[0, 0, 0, 1.4], [0.1, 0, 1.3, 1.5]], { seed: 2 }), 31.2, 37.4, 0.2);
  add(C.hayBales([[0, 0, 0, 0]], { seed: 3 }), 47, 23.6, -0.6);
  add(K.picnicTable({ seed: 4 }), 17.2, 34.6, 0.3, { surface: 'wood' });
  add(K.picnicTable({ seed: 5 }), 43.8, 36.4, -0.5, { surface: 'wood' });
  const flag = K.flagPole({ color: P.cobalt, color2: P.sunflower, height: 7.5, seed: 2, windYaw: 0.8 });
  add(flag, 48, 35, 0, { animate: true, surface: 'metal' });
  const balloons = K.balloonBunch({ colors: [P.tomato, P.sunflower, P.teal, P.bubblegum, P.cobalt, P.lime], count: 6, seed: 4, height: 2.6 });
  add(balloons, 10.1, 20.2, 0, { animate: true, surface: 'soft' });
  const balloons2 = K.balloonBunch({ colors: [P.violet, P.sunflower, P.tomato, P.teal], count: 4, seed: 5, height: 2.3 });
  add(balloons2, 33.1, 34.8, 0, { animate: true, surface: 'soft' });
  D.balloons = [balloons, balloons2];

  // ------------------------------------------------------------ oak green (NE) + pub garden bits
  add(B.wellHouse({ seed: 'green-well' }), 46.5, -60, -0.5, { surface: 'stone' });
  const peteBench = K.bench({ seed: 99, length: 2.1 });
  const PB = [31.4, -45.6];
  add(peteBench, PB[0], PB[1], facePerch(PB[0], PB[1]), { surface: 'wood' });
  D.peteBench = { x: PB[0], z: PB[1], ry: facePerch(PB[0], PB[1]) };
  // Mrs Crumb's bench (the pigeon job) in the square's south-west, facing the perch
  const crumbBench = K.bench({ seed: 98, length: 2.0, color: '#2f7d62' });
  const CB = [-6.2, 9.8];
  add(crumbBench, CB[0], CB[1], 0.05, { surface: 'wood' });
  D.crumbBench = { x: CB[0], z: CB[1], ry: 0.05 };

  // ------------------------------------------------------------ hedges, fences and flowers
  const hedges = [
    B.hedgeRow([[-66, 39.4], [-54, 39.4]], { seed: 31, height: 1.1, flowers: 0.4 }),
    B.hedgeRow([[48.5, 17.5], [48.5, 38.5]], { seed: 32, height: 1.1, flowers: 0.3 }),
    B.hedgeRow([[-60, 53.5], [-9, 53.5]], { seed: 33, height: 1.0 }),
    B.hedgeRow([[9, 53.5], [44, 53.5]], { seed: 34, height: 1.0 }),
    B.hedgeRow([[26.4, -46.5], [26.4, -64]], { seed: 35, height: 1.0, flowers: 0.5, flowerColor: '#ffb8c2' }),
    B.hedgeRow([[-12, 17.5], [-3, 17.5]], { seed: 36, height: 0.8, flowers: 0.6 }),
    B.hedgeRow([[3, 17.5], [11, 17.5]], { seed: 37, height: 0.8, flowers: 0.6 }),
  ];
  for (const h of hedges) { root.add(h); ctx.surface(h, 'leaves'); S.batch.add(h, 'leaves'); }
  const fence = B.picketFence([[13, 39.4], [47, 39.4]], { seed: 41, height: 0.9 });
  root.add(fence);
  S.batch.add(fence, 'wood');

  // flower beds: faceted "carpets" of blooms (cheap, reads as a planted bed at any range) with a
  // sprinkle of instanced flowers standing on top
  const bedsF = [
    { x: 6.6, z: 26.6, r: 3.0 }, { x: -6.2, z: 36.2, r: 2.3 }, { x: 9.8, z: 39.2, r: 1.8 },
    { x: -8.6, z: 40.3, r: 1.9 }, { x: FOUNTAIN[0], z: FOUNTAIN[1] - 7.5, r: 1.6 },
    { x: 36, z: -48, r: 2.4 }, { x: 28, z: -55, r: 2.2 }, { x: 42, z: -44, r: 2 },
    { x: -40, z: -35.2, r: 1.6 }, { x: -45, z: 18.4, r: 2.4 }, { x: -52, z: 24, r: 2 },
    { x: 20, z: 21.6, r: 1.6 }, { x: 13, z: 36, r: 2.2 }, { x: 48, z: 12, r: 1.6 }, { x: 47, z: -4, r: 1.6 },
    { x: -15.2, z: 16.6, r: 1.3 }, { x: 15.4, z: 16.4, r: 1.3 },
  ];
  const carpets = bedsF.map((b, i) => {
    const cp = C.flowerCarpet(b.r, { seed: 30 + i });
    add(cp, b.x, b.z, rng.range(0, 6), { surface: 'leaves' });
    return { ...b, h: cp.userData.heightAt };
  });
  const bedAt = (x, z) => carpets.find((b) => Math.hypot(x - b.x, z - b.z) < b.r - 0.2);
  const inBed = (x, z) => !!bedAt(x, z);
  const fl = N.scatterFlowers({ minX: -58, maxX: 52, minZ: -62, maxZ: 44 }, 700, {
    seed: 9, filter: inBed, clump: 0.7, scale: 1.25, y: (x, z) => { const b = bedAt(x, z); return b ? b.h(x - b.x, z - b.z) - 0.05 : 0; },
  });
  root.add(fl);
  ctx.surface(fl, 'leaves');
  // meadow flowers + grass tufts on the lawns (kept off paths, plazas and beds)
  const lawn = (x, z) => !inPoly(x, z, SQUARE) && !inPoly(x, z, ALLOT) && Math.abs(x) > 2.2 && !(z > 40 && z < 54) && !(x > 47 && x < 60) && !inBed(x, z) && Math.hypot(x + 7, z - 27.5) > 4.2;
  const meadow = N.scatterFlowers({ minX: -70, maxX: 70, minZ: -75, maxZ: 52 }, 460, { seed: 12, filter: lawn, clump: 0.5 });
  root.add(meadow);
  const tufts = N.grassTufts({ area: { minX: -70, maxX: 70, minZ: -75, maxZ: 52 }, count: 420, seed: 5, filter: lawn });
  root.add(tufts);
  ctx.surface(meadow, 'grass');
  ctx.surface(tufts, 'grass');
  // bushes dotted about (merged via the batcher)
  const bushes = [[-54, -16, null], [-55, 10, '#ff7eb6'], [-26, -46, null], [27, -45, '#fff4e6'], [52, 12, null], [50.5, -24, '#ffb8c2'],
    [-57, 36, '#ffc93c'], [-14, -45.8, null], [14, -45.6, '#ff7eb6'], [-60, -40, null]];
  for (const [x, z, f] of bushes) {
    const bu = N.bush({ seed: x * z, size: rng.range(0.9, 1.3), flowers: f });
    add(bu, x, z, rng.range(0, 6), { surface: 'leaves' });
  }

  // ------------------------------------------------------------ the village green: maypole + deckchairs
  const MP = [-7, 27.5];
  const pole = C.maypole({ h: 5.6 });
  add(pole, MP[0], MP[1], 0.3, { surface: 'wood' });
  D.maypole = { x: MP[0], z: MP[1], top: pole.userData.top };
  add(C.picnicBlanket({ color: P.cobalt }), 9.4, 31.4, -0.3, { surface: 'soft' });
  D.deckchairs = [[4.9, 34.2, 0.25, [P.tomato, '#fff8ee']], [7.9, 34.9, -0.2, [P.cobalt, '#fff8ee']]].map(([x, z, ry, colors], i) => {
    const dc = C.deckchair({ colors, seed: i });
    add(dc, x, z, ry, { surface: 'soft' });
    return { x, z, ry, seat: dc.userData.seat };
  });

  // ------------------------------------------------------------ fête bunting (already up)
  const bl = (lx, ly, lz, cx, cz, ry) => { const [x, z] = local(cx, cz, ry, lx, lz); return new THREE.Vector3(x, ly, z); };
  const bRy = facePerch(13.6, 21.2), mRy = facePerch(37.6, 31.5);
  const feteLines = [
    [bl(3.6, 4.35, 0, 13.6, 21.2, bRy), bl(0, 4.9, 3.0, 37.6, 31.5, mRy), 1.5],
    [bl(0, 4.9, 3.0, 37.6, 31.5, mRy), new THREE.Vector3(48, 5.4, 35), 0.9],
    [bl(-3.6, 4.35, 0, 13.6, 21.2, bRy), new THREE.Vector3(lampSpots.path2[0], 4.25, lampSpots.path2[1]), 0.7],
  ];
  D.feteBunting = feteLines.map(([a, b, sag], i) => {
    const bn = K.bunting({ from: a, to: b, sag, seed: 40 + i, spacing: 0.62, flagSize: 0.44 });
    root.add(bn);
    ctx.surface(bn, 'soft');
    ctx.onUpdate(bn.userData.update);
    return bn;
  });
  return D;
}

export { segDist, v3 };
