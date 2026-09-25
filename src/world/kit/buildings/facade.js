// Facade parts shared by houses, shops, the pub and the church. Every function works in the
// kit's current frame: wall surface = plane z=0, +Z points out of the wall, origin at the
// bottom-centre of the element.
import { THREE, materials, cbox, prism, extrude, archPath, lancetPath, cylBetween, shade, hsl, mix, wobbleColor, DEG } from './common.js';
import { box, cyl, sphere, ico, torus } from '../../geo.js';
import { P } from '../../../gfx/palette.js';
import { numberPlate } from './signs.js';

export const GLASS = ['#3478bd', '#a9dcfa'];
export const GLASS_DARK = ['#2b5f96', '#79bfe9'];
export const STREAK = '#f4fcff';
export const CURTAINS = ['#fff1d6', '#ffb8c2', '#ffe590', '#c2e4ff', '#ff9fc4', '#fff8ee', '#bfe8cc'];
export const FLOWERS = [P.tomato, P.bubblegum, P.sunflower, '#ffffff', P.violet, P.tangerine, '#ff4f7b'];
export const LEAF = ['#4f9a3c', '#6cbf4a'];

/**
 * Window. opts: w, h, style ('sash'|'roundtop'|'shuttered'|'simple'|'lancet'|'leaded'), trim,
 * sillColor, headColor, shutter (colour), curtains (colour|null), keystone, rng, glass ([bottom, top]).
 * Returns the pane centre y (for anchors).
 */
