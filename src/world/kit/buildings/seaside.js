// Seaside buildings for Barnacle Bay: stackable harbour cottages, beach huts, kiosks, the chip shop.
import { THREE, materials, Kit, cbox, prism, extrude, archPath, rngOf, shade, mix, wobbleColor, DEG, TAU, addCollider, Tweens, ease } from './common.js';
import { box, cyl, ico, sphere, cone, torus } from '../../geo.js';
import { P, CLOTHES } from '../../../gfx/palette.js';
import { house } from './house.js';
import { shop, addAwning } from './shop.js';
import { numberPlate, signMaterial, labelMaterial } from './signs.js';
import { GLASS, STREAK, LEAF } from './facade.js';

export const HARBOUR_WALLS = ['#ff8fab', '#ffd23f', '#6fd3c7', '#9cc8ff', '#c9a7f5', '#ffa76b', '#a8e07a', '#fff1d6', '#ffb3c6', '#7fd6f5'];
export const HARBOUR_ROOFS = [P.roofSlate, '#46607a', P.roofTerracotta, '#3f6f8f', '#5a6b7d'];

/**
 * Tall, narrow, brightly painted harbour cottage with balconies and washing; `base` (m) adds a stone
 * plinth + terrace + side stairs so cottages can be stacked up a hillside (floor at y = 0, base down
 * to y = -base). Returns a house() group; extra parts: balconies[], washing?, stairFoot?.
 * opts: seed, width, depth, floors (2-3), wall, roof, roofStyle ('gable' | 'flat' | 'hip'),
 * balconies ('top' | 'first' | 'all' | 'none'), washing (bool), base, stairSide (-1 | 1), railColor, house (extra house opts).
 */
export function harbourCottage(opts = {}) {
  const rng = rngOf(opts.seed ?? 1, 'hcottage');
  const floors = opts.floors ?? rng.pick([2, 3, 3]);
  const roofStyle = opts.roofStyle ?? rng.pick(['gable', 'gable', 'flat', 'gable', 'hip']);
  const width = opts.width ?? rng.range(4.3, 5.3);
  const g = house({
    seed: `hc-${opts.seed ?? 1}`, width, depth: opts.depth ?? rng.range(4.8, 5.8), floors, roofStyle,
    gableFront: opts.gableFront ?? (roofStyle === 'gable' && rng.chance(0.45)),
    wall: opts.wall ?? rng.pick(HARBOUR_WALLS), roof: opts.roof ?? rng.pick(HARBOUR_ROOFS),
    style: 'plain', trim: opts.trim ?? '#fff8ee', windowStyle: opts.windowStyle ?? rng.pick(['sash', 'shuttered', 'sash', 'roundtop']),
    shutter: opts.shutter ?? rng.pick([P.teal, P.cobalt, '#2f7d62', P.tomato, P.sunflower]),
    balconies: opts.balconies ?? (floors >= 2 ? rng.pick(['top', 'first', 'top', 'all']) : 'none'),
    railColor: opts.railColor ?? rng.pick(['#fff8ee', '#2f7d8a', '#3a6ee8', '#fff8ee']),
    washing: opts.washing ?? rng.chance(0.8), base: opts.base ?? 0, stairSide: opts.stairSide,
    cols: 2, porch: opts.porch ?? rng.pick(['none', 'hood', 'none']), bay: false, dormers: false,
    climber: opts.climber ?? rng.chance(0.3), gag: opts.gag ?? rng.pick(['none', 'none', 'none', 'birdhouse', 'gnome']),
    number: opts.number, chimneys: 1, pitch: opts.pitch ?? rng.range(34, 42), windowBoxes: opts.windowBoxes ?? rng.chance(0.7),
    pots: true, brickPatch: rng.chance(0.25), budget: opts.budget ?? 5000, ...(opts.house || {}),
  });
  g.name = opts.name ?? 'harbourCottage';
  g.userData.kind = 'harbourCottage';
  g.userData.surface = 'stone';
  const wash = g.userData.parts.washing;
  if (wash) g.userData.update = (dt, t) => wash.userData.update(dt, t);
  return g;
}

/**
 * Striped beach hut on a little deck. parts.door (hinged at its left edge), parts.latch (small hasp
 * with a big collider), parts.inside (anchor at the picnic shelf). userData.open() / close() -> Promise.
 * opts: color, stripe ('#fff8ee'), seed, number, open (start open).
 */
