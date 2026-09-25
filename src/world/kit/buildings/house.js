// Cottage / townhouse generator + terraces. Front faces +Z, origin = footprint centre at ground.
import { THREE, Kit, cbox, prism, rngOf, shade, mix, wobbleColor, clamp, DEG, TAU, stats } from './common.js';
import { box, cyl, ico, cone } from '../../geo.js';
import { hash3 } from '../../../core/rng.js';
import { P, WALLS, ROOFS, CLOTHES } from '../../../gfx/palette.js';
import { addWindow, addWindowBox, addDoor, addChimney, addDrainpipe, addQuoins, addBrickPatch, addClimber, addDormer, addTimbers, CURTAINS, FLOWERS, LEAF } from './facade.js';
import { gableRoof, hipRoof, mansardRoof } from './roofs.js';

export const DOOR_COLORS = [P.tomato, P.cobalt, P.teal, P.sunflower, '#2f7d62', P.bubblegum, P.violet, '#3d4a6b', P.tangerine];
export const BRICKS = ['#c8604a', '#d9785c', '#bd5d47', '#d36e52'];
export const GROUND_FLOOR = 2.9;
export const UPPER_FLOOR = 2.7;

/** Fill in every house option from the seed (explicit opts always win). */
export function resolveHouse(opts = {}) {
  const rng = rngOf(opts.seed ?? 1, 'house');
  const floors = clamp(Math.round(opts.floors ?? rng.pick([1, 2, 2, 2, 3])), 1, 3);
  const roofStyle = opts.roofStyle ?? rng.pick(['gable', 'gable', 'gable', 'hip', 'mansard']);
  const style = opts.style ?? rng.pick(floors === 1 ? ['plain', 'plain', 'quoins', 'brick'] : ['plain', 'quoins', 'tudor', 'brick', 'plain']);
  const wall = opts.wall ?? (style === 'brick' ? rng.pick(BRICKS) : rng.pick(WALLS));
  const lightWall = new THREE.Color(wall).getHSL({}, THREE.SRGBColorSpace).l > 0.8;
  const o = {
    rng,
    seed: opts.seed ?? 1,
    floors,
    roofStyle,
    style,
    wall,
    width: opts.width ?? rng.range(5.4, 7.4),
    depth: opts.depth ?? rng.range(5.2, 6.4),
    roof: opts.roof ?? rng.pick(ROOFS),
    door: opts.door ?? rng.pick(DOOR_COLORS),
    trim: opts.trim ?? (style === 'brick' ? P.white : lightWall && rng.chance(0.4) ? rng.pick([P.cobalt, P.teal, '#2f7d62', P.tomato]) : P.white),
    windowStyle: opts.windowStyle ?? rng.pick(['sash', 'sash', 'roundtop', 'shuttered']),
    shutter: opts.shutter ?? rng.pick([P.teal, P.cobalt, '#2f7d62', P.tomato, P.sunflower, P.violet]),
    windowBoxes: opts.windowBoxes ?? rng.chance(0.65),
    flowers: opts.flowers ?? rng.shuffle(FLOWERS).slice(0, 2),
    chimneys: opts.chimneys ?? (roofStyle === 'mansard' ? 2 : rng.pick([1, 1, 2])),
    drainpipes: opts.drainpipes ?? true,
    gutters: opts.gutters ?? true,
    doorstep: opts.doorstep ?? true,
    number: opts.number ?? rng.int(1, 48),
    porch: opts.porch ?? rng.pick(['none', 'hood', 'gable', 'gable', 'porch']),
    doorStyle: opts.doorStyle ?? rng.pick(['panel', 'panel', 'roundtop', 'stable']),
    gableFront: opts.gableFront ?? (roofStyle === 'gable' && rng.chance(0.35)),
    pitch: (opts.pitch ?? rng.range(40, 48)) * DEG,
    bay: opts.bay ?? rng.chance(0.3),
    climber: opts.climber ?? rng.chance(0.35),
    brickPatch: opts.brickPatch ?? rng.chance(0.4),
    pots: opts.pots ?? rng.chance(0.5),
    gag: opts.gag ?? rng.pick(['none', 'none', 'none', 'gnome', 'birdhouse']),
    balconies: opts.balconies ?? 'none',
    railColor: opts.railColor ?? '#fff8ee',
    base: opts.base ?? 0,
    stairSide: opts.stairSide ?? null,
    washing: opts.washing ?? false,
    groundFloor: opts.groundFloor ?? true,
    wonk: opts.wonk ?? 1,
    lean: opts.lean ?? null,
    sag: opts.sag ?? null,
    backDetail: opts.backDetail ?? true,
    party: opts.party ?? { left: false, right: false },
    chimneyColor: opts.chimneyColor ?? rng.pick([P.brick, P.brick, '#c8604a', wall]),
  };
  o.dormers = opts.dormers ?? ((floors === 1 && roofStyle === 'gable' && !o.gableFront) || roofStyle === 'mansard');
  if (o.gableFront) o.width = opts.width ?? rng.range(5.4, 6.6);
  return o;
}