export function addWindow(kit, o = {}) {
  const w = o.w ?? 1, h = o.h ?? 1.3;
  const style = o.style ?? 'sash';
  const trim = o.trim ?? P.white;
  const sillColor = o.sillColor ?? trim;
  const headColor = o.headColor ?? trim;
  const glass = o.glass ?? GLASS;
  const fw = o.frame ?? 0.14;
  const glossy = materials.glossy;

  if (style === 'simple') {
    // cheap window for sides/backs: surround slab + raised pane + one bar
    kit.add(cbox(w + 0.26, h + 0.26, 0.1, 0.05), trim, { y: h / 2, z: 0.03 });
    kit.add(box(w, h, 0.06), glass, { y: h / 2, z: 0.1 }, glossy);
    kit.add(box(0.07, h, 0.04), trim, { y: h / 2, z: 0.14 });
    kit.add(cbox(w + 0.4, 0.13, 0.26, 0.04), sillColor, { y: -0.12, z: 0.1 });
    return h / 2;
  }

  const arched = style === 'roundtop' || style === 'lancet';
  const hs = arched ? h - w / 2 : h; // spring line
  // pane (recessed behind the frame)
  if (arched) {
    const shape = style === 'lancet' ? lancetPath(w + 0.04, h + 0.02) : archPath(w + 0.04, h + 0.02);
    kit.add(extrude(shape, 0.06, { curveSegments: 1 }), glass, { z: -0.01 }, glossy);
  } else {
    kit.add(box(w + 0.04, h + 0.04, 0.06), glass, { y: h / 2, z: -0.01 }, glossy);
  }
  // glazing bars
  const bar = 0.065;
  if (style === 'leaded') {
    for (const fx of [-1 / 6, 1 / 6]) kit.add(box(bar * 0.8, h, 0.05), trim, { x: fx * w * 1.5 * 0.66, y: h / 2, z: 0.03 });
    for (const fy of [0.34, 0.67]) kit.add(box(w, bar * 0.8, 0.05), trim, { y: h * fy, z: 0.03 });
  } else {
    kit.add(box(bar, arched ? h - 0.05 : h, 0.05), trim, { y: (arched ? h - 0.05 : h) / 2, z: 0.03 });
    kit.add(box(w, bar * 1.2, 0.06), trim, { y: arched ? hs : h * 0.52, z: 0.03 });
    if (style === 'roundtop') {
      for (const s of [-1, 1]) {
        kit.add(box(bar, w * 0.46, 0.05), trim, { x: s * w * 0.16, y: hs + w * 0.16, z: 0.03, rz: -s * 45 * DEG });
      }
    }
  }
  // highlight streak (cartoon glass)
  kit.add(box(0.075, Math.min(h, w) * 0.55, 0.02), STREAK, { x: -w * 0.22, y: hs * 0.72, z: 0.03, rz: -34 * DEG }, glossy);
  // curtains
  if (o.curtains) {
    const cw = w * 0.2;
    for (const s of [-1, 1]) kit.add(box(cw, hs * 0.92, 0.03), [shade(o.curtains, -0.08), o.curtains], { x: s * (w / 2 - cw / 2), y: hs * 0.52, z: 0.025 });
  }
  // frame: jambs + head (or arch)
  const fd = 0.2;
  for (const s of [-1, 1]) kit.add(cbox(fw, hs + 0.04, fd, 0.05), trim, { x: s * (w / 2 + fw / 2), y: hs / 2, z: 0.05 });
  if (arched) {
    if (style === 'lancet') {
      const outer = lancetPath(w + fw * 2, h + fw * 1.2);
      const inner = lancetPath(w, h);
      outer.holes.push(new THREE.Path(inner.getPoints().reverse()));
      kit.add(extrude(outer, fd * 0.9, { curveSegments: 1 }), trim, { z: 0.05 });
    } else {
      kit.add(torus(w / 2 + fw / 2, fw * 0.62, 6, 12, Math.PI), headColor, { y: hs, z: 0.05 });
      if (o.keystone !== false) kit.add(cbox(0.22, 0.3, 0.26, 0.05), headColor, { y: h + fw * 0.35, z: 0.07 });
    }
  } else {
    kit.add(cbox(w + 2 * fw + 0.14, 0.2, 0.24, 0.06), headColor, { y: h + 0.09, z: 0.06 });
    if (o.keystone) kit.add(cbox(0.24, 0.3, 0.27, 0.05), trim, { y: h + 0.13, z: 0.08 });
  }
  // sill
  kit.add(cbox(w + 2 * fw + 0.22, 0.14, 0.32, 0.05), sillColor, { y: -0.06, z: 0.11 });
  // shutters
  if (style === 'shuttered' || o.shutter) {
    const sc = o.shutter ?? P.teal;
    const sw = w * 0.5;
    for (const s of [-1, 1]) {
      const x = s * (w / 2 + fw + sw / 2 + 0.02);
      kit.add(cbox(sw, h + 0.04, 0.09, 0.03), sc, { x, y: h / 2, z: 0.05 });
      for (const fy of [0.3, 0.7]) kit.add(box(sw * 0.72, 0.06, 0.04), shade(sc, -0.1), { x, y: h * fy, z: 0.1 });
    }
  }
  return hs / 2;
}

/** Flower-filled window box hung under a sill (origin = window bottom). */
export function addWindowBox(kit, o = {}) {
  const w = (o.w ?? 1) + 0.3;
  const rng = o.rng;
  const boxColor = o.color ?? P.woodDark;
  const flowers = o.flowers ?? [P.tomato, P.bubblegum];
  kit.add(cbox(w, 0.3, 0.34, 0.06), boxColor, { y: -0.3, z: 0.24 });
  const n = Math.max(3, Math.round(w / 0.3));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + 0.12 + (i / (n - 1)) * (w - 0.24);
    const leaf = rng.pick(LEAF);
    kit.add(ico(0.16, 0), leaf, { x: x + rng.range(-0.04, 0.04), y: -0.13, z: 0.24 + rng.range(-0.05, 0.05), ry: rng.range(0, 3) });
    if (i % 2 === 0 || rng.chance(0.4)) {
      kit.add(ico(rng.range(0.1, 0.13), 0), rng.pick(flowers), { x: x + rng.range(-0.05, 0.05), y: rng.range(-0.02, 0.06), z: 0.26 + rng.range(-0.06, 0.08), ry: rng.range(0, 3) });
    }
  }
  // trailing leaves down the front
  for (let i = 0; i < 2; i++) {
    kit.add(ico(0.12, 0), LEAF[0], { x: rng.range(-w / 2 + 0.2, w / 2 - 0.2), y: -0.44, z: 0.43, ry: rng.range(0, 3) });
  }
}