export function beachHut(opts = {}) {
  const rng = rngOf(opts.seed ?? 'hut', 'hut');
  const color = opts.color ?? rng.pick(['#ff8fab', '#6fd3c7', '#ffd23f', '#9cc8ff', '#c9a7f5', '#ffa76b', P.tomato]);
  const stripe = opts.stripe ?? '#fff8ee';
  const W = 2.3, D = 2.4, H = 2.15;
  const kit = new Kit('beachHut');
  const trim = '#fff8ee';
  const dw = 1.12, dh = 1.9;
  const deckY = 0.34;
  // stilts + deck
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.add(box(0.2, deckY, 0.2), P.woodDark, { x: sx * (W / 2 - 0.1), y: deckY / 2 - 0.05, z: sz * (D / 2 - 0.1) + 0.3 });
  kit.add(cbox(W + 0.5, 0.14, D + 1.0, 0.04), '#c9965e', { y: deckY, z: 0.4 });
  for (let i = 0; i < 6; i++) kit.add(box(W + 0.52, 0.02, 0.03), '#a8774a', { y: deckY + 0.075, z: -D / 2 + 0.05 + i * ((D + 0.9) / 6) });
  kit.add(cbox(0.9, 0.16, 0.4, 0.04), '#c9965e', { y: 0.14, z: D / 2 + 1.05 });
  const floorY = deckY + 0.07;
  // walls: vertical planks in alternating colours (sides + back), front has the doorway
  const plank = 0.23;
  const addPlanks = (len, place) => {
    const n = Math.round(len / plank);
    for (let i = 0; i < n; i++) place(-len / 2 + (i + 0.5) * (len / n), len / n, i % 2 ? stripe : color);
  };
  addPlanks(D, (u, w, c) => { for (const sx of [-1, 1]) kit.add(box(0.1, H, w - 0.01), c, { x: sx * W / 2, y: floorY + H / 2, z: u }); });
  kit.add(box(W, H, 0.1), color, { y: floorY + H / 2, z: -D / 2 });
  addPlanks(W, (u, w, c) => {
    if (Math.abs(u) < dw / 2 + 0.02) {
      kit.add(box(w - 0.01, H - dh - 0.02, 0.1), c, { x: u, y: floorY + dh + (H - dh) / 2 + 0.01, z: D / 2 });
    } else kit.add(box(w - 0.01, H, 0.1), c, { x: u, y: floorY + H / 2, z: D / 2 });
  });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.add(box(0.14, H + 0.02, 0.14), trim, { x: sx * W / 2, y: floorY + H / 2, z: sz * D / 2 });
  // door frame + dark interior + goodies (seen when the door opens)
  kit.add(box(dw + 0.16, 0.1, 0.16), trim, { y: floorY + dh + 0.03, z: D / 2 + 0.02 });
  for (const sx of [-1, 1]) kit.add(box(0.08, dh, 0.16), trim, { x: sx * (dw / 2 + 0.04), y: floorY + dh / 2, z: D / 2 + 0.02 });
  kit.add(box(W - 0.2, H - 0.05, 0.05), shade(color, -0.35), { y: floorY + H / 2, z: -D / 2 + 0.08 });
  kit.add(box(W - 0.2, 0.04, D - 0.2), '#a8774a', { y: floorY + 0.02, z: 0 });
  kit.add(box(W - 0.3, 0.05, 0.45), '#c9965e', { y: floorY + 1.05, z: -D / 2 + 0.35 });
  kit.add(cbox(0.5, 0.3, 0.32, 0.05), '#d9a560', { x: -0.45, y: floorY + 1.23, z: -D / 2 + 0.35 });
  kit.add(torus(0.18, 0.025, 4, 10, Math.PI), P.woodDark, { x: -0.45, y: floorY + 1.38, z: -D / 2 + 0.35 });
  for (let i = 0; i < 3; i++) kit.add(prism([[-0.14, 0], [0.14, 0], [0, 0.18]], 0.07), '#fff1d6', { x: 0.35 + i * 0.17, y: floorY + 1.08, z: -D / 2 + 0.35, rz: i % 2 ? 0.4 : -0.3 });
  kit.add(box(0.5, 0.8, 0.03), rng.pick(CLOTHES), { x: 0.75, y: floorY + 1.6, z: -D / 2 + 0.14 });
  kit.add(cyl(0.16, 0.12, 0.28, 8), P.tomato, { x: 0.6, y: floorY + 0.16, z: -0.3 });
  kit.add(box(0.05, 0.6, 0.05), P.sunflower, { x: 0.75, y: floorY + 0.35, z: -0.3, rz: 0.4 });
  // side porthole window
  kit.at({ x: W / 2 + 0.05, y: floorY + 1.3, z: -0.2, ry: Math.PI / 2 }, () => {
    kit.add(torus(0.22, 0.06, 5, 12), trim, {});
    kit.add(cyl(0.2, 0.2, 0.04, 12), GLASS, { rx: Math.PI / 2 }, materials.glossy);
  });
  // gable roof (ridge front-to-back) with white bargeboards + number on the gable
  const pitch = 34 * DEG;
  const half = W / 2 + 0.25;
  const rise = half * Math.tan(pitch);
  const topY = floorY + H;
  kit.add(prism([[-W / 2, 0], [W / 2, 0], [0, rise - 0.05]], D), stripe, { y: topY });
  for (const s of [-1, 1]) {
    kit.add(cbox(half / Math.cos(pitch) + 0.1, 0.12, D + 0.5, 0.04), shade(color, -0.12), { x: s * half / 2, y: topY + rise / 2 + 0.08, rz: -s * pitch });
    kit.add(cbox(half / Math.cos(pitch) + 0.08, 0.16, 0.08, 0.03), trim, { x: s * half / 2, y: topY + rise / 2 - 0.02, z: D / 2 + 0.27, rz: -s * pitch });
  }
  kit.add(ico(0.12, 0), color, { y: topY + rise + 0.22, z: D / 2 + 0.2 });
  if (opts.number !== false) numberPlate(kit, opts.number ?? rng.int(1, 40), { y: topY + rise * 0.4, z: D / 2 + 0.05 }, color, 0.26);
  const group = kit.build(new THREE.Group());
  group.name = opts.name ?? 'beachHut';

  // door leaf (hinged on the left)
  const door = new THREE.Group();
  door.name = 'door';
  const dk = new Kit('hutDoor');
  for (let i = 0; i < 4; i++) dk.add(box(dw / 4 - 0.01, dh - 0.02, 0.07), i % 2 ? stripe : color, { x: (i + 0.5) * (dw / 4), y: dh / 2 });
  dk.add(box(dw - 0.1, 0.1, 0.03), shade(color, -0.2), { x: dw / 2, y: dh * 0.25, z: 0.05 });
  dk.add(box(dw - 0.1, 0.1, 0.03), shade(color, -0.2), { x: dw / 2, y: dh * 0.78, z: 0.05 });
  dk.add(box(0.08, dh * 0.6, 0.03), shade(color, -0.2), { x: dw / 2, y: dh * 0.52, z: 0.05, rz: 0.55 });
  dk.add(torus(0.13, 0.04, 4, 10), trim, { x: dw / 2, y: dh * 0.62, z: 0.05 });
  dk.add(cyl(0.12, 0.12, 0.03, 10), '#6fb6e0', { x: dw / 2, y: dh * 0.62, z: 0.04, rx: Math.PI / 2 });
  dk.build(door);
  door.position.set(-dw / 2, floorY, D / 2 + 0.06);
  group.add(door);
  // latch: hasp on the frame at the door's closing edge
  const latch = new THREE.Group();
  latch.name = 'latch';
  const lk = new Kit('hutLatch');
  lk.add(box(0.1, 0.14, 0.05), '#4a525a', {});
  lk.add(box(0.26, 0.06, 0.04), '#8f99a3', { x: -0.14, z: 0.03 });
  lk.add(torus(0.05, 0.015, 4, 8), '#c9a46a', { x: -0.24, y: -0.03, z: 0.06 });
  lk.build(latch);
  latch.position.set(dw / 2 + 0.06, floorY + 1.05, D / 2 + 0.12);
  addCollider(latch, 0.4, [-0.1, 0, 0.05]);
  group.add(latch);
  const inside = new THREE.Object3D(); inside.name = 'inside'; inside.position.set(0, floorY + 1.1, -D / 2 + 0.5); group.add(inside);
  const step = new THREE.Object3D(); step.name = 'doorstep'; step.position.set(0, floorY, D / 2 + 0.7); group.add(step);

  const tw = new Tweens();
  const state = { open: false };
  const setOpen = (open) => {
    state.open = open;
    const d0 = door.rotation.y, l0 = latch.rotation.z;
    if (open) {
      tw.run('latch', 0.18, (e) => { latch.rotation.z = l0 + (1.4 - l0) * e; }, ease.outCubic);
      return tw.run('door', 0.75, (e) => { door.rotation.y = d0 + (-2.0 - d0) * e; }, ease.outBack);
    }
    tw.run('latch', 0.2, (e) => { latch.rotation.z = l0 * (1 - e); }, ease.outCubic);
    return tw.run('door', 0.5, (e) => { door.rotation.y = d0 * (1 - e); }, ease.outBounce);
  };
  group.userData.kind = 'beachHut';
  group.userData.surface = 'wood';
  group.userData.parts = { door, latch, inside, doorstep: step };
  group.userData.open = () => setOpen(true);
  group.userData.close = () => setOpen(false);
  group.userData.isOpen = () => state.open;
  group.userData.update = (dt) => tw.update(Math.min(dt, 0.05));
  group.userData.size = { width: W + 0.5, depth: D + 1.4, height: topY + rise + 0.4 };
  if (opts.open) { state.open = true; door.rotation.y = -2.0; latch.rotation.z = 1.4; }
  return group;
}