/** Build one house into `kit` (at the kit's current origin). Returns { parts, size, info }. */
export function buildHouse(kit, opts = {}) {
  const o = resolveHouse(opts);
  const { rng, floors, style } = o;
  const W = o.width, D = o.depth;
  const yW = GROUND_FLOOR + (floors - 1) * UPPER_FLOOR;
  const trim = o.trim;
  const stone = shade(mix(o.wall, P.stone, 0.6), -0.02);
  const wall = o.wall;
  const upperWall = style === 'tudor' ? (opts.upperWall ?? P.wallCream) : wall;
  const jetty = style === 'tudor' ? 0.22 : 0;
  const parts = { chimneyTops: [], windows: [], door: null, ridge: null, number: o.number };
  const fz = D / 2; // front wall plane
  // horizontal bands overhang the side walls by `ext`, except at party walls (flush, no overlap)
  const band = (ext) => {
    const l = o.party.left ? 0 : ext, r = o.party.right ? 0 : ext;
    return { w: W + l + r, x: (r - l) / 2 };
  };

  // ---- body
  const pb = band(0.1);
  kit.add(cbox(pb.w, 0.56, D + 0.2, 0.09), [shade(stone, -0.12), shade(stone, -0.04)], { x: pb.x, y: 0.17 });
  if (style === 'tudor') {
    kit.add(cbox(W, GROUND_FLOOR + 0.1, D, 0.14), [shade(wall, -0.06), wall], { y: (GROUND_FLOOR + 0.1) / 2 });
    const uh = yW - GROUND_FLOOR;
    kit.add(cbox(W + 0.12, uh, D + jetty, 0.12), [shade(upperWall, -0.03), upperWall], { y: GROUND_FLOOR + uh / 2, z: jetty / 2 });
    const jb = band(0.1);
    kit.add(cbox(jb.w, 0.24, D + jetty + 0.1, 0.06), P.woodDark, { x: jb.x, y: GROUND_FLOOR + 0.04, z: jetty / 2 });
  } else {
    kit.add(cbox(W, yW, D, 0.15), [shade(wall, -0.06), wall], { y: yW / 2 });
    for (let f = 1; f < floors; f++) {
      const sb = band(0.07);
      kit.add(cbox(sb.w, 0.17, D + 0.14, 0.05), style === 'brick' ? P.white : shade(stone, 0.04), { x: sb.x, y: GROUND_FLOOR + (f - 1) * UPPER_FLOOR - 0.02 });
    }
  }
  // cornice under the eaves
  const cb = band(0.08);
  kit.add(cbox(cb.w, 0.2, D + 0.16 + jetty, 0.06), trim === P.white ? P.white : shade(stone, 0.06), { x: cb.x, y: yW - 0.1, z: jetty / 2 });
  if (style === 'quoins' || (style === 'brick' && rng.chance(0.5))) {
    const qc = style === 'brick' ? P.white : shade(stone, 0.06);
    for (const sx of [-1, 1]) {
      if ((sx < 0 && o.party.left) || (sx > 0 && o.party.right)) continue;
      addQuoins(kit, { W, D, height: yW, color: qc, sx, sz: 1 });
    }
  }

  // ---- facade layout
  const nCols = opts.cols ?? clamp(Math.round((W - 0.5) / 1.95), 1, 4);
  const colX = (i) => -W / 2 + (W / nCols) * (i + 0.5);
  let doorCol = opts.doorCol ?? (nCols % 2 ? (nCols - 1) / 2 : nCols === 2 ? rng.int(0, 1) : rng.pick([1, 2]));
  doorCol = clamp(doorCol, 0, nCols - 1);
  const winStyle = o.windowStyle;
  const curtain = rng.pick(CURTAINS);
  const wj = () => ({ x: rng.range(-0.04, 0.04) * o.wonk, rz: rng.range(-1.3, 1.3) * DEG * o.wonk });
  const bayCol = o.bay && nCols > 1 ? (doorCol === 0 ? nCols - 1 : 0) : -1;

  // ground floor (skipped for shops / pubs, which add their own frontage)
  const doorX = colX(doorCol);
  if (o.groundFloor !== false) {
    kit.at({ x: doorX, z: fz }, () => {
      addDoor(kit, {
        color: o.door, trim, style: o.doorStyle, hood: o.porch, roofColor: o.roof, rng,
        number: o.number, numberRim: o.door, step: o.doorstep, w: 1.15, h: 2.15,
        numberSide: doorCol === nCols - 1 ? -1 : 1,
      });
      parts.door = kit.anchor('door', { y: 0.2, z: 0.45 });
      if (o.pots) {
        for (const s of [-1, 1]) {
          const px = s * 1.0;
          if (Math.abs(doorX + px) > W / 2 - 0.3) continue;
          kit.add(cyl(0.22, 0.16, 0.4, 10), P.roofTerracotta, { x: px, y: 0.2, z: 0.4 });
          kit.add(ico(0.3, 0), LEAF[0], { x: px, y: 0.62, z: 0.4 });
        }
      }
    });
    if (o.climber) addClimberSafe(kit, { x: doorX + (doorCol === 0 ? 0.95 : -0.95), fz, height: Math.min(yW - 0.6, 3.6), rng, flower: rng.pick([P.bubblegum, P.tomato, '#fff8ee']) });

    for (let i = 0; i < nCols; i++) {
      if (i === doorCol) continue;
      const x = colX(i);
      if (i === bayCol) {
        addBay(kit, { x, z: fz, w: Math.min(2.1, W / nCols - 0.2), trim, wall: style === 'tudor' ? wall : wall, roof: o.roof, rng, curtains: curtain });
        parts.windows.push(kit.anchor('window', { x, y: 1.55, z: fz + 0.8 }));
        continue;
      }
      kit.at({ x: x + wj().x, y: 0.85, z: fz, rz: wj().rz }, () => {
        addWindow(kit, { w: 1.15, h: 1.4, style: winStyle, trim, shutter: winStyle === 'shuttered' ? o.shutter : null, curtains: rng.chance(0.7) ? curtain : null, rng, keystone: style !== 'tudor' && rng.chance(0.4) });
        if (o.windowBoxes && rng.chance(0.5)) addWindowBox(kit, { w: 1.15, rng, flowers: o.flowers, color: rng.chance(0.5) ? P.woodDark : o.door });
        parts.windows.push(kit.anchor('window', { y: 0.7, z: 0.1 }));
      });
    }
  }
  // upper floors
  parts.balconies = [];
  const balconyInfo = [];
  for (let f = 1; f < floors; f++) {
    const base = GROUND_FLOOR + (f - 1) * UPPER_FLOOR;
    const z = fz + jetty;
    const balc = o.balconies === 'all' || (o.balconies === 'top' && f === floors - 1) || (o.balconies === 'first' && f === 1);
    if (style === 'tudor') {
      kit.at({ y: base + 0.1, z }, () => addTimbers(kit, { w: W + 0.1, h: UPPER_FLOOR - 0.12, rng, cols: nCols * 2 }));
    }
    for (let i = 0; i < nCols; i++) {
      const x = colX(i);
      const small = i === doorCol && nCols % 2 === 1 && !balc;
      const w = small ? 0.8 : balc ? 1.0 : 1.05;
      const h = balc ? 2.0 : f === floors - 1 && floors === 3 ? 1.15 : 1.3;
      const j = wj();
      kit.at({ x: x + j.x, y: base + (balc ? 0.2 : 0.82), z: z + (style === 'tudor' ? 0.06 : 0), rz: balc ? 0 : j.rz }, () => {
        const top3 = f === 2; // third floor of a 3-floor house: keep it light
        addWindow(kit, { w, h, style: balc || top3 || (small && winStyle === 'shuttered') ? 'sash' : winStyle, trim, shutter: winStyle === 'shuttered' && !small && !top3 ? o.shutter : null, curtains: !top3 && rng.chance(0.75) ? curtain : null, rng });
        if (o.windowBoxes && !small && !balc && (floors < 3 || f === 1)) addWindowBox(kit, { w, rng, flowers: o.flowers, color: rng.chance(0.6) ? P.woodDark : o.door });
        parts.windows.push(kit.anchor('window', { y: h / 2, z: 0.1 }));
      });
    }
    if (balc) {
      const bw = W - 0.5, bd = 1.0, by = base + 0.04;
      const rc = o.railColor;
      kit.at({ y: by, z }, () => {
        kit.add(cbox(bw, 0.2, bd, 0.06), shade(trim === P.white ? '#e9e1d2' : trim, -0.02), { y: -0.08, z: bd / 2 });
        for (const bx of [-bw / 2 + 0.35, bw / 2 - 0.35]) kit.add(prism([[0, 0], [bd - 0.12, 0], [0, -0.55]], 0.14), rc, { x: bx, y: -0.18, ry: -Math.PI / 2 });
        const nP = Math.max(3, Math.round(bw / 0.36));
        for (let k = 0; k <= nP; k++) kit.add(box(0.06, 0.8, 0.06), rc, { x: -bw / 2 + 0.1 + (k / nP) * (bw - 0.2), y: 0.42, z: bd - 0.1 });
        kit.add(cbox(bw, 0.09, 0.12, 0.03), rc, { y: 0.86, z: bd - 0.1 });
        kit.add(box(bw - 0.1, 0.05, 0.06), rc, { y: 0.1, z: bd - 0.1 });
        for (const sx of [-1, 1]) {
          kit.add(cbox(0.1, 0.09, bd, 0.03), rc, { x: sx * (bw / 2 - 0.06), y: 0.86, z: bd / 2 });
          kit.add(box(0.06, 0.8, 0.06), rc, { x: sx * (bw / 2 - 0.06), y: 0.42, z: 0.15 });
        }
        for (const sx of [-1, 1]) {
          if (!rng.chance(0.75)) continue;
          kit.add(cyl(0.16, 0.12, 0.3, 8), P.roofTerracotta, { x: sx * (bw / 2 - 0.35), y: 0.17, z: 0.35 });
          kit.add(ico(0.24, 0), LEAF[1], { x: sx * (bw / 2 - 0.35), y: 0.45, z: 0.35 });
          kit.add(ico(0.1, 0), rng.pick(o.flowers), { x: sx * (bw / 2 - 0.35) + 0.1, y: 0.58, z: 0.45 });
        }
      });
      parts.balconies.push(kit.anchor('balcony', { y: by + 0.02, z: z + bd / 2 }));
      balconyInfo.push({ y: by, z, bw, bd });
    }
  }
  if (o.brickPatch && style !== 'brick' && style !== 'tudor' && o.groundFloor !== false) {
    const px = colX(doorCol === 0 ? nCols - 1 : 0) + rng.range(-0.3, 0.3);
    kit.at({ z: fz }, () => addBrickPatch(kit, { x: clamp(px, -W / 2 + 0.7, W / 2 - 0.7), y: rng.pick([0.55, yW - 0.55]), rng, wall }));
  }

  // ---- sides & back (cheaper windows)
  if (o.backDetail) {
    const sideWins = D >= 4.6 ? 1 : 0;
    for (const s of [-1, 1]) {
      if ((s < 0 && o.party.left) || (s > 0 && o.party.right)) continue;
      for (let f = 0; f < Math.min(floors, 2) && sideWins; f++) {
        const base = f === 0 ? 0.95 : GROUND_FLOOR + (f - 1) * UPPER_FLOOR + 0.85;
        kit.at({ x: s * W / 2, y: base, z: -0.3, ry: s * Math.PI / 2 }, () => addWindow(kit, { w: 0.9, h: 1.15, style: 'simple', trim }));
      }
    }
    for (let f = 0; f < floors; f++) {
      const base = f === 0 ? 0.95 : GROUND_FLOOR + (f - 1) * UPPER_FLOOR + 0.85;
      for (const s of nCols >= 3 && floors < 3 ? [-1, 1] : [0]) {
        kit.at({ x: s * W * 0.27, y: base, z: -D / 2, ry: Math.PI }, () => addWindow(kit, { w: 0.95, h: 1.15, style: 'simple', trim }));
      }
    }
  }

  // ---- brick accents: a few lighter / darker bricks in the piers so brick reads as brick from afar
  if (style === 'brick') {
    const piers = (x) => Array.from({ length: nCols }, (_, i) => colX(i)).every((cx) => Math.abs(x - cx) > 0.9);
    const n = Math.round(W * yW * 0.45);
    for (let i = 0; i < n; i++) {
      const x = rng.range(-W / 2 + 0.25, W / 2 - 0.25), y = rng.range(0.55, yW - 0.35);
      if (!piers(x)) continue;
      kit.add(box(0.32, 0.12, 0.05), wobbleColor(rng, shade(wall, rng.chance(0.5) ? 0.1 : -0.09), 0.02), { x, y, z: fz + 0.012 });
    }
    for (const sx of [-1, 1]) {
      if ((sx < 0 && o.party.left) || (sx > 0 && o.party.right)) continue;
      for (let i = 0; i < Math.round(D * yW * 0.18); i++) {
        const z = rng.range(-D / 2 + 0.25, D / 2 - 0.25), y = rng.range(0.55, yW - 0.35);
        if (Math.abs(z + 0.3) < 0.85) continue;
        kit.add(box(0.05, 0.11, 0.3), wobbleColor(rng, shade(wall, rng.chance(0.5) ? 0.07 : -0.07), 0.02), { x: sx * (W / 2 + 0.012), y, z });
      }
    }
  }

  // ---- stone base for hillside stacking (house floor at y = 0, base down to -base)
  if (o.base > 0) {
    const bh = o.base, front = 1.6;
    const bd = D + 0.4 + front;
    kit.addFaces(box(W + 0.4, bh, bd), (x, y, z, c) => {
      const i = Math.floor((y + 50) / 0.45);
      const h = hash3(Math.floor((x + z + (i % 2) * 0.55) / 1.1), i, 7.7);
      c.set(shade(h > 0.75 ? '#d8d0c1' : h < 0.25 ? '#968d7e' : '#bdb4a4', (h - 0.5) * 0.05));
    }, { y: -bh / 2 - 0.02, z: front / 2 });
    kit.add(cbox(W + 0.5, 0.12, bd + 0.1, 0.04), '#d8d0c1', { y: -0.05, z: front / 2 });
    // terrace railing along the front edge
    const tz = D / 2 + front + 0.1;
    for (let k = 0; k <= Math.round(W / 0.5); k++) kit.add(box(0.06, 0.7, 0.06), o.railColor, { x: -W / 2 + (k / Math.round(W / 0.5)) * W, y: 0.35, z: tz });
    kit.add(cbox(W + 0.1, 0.08, 0.1, 0.03), o.railColor, { y: 0.72, z: tz });
    // stairs down one side
    const ss = o.stairSide ?? (doorCol === 0 ? -1 : 1);
    const n = Math.ceil(bh / 0.3);
    for (let i = 0; i < n; i++) {
      const top = -0.3 * (i + 1) + 0.08;
      const hgt = top + bh;
      if (hgt <= 0.05) break;
      kit.add(box(0.4, hgt, 1.2), i % 2 ? '#c9c0b1' : '#bdb4a4', { x: ss * (W / 2 + 0.4 + i * 0.4), y: -bh + hgt / 2, z: D / 2 + front - 0.6 });
    }
    parts.stairFoot = kit.anchor('stairFoot', { x: ss * (W / 2 + 0.6 + n * 0.4), y: -bh, z: D / 2 + front - 0.6 });
  }

  // ---- roof
  const roofTop = buildRoof(kit, o, { W, D, yW, jetty, wall: upperWall, trim, colX, nCols, parts });

  // ---- visual gags
  if (o.gag === 'birdhouse') {
    const sx = o.party.right ? -1 : o.party.left ? 1 : rng.sign();
    kit.at({ x: sx * (W / 2), y: Math.min(yW - 0.9, 3.6), z: -0.2 + (o.backDetail ? 0.9 : 0), ry: sx * Math.PI / 2 }, () => {
      const bc = rng.pick([P.sunflower, P.teal, P.bubblegum, P.tomato]);
      kit.add(box(0.08, 0.5, 0.08), P.woodDark, { y: -0.2, z: 0.06 });
      kit.add(cbox(0.38, 0.42, 0.34, 0.04), bc, { y: 0.1, z: 0.28 });
      for (const s2 of [-1, 1]) kit.add(cbox(0.3, 0.05, 0.44, 0.02), P.roofTerracotta, { x: s2 * 0.12, y: 0.39, z: 0.28, rz: -s2 * 0.7 });
      kit.add(cyl(0.07, 0.07, 0.02, 10), P.ink, { y: 0.14, z: 0.455, rx: Math.PI / 2 });
      kit.add(cyl(0.015, 0.015, 0.14, 4), P.woodDark, { y: 0.02, z: 0.5, rx: Math.PI / 2 });
    });
  }

  // ---- wonk: gentle lean + sagging ridge
  const lean = o.lean ?? rng.range(-1, 1) * 0.02 * o.wonk;
  const leanZ = rng.range(-1, 1) * 0.007 * o.wonk;
  if (o.roofStyle === 'gable') {
    const sag = o.sag ?? rng.range(0.1, 0.2) * o.wonk;
    const along = o.gableFront ? 'z' : 'x';
    const L = o.gableFront ? D : W;
    const hR = roofTop - yW;
    kit.warp((v) => {
      const u = clamp((2 * v[along]) / (L + 0.8), -1, 1);
      v.y -= sag * (1 - u * u) * clamp((v.y - yW) / hR, 0, 1);
    });
  }
  if (!o.party.left && !o.party.right) kit.warp((v) => { v.x += v.y * lean; v.z += v.y * leanZ; });

  parts.ridge = kit.anchor('ridge', { y: roofTop, z: 0 });
  if (o.gag === 'gnome') {
    const g = makeGnome(rng);
    const along = o.gableFront && o.roofStyle === 'gable';
    const off = rng.range(-0.25, 0.25) * (along ? D : W) * (o.roofStyle === 'gable' ? 1 : 0.2);
    kit.place(g, { x: along ? 0 : off, y: roofTop + (o.roofStyle === 'gable' ? 0.1 : 0.02), z: along ? off : jetty / 2, ry: rng.range(-0.5, 0.5) });
    parts.gnome = g;
  }
  if (o.washing && balconyInfo.length) {
    const b = balconyInfo[balconyInfo.length - 1];
    const wash = makeWashing(rng, b.bw - 0.2);
    kit.place(wash, { y: b.y + 1.35, z: b.z + b.bd - 0.1 });
    for (const sx of [-1, 1]) kit.add(cyl(0.025, 0.025, 0.55, 5), '#8f877a', { x: sx * (b.bw / 2 - 0.12), y: b.y + 1.1, z: b.z + b.bd - 0.1 });
    parts.washing = wash;
  }
  return { parts, size: { width: W, depth: D + jetty + (o.base > 0 ? 1.6 : 0), height: roofTop }, options: o };
}