/**
 * Front door with frame, step, optional hood/porch and house number.
 * opts: w, h, color, trim, style ('panel'|'roundtop'|'stable'), hood ('none'|'hood'|'gable'|'porch'),
 * roofColor, step (bool), number, numberRim, transom (bool), rng.
 * Returns { top } (height of the doorway top incl. transom).
 */
export function addDoor(kit, o = {}) {
  const w = o.w ?? 1.15, h = o.h ?? 2.15;
  const color = o.color ?? P.tomato;
  const trim = o.trim ?? P.white;
  const style = o.style ?? 'panel';
  const transom = o.transom ?? style !== 'roundtop';
  const gold = P.gold;
  const fw = 0.17;
  const panel = shade(color, -0.07);
  let top = h;

  if (style === 'roundtop') {
    kit.add(extrude(archPath(w, h), 0.14, { curveSegments: 1 }), color, { z: -0.03 });
    kit.add(box(w * 0.66, h * 0.26, 0.05), panel, { y: h * 0.25, z: 0.055 });
    kit.add(box(w * 0.66, h * 0.26, 0.05), panel, { y: h * 0.56, z: 0.055 });
    for (const s of [-1, 1]) kit.add(cbox(fw, h - w / 2 + 0.04, 0.22, 0.05), trim, { x: s * (w / 2 + fw / 2), y: (h - w / 2) / 2, z: 0.06 });
    kit.add(torus(w / 2 + fw / 2, fw * 0.62, 6, 12, Math.PI), trim, { y: h - w / 2, z: 0.06 });
    kit.add(cbox(0.24, 0.32, 0.28, 0.05), trim, { y: h + 0.12, z: 0.08 });
    top = h + 0.25;
  } else {
    kit.add(cbox(w, h, 0.14, 0.04), color, { y: h / 2, z: -0.03 });
    if (style === 'stable') {
      kit.add(box(w + 0.04, 0.08, 0.06), panel, { y: h * 0.5, z: 0.06 });
      kit.add(box(w * 0.7, h * 0.3, 0.05), panel, { y: h * 0.25, z: 0.055 });
      kit.add(box(w * 0.7, h * 0.3, 0.05), panel, { y: h * 0.75, z: 0.055 });
    } else {
      for (const px of [-1, 1]) {
        kit.add(box(w * 0.32, h * 0.3, 0.05), panel, { x: px * w * 0.2, y: h * 0.24, z: 0.055 });
        kit.add(box(w * 0.32, h * 0.3, 0.05), panel, { x: px * w * 0.2, y: h * 0.7, z: 0.055 });
      }
    }
    if (transom) {
      kit.add(box(w + 0.04, 0.4, 0.06), GLASS, { y: h + 0.26, z: -0.01 }, materials.glossy);
      kit.add(box(w + 0.1, 0.1, 0.1), trim, { y: h + 0.03, z: 0.04 });
      for (const bx of [-w / 6, w / 6]) kit.add(box(0.06, 0.4, 0.05), trim, { x: bx, y: h + 0.26, z: 0.03 });
      top = h + 0.46;
    }
    for (const s of [-1, 1]) kit.add(cbox(fw, top + 0.04, 0.22, 0.05), trim, { x: s * (w / 2 + fw / 2), y: top / 2, z: 0.06 });
    kit.add(cbox(w + 2 * fw + 0.16, 0.22, 0.26, 0.06), trim, { y: top + 0.1, z: 0.07 });
    top += 0.21;
  }
  // knob + letterbox
  kit.add(sphere(0.07, 8, 6), gold, { x: w * 0.33, y: h * 0.47, z: 0.1 }, materials.glossy);
  kit.add(box(0.3, 0.08, 0.05), gold, { y: h * 0.47, z: 0.07 }, materials.glossy);

  // step(s)
  if (o.step !== false) {
    const deep = o.hood === 'porch' ? 1.2 : 0.62;
    kit.add(cbox(w + 0.8, 0.24, deep, 0.06), o.stepColor ?? P.stone, { y: 0.07, z: deep / 2 - 0.02 });
  }

  // hood / porch
  const hood = o.hood ?? 'none';
  const hw = w + 0.9;
  const hy = top + 0.18;
  if (hood === 'hood') {
    kit.add(cbox(hw, 0.18, 0.8, 0.06), o.hoodColor ?? trim, { y: hy, z: 0.38 });
    for (const s of [-1, 1]) kit.add(prism([[0, 0], [0.55, 0], [0, -0.5]], 0.12), trim, { x: s * (hw / 2 - 0.12), y: hy - 0.07, z: 0, ry: -Math.PI / 2 });
  } else if (hood === 'gable' || hood === 'porch') {
    const depth = hood === 'porch' ? 1.35 : 0.95;
    const roof = o.roofColor ?? P.roofTerracotta;
    const pitch = 38 * DEG;
    const half = hw / 2;
    const rise = half * Math.tan(pitch);
    const slab = half / Math.cos(pitch) + 0.08;
    const zc = depth / 2 - 0.05;
    for (const s of [-1, 1]) {
      kit.add(cbox(slab, 0.14, depth + 0.1, 0.05), roof, {
        x: s * (half / 2) - s * 0.02, y: hy + rise / 2 + 0.12, z: zc, rz: -s * pitch,
      });
    }
    kit.add(cyl(0.09, 0.09, depth + 0.14, 8), shade(roof, -0.1), { y: hy + rise + 0.17, z: zc, rx: Math.PI / 2 });
    // pediment triangle
    kit.add(prism([[-half + 0.12, 0], [half - 0.12, 0], [0, rise - 0.05]], 0.12), trim, { y: hy, z: depth - 0.12 });
    kit.add(cbox(hw - 0.1, 0.12, 0.14, 0.04), trim, { y: hy - 0.02, z: depth - 0.12 });
    if (hood === 'porch') {
      for (const s of [-1, 1]) {
        kit.add(cbox(0.16, hy - 0.1, 0.16, 0.05), trim, { x: s * (half - 0.2), y: (hy + 0.1) / 2, z: depth - 0.2 });
      }
    } else {
      for (const s of [-1, 1]) kit.add(prism([[0, 0], [0.6, 0], [0, -0.55]], 0.12), trim, { x: s * (half - 0.14), y: hy - 0.07, z: 0, ry: -Math.PI / 2 });
    }
  }
  if (o.number != null) numberPlate(kit, o.number, { x: (o.numberSide ?? 1) * (w / 2 + fw + 0.36), y: Math.min(1.75, h - 0.3), z: 0 }, o.numberRim ?? color);
  return { top: hood === 'none' ? top : hy + 0.3 };
}