/**
 * Seafront kiosk. kind 'icecream' (giant cone topper, tubs, pastel stripes) or 'tickets' (ferry
 * tickets: clock topper, timetable). parts: topper (Group, pivot at its base), window (seller spot
 * behind the counter), counter. userData.wobble() bounces the topper.
 */
export function kiosk(opts = {}) {
  const kind = opts.kind === 'tickets' ? 'tickets' : 'icecream';
  const rng = rngOf(opts.seed ?? kind, 'kiosk');
  const body = opts.color ?? (kind === 'icecream' ? '#bfeede' : '#3f6f8f');
  const trim = '#fff8ee';
  const W = 2.8, D = 2.1, H = 2.55;
  const kit = new Kit(`kiosk-${kind}`);
  kit.add(cbox(W + 0.3, 0.2, D + 0.3, 0.06), '#c9c2b4', { y: 0.1 });
  // shell: back + sides + lower front + fascia (an open service window between)
  kit.add(cbox(W, H, 0.14, 0.05), body, { y: 0.2 + H / 2, z: -D / 2 + 0.07 });
  for (const s of [-1, 1]) kit.add(cbox(0.14, H, D, 0.05), body, { x: s * (W / 2 - 0.07), y: 0.2 + H / 2, z: 0 });
  kit.add(cbox(W, 1.05, 0.16, 0.05), [shade(body, -0.06), body], { y: 0.2 + 0.52, z: D / 2 - 0.08 });
  for (let i = 0; i < 6; i++) kit.add(box(0.06, 0.8, 0.03), trim, { x: -W / 2 + 0.35 + i * ((W - 0.7) / 5), y: 0.7, z: D / 2 + 0.01 });
  const fasY = 0.2 + H - 0.3;
  kit.add(cbox(W + 0.1, 0.6, 0.2, 0.06), trim, { y: fasY, z: D / 2 - 0.05 });
  kit.add(cbox(W + 0.2, 0.2, D + 0.2, 0.06), shade(body, -0.1), { y: 0.2 + H + 0.1 });
  // counter + interior back panel
  kit.add(cbox(W - 0.1, 0.1, 0.55, 0.03), '#fff1d6', { y: 1.3, z: D / 2 - 0.1 });
  kit.add(box(W - 0.3, H - 0.4, 0.04), shade(body, -0.28), { y: 0.2 + H / 2, z: -D / 2 + 0.16 });
  const text = opts.text ?? (kind === 'icecream' ? 'ICE CREAM' : 'FERRY TICKETS');
  kit.raw(new THREE.PlaneGeometry(W - 0.2, 0.46), signMaterial({ text, bg: kind === 'icecream' ? '#ff7eb6' : '#2f5fd0', fg: '#fff8ee', border: '#fff8ee', accent: kind === 'icecream' ? P.sunflower : P.sunflower, w: 768, h: Math.round(768 / ((W - 0.2) / 0.46)), icon: kind === 'icecream' ? 'candy' : null }), { y: fasY, z: D / 2 + 0.065 });
  kit.at({ y: 0.2 + H - 0.62, z: D / 2 + 0.05 }, () => addAwning(kit, { w: W + 0.1, depth: 0.85, drop: 0.3, colors: kind === 'icecream' ? ['#ff9fc4', '#fff8ee'] : ['#3a6ee8', '#fff8ee'], rng, stripe: 0.4 }));
  if (kind === 'icecream') {
    const flavours = ['#ffb3c6', '#fff1d6', '#a8e6c8', '#7a4a26', '#ffd23f', '#c9a7f5'];
    for (let i = 0; i < 6; i++) kit.add(cyl(0.16, 0.14, 0.14, 10), flavours[i], { x: -W / 2 + 0.45 + i * 0.38, y: 1.42, z: D / 2 - 0.2 });
    // menu board on the side
    kit.at({ x: W / 2 + 0.08, y: 1.5, ry: Math.PI / 2 }, () => {
      kit.add(cbox(1.2, 1.0, 0.06, 0.03), '#3d4a4f', {});
      for (let i = 0; i < 4; i++) kit.add(box(0.8, 0.07, 0.02), flavours[i], { y: 0.3 - i * 0.2, z: 0.04 });
    });
  } else {
    kit.add(cyl(0.2, 0.2, 0.1, 12), P.tomato, { x: -0.8, y: 1.42, z: D / 2 - 0.2 });
    kit.add(box(0.4, 0.3, 0.3), '#fff8ee', { x: 0.7, y: 1.5, z: D / 2 - 0.25 });
    kit.at({ x: W / 2 + 0.08, y: 1.5, ry: Math.PI / 2 }, () => {
      kit.add(cbox(1.2, 1.0, 0.06, 0.03), '#fff8ee', {});
      for (let i = 0; i < 5; i++) kit.add(box(0.85, 0.05, 0.02), i === 0 ? P.cobalt : P.ink, { y: 0.32 - i * 0.16, z: 0.04 });
    });
  }
  const group = kit.build(new THREE.Group());
  group.name = opts.name ?? `kiosk-${kind}`;

  const topper = new THREE.Group();
  topper.name = 'topper';
  const tk = new Kit('kioskTopper');
  if (kind === 'icecream') {
    const coneG = new THREE.ConeGeometry(0.55, 1.5, 12, 3).rotateX(Math.PI).translate(0, 0.75, 0);
    tk.addFaces(coneG, (x, y, z, c) => c.set(((Math.floor(Math.atan2(z, x) * 1.9 + y * 3.2) % 2) + 2) % 2 ? '#e0a45a' : '#c9884a'));
    const sc = opts.scoops ?? ['#ffb3c6', '#fff1d6', '#a8e6c8'];
    tk.add(sphere(0.62, 14, 10), sc[0], { y: 1.72, sy: 0.9 }, materials.glossy);
    tk.add(sphere(0.52, 14, 10), sc[1], { x: -0.12, y: 2.35, sy: 0.9 }, materials.glossy);
    tk.add(sphere(0.42, 14, 10), sc[2], { x: 0.06, y: 2.85, sy: 0.9 }, materials.glossy);
    tk.add(box(0.14, 0.7, 0.14), '#7a4a26', { x: 0.3, y: 2.55, rz: -0.4 });
    tk.add(sphere(0.15, 10, 8), P.tomato, { x: 0.05, y: 3.26 }, materials.glossy);
  } else {
    tk.add(cyl(0.08, 0.1, 1.1, 8), '#fff8ee', { y: 0.55 });
    tk.add(cyl(0.6, 0.6, 0.18, 20), '#2f5fd0', { y: 1.55, rx: Math.PI / 2 });
    tk.add(cyl(0.5, 0.5, 0.2, 20), '#fff8ee', { y: 1.55, rx: Math.PI / 2 });
    tk.add(box(0.06, 0.38, 0.05), P.ink, { y: 1.68, z: 0.12 });
    tk.add(box(0.28, 0.06, 0.05), P.ink, { x: 0.12, y: 1.55, z: 0.12 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      tk.add(cyl(0.035, 0.035, 0.4, 5), '#c9884a', { x: Math.cos(a) * 0.8, y: 1.55 + Math.sin(a) * 0.8, rz: a + Math.PI / 2 });
    }
    tk.add(torus(0.75, 0.05, 4, 20), '#c9884a', { y: 1.55 });
  }
  tk.build(topper);
  topper.position.set(0, 0.2 + H + 0.2, 0);
  group.add(topper);
  const win = new THREE.Object3D(); win.name = 'window'; win.position.set(0, 0.3, -0.2); group.add(win);
  const counter = new THREE.Object3D(); counter.name = 'counter'; counter.position.set(0, 1.35, D / 2 + 0.3); group.add(counter);
  const tw = new Tweens();
  group.userData.kind = 'kiosk';
  group.userData.surface = 'wood';
  group.userData.parts = { topper, window: win, counter };
  group.userData.wobble = (s = 1) => tw.run('wobble', 0.9, (e, k) => {
    const d = Math.sin(k * Math.PI * 5) * (1 - k) * 0.18 * s;
    topper.rotation.z = d;
    topper.scale.set(1 - d * 0.5, 1 + d, 1 - d * 0.5);
  }, ease.linear);
  group.userData.update = (dt) => tw.update(Math.min(dt, 0.05));
  group.userData.size = { width: W + 1.4, depth: D + 1, height: topper.position.y + (kind === 'icecream' ? 3.4 : 2.4) };
  return group;
}

/**
 * The harbour chip shop: a fish & chips shop() with a jammed roller shutter, a release lever and a
 * giant cone-of-chips sign on the roof. parts: shutter, release, queue[] (10 queue spots along the
 * pavement), chipCone, plus the shop parts. userData.openShutter() / closeShutter() -> Promise.
 * opts: text, sub, seed, open (start with the shutter up), floors, wall, queueSide (1 | -1).
 */
export function chipShop(opts = {}) {
  const rng = rngOf(opts.seed ?? 'chippy', 'chippy');
  const g = shop({
    kind: 'fishchips', text: opts.text ?? 'FISH & CHIPS', sub: opts.sub ?? 'The Battered Barnacle', seed: opts.seed ?? 'chippy',
    floors: opts.floors ?? 2, wall: opts.wall ?? '#9cc8ff', roofStyle: opts.roofStyle ?? 'gable', shutter: true,
    shutterOpen: !!opts.open, width: opts.width ?? 7.2, awning: opts.awning, gableFront: false,
  });
  g.name = opts.name ?? 'chipShop';
  g.userData.kind = 'chipShop';
  const parts = g.userData.parts;
  // giant cone of chips astride the ridge
  const cone2 = new THREE.Group();
  cone2.name = 'chipCone';
  const ck = new Kit('chipCone');
  ck.add(new THREE.ConeGeometry(0.7, 1.7, 12).rotateX(Math.PI).translate(0, 0.85, 0), ['#f4f0e6', '#fff8ee']);
  ck.add(cyl(0.72, 0.72, 0.12, 12), '#3a6ee8', { y: 1.62 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + rng.range(-0.2, 0.2);
    ck.add(box(0.16, rng.range(0.7, 1.0), 0.16), '#ffd23f', { x: Math.cos(a) * 0.38, y: 1.95, z: Math.sin(a) * 0.38, rz: Math.cos(a) * 0.3, rx: -Math.sin(a) * 0.3 });
  }
  ck.add(box(0.16, 1.0, 0.16), '#ffe07a', { y: 2.1 });
  ck.add(ico(0.35, 1), '#e9a45c', { x: 0.25, y: 2.2, z: 0.1, sx: 1.8, sy: 0.7, rz: 0.5 });
  ck.build(cone2);
  const ridge = parts.ridge.position;
  cone2.position.set(ridge.x, ridge.y - 0.1, ridge.z);
  g.add(cone2);
  parts.chipCone = cone2;
  // queue spots snaking along the pavement from the door
  const door = parts.door.position;
  const qs = opts.queueSide ?? 1;
  parts.queue = Array.from({ length: 10 }, (_, i) => {
    const o = new THREE.Object3D();
    o.name = 'queue';
    o.position.set(door.x + qs * (0.4 + i * 0.85), 0, door.z + 0.9 + Math.sin(i * 0.9) * 0.2);
    o.rotation.y = -qs * Math.PI / 2;
    g.add(o);
    return o;
  });
  return g;
}