/** Garden gnome (separate little Group so a job can knock it off the roof). ~0.7 m. */
export function makeGnome(rng) {
  const k = new Kit('gnome');
  const coat = rng ? rng.pick([P.cobalt, '#2f7d62', P.teal]) : P.cobalt;
  k.add(cyl(0.16, 0.2, 0.32, 10), coat, { y: 0.16 });
  k.add(ico(0.13, 1), P.skin[0], { y: 0.4 });
  k.add(ico(0.045, 0), '#ff8a80', { y: 0.39, z: 0.13 });
  k.add(cone(0.14, 0.26, 8), '#fff8ee', { y: 0.28, z: 0.08, rx: Math.PI + 0.35 });
  k.add(cone(0.15, 0.42, 10), P.tomato, { y: 0.66, rx: -0.15 });
  for (const s of [-1, 1]) k.add(box(0.08, 0.06, 0.14), P.woodDark, { x: s * 0.08, y: 0.03, z: 0.1 });
  const g = k.build(new THREE.Group());
  g.name = 'gnome';
  return g;
}

/** A sagging washing line with clothes (separate Group; userData.update makes it flap). */
export function makeWashing(rng, span = 3) {
  const k = new Kit('washing');
  const pts = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector3(-span / 2 + t * span, -Math.sin(Math.PI * t) * 0.14, 0)); }
  k.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.015, 4), '#f4f0e6');
  const n = Math.max(3, Math.round(span / 0.55));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = -span / 2 + t * span;
    const y = -Math.sin(Math.PI * t) * 0.14;
    const c = rng.pick(CLOTHES);
    const kind = rng.pick(['shirt', 'shirt', 'trousers', 'towel', 'sock', 'sock']);
    if (kind === 'shirt') {
      k.add(box(0.38, 0.42, 0.03), c, { x, y: y - 0.23 });
      k.add(box(0.62, 0.13, 0.03), c, { x, y: y - 0.07 });
    } else if (kind === 'trousers') {
      for (const s of [-1, 1]) k.add(box(0.14, 0.52, 0.03), c, { x: x + s * 0.09, y: y - 0.3 });
      k.add(box(0.34, 0.1, 0.03), c, { x, y: y - 0.05 });
    } else if (kind === 'towel') {
      k.add(box(0.42, 0.55, 0.025), c, { x, y: y - 0.28 });
      k.add(box(0.42, 0.06, 0.03), '#fff8ee', { x, y: y - 0.47 });
    } else {
      k.add(box(0.09, 0.26, 0.03), c, { x, y: y - 0.14 });
      k.add(box(0.16, 0.08, 0.03), c, { x: x + 0.04, y: y - 0.26 });
    }
  }
  const g = k.build(new THREE.Group());
  g.name = 'washing';
  const phase = rng.range(0, TAU);
  g.userData.update = (dt, t) => { g.rotation.x = Math.sin(t * 1.6 + phase) * 0.14 + Math.sin(t * 3.7 + phase) * 0.04; };
  return g;
}

