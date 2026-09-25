// Shopfronts: a house body (upper floors + roof from house.js) with a projecting painted
// shopfront: pilasters, big display window with goods, striped scalloped awning and a sign
// board painted on a CanvasTexture. Front faces +Z, origin = footprint centre at ground.
import { THREE, materials, Kit, cbox, cylBetween, rngOf, shade, mix, DEG } from './common.js';
import { box, cyl, ico, sphere, torus, cone } from '../../geo.js';
import { P, WALLS } from '../../../gfx/palette.js';
import { buildHouse, GROUND_FLOOR } from './house.js';
import { GLASS, STREAK, LEAF, FLOWERS } from './facade.js';
import { signMaterial } from './signs.js';

/** Shop presets: sign text, colours and what sits in the window. */
export const SHOP_KINDS = {
  bakery: { text: 'BAKERY', front: '#d9553f', sign: '#d9553f', fg: '#fff1d6', accent: P.sunflower, awning: ['#e8553f', '#fff8ee'], goods: 'bakery', icon: 'bread' },
  fishchips: { text: 'FISH & CHIPS', front: P.cobalt, sign: '#2f5fd0', fg: P.sunflower, accent: '#fff8ee', awning: ['#3a6ee8', '#fff8ee'], goods: 'fish', icon: 'fish' },
  post: { text: 'POST OFFICE', front: '#d8342f', sign: '#d8342f', fg: P.gold, accent: '#fff8ee', awning: ['#e03b35', P.sunflower], goods: 'post', icon: 'letter' },
  hardware: { text: 'HARDWARE', front: '#2f7d62', sign: '#2f7d62', fg: '#fff8ee', accent: P.sunflower, awning: ['#2f8a6a', P.sunflower], goods: 'hardware', icon: 'hammer' },
  grocer: { text: 'GROCER', front: '#4f9a3c', sign: '#3f8a34', fg: '#fff8ee', accent: P.tomato, awning: ['#4fa83c', '#fff8ee'], goods: 'grocer', icon: 'apple' },
  sweets: { text: 'SWEET SHOP', front: '#ff6fae', sign: '#ff6fae', fg: '#fff8ee', accent: '#7fd8ff', awning: ['#ff7eb6', '#fff8ee'], goods: 'sweets', icon: 'candy' },
  florist: { text: 'FLORIST', front: P.violet, sign: '#8a5ae0', fg: '#fff8ee', accent: P.sunflower, awning: ['#9b6cf0', '#fff8ee'], goods: 'florist', icon: 'flower' },
  cafe: { text: 'CAFE', front: P.teal, sign: '#1fa89b', fg: '#fff8ee', accent: P.tangerine, awning: ['#2ec4b6', '#fff8ee'], goods: 'cafe', icon: 'cup' },
  butcher: { text: 'BUTCHER', front: '#8b2e3c', sign: '#8b2e3c', fg: '#fff8ee', accent: P.sunflower, awning: ['#c8503a', '#fff8ee'], goods: 'butcher', icon: 'meat' },
};

let shopGlass = null;
/** Thin transparent display glass (one shared material). */
export function displayGlassMaterial() {
  if (!shopGlass) {
    shopGlass = new THREE.MeshStandardMaterial({ color: '#d8f3ff', transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0, depthWrite: false, envMapIntensity: 2 });
    shopGlass.name = 'displayGlass';
  }
  return shopGlass;
}

/**
 * Shop. opts: kind (see SHOP_KINDS), text, sub (small subtitle), width, depth, floors (1-3),
 * wall, roof, roofStyle, seed, awning ([a, b] stripe colours | false), front (paint colour),
 * awningObject (true -> awning is a separate Object3D in parts.awning, hinged at the wall).
 * parts: { door, sign, awning?, windows, chimneyTops, ridge, displayWindow }
 */