/**
 * Chimney stack from baseY to topY centred at (x, z) of the current frame.
 * Returns the list of pot-top anchors (Object3D) for smoke.
 */
export function addChimney(kit, o) {
  const { x = 0, z = 0, baseY, topY, rng } = o;
  const w = o.w ?? 0.95, d = o.d ?? 0.72;
  const color = o.color ?? P.brick;
  const cap = o.capColor ?? shade(color, 0.12);
  const potColor = o.potColor ?? P.roofTerracotta;
  const pots = o.pots ?? 2;
  const tops = [];
  kit.at({ x, y: baseY, z, rz: o.lean ?? 0, rx: o.leanX ?? 0 }, () => {
    const hgt = topY - baseY;
    kit.add(cbox(w, hgt, d, 0.07), [shade(color, -0.04), color], { y: hgt / 2 });
    // a couple of brick courses poking out (reads as brickwork from afar)
    kit.add(cbox(w + 0.08, 0.12, d + 0.08, 0.04), shade(color, -0.07), { y: hgt - 0.52 });
    kit.add(cbox(w + 0.2, 0.2, d + 0.2, 0.06), cap, { y: hgt - 0.08 });
    for (let i = 0; i < pots; i++) {
      const px = pots === 1 ? 0 : (i / (pots - 1) - 0.5) * (w - 0.36);
      const ph = rng ? rng.range(0.42, 0.62) : 0.5;
      const pc = rng && rng.chance(0.3) ? shade(potColor, -0.08) : potColor;
      kit.add(cyl(0.13, 0.17, ph, 10), pc, { x: px, y: hgt + ph / 2, z: 0 });
      kit.add(cyl(0.18, 0.18, 0.09, 10), shade(pc, 0.05), { x: px, y: hgt + ph - 0.02, z: 0 });
      tops.push(kit.anchor('chimneyTop', { x: px, y: hgt + ph + 0.05, z: 0 }));
    }
  });
  return tops;
}