function addClimberSafe(kit, { x, fz, height, rng, flower }) {
  kit.at({ z: fz }, () => addClimber(kit, { x, height, rng, flower, spread: 0.45 }));
}

/** Ground-floor bay window: a projecting box with three glazed faces and a little lead roof. */
function addBay(kit, { x, z, w, trim, wall, roof, rng, curtains }) {
  const d = 0.75, h = 2.15;
  kit.at({ x, z }, () => {
    kit.add(cbox(w + 0.3, 0.75, d + 0.15, 0.07), shade(wall, -0.05), { y: 0.36, z: d / 2 });
    kit.at({ y: 0.72, z: d + 0.02 }, () => addWindow(kit, { w: w - 0.5, h: 1.35, style: 'sash', trim, curtains, rng, frame: 0.12 }));
    for (const s of [-1, 1]) {
      kit.at({ x: s * (w / 2 + 0.1), y: 0.72, z: d / 2 + 0.02, ry: s * Math.PI / 2 }, () => addWindow(kit, { w: 0.4, h: 1.35, style: 'sash', trim, rng, frame: 0.1 }));
    }
    kit.add(cbox(w + 0.25, 0.18, d + 0.2, 0.05), trim, { y: h + 0.04, z: d / 2 + 0.02 });
    kit.add(cbox(w + 0.45, 0.28, d + 0.35, 0.1), shade(roof, -0.05), { y: h + 0.26, z: d / 2 + 0.05, rx: -8 * DEG });
  });
}