export function shop(opts = {}) {
  const kind = SHOP_KINDS[opts.kind] ? opts.kind : 'bakery';
  const K = { ...SHOP_KINDS[kind], ...(opts.text ? { text: opts.text } : {}) };
  const rng = rngOf(opts.seed ?? kind, 'shop');
  const front = opts.front ?? K.front;
  const kit = new Kit(`shop-${kind}`);
  const W = opts.width ?? rng.range(6.2, 7.6);
  const D = opts.depth ?? rng.range(5.6, 6.4);
  const res = buildHouse(kit, {
    seed: opts.seed ?? `${kind}-shop`, width: W, depth: D, floors: opts.floors ?? rng.pick([2, 2, 3]),
    wall: opts.wall ?? rng.pick(WALLS), roof: opts.roof, roofStyle: opts.roofStyle ?? rng.pick(['gable', 'gable', 'hip', 'mansard']),
    style: opts.style ?? rng.pick(['plain', 'plain', 'quoins', 'brick']), groundFloor: false, gableFront: opts.gableFront ?? false,
    windowBoxes: opts.windowBoxes, windowStyle: opts.windowStyle, trim: opts.trim, bay: false, gag: opts.gag ?? 'none',
    cols: opts.cols ?? (W > 6.8 ? 3 : 2), wonk: opts.wonk ?? 0.8,
  });
  const parts = res.parts;
  const fz = D / 2;
  const proj = 0.6; // shopfront projection
  const fh = GROUND_FLOOR; // ground floor height
  const sfW = W - 0.3; // shopfront width
  const pil = 0.34; // pilaster width
  const riser = 0.62;
  const winTop = 2.35;
  const fasciaH = 0.78;
  const fasciaY = winTop + 0.1 + fasciaH / 2;
  const dark = shade(front, -0.12);
  const light = mix(front, '#fff8ee', 0.75);
  const doorW = 1.1;
  const doorSide = opts.doorSide ?? (rng.chance(0.5) ? -1 : 1);
  const centreDoor = sfW > 6.6;
  const doorX = centreDoor ? 0 : doorSide * (sfW / 2 - pil - doorW / 2 - 0.12);
  // display window spans
  const spans = centreDoor
    ? [[-sfW / 2 + pil, -doorW / 2 - 0.2], [doorW / 2 + 0.2, sfW / 2 - pil]]
    : doorSide > 0 ? [[-sfW / 2 + pil, doorX - doorW / 2 - 0.2]] : [[doorX + doorW / 2 + 0.2, sfW / 2 - pil]];

  kit.at({ z: fz }, () => {
    // pilasters with capitals and bases
    for (const s of [-1, 1]) {
      const x = s * (sfW / 2 - pil / 2);
      kit.add(cbox(pil, fh + 0.1, proj + 0.1, 0.07), [dark, front], { x, y: (fh + 0.1) / 2, z: proj / 2 });
      kit.add(cbox(pil + 0.14, 0.3, proj + 0.22, 0.06), light, { x, y: 0.15, z: proj / 2 + 0.02 });
      kit.add(cbox(pil + 0.16, 0.36, proj + 0.26, 0.07), light, { x, y: winTop + 0.12, z: proj / 2 + 0.04 });
    }
    // fascia board + cornice
    kit.add(cbox(sfW + 0.16, fasciaH + 0.12, proj + 0.2, 0.07), dark, { y: fasciaY, z: proj / 2 + 0.02 });
    kit.add(cbox(sfW + 0.42, 0.22, proj + 0.46, 0.07), light, { y: fasciaY + fasciaH / 2 + 0.16, z: proj / 2 + 0.06 });
    // painted sign on the fascia (canvas texture)
    const sw = sfW - 0.3, sh = fasciaH - 0.1;
    const cw = 1024, ch = Math.round(1024 / (sw / sh));
    const mat = signMaterial({ text: K.text, sub: opts.sub ?? null, bg: K.sign, fg: K.fg, border: shade(K.sign, -0.22), accent: K.accent, w: cw, h: ch, icon: K.icon });
    kit.raw(new THREE.PlaneGeometry(sw, sh), mat, { y: fasciaY, z: proj + 0.15 });
    parts.sign = kit.anchor('sign', { y: fasciaY, z: proj + 0.2 });

    // display windows
    for (const [x0, x1] of spans) {
      const w = x1 - x0, xc = (x0 + x1) / 2;
      // stallriser with a raised panel
      kit.add(cbox(w + 0.1, riser, proj + 0.02, 0.06), front, { x: xc, y: riser / 2, z: proj / 2 });
      kit.add(box(w - 0.3, riser - 0.24, 0.05), light, { x: xc, y: riser / 2, z: proj + 0.02 });
      // shop interior: back panel, side walls, ceiling, shelves
      const inner = shade(mix(front, '#7a4a26', 0.55), -0.12);
      kit.add(box(w, winTop - riser, 0.06), [shade(inner, -0.04), inner], { x: xc, y: (winTop + riser) / 2, z: 0.05 });
      kit.add(box(w, 0.06, proj), shade(inner, -0.08), { x: xc, y: winTop - 0.02, z: proj / 2 });
      kit.add(box(w - 0.06, 0.07, 0.34), P.woodLight, { x: xc, y: 1.42, z: 0.24 });
      // glazing: frame, mullions, transom
      const glassZ = proj - 0.06;
      kit.add(box(w, 0.1, 0.12), light, { x: xc, y: riser + 0.03, z: glassZ });
      kit.add(box(w, 0.1, 0.12), light, { x: xc, y: winTop - 0.02, z: glassZ });
      kit.add(box(w, 0.08, 0.1), light, { x: xc, y: winTop - 0.42, z: glassZ });
      const mull = Math.max(1, Math.round(w / 1.4));
      for (let m = 1; m < mull; m++) kit.add(box(0.08, winTop - riser, 0.1), light, { x: x0 + (m / mull) * w, y: (winTop + riser) / 2, z: glassZ });
      for (const s of [-1, 1]) kit.add(box(0.1, winTop - riser, 0.12), light, { x: xc + s * (w / 2 - 0.05), y: (winTop + riser) / 2, z: glassZ });
      kit.raw(new THREE.PlaneGeometry(w, winTop - riser), displayGlassMaterial(), { x: xc, y: (winTop + riser) / 2, z: glassZ + 0.02 });
      // cartoon glints on the glass
      kit.add(box(0.1, 0.9, 0.02), STREAK, { x: xc - w * 0.3, y: 1.55, z: glassZ + 0.05, rz: -30 * DEG }, materials.glossy);
      kit.add(box(0.05, 0.55, 0.02), STREAK, { x: xc - w * 0.3 + 0.24, y: 1.6, z: glassZ + 0.05, rz: -30 * DEG }, materials.glossy);
      addGoods(kit, K.goods, { x0: x0 + 0.1, x1: x1 - 0.1, riser, winTop, rng, depth: proj });
    }
    parts.displayWindow = kit.anchor('displayWindow', { x: (spans[0][0] + spans[0][1]) / 2, y: 1.5, z: proj });

    // glazed shop door, set back in the wall with a step
    kit.at({ x: doorX, z: 0 }, () => {
      const dh = 2.2;
      kit.add(cbox(doorW, dh, 0.12, 0.04), front, { y: dh / 2, z: 0.02 });
      kit.add(box(doorW - 0.3, dh * 0.45, 0.05), GLASS, { y: dh * 0.66, z: 0.09 }, materials.glossy);
      kit.add(box(doorW - 0.3, dh * 0.22, 0.05), light, { y: dh * 0.22, z: 0.09 });
      kit.add(ico(0.07, 0), P.gold, { x: doorW * 0.32, y: dh * 0.45, z: 0.12 }, materials.glossy);
      // little OPEN sign hanging in the door
      kit.add(box(0.36, 0.2, 0.03), '#fff8ee', { y: dh * 0.62, z: 0.13 });
      kit.add(box(0.26, 0.07, 0.035), P.tomato, { y: dh * 0.62, z: 0.14 });
      // door surround + transom light
      kit.add(box(doorW + 0.1, winTop - dh, 0.1), GLASS, { y: (winTop + dh) / 2, z: 0.03 }, materials.glossy);
      kit.add(box(doorW + 0.3, 0.1, proj), light, { y: winTop - 0.02, z: proj / 2 });
      kit.add(cbox(doorW + 0.4, 0.16, proj + 0.35, 0.05), P.stone, { y: 0.06, z: (proj + 0.35) / 2 - 0.02 });
      parts.door = kit.anchor('door', { y: 0.15, z: proj + 0.4 });
    });
    // door recess side walls
    for (const s of [-1, 1]) {
      const x = doorX + s * (doorW / 2 + 0.1);
      if (Math.abs(x) < sfW / 2 - pil) kit.add(box(0.14, winTop, proj), light, { x, y: winTop / 2, z: proj / 2 });
    }

    // outdoor display / clutter
    addStreetClutter(kit, K.goods, { W: sfW, proj, rng, doorX, front, accent: K.accent, spans });
  });

  // awning
  const awnCols = opts.awning === false ? null : opts.awning ?? K.awning;
  if (awnCols) {
    const aw = sfW + 0.1;
    const fill = (k) => addAwning(k, { w: aw, depth: 1.55, drop: 0.55, colors: awnCols, rng });
    const hingeY = winTop + 0.08;
    const hingeZ = fz + proj + 0.08;
    if (opts.awningObject) {
      const sub = new Kit(`${kit.name}-awning`);
      fill(sub);
      const g = sub.build(new THREE.Group());
      g.name = 'awning';
      g.position.set(0, hingeY, hingeZ);
      kit.anchors.push(g);
      parts.awning = g;
    } else {
      kit.at({ y: hingeY, z: hingeZ }, () => fill(kit));
    }
  }

  const group = kit.build(new THREE.Group());
  group.name = opts.name ?? `shop-${kind}`;
  group.userData.kind = 'shop';
  group.userData.shopKind = kind;
  group.userData.parts = parts;
  group.userData.size = { ...res.size, depth: D + proj + 1.6 };
  return group;
}

