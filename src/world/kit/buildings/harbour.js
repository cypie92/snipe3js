// Harbour waterfront: quay walls, breakwater pier, slipway, beach and simple land masses.
// Convention: land / quay tops at y = 0, sea surface at y = seaLevel (default -1.6). Everything that
// meets the water runs well below it, so any water height between about -0.5 and -3 works.
// Paths are [x, z] points; `side: 1` = water on the LEFT of travel (first -> last point), -1 = right.
import { THREE, materials, Kit, cbox, prism, sweep, resample, pathFrames, alongPath, rngOf, shade, mix, wobbleColor, clamp, DEG, TAU, addCollider, Tweens, ease } from './common.js';
import { box, cyl, ico, torus, jitter } from '../../geo.js';
import { hash3 } from '../../../core/rng.js';
import { P } from '../../../gfx/palette.js';
import { labelMaterial } from './signs.js';

export const SEA_LEVEL = -1.6;
export const HARBOUR_STONE = { base: '#bdb4a4', light: '#d8d0c1', dark: '#968d7e', algae: '#6f8450', wet: '#5d625a', barnacle: '#f3eee4' };

const c0 = new THREE.Color();
const setHex = (c, hex) => c.set(hex);

/** Masonry colour for a wall face point (y) with a per-stone hash: dry stone / algae band / wet. */
function masonry(c, y, seaLevel, h, S = HARBOUR_STONE) {
  if (y < seaLevel - 0.35) return setHex(c, shade(S.wet, (h - 0.5) * 0.05));
  if (y < seaLevel + 0.55) return setHex(c, shade(mix(S.algae, S.wet, clamp((seaLevel + 0.55 - y) / 0.9, 0, 1) * 0.6), (h - 0.5) * 0.05));
  const base = h < 0.3 ? S.dark : h > 0.8 ? S.light : S.base;
  return setHex(c, shade(base, (h - 0.5) * 0.06));
}

/** Faceted boulder (flat-shaded). detail 0 = 20 tris, 1 = 80 tris. */
export function addBoulder(kit, { r = 1, t = {}, color = '#a9a193', seed = 1, detail = 1, squash = 0.75 } = {}) {
  const g = jitter(ico(r, detail), r * 0.2, seed);
  kit.add(g, [shade(color, -0.08), shade(color, 0.05)], { ...t, sy: (t.sy ?? 1) * squash }, materials.facet);
}

/** Chunky mooring bollard (cast-iron mushroom). Origin at its foot. */
export function addMooringBollard(kit, t = {}, color = '#3d4a52') {
  kit.at(t, () => {
    kit.add(cyl(0.26, 0.3, 0.14, 10), shade(color, -0.05), { y: 0.07 });
    kit.add(cyl(0.2, 0.24, 0.55, 10), color, { y: 0.4 });
    kit.add(cyl(0.3, 0.22, 0.14, 10), shade(color, 0.08), { y: 0.72 });
    kit.add(cyl(0.18, 0.3, 0.08, 10), shade(color, 0.12), { y: 0.83 });
  });
}

// ------------------------------------------------------------------ quay
/**
 * Stone quay wall along a polyline. Top (paving) at y = 0, face down past the sea.
 * opts: points, height (quay top above sea, default 1.6 -> seaLevel = -height), seaLevel, side (1 | -1),
 * topWidth (paved strip behind the coping, 2.5), closed, seed,
 * steps: [s metres along the path, ...], ladders: [s, ...] | number (auto spacing), rings (spacing m, 7),
 * fenders (spacing, 11), bollards (spacing, 9 | 0), barnacles (true).
 * parts: steps[], ladders[], rings[], bollards[] (anchors on top of each bollard), edge (path frames).
 */