function buildRoof(kit, o, { W, D, yW, jetty, wall, trim, colX, nCols, parts }) {
  const { rng } = o;
  const style = o.roofStyle;
  const chimneyColor = o.chimneyColor;
  const potColor = rng.pick([P.roofTerracotta, P.roofTerracotta, '#b85a3c', P.stoneDark]);
  let roofTop = yW + 2;
  const addPipe = (gx, gy, gz) => {
    if (!o.drainpipes) return;
    kit.at({}, () => addDrainpipe(kit, { x: clamp(gx, -W / 2 + 0.22, W / 2 - 0.22), zWall: D / 2 + jetty * (gy > 3 ? 1 : 0), gutter: [clamp(gx, -W / 2 + 0.22, W / 2 - 0.22), gy, gz] }));
  };
  const sideX = o.party.right ? -1 : o.party.left ? 1 : rng.sign();

  if (style === 'gable' && !o.gableFront) {
    const r = gableRoof(kit, {
      span: D + jetty, length: W, yW, pitch: o.pitch, color: o.roof, rng, gable: wall,
      ovL: o.party.left ? 0.02 : 0.32, ovR: o.party.right ? 0.02 : 0.32,
      barge: o.party.left || o.party.right ? null : rng.chance(0.5) ? trim : null,
      gutter: o.gutters ? P.metalDark : null,
    });
    roofTop = r.ridgeY;
    kit.at({ z: jetty / 2 }, () => {
      const ends = o.chimneys >= 2 ? [-1, 1] : [sideX];
      for (const s of ends) {
        const party = (s < 0 && o.party.left) || (s > 0 && o.party.right);
        const cx = party ? s * W / 2 : s * (W / 2 - 0.55);
        parts.chimneyTops.push(...addChimney(kit, {
          x: cx, z: rng.range(-0.15, 0.15), baseY: yW - 0.2, topY: r.ridgeY + rng.range(0.7, 1.3), rng,
          color: chimneyColor, potColor, pots: rng.int(1, o.floors >= 3 ? 2 : 3), lean: (party ? 0 : s) * rng.range(0.5, 3) * DEG * Math.min(1, o.wonk), leanX: rng.range(-1.5, 1.5) * DEG * Math.min(1, o.wonk), w: party ? 1.1 : 0.95,
        }));
      }
    });
    if (o.gutters) {
      const g = r.gutters.find((q) => q.side === 1);
      if (g) addPipe(-sideX * (W / 2 - 0.22), g.y, g.z + jetty / 2);
    }
    if (o.dormers) {
      const ys = yW + 0.75;
      const zf = (r.ridgeY - 0.04 - ys) / Math.tan(r.pitch) + jetty / 2;
      const cols = nCols >= 3 ? [0, nCols - 1] : nCols === 2 ? [0, 1] : [0];
      for (const i of cols) {
        kit.at({ x: colX(i), y: ys - 0.08, z: zf }, () => {
          addDormer(kit, { w: 1.55, h: 1.55, depth: 1.55 / Math.tan(r.pitch) + 0.5, wall, roof: o.roof, trim, rng, windowStyle: o.windowStyle, curtains: rng.pick(CURTAINS) });
          parts.windows.push(kit.anchor('window', { y: 0.7, z: 0.1 }));
        });
      }
    }
  } else if (style === 'gable') {
    // gable faces the street: build rotated so the ridge runs front-to-back
    let r;
    kit.at({ ry: Math.PI / 2, z: jetty / 2 }, () => {
      r = gableRoof(kit, {
        span: W, length: D + jetty, yW, pitch: o.pitch, color: o.roof, rng, gable: wall, barge: trim,
        ovL: 0.42, ovR: 0.36, gutter: o.gutters ? P.metalDark : null,
      });
    });
    roofTop = r.ridgeY;
    // attic window in the front gable
    const attic = r.hR > 1.9;
    if (attic) {
      kit.at({ y: yW + 0.3, z: D / 2 + jetty }, () => {
        addWindow(kit, { w: 0.85, h: Math.min(1.25, r.hR - 0.95), style: 'roundtop', trim, rng, curtains: rng.pick(CURTAINS) });
        parts.windows.push(kit.anchor('window', { y: 0.6, z: 0.1 }));
      });
    }
    const cx = sideX * (W / 2 - 1.25);
    parts.chimneyTops.push(...addChimney(kit, {
      x: cx, z: -D / 2 + 1.1, baseY: yW - 0.2, topY: r.ridgeY + rng.range(0.3, 0.8), rng, color: chimneyColor, potColor,
      pots: rng.int(1, 2), lean: rng.range(-2.5, 2.5) * DEG * Math.min(1, o.wonk),
    }));
    if (o.drainpipes && o.gutters) {
      // down the side wall near the front corner
      const gx = -sideX * (W / 2 + 0.38 - 0.08);
      const gy = r.eaveY - 0.12;
      kit.at({ x: -sideX * W / 2, z: D / 2 - 0.35, ry: -sideX * Math.PI / 2 }, () => {
        addDrainpipe(kit, { x: 0, zWall: 0, gutter: [0, gy, 0.3] });
      });
    }
  } else if (style === 'hip') {
    const r = hipRoof(kit, { W: W + 0.02, D: D + jetty, yW, pitch: o.pitch * 0.85, color: o.roof, rng, gutter: o.gutters ? P.metalDark : null });
    roofTop = r.ridgeY;
    const ends = o.chimneys >= 2 ? [-1, 1] : [sideX];
    for (const s of ends) {
      parts.chimneyTops.push(...addChimney(kit, {
        x: s * Math.max(0.6, W / 2 - 1.3), z: -0.35 + jetty / 2, baseY: yW, topY: r.ridgeY + rng.range(0.6, 1.1), rng,
        color: chimneyColor, potColor, pots: rng.int(1, 2), lean: s * rng.range(0, 2) * DEG * Math.min(1, o.wonk),
      }));
    }
    if (o.gutters) addPipe(-sideX * (W / 2 - 0.22), r.gutters[0].y, r.gutters[0].z + jetty / 2);
  } else if (style === 'flat') {
    // flat roof terrace with a parapet, stair hut, chimney and a water tank
    const pw = W + 0.16, pd = D + jetty + 0.16, zc = jetty / 2;
    kit.add(cbox(pw, 0.3, pd, 0.06), shade(wall, -0.1), { y: yW + 0.05, z: zc });
    kit.add(box(pw - 0.3, 0.05, pd - 0.3), '#d9cfc0', { y: yW + 0.21, z: zc });
    for (const [x, z, w, d] of [[0, pd / 2 - 0.1, pw, 0.2], [0, -pd / 2 + 0.1, pw, 0.2], [pw / 2 - 0.1, 0, 0.2, pd - 0.4], [-pw / 2 + 0.1, 0, 0.2, pd - 0.4]]) {
      kit.add(box(w, 0.72, d), wall, { x, y: yW + 0.52, z: z + zc });
      kit.add(cbox(w + 0.08, 0.1, d + 0.08, 0.03), trim, { x, y: yW + 0.92, z: z + zc });
    }
    const hx = -sideX * Math.max(0, W / 2 - 1.1), hz = zc - D / 2 + 1.1;
    kit.add(cbox(1.3, 1.15, 1.5, 0.08), wall, { x: hx, y: yW + 0.8, z: hz });
    kit.add(cbox(1.5, 0.14, 1.7, 0.05), trim, { x: hx, y: yW + 1.42, z: hz });
    kit.add(box(0.7, 0.95, 0.06), o.door, { x: hx, y: yW + 0.72, z: hz + 0.76 });
    kit.add(cyl(0.38, 0.38, 0.75, 10), '#8fa3b3', { x: -hx * 0.6, y: yW + 0.62, z: zc - D / 4 });
    kit.add(cyl(0.4, 0.4, 0.06, 10), '#6b7f8f', { x: -hx * 0.6, y: yW + 1.02, z: zc - D / 4 });
    parts.chimneyTops.push(...addChimney(kit, {
      x: sideX * (W / 2 - 0.55), z: zc - 0.4, baseY: yW, topY: yW + rng.range(1.7, 2.3), rng, color: chimneyColor, potColor,
      pots: rng.int(1, 2), lean: rng.range(-2, 2) * DEG * Math.min(1, o.wonk), w: 0.8, d: 0.62,
    }));
    roofTop = yW + 1.5;
    if (o.drainpipes) kit.at({}, () => addDrainpipe(kit, { x: -sideX * (W / 2 - 0.22), zWall: D / 2 + jetty, gutter: [-sideX * (W / 2 - 0.22), yW + 0.1, D / 2 + jetty + 0.12] }));
  } else {
    const r = mansardRoof(kit, { W: W + 0.02, D: D + jetty, yW, color: o.roof, rng, trim, gutter: o.gutters ? P.metalDark : null });
    roofTop = r.ridgeY;
    for (const s of o.chimneys >= 2 ? [-1, 1] : [sideX]) {
      parts.chimneyTops.push(...addChimney(kit, {
        x: s * (W / 2 - 0.95), z: jetty / 2 - 0.3, baseY: yW, topY: r.ridgeY + rng.range(0.6, 1.0), rng,
        color: chimneyColor, potColor, pots: 2, lean: s * rng.range(0, 1.5) * DEG * Math.min(1, o.wonk), w: 0.8, d: 1.1,
      }));
    }
    // dormers in the steep slope (evenly spaced, max 3)
    const nd = Math.min(nCols, 3);
    for (let i = 0; i < nd; i++) {
      const y0 = r.base + 0.3;
      const zf = r.slopeZ(y0) + 0.12 + jetty / 2;
      const dx = nd === nCols ? colX(i) : -W / 2 + (W / nd) * (i + 0.5);
      kit.at({ x: dx, y: y0, z: zf }, () => {
        addDormer(kit, { w: 1.25, h: 1.45, depth: 1.2, wall: trim === P.white ? P.white : wall, roof: o.roof, trim: trim === P.white ? P.cobalt : trim, rng, windowStyle: 'sash', detail: false });
        parts.windows.push(kit.anchor('window', { y: 0.65, z: 0.1 }));
      });
    }
    if (o.gutters) addPipe(-sideX * (W / 2 - 0.22), r.gutters[0].y, r.gutters[0].z + jetty / 2);
  }
  return roofTop;
}

