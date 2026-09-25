// Barnacle Bay fish market: an open-fronted hall with cast-iron columns, arched bays, striped
// canopies over stalls of fish on crushed ice, a louvred ridge lantern, a central front gable and a
// giant cartoon fish sign on the roof.
//   parts.fishSign  Group (pivot at the top of its pole; spins about Y); userData.spinFish(turns)
//   parts.stalls[]  anchors behind each counter (fishmonger spots, facing +Z)
//   parts.crates[]  anchors of the fish boxes out front; parts.sign (fascia anchor)
import { THREE, materials, Kit, cbox, prism, extrude, archPath, rngOf, shade, mix, wobbleColor, DEG, TAU, addCollider, Tweens, ease } from './common.js';
import { box, cyl, ico, sphere, cone, torus } from '../../geo.js';
import { hash3 } from '../../../core/rng.js';
import { P } from '../../../gfx/palette.js';
import { gableRoof } from './roofs.js';
import { addWindow } from './facade.js';
import { signMaterial } from './signs.js';
import { addAwning } from './shop.js';

const FISH_COLS = ['#8fb8d8', '#b9c8d6', '#ff9a8a', '#ffb070', '#7fc8f8', '#c9d6e0'];

/** Small glossy fish lying on its side (for counters and boxes). */
function addFish(kit, { x, y, z, ry = 0, color, s = 1 }) {
  kit.at({ x, y, z, ry }, () => {
    kit.add(ico(0.16 * s, 0), [shade(color, -0.12), shade(color, 0.12)], { sx: 2.1, sy: 0.55, sz: 0.8 }, materials.glossy);
    kit.add(cone(0.1 * s, 0.18 * s, 4), shade(color, -0.08), { x: -0.38 * s, rz: Math.PI / 2, sz: 0.4 }, materials.glossy);
  });
}

/**
 * fishMarket(opts): seed, width (18), depth (10), bays (4), wall ('#f4efe4'), roof, columns (colour),
 * canopy ([a, b]), text ('FISH MARKET'), fishColor.
 */