export function quay(opts = {}) {
  const rng = rngOf(opts.seed ?? 'quay', 'quay');
  const seaLevel = opts.seaLevel ?? -(opts.height ?? -SEA_LEVEL);
  const side = opts.side ?? 1;
  const topW = opts.topWidth ?? 2.5;
  const bottom = seaLevel - 2.6;
  const closed = !!opts.closed;
  const pts = resample(opts.points ?? [[-20, 0], [20, 0]], 1.25, { smooth: opts.smooth ?? false, closed });
  const frames = pathFrames(pts, { closed });
  const total = frames[frames.length - 1].s;
  const kit = new Kit('quay');
  const S = HARBOUR_STONE;
  const X = (x) => x * side;
  const prof = (list) => (side > 0 ? list : list.map(([x, y]) => [-x, y]).reverse());

  // wall body: courses of masonry (one colour per path segment x course = a stone block)
  const face = [];
  for (let y = -0.3; y > bottom; y -= 0.45) face.push([0.02 + (-0.3 - y) * 0.05, y]);
  face.push([0.02 + (-0.3 - bottom) * 0.05, bottom]);
  const body = sweep(prof([[-topW, bottom], [-topW, -0.06], [0.0, -0.06], ...face]), pts, { closed });
  kit.addFaces(body, (x, y, z, c) => {
    const i = Math.floor(y / 0.45);
    const k = Math.floor((x * 0.61 + z * 0.79 + (i % 2) * 0.6) / 1.25);
    masonry(c, y, seaLevel, hash3(k, i, 3.3));
    if (y > -0.1) c.set(shade(S.light, -0.04));
  });
  // coping stones: rounded, slightly proud of the face
  const coping = prof([[-0.55, -0.16], [-0.55, 0.04], [-0.45, 0.1], [0.02, 0.1], [0.14, 0.04], [0.16, -0.12], [0.06, -0.22]]);
  kit.addFaces(sweep(coping, pts, { closed, hard: false }), (x, y, z, c) => {
    const k = Math.floor((x * 0.61 + z * 0.79) / 1.25);
    c.set(shade(S.light, (hash3(k, 1, 7) - 0.5) * 0.06));
  });
  // paving slabs behind the coping
  const slabs = [];
  const across = Math.max(1, Math.round((topW - 0.55) / 1.0));
  for (let i = 0; i < frames.length - (closed ? 0 : 1); i++) {
    const a = frames[i], b = frames[(i + 1) % frames.length];
    for (let j = 0; j < across; j++) {
      const u0 = -0.55 - (j / across) * (topW - 0.55), u1 = -0.55 - ((j + 1) / across) * (topW - 0.55);
      const A = a.p.clone().addScaledVector(a.left, X(u0)), B = a.p.clone().addScaledVector(a.left, X(u1));
      const C = b.p.clone().addScaledVector(b.left, X(u1)), D = b.p.clone().addScaledVector(b.left, X(u0));
      slabs.push([A, B, C, D, hash3(i, j, 5.5)]);
    }
  }
  const sp = [];
  for (const [A, B, C, D] of slabs) for (const v of [A, C, B, A, D, C]) sp.push(v.x, 0.012, v.z);
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  sg.computeVertexNormals();
  if (sg.attributes.normal.getY(0) < 0) {
    for (let i = 0; i < sp.length; i += 9) for (let d = 0; d < 3; d++) { const t = sp[i + 3 + d]; sp[i + 3 + d] = sp[i + 6 + d]; sp[i + 6 + d] = t; }
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sg.computeVertexNormals();
  }
  kit.addFaces(sg, (x, y, z, c, f) => c.set(shade('#d9d0bf', (slabs[Math.floor(f / 2)][4] - 0.5) * 0.06)));

  // proud stones on the dry face for a hand-built look
  const parts = { steps: [], ladders: [], rings: [], bollards: [], fenders: [], edge: frames };
  for (let s = 0.6; s < total - 0.6; s += 1.1) {
    const at = alongPath(frames, s);
    for (let y = -0.55; y > seaLevel + 0.7; y -= 0.45) {
      if (hash3(s * 3.1, y * 7.7, 2.2) < 0.55) continue;
      kit.at({ x: at.p.x, z: at.p.z, ry: at.ry }, () => {
        kit.add(box(0.08, 0.36, rng.range(0.7, 1.05)), wobbleColor(rng, hash3(s, y, 1) > 0.5 ? S.light : S.dark, 0.03), { x: X(0.05 + (-0.3 - y) * 0.05), y: y - 0.2 });
      });
    }
    if (opts.barnacles !== false && rng.chance(0.55)) {
      kit.at({ x: at.p.x, z: at.p.z, ry: at.ry }, () => {
        for (let k = 0; k < 3; k++) kit.add(ico(rng.range(0.05, 0.09), 0), S.barnacle, { x: X(0.1 + (-0.3 - seaLevel) * 0.05), y: seaLevel + rng.range(-0.3, 0.35), z: rng.range(-0.5, 0.5) });
      });
    }
  }
  const excl = [];
  const free = (s, w) => excl.every(([a, b]) => s + w < a || s - w > b);

  // steps down to the water (protruding flight along the face)
  for (const s0 of opts.steps ?? []) {
    const n = Math.max(3, Math.ceil((0 - seaLevel + 0.4) / 0.28));
    const run = n * 0.36;
    const s1 = clamp(s0, 0.5, total - run - 0.5);
    excl.push([s1 - 0.6, s1 + run + 0.6]);
    const at = alongPath(frames, s1);
    kit.at({ x: at.p.x, z: at.p.z, ry: at.ry }, () => {
      for (let i = 0; i < n; i++) {
        const topY = -0.1 - i * 0.28;
        const hgt = topY - bottom;
        kit.add(box(1.25, hgt, 0.38), [S.wet, i < n - 2 ? S.base : S.algae], { x: X(0.72), y: bottom + hgt / 2, z: 0.19 + i * 0.36 });
        kit.add(box(1.3, 0.08, 0.4), shade(S.light, -0.03), { x: X(0.72), y: topY - 0.03, z: 0.19 + i * 0.36 });
      }
      kit.add(box(0.2, 0.9 - bottom, run), S.dark, { x: X(1.42), y: (bottom + 0.9) / 2 - 0.45, z: run / 2 });
    });
    parts.steps.push(Object.assign(kit.anchor('steps', { x: at.p.x, y: -0.1, z: at.p.z, ry: at.ry }), { userData: { bottomY: seaLevel } }));
  }
  // iron ladders
  let ladderList = opts.ladders ?? 2;
  if (typeof ladderList === 'number') {
    const n = ladderList;
    ladderList = Array.from({ length: n }, (_, i) => ((i + 0.5) / n) * total);
  }
  for (const s of ladderList) {
    if (!free(s, 0.6)) continue;
    excl.push([s - 0.5, s + 0.5]);
    const at = alongPath(frames, s);
    kit.at({ x: at.p.x, z: at.p.z, ry: at.ry }, () => {
      const faceX = X(0.14);
      const lowY = seaLevel - 1.2;
      for (const sz of [-0.24, 0.24]) {
        kit.add(cyl(0.035, 0.035, -lowY + 0.1, 6), '#3a4046', { x: faceX + X(0.12), y: lowY / 2, z: sz });
        kit.add(torus(0.33, 0.035, 4, 8, Math.PI), '#3a4046', { x: X(-0.07), y: 0.1, z: sz });
      }
      for (let y = -0.35; y > lowY; y -= 0.3) kit.add(cyl(0.025, 0.025, 0.48, 5), '#4a525a', { x: faceX + X(0.12), y, z: 0, rx: Math.PI / 2 });
    });
    parts.ladders.push(kit.anchor('ladder', { x: at.p.x, y: 0, z: at.p.z, ry: at.ry }));
  }
  // mooring rings + tyre fenders
  for (let s = (opts.rings ?? 7) / 2; s < total && (opts.rings ?? 7) > 0; s += opts.rings ?? 7) {
    if (!free(s, 0.3)) continue;
    const at = alongPath(frames, s);
    kit.at({ x: at.p.x, z: at.p.z, ry: at.ry }, () => {
      kit.add(box(0.06, 0.2, 0.2), '#3a4046', { x: X(0.17), y: -0.42 });
      kit.add(torus(0.16, 0.035, 4, 10), '#4a525a', { x: X(0.22), y: -0.6, ry: Math.PI / 2 });
    });
    parts.rings.push(kit.anchor('ring', { x: at.p.x + at.left.x * X(0.25), y: -0.6, z: at.p.z + at.left.z * X(0.25), ry: at.ry }));
  }
  for (let s = (opts.fenders ?? 11) * 0.7; s < total && (opts.fenders ?? 11) > 0; s += opts.fenders ?? 11) {
    if (!free(s, 0.6)) continue;
    const at = alongPath(frames, s);
    const fy = Math.min(-0.9, seaLevel + 0.9);
    kit.at({ x: at.p.x, z: at.p.z, ry: at.ry }, () => {
      kit.add(cyl(0.025, 0.025, -fy - 0.2, 4), '#c9a46a', { x: X(0.2), y: fy / 2 - 0.05 });
      kit.add(torus(0.34, 0.15, 5, 10), '#2e3136', { x: X(0.34), y: fy - 0.3, ry: Math.PI / 2 });
    });
    parts.fenders.push(kit.anchor('fender', { x: at.p.x, y: fy - 0.3, z: at.p.z, ry: at.ry }));
  }
  // mooring bollards on the quay top
  const bs = opts.bollards ?? 9;
  if (bs > 0) {
    for (let s = bs * 0.55; s < total - 0.5; s += bs) {
      if (!free(s, 0.5)) continue;
      const at = alongPath(frames, s);
      const px = at.p.x + at.left.x * X(-0.95), pz = at.p.z + at.left.z * X(-0.95);
      addMooringBollard(kit, { x: px, y: 0, z: pz, ry: rng.range(0, TAU) });
      parts.bollards.push(kit.anchor('bollard', { x: px, y: 0.86, z: pz, ry: at.ry }));
    }
  }
  const group = kit.build(new THREE.Group());
  group.name = opts.name ?? 'quay';
  group.userData.kind = 'quay';
  group.userData.surface = 'stone';
  group.userData.parts = parts;
  group.userData.seaLevel = seaLevel;
  group.userData.length = total;
  return group;
}