/**
 * A single house as a THREE.Group (<= 3-4 draw calls: toy, glossy windows, number decal, gnome).
 * Stays within opts.budget triangles (default 5000) by dropping optional extras the caller did not
 * ask for explicitly (climber, brick patch, pots, back windows).
 */
export function house(opts = {}) {
  const budget = opts.budget ?? 5000;
  const trims = [{}, { climber: false }, { climber: false, brickPatch: false, pots: false }, { climber: false, brickPatch: false, pots: false, backDetail: false, gag: 'none' }];
  let group = null;
  for (let i = 0; i < trims.length; i++) {
    const kit = new Kit('house');
    const { parts, size, options } = buildHouse(kit, { ...trims[i], ...opts });
    group = kit.build(new THREE.Group());
    group.name = opts.name ?? `house-${options.number}`;
    group.userData.kind = 'house';
    group.userData.parts = parts;
    group.userData.size = size;
    group.userData.options = { ...options, rng: undefined };
    if (i === trims.length - 1 || stats(group).tris <= budget) break;
    group.traverse((o) => o.geometry?.dispose());
  }
  return group;
}

/**
 * A row of joined houses with varied colours, heights and roofs (shared party walls and chimneys).
 * opts: seed, depth, floors (fixed or [min,max]), widths [min,max], startNumber, numberStep,
 * walls (palette list), roof (single colour or undefined for varied), roofStyle ('gable'|'mixed').
 * Returns one Group with merged meshes and userData.parts.houses[i] (per-house anchors).
 */