/** Round gutter between two points (current frame). */
export function addGutter(kit, a, b, color = P.metalDark, r = 0.09) {
  kit.add(cylBetween(a, b, r, r, 8), color);
}

/** Drainpipe down a wall: from gutter point g=[x,y,z] to the ground at wall plane zWall. */
export function addDrainpipe(kit, o) {
  const { x, zWall, gutter, color = P.metalDark } = o;
  const zp = zWall + 0.13;
  const topY = gutter[1] - 0.35;
  kit.add(cylBetween([x, 0.35, zp], [x, topY, zp], 0.075, 0.075, 8), color);
  kit.add(cylBetween([x, topY - 0.02, zp], [gutter[0], gutter[1] - 0.05, gutter[2]], 0.075, 0.075, 8), color);
  kit.add(cylBetween([x, 0.38, zp], [x, 0.1, zp + 0.28], 0.08, 0.09, 8), color);
  const n = Math.max(1, Math.floor(topY / 1.8));
  for (let i = 1; i <= n; i++) kit.add(box(0.22, 0.07, 0.14), shade(color, -0.05), { x, y: (i / (n + 1)) * topY + 0.3, z: zWall + 0.07 });
}

/** Alternating corner quoin blocks up a vertical corner (sx, sz = which corner, +-1). */
export function addQuoins(kit, { W, D, height, color, sx, sz, y0 = 0.4 }) {
  const bh = 0.3, gap = 0.08;
  let i = 0;
  for (let y = y0; y + bh < height - 0.1; y += bh + gap, i++) {
    const a = i % 2 ? 0.34 : 0.52;
    const b = i % 2 ? 0.52 : 0.34;
    kit.add(box(a, bh, b), color, { x: sx * (W / 2 - a / 2 + 0.04), y: y + bh / 2, z: sz * (D / 2 - b / 2 + 0.04) });
  }
}

/** A small patch of exposed bricks where the plaster "fell off" (classic cartoon wall gag). */
export function addBrickPatch(kit, { x, y, z = 0, rng, color = P.brick, wall }) {
  const rows = rng.int(2, 3);
  kit.add(cbox(0.95, rows * 0.17 + 0.1, 0.05, 0.03), shade(wall, -0.07), { x, y, z: z + 0.01 });
  for (let r = 0; r < rows; r++) {
    const n = r % 2 ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const bx = x + (i - (n - 1) / 2) * 0.3 + rng.range(-0.02, 0.02);
      kit.add(box(0.26, 0.12, 0.06), wobbleColor(rng, color, 0.05), { x: bx, y: y + (r - (rows - 1) / 2) * 0.17, z: z + 0.04 });
    }
  }
}

/** Climbing rose / ivy cluster up a wall (origin at ground, wall plane). */
export function addClimber(kit, { x, height = 2.6, rng, flower = P.bubblegum, spread = 0.7 }) {
  const n = Math.round(height * 3.2);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const y = 0.3 + t * height;
    const bx = x + Math.sin(t * 7 + x) * spread * (0.35 + t * 0.6) + rng.range(-0.15, 0.15);
    const r = 0.28 - t * 0.08 + rng.range(-0.04, 0.04);
    kit.add(ico(r, 0), wobbleColor(rng, t > 0.5 ? LEAF[1] : LEAF[0], 0.04), { x: bx, y, z: 0.12, ry: rng.range(0, 3), sz: 0.6 });
    if (rng.chance(0.55)) kit.add(ico(0.1, 0), rng.chance(0.8) ? flower : '#fff8ee', { x: bx + rng.range(-0.2, 0.2), y: y + rng.range(-0.15, 0.15), z: 0.25, ry: rng.range(0, 3) });
  }
}