export function fishMarket(opts = {}) {
  const rng = rngOf(opts.seed ?? 'fishmarket', 'fm');
  const W = opts.width ?? 18, D = opts.depth ?? 10;
  const bays = opts.bays ?? 4;
  const wallH = 5.0;
  const wall = opts.wall ?? '#f4efe4';
  const roof = opts.roof ?? '#46607a';
  const col = opts.columns ?? '#2f8a7a';
  const canopy = opts.canopy ?? ['#3a6ee8', '#fff8ee'];
  const kit = new Kit('fishMarket');
  const parts = { stalls: [], crates: [] };
  const fz = D / 2;
  const stone = '#cfc6b6';

  // plinth + floor + back / side walls
  kit.add(cbox(W + 0.4, 0.5, D + 0.4, 0.08), [shade(stone, -0.12), stone], { y: 0.15 });
  kit.add(box(W - 0.3, 0.05, D - 0.3), '#d9d2c4', { y: 0.42 });
  kit.add(cbox(W, wallH, 0.4, 0.1), [shade(wall, -0.05), wall], { y: wallH / 2, z: -D / 2 + 0.2 });
  for (const s of [-1, 1]) kit.add(cbox(0.45, wallH, D, 0.1), [shade(wall, -0.05), wall], { x: s * (W / 2 - 0.22), y: wallH / 2 });
  // dark-ish interior back so the open front has depth
  kit.add(box(W - 1.0, wallH - 0.6, 0.05), shade('#6f8fa0', -0.1), { y: wallH / 2 + 0.1, z: -D / 2 + 0.43 });
  for (let i = 0; i < 6; i++) kit.add(box(0.9, 0.6, 0.05), '#fff8ee', { x: -W / 2 + 2 + i * ((W - 4) / 5), y: 3.2, z: -D / 2 + 0.47 });
  // side windows
  for (const s of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      kit.at({ x: s * W / 2, y: 1.6, z: -D / 4 + i * (D / 2), ry: s * Math.PI / 2 }, () => addWindow(kit, { w: 1.2, h: 2.0, style: 'roundtop', trim: col, headColor: col, sillColor: stone, rng }));
    }
  }
  // front arcade: cast-iron columns, arches, fascia beam
  const bw = (W - 0.9) / bays;
  const colX = (i) => -W / 2 + 0.45 + i * bw;
  for (let i = 0; i <= bays; i++) {
    const x = colX(i);
    kit.add(cyl(0.2, 0.26, 0.4, 10), shade(col, -0.1), { x, y: 0.62, z: fz - 0.25 });
    kit.add(cyl(0.14, 0.16, wallH - 1.0, 10), col, { x, y: 0.4 + (wallH - 1.0) / 2 + 0.2, z: fz - 0.25 });
    kit.add(cbox(0.52, 0.28, 0.52, 0.06), shade(col, 0.08), { x, y: wallH - 0.35, z: fz - 0.25 });
  }
  for (let i = 0; i < bays; i++) {
    const x = (colX(i) + colX(i + 1)) / 2;
    kit.add(torus(bw / 2 - 0.18, 0.1, 4, 14, Math.PI), col, { x, y: wallH - 1.9, z: fz - 0.25 });
    // spandrel between the arch and the beam: rectangle with the arch notched out from below
    const hw = bw / 2 - 0.1, ra = bw / 2 - 0.18, top = 1.55;
    const sh = new THREE.Shape();
    sh.moveTo(-hw, 0); sh.lineTo(-hw, top); sh.lineTo(hw, top); sh.lineTo(hw, 0); sh.lineTo(ra, 0);
    for (let k = 1; k <= 10; k++) { const a = (k / 10) * Math.PI; sh.lineTo(Math.cos(a) * ra, Math.sin(a) * ra); }
    sh.lineTo(-hw, 0);
    kit.add(extrude(sh, 0.16, { curveSegments: 1 }), wall, { x, y: wallH - 1.9, z: fz - 0.25 });
  }
  kit.add(cbox(W + 0.3, 0.7, 0.55, 0.08), wall, { y: wallH + 0.05, z: fz - 0.2 });
  kit.add(cbox(W + 0.5, 0.18, 0.75, 0.06), shade(col, 0.05), { y: wallH + 0.45, z: fz - 0.2 });
  // painted sign on the fascia
  const signW = Math.min(9, W - 4);
  kit.add(cbox(signW + 0.3, 0.9, 0.16, 0.06), '#2b5d7a', { y: wallH + 0.05, z: fz + 0.1 });
  kit.raw(new THREE.PlaneGeometry(signW, 0.72), signMaterial({ text: opts.text ?? 'FISH MARKET', bg: '#2f6f9a', fg: '#fff8ee', border: '#1f4f70', accent: P.sunflower, w: 1024, h: Math.round(1024 / (signW / 0.72)), icon: 'fish' }), { y: wallH + 0.05, z: fz + 0.2 });
  parts.sign = kit.anchor('sign', { y: wallH + 0.05, z: fz + 0.3 });

  // stalls in every bay: counter, tilted ice bed with fish, price tags, striped canopy
  for (let i = 0; i < bays; i++) {
    const x = (colX(i) + colX(i + 1)) / 2;
    const cw = bw - 0.9;
    kit.at({ x, z: fz - 1.6 }, () => {
      kit.add(cbox(cw, 0.95, 1.1, 0.06), i % 2 ? '#fff8ee' : '#d9ecf7', { y: 0.9 });
      for (let k = 0; k < 4; k++) kit.add(box(0.05, 0.8, 0.02), canopy[0], { x: -cw / 2 + 0.3 + k * ((cw - 0.6) / 3), y: 0.9, z: 0.56 });
      kit.add(box(cw - 0.1, 0.12, 1.0), '#eef8ff', { y: 1.42, z: 0.05, rx: 0.18 });
      for (let k = 0; k < 9; k++) kit.add(ico(0.16, 0), wobbleColor(rng, '#f4fbff', 0.03), { x: rng.range(-cw / 2 + 0.2, cw / 2 - 0.2), y: 1.47 + rng.range(-0.03, 0.03), z: rng.range(-0.35, 0.4), sy: 0.5 }, materials.glossy);
      const nf = Math.max(4, Math.round(cw / 0.42));
      for (let k = 0; k < nf; k++) {
        const fx = -cw / 2 + 0.3 + (k / (nf - 1)) * (cw - 0.6);
        const fzz = rng.range(-0.25, 0.3);
        addFish(kit, { x: fx, y: 1.55 - fzz * 0.18, z: fzz, ry: rng.range(-0.4, 0.4) + (k % 2) * Math.PI, color: opts.fishColor ?? rng.pick(FISH_COLS), s: rng.range(0.9, 1.15) });
      }
      if (rng.chance(0.6)) {
        // a lobster / crab: red body + claws
        kit.add(ico(0.18, 0), P.tomato, { x: rng.range(-cw / 3, cw / 3), y: 1.62, z: 0.1, sx: 1.4, sy: 0.6 }, materials.glossy);
      }
      for (let k = 0; k < 2; k++) {
        const tx = -cw / 2 + 0.5 + k * (cw - 1.0);
        kit.add(box(0.02, 0.3, 0.02), P.ink, { x: tx, y: 1.7, z: 0.4 });
        kit.add(box(0.26, 0.16, 0.02), '#fff8ee', { x: tx, y: 1.88, z: 0.41 });
        kit.add(box(0.16, 0.04, 0.01), P.tomato, { x: tx, y: 1.88, z: 0.425 });
      }
      // hanging scales
      kit.add(cyl(0.01, 0.01, 0.6, 4), P.ink, { x: cw / 2 - 0.4, y: 2.9, z: -0.2 });
      kit.add(cyl(0.18, 0.12, 0.06, 10), '#c9ced6', { x: cw / 2 - 0.4, y: 2.55, z: -0.2 }, materials.glossy);
      kit.add(cyl(0.12, 0.12, 0.2, 10), '#fff8ee', { x: cw / 2 - 0.4, y: 2.72, z: -0.2 });
    });
    parts.stalls.push(kit.anchor('stall', { x, y: 0.45, z: fz - 2.5 }));
    kit.at({ x, y: wallH - 2.05, z: fz - 0.1 }, () => addAwning(kit, { w: bw - 0.5, depth: 1.1, drop: 0.45, colors: canopy, rng, stripe: 0.42 }));
  }
  // fish boxes and ice out front
  for (let i = 0; i < bays + 1; i++) {
    if (!rng.chance(0.7)) continue;
    const x = rng.range(-W / 2 + 1, W / 2 - 1);
    const z = fz + rng.range(0.7, 1.6);
    kit.at({ x, z, ry: rng.range(-0.3, 0.3) }, () => {
      kit.add(cbox(0.9, 0.34, 0.6, 0.04), rng.pick(['#ff9f43', '#3a6ee8', '#fff8ee', '#2ec4b6']), { y: 0.17 });
      for (let k = 0; k < 3; k++) addFish(kit, { x: -0.25 + k * 0.25, y: 0.36, z: rng.range(-0.1, 0.1), ry: Math.PI / 2 + rng.range(-0.3, 0.3), color: rng.pick(FISH_COLS), s: 0.8 });
    });
    parts.crates.push(kit.anchor('crate', { x, y: 0.4, z }));
  }
  kit.add(cyl(0.9, 0.9, 0.02, 14), '#8fd0f0', { x: -W / 4, y: 0.44, z: fz + 1.0, sz: 0.5 }, materials.glossy);

  // roof: long gable + louvred ridge lantern + central front gable carrying the fish sign
  const pitch = 30 * DEG;
  const r = gableRoof(kit, { span: D + 0.1, length: W - 0.1, yW: wallH + 0.55, pitch, color: roof, rng, gable: wall, barge: '#fff8ee', ovL: 0.45, ovR: 0.45, gutter: '#3a4a55' });
  const lanternL = W * 0.55;
  kit.add(box(lanternL, 0.9, 1.7), '#fff8ee', { y: r.ridgeY + 0.3 });
  for (let i = 0; i < Math.round(lanternL / 0.6); i++) for (const s of [-1, 1]) kit.add(box(0.5, 0.06, 0.12), '#8fa3b3', { x: -lanternL / 2 + 0.35 + i * 0.6, y: r.ridgeY + 0.3, z: s * 0.86, rx: s * 0.5 });
  kit.at({ y: r.ridgeY + 0.75 }, () => gableRoof(kit, { span: 1.7, length: lanternL, yW: 0, pitch: 28 * DEG, color: shade(roof, 0.06), rng, gutter: null, rows: 2, t: 0.14, ovL: 0.25, ovR: 0.25 }));
  // central cross gable over the middle bays
  const cgW = Math.min(8, W * 0.42);
  kit.at({ z: fz - 0.6, ry: Math.PI / 2 }, () => {
    gableRoof(kit, { span: cgW, length: 2.6, yW: wallH + 0.55, pitch: 38 * DEG, color: roof, rng, gable: wall, barge: '#fff8ee', ovL: 0.5, ovR: 0.05, gutter: null, rows: 4 });
  });
  const pedTop = wallH + 0.55 + (cgW / 2) * Math.tan(38 * DEG);
  kit.add(cyl(0.5, 0.5, 0.08, 16), col, { y: wallH + 0.55 + 1.0, z: fz + 0.72, rx: Math.PI / 2 });
  kit.add(cyl(0.4, 0.4, 0.1, 16), '#fff8ee', { y: wallH + 0.55 + 1.0, z: fz + 0.74, rx: Math.PI / 2 });
  // the pole for the fish sign
  kit.add(cyl(0.09, 0.12, 1.6, 8), '#fff8ee', { y: pedTop + 0.75, z: fz - 0.6 });

  const group = kit.build(new THREE.Group());
  group.name = opts.name ?? 'fishMarket';

  // giant cartoon fish (separate so it can wobble / spin when shot)
  const fishSign = new THREE.Group();
  fishSign.name = 'fishSign';
  const fk = new Kit('fishSign');
  const fc = opts.signFish ?? '#ff9f43';
  fk.add(sphere(1.0, 20, 12), [shade(fc, 0.1), shade(fc, -0.12)], { y: 0.9, sx: 2.7, sy: 1.15, sz: 0.62, rz: 0.12 }, materials.glossy);
  fk.add(sphere(0.98, 18, 10), '#ffe7a8', { y: 0.72, x: 0.2, sx: 2.3, sy: 0.7, sz: 0.58, rz: 0.12 }, materials.glossy);
  fk.add(prism([[0, 0], [1.3, 0.85], [1.1, 0], [1.3, -0.85]], 0.18), shade(fc, -0.1), { x: -2.55, y: 0.75, ry: Math.PI, rz: -0.2 }, materials.glossy);
  fk.add(prism([[-0.9, 0], [0.9, 0], [0.2, 0.75]], 0.14), shade(fc, -0.1), { x: -0.2, y: 1.95, rz: 0.1 }, materials.glossy);
  for (const s of [-1, 1]) {
    fk.add(cyl(0.34, 0.34, 0.08, 16), '#fff8ee', { x: 1.75, y: 1.15, z: s * 0.5, rx: Math.PI / 2 });
    fk.add(cyl(0.17, 0.17, 0.1, 12), P.ink, { x: 1.83, y: 1.15, z: s * 0.53, rx: Math.PI / 2 });
    fk.add(sphere(0.06, 6, 4), '#ffffff', { x: 1.9, y: 1.22, z: s * 0.59 });
    fk.add(prism([[0, 0.28], [0.6, 0], [0, -0.28]], 0.08), shade(fc, -0.15), { x: 0.9, y: 0.6, z: s * 0.55, ry: s * 0.3 }, materials.glossy);
  }
  fk.add(torus(0.22, 0.1, 6, 12), '#ff6f8a', { x: 2.62, y: 0.95, ry: Math.PI / 2 }, materials.glossy);
  for (let i = 0; i < 3; i++) fk.add(torus(0.35, 0.05, 4, 10, Math.PI), shade(fc, -0.18), { x: -0.8 + i * 0.6, y: 0.9, z: 0.6, rz: Math.PI / 2 });
  fk.build(fishSign);
  fishSign.position.set(0, pedTop + 1.45, fz - 0.6);
  addCollider(fishSign, 1.6, [0, 0.9, 0]);
  group.add(fishSign);

  const tw = new Tweens();
  const base = { y: fishSign.position.y };
  group.userData.kind = 'fishMarket';
  group.userData.surface = 'stone';
  group.userData.parts = { ...parts, fishSign };
  group.userData.size = { width: W + 1, depth: D + 3.5, height: pedTop + 3.5 };
  group.userData.spinFish = (turns = 1) => {
    const r0 = fishSign.rotation.y;
    return tw.run('spin', 1.2 * turns, (e) => { fishSign.rotation.y = r0 + e * turns * TAU; }, ease.outBack);
  };
  group.userData.wobble = (s = 1) => tw.run('wobble', 1.0, (e, k) => { fishSign.rotation.z = Math.sin(k * Math.PI * 6) * (1 - k) * 0.25 * s; }, ease.linear);
  group.userData.update = (dt, t) => {
    tw.update(Math.min(dt, 0.05));
    fishSign.position.y = base.y + Math.sin(t * 1.3) * 0.06;
  };
  return group;
}