/**
 * Striped awning, hinge line at the origin running along X; slopes out (+Z) and down.
 * Scalloped valance in alternating colours, metal side arms.
 */
export function addAwning(kit, { w, depth = 1.5, drop = 0.5, colors = [P.tomato, '#fff8ee'], rng, stripe = 0.42 }) {
  const n = Math.max(4, Math.round(w / stripe));
  const sw = w / n;
  const len = Math.hypot(depth, drop);
  const ang = Math.atan2(drop, depth);
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + sw * (i + 0.5);
    const c = colors[i % colors.length];
    kit.add(box(sw + 0.005, 0.07, len), c, { x, y: -drop / 2, z: depth / 2, rx: ang });
    // scallop
    kit.add(new THREE.CylinderGeometry(sw / 2, sw / 2, 0.06, 6, 1, false, Math.PI / 2, Math.PI).rotateX(Math.PI / 2), c, { x, y: -drop - 0.12, z: depth + 0.01 });
    kit.add(box(sw + 0.005, 0.22, 0.06), c, { x, y: -drop - 0.01, z: depth + 0.01 });
  }
  // front bar + side arms
  kit.add(cyl(0.06, 0.06, w + 0.16, 8), shade(colors[0], -0.25), { y: -drop + 0.08, z: depth - 0.02, rz: Math.PI / 2 });
  for (const s of [-1, 1]) kit.add(cylBetween([s * (w / 2 + 0.02), -drop - 0.55, 0.0], [s * (w / 2 + 0.02), -drop + 0.05, depth - 0.02], 0.035, 0.035, 6), P.metalDark);
}