// ------------------------------------------------------------------ breakwater
/**
 * Breakwater pier: paved causeway at y = 0 with a seaward parapet, boulder armour on both flanks
 * and a round head (for the lighthouse) at the last point.
 * opts: points, width (4.6), seaLevel, parapet ('left' | 'right' | 'none'), endRadius (6.5, 0 = none),
 * railing (true: posts + rails on the harbour side), seed.
 * parts: head (anchor at the head centre, y = 0), walk[] (anchors every ~10 m along the centre line).
 */
export function breakwater(opts = {}) {
  const rng = rngOf(opts.seed ?? 'breakwater', 'bw');
  const seaLevel = opts.seaLevel ?? SEA_LEVEL;
  const W = opts.width ?? 4.6;
  const half = W / 2;
  const bottom = seaLevel - 3;
  const pts = resample(opts.points ?? [[0, 0], [0, -60]], 1.6, { smooth: opts.smooth ?? true });
  const frames = pathFrames(pts);
  const total = frames[frames.length - 1].s;
  const kit = new Kit('breakwater');
  const S = HARBOUR_STONE;
  // causeway body with battered sides
  const bodyProf = [[-half - 2.6, bottom], [-half - 0.5, seaLevel + 0.2], [-half, -0.06], [half, -0.06], [half + 0.5, seaLevel + 0.2], [half + 2.6, bottom]];
  kit.addFaces(sweep(bodyProf, pts), (x, y, z, c) => {
    const i = Math.floor(y / 0.5);
    const k = Math.floor((x * 0.61 + z * 0.79 + (i % 2) * 0.7) / 1.6);
    masonry(c, y, seaLevel, hash3(k, i, 9.1));
    if (y > -0.1) c.set(shade('#d4cab7', (hash3(k, 0, 4) - 0.5) * 0.05));
  });
  // paving on top (crisp slabs)
  const walkProf = [[-half + 0.02, -0.06], [-half + 0.02, 0.02], [half - 0.02, 0.02], [half - 0.02, -0.06]];
  kit.addFaces(sweep(walkProf, pts, { caps: false }), (x, y, z, c, f) => c.set(shade('#dcd2c0', (hash3(Math.floor(f / 6), 2, 8) - 0.5) * 0.07)));
  // parapet wall on the seaward side
  const par = opts.parapet ?? 'left';
  if (par !== 'none') {
    const s = par === 'left' ? 1 : -1;
    const pw = [[half - 0.75, -0.05], [half - 0.75, 1.0], [half - 0.1, 1.0], [half, -0.05]].map(([x, y]) => [x * s, y]);
    const prof = s > 0 ? pw : pw.slice().reverse();
    kit.addFaces(sweep(prof, pts), (x, y, z, c) => {
      const i = Math.floor(y / 0.35);
      const k = Math.floor((x * 0.61 + z * 0.79 + (i % 2) * 0.6) / 0.9);
      c.set(shade(S.base, (hash3(k, i, 6) - 0.5) * 0.08));
    });
    const cap = [[half - 0.85, 0.95], [half - 0.85, 1.12], [half - 0.78, 1.18], [half - 0.05, 1.18], [half + 0.02, 1.12], [half + 0.02, 0.95]].map(([x, y]) => [x * s, y]);
    kit.add(sweep(s > 0 ? cap : cap.slice().reverse(), pts, { hard: false }), S.light);
  }
  // harbour-side railing
  const parts = { head: null, walk: [] };
  if (opts.railing !== false) {
    const rs = par === 'left' ? -1 : 1;
    const endS = total - (opts.endRadius ?? 6.5) * 0.9;
    for (let s = 1; s < endS; s += 2.4) {
      const at = alongPath(frames, s);
      kit.at({ x: at.p.x + at.left.x * rs * (half - 0.25), z: at.p.z + at.left.z * rs * (half - 0.25), ry: at.ry }, () => {
        kit.add(cyl(0.06, 0.07, 1.05, 6), '#fff8ee', { y: 0.52 });
        kit.add(ico(0.08, 0), '#2f7d8a', { y: 1.08 });
      });
    }
    const rail = (y) => [[-0.04 + rs * (half - 0.25), y - 0.04], [-0.04 + rs * (half - 0.25), y + 0.04], [0.04 + rs * (half - 0.25), y + 0.04], [0.04 + rs * (half - 0.25), y - 0.04]];
    const railPts = pts.filter((p, i) => frames[i].s > 0.8 && frames[i].s < endS + 0.2);
    if (railPts.length > 1) for (const y of [0.55, 0.98]) kit.add(sweep(rail(y), railPts), '#2f7d8a');
  }
  // boulder armour along both flanks
  for (let s = 0.8; s < total; s += 1.9) {
    const at = alongPath(frames, s);
    for (const sd of [-1, 1]) {
      const r = rng.range(0.8, 1.35);
      const off = half + rng.range(0.9, 1.9);
      addBoulder(kit, { r, seed: s * 13 + sd, color: wobbleColor(rng, rng.pick(['#aaa294', '#9d968a', '#b5aa98']), 0.05), t: { x: at.p.x + at.left.x * sd * off, y: seaLevel + rng.range(-0.3, 0.35), z: at.p.z + at.left.z * sd * off, ry: rng.range(0, TAU), rz: rng.range(-0.3, 0.3) }, detail: 1 });
      if (rng.chance(0.6)) addBoulder(kit, { r: r * 0.8, seed: s * 7 - sd, color: '#8f887c', t: { x: at.p.x + at.left.x * sd * (off + 1.3), y: seaLevel - 0.8, z: at.p.z + at.left.z * sd * (off + 1.3) }, detail: 0 });
    }
    if (Math.round(s / 1.9) % 5 === 0) parts.walk.push(kit.anchor('walk', { x: at.p.x, y: 0, z: at.p.z, ry: at.ry }));
  }
  // round head
  const R = opts.endRadius ?? 6.5;
  if (R > 0) {
    const e = frames[frames.length - 1];
    kit.at({ x: e.p.x, z: e.p.z }, () => {
      const lat = new THREE.LatheGeometry([[R + 2.2, bottom], [R + 0.3, seaLevel + 0.2], [R, -0.06], [0.01, -0.06]].map(([x, y]) => new THREE.Vector2(x, y)), 28);
      kit.addFaces(lat, (x, y, z, c) => {
        const i = Math.floor(y / 0.5);
        masonry(c, y, seaLevel, hash3(Math.floor(Math.atan2(z, x) * 5 + (i % 2) * 0.5), i, 2));
        if (y > -0.1) c.set('#d4cab7');
      });
      kit.add(cyl(R - 0.02, R - 0.02, 0.08, 28), '#dcd2c0', { y: -0.02 });
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU + rng.range(-0.1, 0.1);
        const rr = R + rng.range(1.0, 2.0);
        addBoulder(kit, { r: rng.range(0.9, 1.5), seed: i * 3.3, color: wobbleColor(rng, '#a69e90', 0.05), t: { x: Math.cos(a) * rr, y: seaLevel + rng.range(-0.3, 0.3), z: Math.sin(a) * rr, ry: rng.range(0, TAU) } });
      }
    });
    parts.head = kit.anchor('head', { x: e.p.x, y: 0, z: e.p.z });
  }
  const group = kit.build(new THREE.Group());
  group.name = opts.name ?? 'breakwater';
  group.userData.kind = 'breakwater';
  group.userData.surface = 'stone';
  group.userData.parts = parts;
  group.userData.seaLevel = seaLevel;
  group.userData.length = total;
  return group;
}

