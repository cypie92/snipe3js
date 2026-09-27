// Puddleby Green: set dressing — two market rows, street furniture, the fête green under the van,
// allotments, the pub garden and car-boot sale, flowers, hedges and fences, and a little something
// in the sky. Static pieces are batched; animated kit props get their update() registered.
import * as THREE from 'three';
import * as B from '../../world/kit/buildings/index.js';
import * as K from '../../world/kit/props/index.js';
import * as N from '../../world/kit/nature/index.js';
import { P } from '../../gfx/palette.js';
import { put, facePerch, inPoly, local, segDist, v3 } from './util.js';
import { SQUARE, ALLOT, GREEN, FOUNTAIN, ROT_W, ROT_E, WORLD_C } from './layout.js';
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
  const [FX, FZ] = FOUNTAIN;

  // ------------------------------------------------------------ lamp posts
  const lampSpots = {
    NW: [-9.6, -14.6], NE: [9.6, -14.6], SW: [-10.2, 4.4], SE: [10.2, 4.4],
    sqNW: [-24.6, -21.8], sqNE: [24.6, -21.8], sqW: [-28.2, -3], sqE: [28, -6.5],
    gateW: [-5.4, 15.6], gateE: [5.4, 15.6], greenW: [-25.5, 21.5], greenE: [25.8, 21.5],
    layby: [5, 38.6], roadW: [-50.5, 34], roadE: [50.5, 34], allot: [-28.4, 36],
  };
  for (const [k, [x, z]] of Object.entries(lampSpots)) {
    const tall = ['NW', 'NE', 'SW', 'SE'].includes(k);
    const lamp = K.lampPost({ seed: x * 7 + z, height: tall ? 4.6 : 4.2, arms: tall ? 2 : 1, color: tall ? '#2f4858' : undefined, tilt: tall ? 0 : undefined });
    add(lamp, x, z, facePerch(x, z), { surface: 'metal' });
    D.lamps[k] = { x, z, top: tall ? 4.62 : 4.4 };
  }

  // ------------------------------------------------------------ market: two rows of four
  const stalls = [
    // south row (by the fête gate): fruit, veg | flowers, cakes
    { goods: 'fruit', awning: [P.tomato, '#fff8ee'], x: -21.2, z: 9.2, ry: 0.34 },
    { goods: 'veg', awning: ['#4fa83c', '#fff8ee'], x: -14.2, z: 8.8, ry: 0.2 },
    { goods: 'flowers', awning: [P.bubblegum, '#fff8ee'], x: 14.2, z: 8.8, ry: -0.2 },
    { goods: 'cakes', awning: [P.teal, '#fff8ee'], x: 21.2, z: 9.2, ry: -0.34 },
    // north row (by the terrace)
    { goods: 'veg', awning: [P.violet, '#fff8ee'], x: -19.4, z: -15.6, ry: 0.22 },
    { goods: 'flowers', awning: [P.sunflower, '#fff8ee'], x: -12.4, z: -15.6, ry: 0.12 },
    { goods: 'cakes', awning: [P.tangerine, '#fff8ee'], x: 12.4, z: -15.6, ry: -0.12 },
    { goods: 'fruit', awning: [P.cobalt, '#fff8ee'], x: 19.4, z: -15.6, ry: -0.22 },
  ];
  D.stalls = stalls.map((s, i) => {
    const st = K.marketStall({ goods: s.goods, awning: s.awning, seed: 60 + i });
    add(st, s.x, s.z, s.ry, { surface: 'wood' });
    return { ...s, obj: st };
  });
  // crates, sacks and baskets round the stalls
  const clutter = [
    [K.crate({ seed: 71, contents: 'apples' }), -18.6, 10.8, 0.3], [K.crate({ seed: 72, contents: 'oranges' }), -16.9, 10.5, -0.2],
    [K.sack({ seed: 73, label: P.tomato }), -11.8, 10.2, 0.4], [K.crate({ seed: 74 }), -11.6, 9.3, 0.1],
    [K.crate({ seed: 75, contents: 'apples' }), 11.6, 10.4, -0.3], [K.sack({ seed: 76, color: '#e8d2a0' }), 16.8, 10.6, 0.2],
    [K.crate({ seed: 77 }), 18.6, 10.9, 0.25], [K.barrel({ seed: 79 }), 24.2, 9.6, 0],
    [K.crate({ seed: 80, size: 0.7, contents: 'oranges' }), -24.4, 8.2, 0.5],
    [K.crate({ seed: 82, contents: 'apples' }), -22, -13.6, 0.2], [K.sack({ seed: 83, color: '#e6d3a8' }), -15.8, -13.7, -0.3],
    [K.crate({ seed: 84 }), 15.6, -13.8, 0.3], [K.barrel({ seed: 85, style: 'drum', color: P.teal }), 22.4, -14.6, 0],
    [K.crate({ seed: 86, size: 0.7, contents: 'oranges' }), 21.6, -13.4, -0.4],
  ];
  for (const [o, x, z, ry] of clutter) add(o, x, z, ry, { surface: 'wood' });
  add(K.crate({ seed: 81, size: 0.7 }), 18.6, 10.9, 0.1, { y: 0.9, surface: 'wood' });

  // ------------------------------------------------------------ benches, bins, planters in the square
  const benches = [
    [-6.2, -14.8, 0.35], [6.2, -14.8, -0.35], [22.6, 1.8, -1.3], [-23.4, -8.2, 1.3], [-4.2, -25.4, 0], [4.8, -25.4, 0],
  ];
  for (const [x, z, ry] of benches) add(K.bench({ seed: x * 3 + z }), x, z, ry, { surface: 'wood' });
  const bins = [[-8.6, -15.8], [8.4, -15.9], [-24.8, -10.4], [3.4, 14.8], [-26.6, 12.4], [24.4, -18.6], [-4.8, 37.6]];
  for (const [x, z] of bins) add(K.bin({ seed: x + z * 3, overflow: rng.chance(0.3) }), x, z, facePerch(x, z), { surface: 'metal' });
  const planters = [
    [-26.3, -18.6, ROT_W, 'flowers'], [-29.4, 1.2, ROT_W, 'flowers'], [26.2, -13.4, ROT_E, 'flowers'],
    [-15.6, -24.8, 0, 'shrub'], [11.2, -24.9, 0, 'flowers'], [-8.4, 16.4, 0, 'topiary'], [8.4, 16.4, 0, 'topiary'],
  ];
  for (const [x, z, ry, plant] of planters) add(K.planter({ seed: x * 13 + z, plant, w: 1.6 }), x, z, ry, { surface: 'wood' });
  for (const x of [-3.2, 3.2]) add(K.bollard({ seed: x * 11 }), x, 16.6, 0, { surface: 'metal' });
  // the war memorial (west half) and the bandstand (east half) fill the square's open flanks
  add(C.memorial(), -17.6, -3.6, 0.6, { surface: 'stone' });
  const band = B.bandstand({ radius: 3.2, color: P.teal });
  add(band, 17.6, -4.2, facePerch(17.6, -4.2), { surface: 'wood' });
  D.bandstand = { x: 17.6, z: -4.2, ry: facePerch(17.6, -4.2), deck: 0.95 };
  // signpost by the fountain
  add(K.signpost({ seed: 5, arrows: [{ yaw: 2.3, color: P.teal, len: 1.0 }, { yaw: -0.9, color: P.tomato, len: 0.95 }, { yaw: 0.6, color: P.sunflower, len: 0.9 }] }), -4.4, 2.1, 0.1, { batch: false, surface: 'wood' });
  // notice board with the LOST CAT poster (the cat is on Mr Grubb's wall...)
  const nb = L.west[3];
  const [nbx, nbz] = local(nb.front[0], nb.front[1], ROT_W, 3.9, 1.1);
  add(K.noticeBoard({ seed: 3 }), nbx, nbz, ROT_W, { surface: 'wood' });
  // bike rack + bikes by the post office; a bike leaning by the café
  const po = L.west[2];
  const [brx, brz] = local(po.front[0], po.front[1], ROT_W, -3.6, 1.2);
  add(K.bikeRack({ seed: 2, n: 4 }), brx, brz, ROT_W, { surface: 'metal' });
  add(K.bicycle({ seed: 3, color: P.cobalt }), brx + 0.4, brz - 0.5, ROT_W + Math.PI / 2 + 0.1, { surface: 'metal' });
  add(K.bicycle({ seed: 4, color: P.sunflower }), brx + 0.3, brz + 0.6, ROT_W + Math.PI / 2 - 0.1, { surface: 'metal' });
  add(K.bicycle({ seed: 5, color: P.bubblegum, basket: true }), 27.4, -9.6, -2.2, { surface: 'metal' });
  add(K.hydrant({ seed: 1 }), 18.2, -24.9, 0.2, { surface: 'metal' });
  // café tables in front of THE TEAPOT
  const cafe = L.east[0];
  for (const [lx, lz] of [[-2.1, 2.4], [1.9, 2.9]]) {
    const [x, z] = local(cafe.front[0], cafe.front[1], ROT_E, lx, lz);
    add(K.parasolTable({ seed: lx * 5 + 3, colors: [P.teal, '#fff8ee'], chairs: 2 }), x, z, ROT_E + 0.3, { surface: 'wood' });
  }
  // barrels outside the hardware shop; sacks outside the bakery
  const hw = L.west[3];
  for (const [lx, lz, kind] of [[-2.4, 1.3, 'barrel'], [-3.1, 1.7, 'crate'], [2.6, 1.4, 'wheelbarrow']]) {
    const [x, z] = local(hw.front[0], hw.front[1], ROT_W, lx, lz);
    const o = kind === 'barrel' ? K.barrel({ seed: 90, style: 'drum', color: P.teal }) : kind === 'crate' ? K.crate({ seed: 91 }) : K.wheelbarrow({ seed: 92, load: 'bricks' });
    add(o, x, z, ROT_W + (kind === 'wheelbarrow' ? 1.2 : 0.3), { surface: 'metal' });
  }
  const bk = L.west[1];
  for (const [lx, lz] of [[2.4, 1.3], [2.9, 1.6]]) {
    const [x, z] = local(bk.front[0], bk.front[1], ROT_W, lx, lz);
    add(K.sack({ seed: 93 + lx, color: '#f4efe4', label: P.cobalt }), x, z, ROT_W + lx, { surface: 'soft' });
  }
  // the post box + phone kiosk on the pavement in front of the terrace
  add(B.postBox({}), -11.2, -26.4, 0.1, { surface: 'metal' });
  const kiosk = C.phoneKiosk({ open: 1.75 });
  const KX = [14.3, -26.4];
  put(root, kiosk, KX[0], KX[1], facePerch(KX[0], KX[1]) + 0.15);
  ctx.surface(kiosk, 'metal');
  S.batch.addMeshes(kiosk, 'metal');
  D.kiosk = kiosk;

  // ------------------------------------------------------------ the fête green (right under the van)
  const banner = C.feteBanner({ w: 7.2, h: 4.4 });
  const BN = [0, 18.3];
  add(banner, BN[0], BN[1], 0, { surface: 'soft' });
  D.banner = { x: BN[0], z: BN[1], w: 7.2 };
  // fête stalls along the top of the green
  const feteStalls = [
    { goods: 'cakes', awning: [P.violet, '#fff8ee'], x: -21.8, z: 21.6, ry: 0.28 },
    { goods: 'flowers', awning: [P.sunflower, '#fff8ee'], x: -15, z: 21.2, ry: 0.18 },
    { goods: 'veg', awning: [P.tangerine, '#fff8ee'], x: 15, z: 21.2, ry: -0.18 },
    { goods: 'fruit', awning: [P.lime, '#fff8ee'], x: 21.8, z: 21.6, ry: -0.28 },
  ];
  D.feteStalls = feteStalls.map((st, i) => {
    const o = K.marketStall({ goods: st.goods, awning: st.awning, seed: 90 + i });
    add(o, st.x, st.z, st.ry, { surface: 'wood' });
    return st;
  });
  const castle = C.bouncyCastle({});
  const CA = [-19.4, 31.2], CAR = facePerch(-19.4, 31.2) * 0.6;
  add(castle, CA[0], CA[1], CAR, { surface: 'soft' });
  D.castle = { x: CA[0], z: CA[1], ry: CAR, deck: castle.userData.deck };
  // (the coconut shy is built by games.js: its coconuts are a combo job)
  add(C.tombola({}), -19.6, 25.4, facePerch(-19.6, 25.4), { surface: 'wood' });
  add(C.prizeTable({}), -4.8, 22.3, facePerch(-4.8, 22.3), { surface: 'wood' });
  D.prizeTable = { x: -4.8, z: 22.3 };
  add(C.hayBales([[0, 0, 0, 0.1], [1.25, 0, 0.05, 0.05], [0.6, 0.55, 0, 0.12]], { seed: 1 }), -25.2, 26.4, 0.4);
  add(C.hayBales([[0, 0, 0, 1.4], [0.1, 0, 1.3, 1.5]], { seed: 2 }), 24.6, 33.6, 0.2);
  add(C.hayBales([[0, 0, 0, 0]], { seed: 3 }), -8.2, 34.8, -0.6);
  add(K.picnicTable({ seed: 4 }), -24.4, 33.6, 0.3, { surface: 'wood' });
  add(K.picnicTable({ seed: 5 }), 11.2, 33.8, -0.5, { surface: 'wood' });
  const flag = K.flagPole({ color: P.cobalt, color2: P.sunflower, height: 7.5, seed: 2, windYaw: 0.8 });
  add(flag, -27.4, 37.2, 0, { animate: true, surface: 'metal' });
  const balloons = K.balloonBunch({ colors: [P.tomato, P.sunflower, P.teal, P.bubblegum, P.cobalt, P.lime], count: 6, seed: 4, height: 2.6 });
  add(balloons, -4.4, 18.8, 0, { animate: true, surface: 'soft' });
  const balloons2 = K.balloonBunch({ colors: [P.violet, P.sunflower, P.tomato, P.teal], count: 4, seed: 5, height: 2.3 });
  add(balloons2, 4.4, 18.8, 0, { animate: true, surface: 'soft' });
  D.balloons = [balloons, balloons2];
  // maypole with its worn ring of grass
  const MP = [8.5, 25.5];
  const pole = C.maypole({ h: 5.6 });
  add(pole, MP[0], MP[1], 0.3, { surface: 'wood' });
  D.maypole = { x: MP[0], z: MP[1], top: pole.userData.top };
  // deckchairs + picnic blanket in the green's quiet corner
  add(C.picnicBlanket({ color: P.cobalt }), 19.6, 36.4, -0.3, { surface: 'soft' });
  D.deckchairs = [[16.4, 37.2, 0.4, [P.tomato, '#fff8ee']], [-15.4, 37.4, -0.3, [P.cobalt, '#fff8ee']]].map(([x, z, ry, colors], i) => {
    const dc = C.deckchair({ colors, seed: i });
    add(dc, x, z, ry, { surface: 'soft' });
    return { x, z, ry, seat: dc.userData.seat };
  });
  // test-your-strength + hook-a-duck in the strip you see just over the crow's-nest rail
  const striker = C.highStriker();
  const HS = [-3.4, 24.6];
  add(striker, HS[0], HS[1], facePerch(HS[0], HS[1]), { batch: false, surface: 'wood' });
  const { puck, pad, bell } = striker.userData.parts;
  let ringing = false;
  ctx.prop(pad, { surface: 'soft', onHit: () => { // anyone can have a go: a shot on the pad sends the puck up
    if (ringing) return;
    ringing = true;
    const top = striker.userData.top - 0.3;
    ctx.sfx('hitWood', { position: pad.getWorldPosition(new THREE.Vector3()) });
    ctx.tweens.run(0.6, (k) => { const up = k < 0.5 ? 1 - (1 - k * 2) ** 3 : 1 - ((k - 0.5) * 2) ** 2; puck.position.y = 0.45 + (top - 0.45) * up; }, { onComplete: () => { ringing = false; } });
    ctx.delay(0.3, () => {
      const bp = bell.getWorldPosition(new THREE.Vector3());
      ctx.sfx('bell', { position: bp, pitch: 2.1, volume: 0.8 });
      ctx.popText(bp.clone().add(v3(0, 0.8, 0)), rng.pick(['MIGHTY!', 'DING!', 'STRONGMAN!']), { cls: 'pop-big', duration: 1.2 });
    });
  } });
  D.striker = { x: HS[0], z: HS[1], obj: striker };
  const pool = C.duckPool({ r: 1.1 });
  add(pool, 4.3, 22.8, 0, { animate: true, batch: false, surface: 'water' });
  D.duckPool = { x: 4.3, z: 22.8 };
  // Mrs Crumb's bench (the pigeon job), just south-west of the fountain
  const crumbBench = K.bench({ seed: 98, length: 2.0, color: '#2f7d62' });
  const CB = [-8.4, 4.6], CBR = 0.16;
  add(crumbBench, CB[0], CB[1], CBR, { surface: 'wood' });
  D.crumbBench = { x: CB[0], z: CB[1], ry: CBR };
  // village sign by the lay-by
  add(C.villageSign(), -6.4, 39.6, 0.04, { surface: 'wood' });
  // the near lawn right under the van (the bottom of the default view): a Punch & Judy show, a
  // tug-of-war rope waiting for 3 o'clock, the lost-property table (and a dog nobody has claimed),
  // a family picnic (dad asleep: life.js) and odd bits of fête litter
  const pj = C.punchAndJudy();
  add(pj, -6.2, 29.6, facePerch(-6.2, 29.6), { animate: true, batch: false, surface: 'soft' });
  S.batch.addMeshes(pj, 'soft'); // the booth merges; the puppets' LiveMesh stays live
  add(C.tugRope({ len: 6.4, seed: 2 }), -6.4, 33.4, 0.08, { surface: 'soft' });
  add(C.aBoard('TUG OF WAR', { sub: '3pm · all welcome' }), -10.2, 32.6, facePerch(-10.2, 32.6), { surface: 'wood' });
  add(C.lostProperty(), 5.9, 30.6, facePerch(5.9, 30.6), { surface: 'wood' });
  D.lostProperty = { x: 5.9, z: 30.6 };
  for (const [x, z, seed] of [[-2.9, 28.4, 1], [3.1, 27.3, 2], [12.8, 27.6, 3], [-13.4, 32.2, 4], [-7.4, 36.2, 5], [8.8, 35.6, 6]]) add(C.feteLitter({ seed, r: 1.3 }), x, z, seed, { surface: 'soft' });
  D.picnic = { x: 10.9, z: 31.5, ry: -0.35 };
  add(C.picnicBlanket({ color: P.tomato }), D.picnic.x, D.picnic.z, D.picnic.ry, { surface: 'soft' });
  // ...and the square's bare corners: a hopscotch in the south-east, a florist's barrow and a pram
  // in the south-west, an A-board pointing at the cakes (the juggler + queue are in life.js)
  add(C.hopscotch({ seed: 1 }), 24.6, 13.6, 0.12, { surface: 'stone' });
  add(C.flowerBarrow({ seed: 2 }), -25.6, 3.0, 1.45, { surface: 'wood' });
  add(C.aBoard('CAKES', { sub: 'lovely & fresh 20p', bg: '#7a4a26' }), 25.2, 5.6, facePerch(25.2, 5.6), { surface: 'wood' });
  D.pram = { x: -15.4, z: 3.4, ry: facePerch(-15.4, 3.4) + 0.45 };
  add(C.pram({ color: P.teal }), D.pram.x, D.pram.z, D.pram.ry, { surface: 'soft' });

  // ------------------------------------------------------------ east flank: pub garden, tea tent, car-boot sale
  for (const [x, z, ry, c] of [[34.6, 13.6, -0.4, P.tomato], [39.4, 15.4, -0.2, P.cobalt], [36.6, 18.9, 0.3, P.sunflower]]) {
    add(K.parasolTable({ seed: x * 3, colors: [c, '#fff8ee'], chairs: 2 }), x, z, ry, { surface: 'wood' });
  }
  D.pubGarden = [[34.6, 13.6], [39.4, 15.4], [36.6, 18.9]];
  add(C.marquee({ w: 9, d: 6, seed: 2, sign: 'TEA & CAKES' }), 38.4, 30.2, facePerch(38.4, 30.2), { surface: 'soft' });
  D.marquee = { x: 38.4, z: 30.2 };
  // car-boot sale: two cars with their boots open and trestles of treasures
  const boots = [
    [K.car({ style: 'hatch', color: P.bubblegum, seed: 21 }), 47.2, 21.6, 0.2],
    [K.car({ style: 'van', color: '#fff1d6', seed: 22 }), 49.6, 30.2, -0.3],
  ];
  D.parkedCars = boots.map(([o, x, z, ry]) => {
    add(o, x, z, ry, { animate: true, batch: false, surface: 'metal' });
    return o;
  });
  for (const [x, z, ry, seed] of [[46.2, 25.6, 0.2, 1], [46.2, 32.6, -0.3, 2], [41.6, 23.4, 1.3, 3]]) add(C.bootTable({ seed }), x, z, ry, { surface: 'wood' });

  // ------------------------------------------------------------ west flank: allotments + Mr Grubb's garden
  const G = L.grubb;
  const allot = B.picketFence([[-47.5, 22.8], [-29.6, 22.8], [-29.6, 29.5]], { seed: 21, height: 1.0 });
  const allot2 = B.picketFence([[-29.6, 33], [-29.6, 41.8], [-47.5, 41.8]], { seed: 22, height: 1.0 });
  for (const f of [allot, allot2]) { root.add(f); S.batch.add(f, 'wood'); }
  // Mr Grubb's front garden wall (the cat's wall)
  const gw = (lx, lz) => local(G.x, G.z, G.ry, lx, lz);
  const gwall = B.lowWall([gw(-5.5, 7.4), gw(-1.1, 7.4)], { seed: 23, height: 0.95, style: 'brick' });
  const gwall2 = B.lowWall([gw(1.1, 7.4), gw(6, 7.4), gw(6.8, 2.5)], { seed: 24, height: 0.95, style: 'brick' });
  for (const w of [gwall, gwall2]) { root.add(w); S.batch.add(w, 'stone'); }
  D.catWall = { a: gw(2.4, 7.4), b: gw(5.4, 7.4), ry: G.ry, y: 0.95 };
  const beds = [
    [-43.5, 26.4, 'cabbage', 4.0, 2.3], [-37.8, 26.4, 'carrot', 4.0, 2.3], [-43.5, 31.4, 'leek', 4.0, 2.2],
    [-33.2, 31.8, 'pumpkin', 3.8, 2.8], [-43.5, 36.2, 'strawberry', 4.0, 2.2], [-37.6, 36.8, 'lettuce', 3.6, 2.2],
  ];
  beds.forEach(([x, z, crop, w, d], i) => add(C.vegBed(w, d, crop, { seed: i + 1 }), x, z, 0.02 * (i % 3 - 1), { surface: 'dust' }));
  add(C.shed({ color: '#8fbf9f' }), -32.4, 39.2, facePerch(-32.4, 39.2) - 0.2, { surface: 'wood' });
  add(C.greenhouse({}), -46.2, 39.4, 0.2, { surface: 'glass' });
  add(C.scarecrow({ coat: P.cobalt }), -38.2, 31.4, 0.8, { surface: 'soft' });
  for (const [x, z] of [[-46.6, 31.6], [-33.6, 26.2], [-40.6, 40.4]]) add(C.beanWigwam({ seed: x * z }), x, z, 0, { surface: 'leaves' });
  add(C.sunflowers(7, { seed: 2 }), -38.5, 41.2, 0, { surface: 'leaves' });
  add(C.sunflowers(4, { seed: 3 }), -30.2, 25.6, Math.PI / 2, { surface: 'leaves' });
  add(C.compost(), -47, 35, 0.3, { surface: 'dust' });
  add(K.giantMarrow({ seed: 1 }), -34.8, 35.8, 0.6, { surface: 'soft' });
  add(K.wheelbarrow({ seed: 5, load: 'pumpkins' }), -40.6, 29, 1.1, { surface: 'metal' });
  add(K.gnome({ seed: 7, pose: 'fishing' }), gw(-3.4, 5.2)[0], gw(-3.4, 5.2)[1], G.ry + 0.3, { surface: 'stone' });
  add(K.gnome({ seed: 8, pose: 'toadstool' }), gw(4.3, 5.8)[0], gw(4.3, 5.8)[1], G.ry - 0.2, { surface: 'stone' });
  const line = K.washingLine({ from: [-52.2, 0, 8.2], to: [-50.4, 0, 1.2], seed: 3, items: ['shirt', 'sock', 'trousers', 'dress', 'towel', 'pants', 'sock'] });
  root.add(line);
  ctx.surface(line, 'soft');
  ctx.onUpdate(line.userData.update);
  // bus stop on the west road
  const busStop = B.busStop({ seed: 'puddleby', side: -1, color: P.teal });
  add(busStop, -49.2, 28.6, Math.PI / 2 + 0.12, { surface: 'glass' });
  D.busStopAt = { x: -53, z: 28.6 };
  D.busBench = busStop.userData.parts.bench.getWorldPosition(new THREE.Vector3());
  D.busStopRy = Math.PI / 2 + 0.12;
  // a sheep paddock beyond the road
  const paddock = B.picketFence([[-58.5, 4], [-58.5, 30], [-70, 30]], { seed: 44, height: 1.05, color: '#e8dcc4' });
  root.add(paddock);
  S.batch.add(paddock, 'wood');
  D.paddock = { x0: -69, x1: -60, z0: 6, z1: 28 };
  // the pub pond, between the beer garden and the ring road: the cricket sixes land in it (games.js).
  // Inside the perch's yaw limits so the whole six arc can be tracked and shot.
  const pond = C.pond({ r: 3.4, seed: 3 });
  add(pond, 46.0, 12.4, 0.2, { surface: 'water' });
  D.pond = { x: 46.0, z: 12.4, r: 3.4, ry: 0.2, waterY: pond.userData.waterY };
  // fête car park on the west lawn
  const carPark = [
    [K.car({ style: 'beetle', color: P.cobalt, seed: 31 }), -38.6, 46.8, 1.35],
    [K.car({ style: 'hatch', color: P.sunflower, seed: 32 }), -33.4, 47.4, 1.5],
    [K.car({ style: 'pickup', color: '#fff1d6', seed: 33 }), -43.4, 45.6, 1.2],
  ];
  for (const [o, x, z, ry] of carPark) D.parkedCars.push(add(o, x, z, ry, { animate: true, batch: false, surface: 'metal' }));
  add(C.hayBales([[0, 0, 0, 0], [1.3, 0, 0, 0.1]], { seed: 6 }), -27.6, 45.2, 0.1);
  add(C.hayBales([[0, 0, 0, 0.2]], { seed: 7 }), -21.6, 41.6, 0.9);
  for (const [x, z, s, f] of [[-24.4, 48.6, 1.2, '#ffc93c'], [-17.8, 44.8, 1.0, null], [-31.8, 43.4, 1.1, '#ff7eb6'], [21.2, 45.4, 1.1, null], [27.4, 47.8, 1.2, '#fff4e6']]) {
    add(N.bush({ seed: x * z, size: s, flowers: f }), x, z, rng.range(0, 6), { surface: 'leaves' });
  }
  for (const [x, z, sd, type] of [[-22.8, 51.2, 12, 'round'], [-14.8, 48.8, 13, 'fruit'], [16.2, 49.6, 14, 'blossom'], [24.6, 51.8, 15, 'round']]) {
    const t = N.tree({ type, seed: sd, scale: 0.95 });
    add(t, x, z, rng.range(0, 6), { animate: true, batch: false, surface: 'leaves' });
  }

  // ------------------------------------------------------------ Pete's bench under the oak
  const peteBench = K.bench({ seed: 99, length: 2.1 });
  const PB = [20.4, -29.4];
  add(peteBench, PB[0], PB[1], facePerch(PB[0], PB[1]), { surface: 'wood' });
  D.peteBench = { x: PB[0], z: PB[1], ry: facePerch(PB[0], PB[1]) };
  add(B.wellHouse({ seed: 'green-well' }), 31.5, -42.5, -0.5, { surface: 'stone' });

  // ------------------------------------------------------------ hedges, fences and flowers
  const hedges = [
    // the square's south edge (either side of the fête gate)
    B.hedgeRow([[-26.4, 17.6], [-8.6, 17.6]], { seed: 36, height: 0.8, flowers: 0.6 }),
    B.hedgeRow([[8.6, 17.6], [26.4, 17.6]], { seed: 37, height: 0.8, flowers: 0.6 }),
    // behind the van along the road
    B.hedgeRow([[-46, 50.6], [-7, 51.8]], { seed: 33, height: 1.0 }),
    B.hedgeRow([[7, 51.8], [46, 50.6]], { seed: 34, height: 1.0 }),
    // round the oak green
    B.hedgeRow([[19.4, -40.4], [19.4, -48]], { seed: 35, height: 1.0, flowers: 0.5, flowerColor: '#ffb8c2' }),
    // pub garden edge
    B.hedgeRow([[31.6, 22.4], [43.8, 21.2]], { seed: 38, height: 0.9, flowers: 0.3 }),
    B.hedgeRow([[-56.6, 38], [-56.6, 12]], { seed: 39, height: 1.1, flowers: 0.3 }),
  ];
  for (const h of hedges) { root.add(h); ctx.surface(h, 'leaves'); S.batch.add(h, 'leaves'); }
  const fence = B.picketFence([[-28.8, 38.8], [-7.2, 39.6]], { seed: 41, height: 0.9 });
  const fence2 = B.picketFence([[7.2, 39.6], [28.8, 38.8]], { seed: 42, height: 0.9 });
  for (const f of [fence, fence2]) { root.add(f); S.batch.add(f, 'wood'); }

  // raised flower beds (stone-edged domes of blooms) + flower borders
  const bedsF = [
    { x: -7.6, z: 20.4, r: 1.5 }, { x: 7.6, z: 20.4, r: 1.5 }, { x: -3.8, z: 36.8, r: 1.7 }, { x: 3.9, z: 34.2, r: 1.4 },
    { x: -27.2, z: 20.4, r: 1.5 }, { x: 27.4, z: 19.6, r: 1.4 }, { x: FX, z: FZ + 12.9, r: 1.2 },
    { x: -21.6, z: -27.2, r: 1.4 }, { x: 22.4, z: -26.8, r: 1.6 }, { x: -44, z: 44.2, r: 1.8 }, { x: 44.4, z: 44.6, r: 1.8 },
    { x: -31.6, z: 14.8, r: 1.2 }, { x: 31.2, z: 14.6, r: 1.1 },
  ];
  const carpets = bedsF.map((b, i) => {
    const cp = C.flowerCarpet(b.r, { seed: 30 + i, raised: 0.3 });
    add(cp, b.x, b.z, rng.range(0, 6), { surface: 'leaves' });
    return { ...b, h: cp.userData.heightAt };
  });
  const borders = [
    { a: [-13.2, -27.6], b: [-2.8, -27.6] }, { a: [2.8, -27.6], b: [9.4, -27.6] },
    { a: [-29.2, 20.2], b: [-29.2, 34.8] }, { a: [-24.6, -28.5], b: [-21.8, -34.2] },
  ];
  for (const [i, bd] of borders.entries()) {
    const len = Math.hypot(bd.b[0] - bd.a[0], bd.b[1] - bd.a[1]);
    const o = C.flowerBorder(len, 0.9, { seed: 50 + i });
    add(o, (bd.a[0] + bd.b[0]) / 2, (bd.a[1] + bd.b[1]) / 2, Math.atan2(bd.b[0] - bd.a[0], bd.b[1] - bd.a[1]) + Math.PI / 2, { surface: 'leaves' });
  }
  const bedAt = (x, z) => carpets.find((b) => Math.hypot(x - b.x, z - b.z) < b.r - 0.2);
  const inBed = (x, z) => !!bedAt(x, z);
  const fl = N.scatterFlowers({ minX: -50, maxX: 50, minZ: -32, maxZ: 46 }, 420, {
    seed: 9, filter: inBed, clump: 0.7, scale: 1.35, y: (x, z) => { const b = bedAt(x, z); return b ? b.h(x - b.x, z - b.z) - 0.05 : 0; },
  });
  root.add(fl);
  ctx.surface(fl, 'leaves');
  // meadow flowers + grass tufts on the rough lawns (kept off the mown green, paths, plaza, beds)
  const rough = (x, z) => {
    if (inPoly(x, z, SQUARE) || inPoly(x, z, ALLOT) || inPoly(x, z, GREEN) || inBed(x, z)) return false;
    if (L.inFoot(x, z, 0.6) || L.onRoad(x, z, 4.4)) return false;
    if (Math.hypot(x - WORLD_C[0], z - WORLD_C[1]) > 80) return false;
    return !(Math.abs(x) < 6 && z > 36);
  };
  const meadow = N.scatterFlowers({ minX: -78, maxX: 78, minZ: -70, maxZ: 60 }, 520, { seed: 12, filter: rough, clump: 0.55 });
  root.add(meadow);
  const tufts = N.grassTufts({ area: { minX: -78, maxX: 78, minZ: -70, maxZ: 60 }, count: 460, seed: 5, filter: rough });
  root.add(tufts);
  // the green itself gets only a sprinkle of daisies (it's mown for the fête)
  const daisies = N.scatterFlowers({ minX: -28, maxX: 28, minZ: 19, maxZ: 38 }, 110, { seed: 14, filter: (x, z) => inPoly(x, z, GREEN) && Math.abs(x) > 2 && !inBed(x, z), clump: 0.4, scale: 0.8 });
  root.add(daisies);
  for (const o of [meadow, tufts, daisies]) ctx.surface(o, 'grass');
  // bushes dotted about (merged via the batcher)
  const bushes = [[-36.6, -16, null], [-35.8, 11.4, '#ff7eb6'], [-22.6, -35.6, null], [33.2, -26.6, '#fff4e6'], [44.4, -8.6, '#ffb8c2'],
    [-52.4, 40.2, '#ffc93c'], [-14.6, -37.6, null], [13.8, -37.8, '#ff7eb6'], [-55.6, -26, null], [52.4, -31.6, null], [-49.8, -8.6, '#ffb8c2']];
  for (const [x, z, f] of bushes) {
    const bu = N.bush({ seed: x * z, size: rng.range(0.9, 1.3), flowers: f });
    add(bu, x, z, rng.range(0, 6), { surface: 'leaves' });
  }

  // ------------------------------------------------------------ fête bunting (already up over the green)
  const bl = (x, y, z) => new THREE.Vector3(x, y, z);
  const feteLines = [
    [bl(-3.4, 4.3, 18.3), bl(-25.5, 4.2, 21.5), 1.1],
    [bl(3.4, 4.3, 18.3), bl(25.8, 4.2, 21.5), 1.1],
    [bl(-25.5, 4.2, 21.5), bl(-27.4, 6.4, 37.2), 1.0],
    [bl(3.4, 4.3, 18.3), bl(8.5, 5.4, 25.5), 0.5],
  ];
  D.feteBunting = feteLines.map(([a, b, sag], i) => {
    const bn = K.bunting({ from: a, to: b, sag, seed: 40 + i, spacing: 0.62, flagSize: 0.44 });
    root.add(bn);
    ctx.surface(bn, 'soft');
    ctx.onUpdate(bn.userData.update);
    return bn;
  });

  // ------------------------------------------------------------ up in the sky: a hot-air balloon drifting by
  const hab = C.hotAirBalloon({ seed: 2 });
  root.add(hab);
  ctx.surface(hab, 'soft');
  const habPath = { r: 150, h: 46, sp: 0.012 };
  ctx.onUpdate((dt, t) => {
    const a = -0.9 + Math.sin(t * habPath.sp) * 0.75;
    hab.position.set(WORLD_C[0] + Math.sin(a) * habPath.r, habPath.h + Math.sin(t * 0.21) * 1.6, WORLD_C[1] - Math.cos(a) * habPath.r);
    hab.rotation.y = t * 0.05;
  });
  D.balloon = hab;
  return D;
}

export { segDist, v3 };