/**
 * Dormer: a little box with its own gable roof, poking out of a roof slope. Origin = bottom-centre
 * of its front face. depth = how far the body runs back into the main roof.
 */
export function addDormer(kit, o) {
  const { w = 1.5, h = 1.5, depth = 2.2, wall, roof, trim, rng, windowStyle = 'sash' } = o;
  kit.add(cbox(w, h, depth, 0.08), wall, { y: h / 2, z: -depth / 2 });
  addWindow(kit, { w: w - 0.62, h: h - 0.55, style: windowStyle === 'shuttered' ? 'sash' : windowStyle, trim, rng, curtains: o.curtains });
  // gable roof on the dormer (ridge runs back into the main roof)
  const pitch = 40 * DEG;
  const half = w / 2 + 0.22;
  const rise = half * Math.tan(pitch);
  const slab = half / Math.cos(pitch) + 0.1;
  for (const s of [-1, 1]) {
    kit.add(cbox(slab, 0.16, depth + 0.25, 0.06), roof, { x: s * half / 2, y: h + rise / 2 + 0.06, z: -depth / 2 + 0.12, rz: -s * pitch });
  }
  kit.add(prism([[-w / 2, 0], [w / 2, 0], [0, rise - 0.06]], depth - 0.02), wall, { y: h - 0.01, z: -depth / 2 });
  kit.add(cyl(0.1, 0.1, depth + 0.3, 8), shade(roof, -0.1), { y: h + rise + 0.12, z: -depth / 2 + 0.12, rx: Math.PI / 2 });
}

/** Timber framing (tudor) on a rectangular wall area (origin bottom-centre, width w, height h). */
export function addTimbers(kit, { w, h, color = P.woodDark, rng, cols = 3, skip = [] }) {
  const t = 0.16;
  kit.add(box(w, t, 0.08), color, { y: t / 2, z: 0.04 });
  kit.add(box(w, t, 0.08), color, { y: h - t / 2, z: 0.04 });
  for (let i = 0; i <= cols; i++) {
    const x = -w / 2 + t / 2 + (i / cols) * (w - t);
    kit.add(box(t, h, 0.08), color, { x, y: h / 2, z: 0.04 });
    if (i < cols && !skip.includes(i)) {
      const x2 = -w / 2 + t / 2 + ((i + 1) / cols) * (w - t);
      const dir = (i + (rng ? rng.int(0, 1) : 0)) % 2 ? 1 : -1;
      const a = [dir > 0 ? x + 0.1 : x2 - 0.1, 0.15, 0.03];
      const b = [dir > 0 ? x + (x2 - x) * 0.5 : x2 - (x2 - x) * 0.5, h * 0.62, 0.03];
      kit.add(cylBetween(a, b, 0.07, 0.07, 4), color);
    }
  }
}

/** Hanging flower basket on a little bracket (origin = wall attach point). */
export function addHangingBasket(kit, { rng, flowers = FLOWERS, out = 0.55 }) {
  kit.add(box(0.06, 0.06, out + 0.06), P.ink, { z: out / 2 });
  kit.add(cylBetween([0, 0, out], [0, -0.35, out], 0.02, 0.02, 4), P.ink);
  kit.add(sphere(0.3, 8, 6), LEAF[0], { y: -0.55, z: out, sy: 0.8 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    kit.add(ico(0.1, 0), rng.pick(flowers), { x: Math.cos(a) * 0.27, y: -0.5 + rng.range(-0.12, 0.12), z: out + Math.sin(a) * 0.27 });
  }
  kit.add(ico(0.12, 0), LEAF[1], { y: -0.82, z: out });
}