// ------------------------------------------------------------------ slipway
/**
 * Slipway ramp: top at the origin (y = 0), running down toward +Z into the water.
 * opts: width (4.2), length (14), seaLevel, seed. parts: winch (crank pivot, spins about X),
 * top / bottom anchors. userData.crank(turns) spins the winch (Promise).
 */
export function slipway(opts = {}) {
  const rng = rngOf(opts.seed ?? 'slip', 'slip');
  const seaLevel = opts.seaLevel ?? SEA_LEVEL;
  const W = opts.width ?? 4.2;
  const L = opts.length ?? 14;
  const endY = seaLevel - 1.6;
  const kit = new Kit('slipway');
  const S = HARBOUR_STONE;
  const yAt = (z) => (z / L) * endY;
  const n = Math.ceil(L / 0.6);
  const pos = [];
  const cols = [];
  const cc = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const z0 = (i / n) * L, z1 = ((i + 1) / n) * L;
    const y0 = yAt(z0), y1 = yAt(z1);
    const ym = (y0 + y1) / 2;
    const base = i % 2 ? '#c9c2b4' : '#bbb3a4';
    masonry(cc, ym, seaLevel, 0.5);
    if (ym > seaLevel + 0.55) cc.set(shade(base, (hash3(i, 1, 1) - 0.5) * 0.04));
    for (const [x, y, z] of [[-W / 2, y0, z0], [W / 2, y1, z1], [W / 2, y0, z0], [-W / 2, y0, z0], [-W / 2, y1, z1], [W / 2, y1, z1]]) {
      pos.push(x, y, z);
      cols.push(cc.r, cc.g, cc.b);
    }
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  rg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  rg.computeVertexNormals();
  if (!kit.buckets.has(materials.toy)) kit.buckets.set(materials.toy, []);
  kit.buckets.get(materials.toy).push(rg);
  // solid under the ramp + side walls with coping
  const ang = Math.atan2(-endY, L);
  const len = Math.hypot(L, endY);
  kit.add(prism([[0, 0], [L, endY], [L, endY - 2], [0, -2]], W - 0.05), S.dark, { ry: -Math.PI / 2, x: 0 });
  for (const s of [-1, 1]) {
    kit.at({ x: s * (W / 2 + 0.25) }, () => {
      kit.addFaces(prism([[0, 0.45], [L, endY + 0.45], [L, endY - 2], [0, -2]], 0.5), (x, y, z, c) => masonry(c, y, seaLevel, hash3(Math.floor(z), Math.floor(y * 2), 5)), { ry: -Math.PI / 2 });
      kit.add(box(0.62, 0.14, len + 0.1), S.light, { y: yAt(L / 2) + 0.5, z: L / 2, rx: ang });
    });
  }
  // rails
  for (const s of [-0.6, 0.6]) kit.add(box(0.1, 0.08, len), '#6b7078', { x: s, y: yAt(L / 2) + 0.05, z: L / 2, rx: ang });
  // winch at the top
  kit.at({ z: -1.6 }, () => {
    for (const s of [-1, 1]) kit.add(cbox(0.22, 1.1, 0.4, 0.04), '#2f7d8a', { x: s * 0.55, y: 0.55 });
    kit.add(cbox(1.5, 0.2, 0.7, 0.05), S.base, { y: 0.1 });
  });
  addMooringBollard(kit, { x: -W / 2 - 1.2, z: -0.8 });
  addMooringBollard(kit, { x: W / 2 + 1.2, z: -0.8 });
  // SLIPWAY sign
  kit.at({ x: W / 2 + 1.2, z: -2.2 }, () => {
    kit.add(cyl(0.05, 0.05, 1.6, 6), '#fff8ee', { y: 0.8 });
    kit.add(box(1.0, 0.36, 0.06), '#2f7d8a', { y: 1.55 });
    kit.raw(new THREE.PlaneGeometry(0.92, 0.28), labelMaterial('SLIPWAY', { bg: '#2f7d8a', fg: '#fff8ee', w: 256, h: 80 }), { y: 1.55, z: 0.045 });
  });
  const group = kit.build(new THREE.Group());
  group.name = opts.name ?? 'slipway';
  const winch = new THREE.Group();
  winch.name = 'winch';
  const wk = new Kit('winch');
  wk.add(cyl(0.22, 0.22, 0.9, 12), '#c9a46a', { rz: Math.PI / 2 });
  for (const s of [-1, 1]) wk.add(cyl(0.3, 0.3, 0.06, 12), '#3a4046', { x: s * 0.46, rz: Math.PI / 2 });
  wk.add(box(0.06, 0.5, 0.08), '#3a4046', { x: 0.72, y: -0.2 });
  wk.add(cyl(0.04, 0.04, 0.3, 6), P.tomato, { x: 0.86, y: -0.42, rz: Math.PI / 2 });
  wk.build(winch);
  winch.position.set(0, 0.95, -1.6);
  addCollider(winch, 0.6);
  group.add(winch);
  const top = new THREE.Object3D(); top.name = 'top'; top.position.set(0, 0, 0.5);
  const bottomA = new THREE.Object3D(); bottomA.name = 'bottom'; bottomA.position.set(0, seaLevel, L * (seaLevel / endY));
  group.add(top, bottomA);
  const tw = new Tweens();
  group.userData.kind = 'slipway';
  group.userData.surface = 'stone';
  group.userData.parts = { winch, top, bottom: bottomA };
  group.userData.crank = (turns = 2) => { const r0 = winch.rotation.x; return tw.run('crank', 0.8 * turns, (e) => { winch.rotation.x = r0 + e * turns * TAU; }, ease.inOutSine); };
  group.userData.update = (dt) => tw.update(dt);
  void rng;
  return group;
}