export function terrace(count = 4, opts = {}) {
  const rng = rngOf(opts.seed ?? 1, 'terrace');
  const depth = opts.depth ?? rng.range(5.4, 6.2);
  const [wMin, wMax] = opts.widths ?? [4.6, 6.0];
  const floorsOpt = opts.floors ?? [2, 3];
  const walls = rng.shuffle(opts.walls ?? WALLS);
  const sharedRoof = opts.roof ?? (rng.chance(0.5) ? rng.pick(ROOFS) : null);
  const widths = [];
  for (let i = 0; i < count; i++) widths.push(Array.isArray(opts.width) ? opts.width[i] : opts.width ?? rng.range(wMin, wMax));
  const total = widths.reduce((a, b) => a + b, 0);
  const kit = new Kit('terrace');
  const houses = [];
  let x = -total / 2;
  let prevFloors = -1;
  for (let i = 0; i < count; i++) {
    const w = widths[i];
    let floors = Array.isArray(floorsOpt) ? rng.int(floorsOpt[0], floorsOpt[1]) : floorsOpt;
    if (floors === prevFloors && rng.chance(0.3) && Array.isArray(floorsOpt)) floors = floors === floorsOpt[0] ? floorsOpt[1] : floorsOpt[0];
    prevFloors = floors;
    const sub = new Kit(`terrace-${i}`);
    const res = buildHouse(sub, {
      seed: `${opts.seed ?? 1}-t${i}`, width: w, depth: depth + rng.range(-0.06, 0.06), floors,
      wall: walls[i % walls.length], roof: sharedRoof ?? rng.pick(ROOFS),
      roofStyle: opts.roofStyle === 'mixed' ? rng.pick(['gable', 'gable', 'hip', 'mansard']) : 'gable',
      gableFront: false, party: { left: i > 0, right: i < count - 1 }, chimneys: 1,
      number: (opts.startNumber ?? 1) + i * (opts.numberStep ?? 2), bay: rng.chance(0.3), wonk: 0.8,
      style: opts.style ?? rng.pick(['plain', 'plain', 'quoins', 'brick', 'tudor']), cols: w < 5 ? 2 : undefined,
      ...(opts.house || {}),
    });
    const cx = x + w / 2;
    const zOff = rng.range(-0.08, 0.08);
    kit.absorb(sub, new THREE.Matrix4().makeTranslation(cx, 0, zOff));
    houses.push({ ...res.parts, x: cx, width: w });
    x += w;
  }
  const group = kit.build(new THREE.Group());
  group.name = opts.name ?? 'terrace';
  group.userData.kind = 'terrace';
  group.userData.parts = {
    houses,
    chimneyTops: houses.flatMap((h) => h.chimneyTops),
    windows: houses.flatMap((h) => h.windows),
    doors: houses.map((h) => h.door),
  };
  group.userData.size = { width: total, depth };
  return group;
}