/** Goods sitting on the display shelf / floor inside a shop window (x0..x1, wall plane z=0). */
function addGoods(kit, kind, { x0, x1, riser, winTop, rng, depth }) {
  const w = x1 - x0;
  const shelfY = 1.46;
  const floorY = riser + 0.02;
  const zF = depth * 0.6, zB = 0.24;
  const along = (n) => Array.from({ length: n }, (_, i) => x0 + ((i + 0.5) / n) * w);
  if (kind === 'bakery') {
    for (const x of along(Math.round(w / 0.55))) {
      const c = rng.pick(['#e9a45c', '#d98b43', '#f2c07a']);
      kit.add(ico(0.2, 1), c, { x, y: floorY + 0.13, z: zF, sx: 1.4, sy: 0.7, sz: 0.8, ry: rng.range(-0.4, 0.4) });
    }
    for (const x of along(Math.max(1, Math.round(w / 0.9)))) {
      // iced cake with a cherry
      kit.add(cyl(0.26, 0.26, 0.22, 12), '#f7e3c4', { x, y: shelfY + 0.14, z: zB });
      kit.add(cyl(0.28, 0.28, 0.08, 12), rng.pick(['#ff9fc4', '#fff8ee', '#ffd36b']), { x, y: shelfY + 0.27, z: zB });
      kit.add(ico(0.07, 0), P.tomato, { x, y: shelfY + 0.36, z: zB });
    }
  } else if (kind === 'fish') {
    for (const x of along(Math.max(1, Math.round(w / 1.2)))) {
      kit.add(ico(0.3, 1), '#7fc8f8', { x, y: floorY + 0.24, z: zF, sx: 1.4, sy: 0.6, sz: 0.4 });
      kit.add(cone(0.18, 0.3, 4), '#5fb0e8', { x: x + 0.52, y: floorY + 0.24, z: zF, rz: Math.PI / 2 });
    }
    for (const x of along(Math.round(w / 0.6))) {
      kit.add(cone(0.14, 0.34, 8), '#fff8ee', { x, y: shelfY + 0.19, z: zB, rx: Math.PI });
      kit.add(ico(0.13, 0), P.sunflower, { x, y: shelfY + 0.38, z: zB });
    }
  } else if (kind === 'post') {
    for (const x of along(Math.round(w / 0.5))) {
      const s = rng.range(0.28, 0.4);
      kit.add(cbox(s, s * 0.8, s, 0.03), rng.pick(['#c9955e', '#b98050', '#dca66b']), { x, y: floorY + s * 0.4, z: zF, ry: rng.range(-0.3, 0.3) });
      kit.add(box(s + 0.01, 0.04, 0.04), '#fff8ee', { x, y: floorY + s * 0.8 + 0.005, z: zF, ry: 0 });
    }
    for (const x of along(Math.round(w / 0.45))) kit.add(box(0.3, 0.22, 0.03), rng.pick(['#fff8ee', '#ffe590', '#c2e4ff']), { x, y: shelfY + 0.15, z: zB, rx: -0.2 });
  } else if (kind === 'hardware') {
    for (const x of along(Math.round(w / 0.42))) {
      const c = rng.pick([P.tomato, P.cobalt, P.sunflower, P.teal, P.bubblegum]);
      kit.add(cyl(0.15, 0.15, 0.3, 10), c, { x, y: floorY + 0.15, z: zF });
      kit.add(cyl(0.155, 0.155, 0.04, 10), P.metal, { x, y: floorY + 0.31, z: zF });
    }
    for (const x of along(Math.max(1, Math.round(w / 0.8)))) {
      kit.add(box(0.06, 0.5, 0.06), P.wood, { x, y: shelfY + 0.3, z: zB, rz: 0.4 });
      kit.add(box(0.22, 0.1, 0.1), P.metalDark, { x: x - 0.1, y: shelfY + 0.52, z: zB, rz: 0.4 });
    }
  } else if (kind === 'grocer') {
    for (const x of along(Math.max(1, Math.round(w / 0.7)))) {
      const c = rng.pick([P.tomato, P.tangerine, P.lime, P.sunflower]);
      kit.add(box(0.55, 0.22, 0.4), P.woodLight, { x, y: floorY + 0.11, z: zF });
      for (let k = 0; k < 4; k++) kit.add(ico(0.1, 0), c, { x: x + (k - 1.5) * 0.12, y: floorY + 0.28, z: zF + rng.range(-0.08, 0.08) });
    }
    for (const x of along(Math.round(w / 0.5))) kit.add(ico(0.16, 0), rng.pick(['#6cbf4a', '#a3e635', P.tangerine]), { x, y: shelfY + 0.14, z: zB });
  } else if (kind === 'sweets') {
    for (const x of along(Math.round(w / 0.5))) {
      const c = rng.pick([P.bubblegum, P.sunflower, P.teal, P.tomato, P.violet]);
      kit.add(cyl(0.16, 0.16, 0.42, 10), [shade(c, -0.05), shade(c, 0.12)], { x, y: shelfY + 0.22, z: zB }, materials.glossy);
      kit.add(cyl(0.165, 0.165, 0.1, 10), '#fff8ee', { x, y: shelfY + 0.2, z: zB });
      kit.add(cyl(0.17, 0.17, 0.06, 10), P.tomato, { x, y: shelfY + 0.45, z: zB });
    }
    for (const x of along(Math.max(1, Math.round(w / 0.7)))) {
      kit.add(box(0.04, 0.55, 0.04), '#fff8ee', { x, y: floorY + 0.28, z: zF });
      kit.add(cyl(0.2, 0.2, 0.06, 12).rotateX(Math.PI / 2), rng.pick([P.bubblegum, P.teal, P.sunflower]), { x, y: floorY + 0.62, z: zF });
    }
  } else if (kind === 'florist') {
    for (const x of along(Math.round(w / 0.5))) {
      kit.add(cyl(0.16, 0.12, 0.3, 8), rng.pick([P.metal, P.teal]), { x, y: floorY + 0.15, z: zF });
      for (let k = 0; k < 3; k++) kit.add(ico(0.1, 0), rng.pick(FLOWERS), { x: x + rng.range(-0.1, 0.1), y: floorY + 0.4 + rng.range(0, 0.12), z: zF + rng.range(-0.08, 0.08) });
      kit.add(ico(0.16, 0), LEAF[1], { x, y: floorY + 0.34, z: zF });
    }
  } else if (kind === 'butcher') {
    for (const x of along(Math.round(w / 0.25))) {
      kit.add(new THREE.CapsuleGeometry(0.06, 0.26, 2, 6), '#e0645a', { x, y: winTop - 0.35, z: zB + 0.1 });
    }
    for (const x of along(Math.max(1, Math.round(w / 0.8)))) kit.add(ico(0.22, 1), '#ff9a8a', { x, y: floorY + 0.16, z: zF, sx: 1.3, sy: 0.7 });
  } else {
    // cafe: cake stands + cups
    for (const x of along(Math.max(1, Math.round(w / 0.7)))) {
      kit.add(cyl(0.05, 0.05, 0.3, 6), P.metal, { x, y: floorY + 0.15, z: zF });
      kit.add(cyl(0.26, 0.26, 0.03, 12), '#fff8ee', { x, y: floorY + 0.3, z: zF });
      kit.add(cyl(0.18, 0.18, 0.14, 12), rng.pick(['#ff9fc4', '#ffd36b', '#8a5a2b']), { x, y: floorY + 0.39, z: zF });
    }
    for (const x of along(Math.round(w / 0.4))) kit.add(cyl(0.08, 0.06, 0.12, 8), rng.pick([P.teal, '#fff8ee', P.tangerine]), { x, y: shelfY + 0.08, z: zB });
  }
}