// ------------------------------------------------------------------ beach
/**
 * Sandy beach wedge: back edge at y = 0 (z = 0), sloping toward +Z into the water with a wavy
 * waterline, wet-sand band, foam line, pebbles, shells and seaweed.
 * opts: width (30), depth (16), seaLevel, seed, foam (true). parts: waterline (anchor), spots[].
 */
export function beach(opts = {}) {
  const rng = rngOf(opts.seed ?? 'beach', 'beach');
  const seaLevel = opts.seaLevel ?? SEA_LEVEL;
  const W = opts.width ?? 30, D = opts.depth ?? 16;
  const kit = new Kit('beach');
  const nx = Math.max(6, Math.round(W / 1.6)), nz = Math.max(6, Math.round(D / 1.4));
  const wl = (x) => D * 0.72 + Math.sin(x * 0.21 + 1.3) * 1.2 + Math.sin(x * 0.53) * 0.5; // waterline z
  const hAt = (x, z) => {
    const t = z / wl(x);
    const y = t < 1 ? -(-seaLevel) * Math.pow(t, 1.35) : seaLevel - (z - wl(x)) * 0.35;
    return y + (hash3(x * 0.7, z * 0.7, 3) - 0.5) * 0.12 * clamp(1 - t, 0, 1);
  };
  const pos = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const x0 = -W / 2 + (i / nx) * W, x1 = -W / 2 + ((i + 1) / nx) * W;
      const z0 = (j / nz) * D, z1 = ((j + 1) / nz) * D;
      const q = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => [x, hAt(x, z), z]);
      pos.push(...q[0], ...q[2], ...q[1], ...q[0], ...q[3], ...q[2]);
    }
  }
  // back skirt so the wedge is solid from behind
  for (let i = 0; i < nx; i++) {
    const x0 = -W / 2 + (i / nx) * W, x1 = -W / 2 + ((i + 1) / nx) * W;
    pos.push(x0, hAt(x0, 0), 0, x1, hAt(x1, 0), 0, x1, seaLevel - 2, 0, x0, hAt(x0, 0), 0, x1, seaLevel - 2, 0, x0, seaLevel - 2, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  kit.addFaces(g, (x, y, z, c) => {
    const dry = '#f4dfa8', wet = '#d9bd84';
    const d = y - seaLevel;
    c.set(d > 0.45 ? shade(dry, (hash3(x, z, 1) - 0.5) * 0.04) : d > -0.05 ? mix(wet, dry, clamp(d / 0.45, 0, 1)) : '#b89a68');
  }, undefined, materials.facet);
  // foam line hugging the waterline, just above the water
  if (opts.foam !== false) {
    const fp = [];
    for (let x = -W / 2; x <= W / 2 + 1e-6; x += W / 40) fp.push([x, seaLevel + 0.05, wl(x) - 0.25]);
    kit.add(sweep([[-0.35, 0], [-0.3, 0.05], [0.3, 0.05], [0.35, 0]], fp.map(([x, y, z]) => new THREE.Vector3(x, y, z)), { caps: false, hard: false }), '#f4fbff');
  }
  const parts = { spots: [], waterline: null };
  // pebbles, shells, seaweed, a couple of rocks
  for (let i = 0; i < Math.round(W * D * 0.06); i++) {
    const x = rng.range(-W / 2 + 0.5, W / 2 - 0.5);
    const z = rng.range(0.5, wl(x) + 0.5);
    const y = hAt(x, z);
    const r = rng.random();
    if (r < 0.45) kit.add(ico(rng.range(0.06, 0.14), 0), wobbleColor(rng, rng.pick(['#b8b0a2', '#d9d0c0', '#8f887c']), 0.05), { x, y: y + 0.03, z, sy: 0.6 }, materials.facet);
    else if (r < 0.7) kit.add(ico(0.09, 0), rng.pick(['#ffd9e2', '#fff1d6', '#ffc9a3']), { x, y: y + 0.04, z, sy: 0.5 });
    else if (z > wl(x) - 2.5) kit.add(ico(0.22, 0), rng.pick(['#4f7a3c', '#5f8a3c']), { x, y: y + 0.05, z, sx: 1.6, sy: 0.3 }, materials.facet);
  }
  for (let i = 0; i < 3; i++) {
    const x = rng.range(-W / 2 + 2, W / 2 - 2), z = wl(x) + rng.range(-1, 1.5);
    addBoulder(kit, { r: rng.range(0.7, 1.2), seed: i + 7, t: { x, y: hAt(x, z), z } });
  }
  for (let i = 0; i < 6; i++) {
    const x = -W / 2 + ((i + 0.5) / 6) * W;
    parts.spots.push(kit.anchor('spot', { x, y: hAt(x, D * 0.3), z: D * 0.3 }));
  }
  parts.waterline = kit.anchor('waterline', { x: 0, y: seaLevel, z: wl(0) });
  const group = kit.build(new THREE.Group());
  group.name = opts.name ?? 'beach';
  group.userData.kind = 'beach';
  group.userData.surface = 'soft';
  group.userData.parts = parts;
  group.userData.heightAt = (x, z) => hAt(x, z);
  return group;
}

// ------------------------------------------------------------------ land masses
/**
 * Extruded land block from a closed XZ polygon: top at y = 0 (grass / paved / sand), sides of
 * harbour masonry down past the sea. Pair with quay() along edges that meet the water.
 * opts: top ('grass' | 'paved' | 'sand' | hex), seaLevel.
 */
export function harbourLand(points, opts = {}) {
  const seaLevel = opts.seaLevel ?? SEA_LEVEL;
  const kit = new Kit('harbourLand');
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  const depth = -seaLevel + 3;
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 4 });
  g.rotateX(-Math.PI / 2).translate(0, -depth, 0);
  const topHex = { grass: P.grass, paved: '#d9d0bf', sand: '#f4dfa8' }[opts.top ?? 'grass'] ?? opts.top;
  kit.addFaces(g, (x, y, z, c) => {
    if (y > -0.05) c.set(topHex);
    else masonry(c, y, seaLevel, hash3(Math.floor(x + z), Math.floor(y * 2), 1));
  }, undefined, opts.top === 'grass' || !opts.top ? materials.facet : materials.toy);
  const group = kit.build(new THREE.Group());
  group.name = opts.name ?? 'harbourLand';
  group.userData.kind = 'harbourLand';
  group.userData.surface = opts.top === 'sand' ? 'soft' : 'stone';
  group.userData.parts = {};
  return group;
}