/** Crates, A-boards, buckets and tables out on the pavement under the awning. */
function addStreetClutter(kit, kind, { W, proj, rng, doorX, front, accent, spans }) {
  const z = proj + 0.55;
  const [x0, x1] = spans[0];
  const xc = (x0 + x1) / 2;
  // A-board chalk sign next to the door
  const ax = doorX + (doorX > 0 ? -1 : 1) * 1.0;
  kit.at({ x: ax, z: z + 0.4, ry: rng.range(-0.3, 0.3) }, () => {
    for (const s of [-1, 1]) kit.add(box(0.62, 0.9, 0.05), P.woodDark, { y: 0.44, z: s * 0.12, rx: s * 0.2 });
    for (const s of [-1, 1]) kit.add(box(0.5, 0.7, 0.02), '#3d4a4f', { y: 0.47, z: s * 0.155, rx: s * 0.2 });
    kit.add(box(0.36, 0.06, 0.03), '#fff8ee', { y: 0.62, z: 0.17, rx: 0.2 });
    kit.add(box(0.28, 0.05, 0.03), accent, { y: 0.48, z: 0.19, rx: 0.2 });
  });
  if (kind === 'grocer' || kind === 'florist') {
    // tiered crates in front of the window
    const n = Math.max(2, Math.round((x1 - x0) / 0.85));
    for (let i = 0; i < n; i++) {
      const x = x0 + ((i + 0.5) / n) * (x1 - x0);
      kit.add(cbox(0.7, 0.42, 0.55, 0.04), P.woodLight, { x, y: 0.21, z: z });
      kit.add(box(0.72, 0.05, 0.57), P.wood, { x, y: 0.12, z });
      const c = kind === 'grocer' ? rng.pick([P.tomato, P.tangerine, P.lime, P.sunflower, '#8b5cf6']) : null;
      for (let k = 0; k < 6; k++) {
        const col = c ?? rng.pick(FLOWERS);
        kit.add(ico(kind === 'grocer' ? 0.12 : 0.13, 0), col, { x: x + ((k % 3) - 1) * 0.2 + rng.range(-0.03, 0.03), y: 0.5 + rng.range(0, 0.06), z: z + (k < 3 ? -0.12 : 0.12) });
      }
      if (kind === 'florist') kit.add(ico(0.26, 0), LEAF[0], { x, y: 0.46, z, sy: 0.6 });
    }
  } else if (kind === 'cafe') {
    for (const s of [0]) {
      kit.at({ x: xc, z: z + 0.35 }, () => {
        kit.add(cyl(0.05, 0.05, 0.72, 6), P.metalDark, { y: 0.36 });
        kit.add(cyl(0.42, 0.42, 0.05, 14), '#fff8ee', { y: 0.74 });
        kit.add(cyl(0.3, 0.3, 0.04, 10), P.metalDark, { y: 0.02 });
        for (const c of [-1, 1]) {
          kit.add(cbox(0.38, 0.06, 0.38, 0.02), front, { x: c * 0.62, y: 0.46 });
          kit.add(cbox(0.38, 0.45, 0.05, 0.02), front, { x: c * 0.62 + c * 0.17, y: 0.7, ry: Math.PI / 2 });
          for (const lx of [-0.15, 0.15]) for (const lz of [-0.15, 0.15]) kit.add(box(0.04, 0.44, 0.04), P.metalDark, { x: c * 0.62 + lx, y: 0.22, z: lz });
        }
      });
    }
  } else if (kind === 'hardware') {
    // a ladder leaning on the pilaster, a mop bucket, a watering can
    kit.at({ x: x0 + 0.31, y: 1.05, z: z - 0.2, rx: -0.22 }, () => {
      for (const s of [-1, 1]) kit.add(box(0.08, 2.1, 0.08), P.woodLight, { x: s * 0.22 });
      for (let r = 0; r < 5; r++) kit.add(box(0.44, 0.06, 0.06), P.woodLight, { y: -0.8 + r * 0.4 });
    });
    kit.add(cyl(0.2, 0.16, 0.34, 10), P.cobalt, { x: x1 - 0.3, y: 0.17, z });
    kit.add(torus(0.14, 0.02, 4, 10, Math.PI), P.metalDark, { x: x1 - 0.3, y: 0.34, z });
  } else if (kind === 'fish' || kind === 'bakery' || kind === 'sweets') {
    // a bench and a bin: seaside-high-street clutter
    kit.at({ x: xc, z: z + 0.25 }, () => {
      kit.add(cbox(1.3, 0.08, 0.4, 0.03), P.wood, { y: 0.46 });
      kit.add(cbox(1.3, 0.3, 0.06, 0.03), P.wood, { y: 0.7, z: -0.2 });
      for (const s of [-1, 1]) kit.add(box(0.06, 0.46, 0.36), P.metalDark, { x: s * 0.55, y: 0.23 });
    });
  } else if (kind === 'post') {
    kit.at({ x: xc, z: z + 0.2 }, () => {
      kit.add(cyl(0.26, 0.26, 1.1, 14), '#e03b35', { y: 0.55 });
      kit.add(sphere(0.27, 14, 8).scale(1, 0.55, 1), '#e03b35', { y: 1.1 });
      kit.add(box(0.28, 0.05, 0.05), P.ink, { y: 0.85, z: 0.25 });
      kit.add(cyl(0.3, 0.3, 0.1, 14), P.ink, { y: 0.05 });
    });
  }
}
