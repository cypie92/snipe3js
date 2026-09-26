// Small village architecture: phone box, pillar post box, bus stop, bandstand, wishing well.
// All face +Z, origin at ground centre.
import { THREE, materials, Kit, cbox, prism, polySolid, lathe, ngonFrustum, rngOf, shade, wobbleColor, DEG, TAU, addCollider, Tweens, ease } from './common.js';
import { box, cyl, ico, torus, cone } from '../../geo.js';
import { P } from '../../../gfx/palette.js';
import { labelMaterial, roundelMaterial } from './signs.js';
import { gableRoof } from './roofs.js';

const RED = '#e8413c';

let paneGlass = null;
/** See-through (and shoot-through) glazing for kiosks and shelters. */
export function paneGlassMaterial() {
  if (!paneGlass) {
    paneGlass = new THREE.MeshStandardMaterial({ color: '#cdefff', transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0, depthWrite: false, envMapIntensity: 1.6, side: THREE.DoubleSide });
    paneGlass.name = 'paneGlass';
    paneGlass.userData.passThrough = true;
  }
  return paneGlass;
}

/** Glazed panel at the kit's current frame (pane plane z = 0, bottom at y = 0): glass + glazing bars. */
function glazedPanel(kit, { w, h, color, rows = 4, cols = 3 }) {
  kit.raw(new THREE.PlaneGeometry(w, h), paneGlassMaterial(), { y: h / 2 });
  for (let c = 1; c < cols; c++) kit.add(box(0.05, h, 0.07), color, { x: -w / 2 + (c / cols) * w, y: h / 2, z: 0.01 });
  for (let r = 1; r < rows; r++) kit.add(box(w, 0.05, 0.07), color, { y: (r / rows) * h, z: 0.01 });
}

/**
 * Red telephone kiosk (~2.9 m). The glazing is see-through and shoot-through, so whatever is inside
 * (a caller, a golden spanner on the shelf) can be spotted and hit. The front door is hinged on the
 * front-left post: opts.open = opening angle in radians (0 = closed).
 * parts: door (pivot, rotation.y < 0 opens toward +Z), shelf (Object3D on the shelf top), top, doorstep.
 * userData: ring(secs) rattles it, openDoor(angle) -> Promise, update(dt, t).
 */
export function phoneBox(opts = {}) {
  const color = opts.color ?? RED;
  const kit = new Kit('phoneBox');
  const W = 1.12, H = 2.36;
  const pw = W - 0.22, ph = 1.62, py = 0.45;
  const dark = shade(color, -0.12);
  kit.add(cbox(W + 0.2, 0.2, W + 0.2, 0.05), dark, { y: 0.1 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.add(cbox(0.17, H, 0.17, 0.05), color, { x: sx * (W / 2 - 0.02), y: 0.2 + H / 2, z: sz * (W / 2 - 0.02) });
  // back + side walls (glass + bars); the front is the door (a separate part)
  for (const f of [1, 2, 3]) {
    kit.at({ ry: (f * Math.PI) / 2 }, () => kit.at({ z: W / 2 - 0.02 }, () => {
      kit.add(box(pw, 0.26, 0.08), color, { y: 0.33 });
      kit.add(box(pw, 0.12, 0.08), color, { y: 2.12 });
      kit.at({ y: py }, () => glazedPanel(kit, { w: pw, h: ph, color, rows: 6, cols: 3 }));
    }));
  }
  // TELEPHONE lightboxes on all four sides + stepped domed roof
  for (let f = 0; f < 4; f++) {
    kit.at({ ry: (f * Math.PI) / 2 }, () => {
      kit.add(box(W - 0.16, 0.22, 0.06), '#fff8ee', { y: 2.33, z: W / 2 + 0.02 });
      kit.raw(new THREE.PlaneGeometry(W - 0.26, 0.17), labelMaterial('TELEPHONE', { bg: '#fff8ee', fg: P.ink, w: 512, h: 80, radius: 0.1 }), { y: 2.33, z: W / 2 + 0.056 });
    });
  }
  kit.add(cbox(W + 0.16, 0.16, W + 0.16, 0.05), color, { y: 2.52 });
  kit.add(cbox(W + 0.02, 0.14, W + 0.02, 0.05), color, { y: 2.66 });
  kit.add(new THREE.SphereGeometry(0.64, 16, 5, 0, TAU, 0, Math.PI / 2), color, { y: 2.7, sy: 0.34, sx: 0.9, sz: 0.9 });
  kit.add(ico(0.1, 0), P.gold, { y: 2.93 }, materials.glossy);
  // interior: floor, back-wall shelf, black phone, yellow directory
  kit.add(box(W - 0.22, 0.02, W - 0.22), '#5a4a42', { y: 0.21 });
  kit.add(box(W - 0.3, 0.05, 0.34), P.woodDark, { y: 1.02, z: -W / 2 + 0.26 });
  kit.add(cbox(0.3, 0.36, 0.2, 0.04), P.ink, { y: 1.48, z: -W / 2 + 0.14 });
  kit.add(cbox(0.28, 0.07, 0.08, 0.03), '#3a3e4c', { y: 1.7, z: -W / 2 + 0.26 });
  kit.add(cyl(0.05, 0.05, 0.02, 10), '#d9dde6', { y: 1.5, z: -W / 2 + 0.25, rx: Math.PI / 2 });
  kit.add(cbox(0.22, 0.06, 0.28, 0.02), P.sunflower, { x: 0.28, y: 1.08, z: -W / 2 + 0.26 });
  const group = kit.build(new THREE.Group());
  group.name = opts.name ?? 'phoneBox';
  // hinged front door: bars + glass + handle
  const door = new THREE.Group();
  door.name = 'door';
  const dk = new Kit('phoneBoxDoor');
  dk.at({ x: (W - 0.04) / 2 }, () => {
    dk.add(box(pw, 0.26, 0.08), color, { y: 0.33 });
    dk.add(box(pw, 0.12, 0.08), color, { y: 2.12 });
    dk.at({ y: py }, () => glazedPanel(dk, { w: pw, h: ph, color, rows: 6, cols: 3 }));
    dk.add(box(0.06, 0.34, 0.06), P.ink, { x: pw / 2 - 0.12, y: 1.2, z: 0.05 });
  });
  dk.build(door);
  door.position.set(-W / 2 + 0.02, 0, W / 2 - 0.02);
  door.rotation.y = -(opts.open ?? 0);
  group.add(door);
  const top = new THREE.Object3D(); top.name = 'top'; top.position.set(0, 2.9, 0);
  const shelf = new THREE.Object3D(); shelf.name = 'shelf'; shelf.position.set(-0.02, 1.05, -W / 2 + 0.3);
  const doorstep = new THREE.Object3D(); doorstep.name = 'doorstep'; doorstep.position.set(0, 0.2, W / 2 + 0.4);
  group.add(top, shelf, doorstep);
  group.userData.kind = 'phoneBox';
  group.userData.surface = 'metal';
  group.userData.parts = { door, shelf, top, doorstep };
  const tw = new Tweens();
  let ringT = 0;
  group.userData.ring = (secs = 1.6) => { ringT = secs; };
  group.userData.openDoor = (angle = 1.9) => {
    const a0 = door.rotation.y;
    return tw.run('door', 0.6, (e) => { door.rotation.y = a0 + (-angle - a0) * e; }, angle > 0 ? ease.outBack : ease.outCubic);
  };
  group.userData.update = (dt, t) => {
    tw.update(Math.min(dt, 0.05));
    ringT = Math.max(0, ringT - dt);
    const a = ringT > 0 ? Math.sin(t * 60) * 0.02 * Math.min(1, ringT) : 0;
    for (const c of group.children) if (c.isMesh || c === door) c.rotation.z = a;
  };
  return group;
}

/** Chunky pillar post box (~1.6 m). */
export function postBox(opts = {}) {
  const color = opts.color ?? RED;
  const kit = new Kit('postBox');
  const r = 0.34;
  kit.add(cyl(r + 0.06, r + 0.08, 0.16, 16), P.ink, { y: 0.08 });
  kit.add(cyl(r, r + 0.02, 1.16, 18), [shade(color, -0.08), color], { y: 0.74 });
  kit.add(cyl(r + 0.07, r + 0.07, 0.1, 18), shade(color, -0.04), { y: 1.35 });
  kit.add(new THREE.SphereGeometry(r + 0.05, 18, 6, 0, TAU, 0, Math.PI / 2), color, { y: 1.38, sy: 0.55 });
  kit.add(ico(0.07, 0), shade(color, -0.1), { y: 1.62 });
  // slot with a little hood, collection plate, gold cipher
  kit.add(cbox(0.36, 0.1, 0.12, 0.03), shade(color, -0.1), { y: 1.2, z: r - 0.01 });
  kit.add(box(0.3, 0.05, 0.06), P.ink, { y: 1.13, z: r + 0.01 });
  kit.add(cbox(0.24, 0.17, 0.05, 0.02), '#fff8ee', { y: 0.94, z: r + 0.005 });
  kit.add(box(0.16, 0.025, 0.02), P.ink, { y: 0.96, z: r + 0.03 });
  kit.add(box(0.12, 0.025, 0.02), P.ink, { y: 0.91, z: r + 0.03 });
  kit.add(cyl(0.08, 0.08, 0.03, 12), P.gold, { y: 0.66, z: r + 0.005, rx: Math.PI / 2 }, materials.glossy);
  const group = kit.build(new THREE.Group());
  group.name = opts.name ?? 'postBox';
  const slot = new THREE.Object3D(); slot.name = 'slot'; slot.position.set(0, 1.13, r + 0.05); group.add(slot);
  group.userData.kind = 'postBox';
  group.userData.parts = { slot };
  return group;
}

/** Bus shelter + stop pole with a painted roundel. opts: color (frame/roof), side (pole side). */
export function busStop(opts = {}) {
  const rng = rngOf(opts.seed ?? 'bus', 'bus');
  const color = opts.color ?? P.teal;
  const kit = new Kit('busStop');
  const W = 3.4, H = 2.4, Dp = 1.35;
  const frame = shade(color, -0.1);
  // posts
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.add(cbox(0.12, H, 0.12, 0.04), frame, { x: sx * W / 2, y: H / 2, z: sz * Dp / 2 - (sz > 0 ? 0 : 0) });
  // glass back + sides
  kit.at({ z: -Dp / 2 }, () => glazedPanel(kit, { w: W - 0.12, h: H - 0.35, color: frame, rows: 2, cols: 3 }));
  for (const sx of [-1, 1]) kit.at({ x: sx * W / 2, z: -0.1, ry: sx * Math.PI / 2 }, () => glazedPanel(kit, { w: Dp - 0.35, h: H - 0.35, color: frame, rows: 2, cols: 1 }));
  // curved roof (three tilted slabs)
  for (let i = -1; i <= 1; i++) {
    kit.add(cbox(W + 0.4, 0.12, Dp * 0.45, 0.04), color, { y: H + 0.12 - Math.abs(i) * 0.08, z: i * Dp * 0.36 + 0.1, rx: -i * 0.18 });
  }
  kit.add(cbox(W + 0.44, 0.16, 0.14, 0.04), '#fff8ee', { y: H + 0.02, z: Dp / 2 + 0.33 });
  // bench + timetable
  kit.add(cbox(W - 0.6, 0.08, 0.42, 0.03), P.wood, { y: 0.5, z: -Dp / 2 + 0.32 });
  for (const sx of [-1, 1]) kit.add(box(0.07, 0.5, 0.36), P.metalDark, { x: sx * (W / 2 - 0.5), y: 0.25, z: -Dp / 2 + 0.3 });
  kit.add(cbox(0.7, 0.9, 0.05, 0.02), '#fff8ee', { x: W / 2 - 0.7, y: 1.5, z: -Dp / 2 + 0.06 });
  for (let i = 0; i < 5; i++) kit.add(box(0.5, 0.04, 0.02), i === 0 ? color : P.ink, { x: W / 2 - 0.7, y: 1.8 - i * 0.14, z: -Dp / 2 + 0.09 });
  // stop pole with roundel
  const px = (opts.side ?? 1) * (W / 2 + 0.9);
  const pz = Dp / 2 + 0.3;
  kit.add(cyl(0.06, 0.06, 2.9, 8), '#fff8ee', { x: px, y: 1.45, z: pz });
  kit.add(cyl(0.2, 0.22, 0.12, 10), P.ink, { x: px, y: 0.06, z: pz });
  kit.add(cyl(0.36, 0.36, 0.06, 20).rotateX(Math.PI / 2), shade(RED, -0.1), { x: px, y: 2.7, z: pz });
  const rm = roundelMaterial(opts.label ?? 'BUS', { ring: RED, band: P.cobalt });
  const disc = new THREE.CircleGeometry(0.34, 20);
  kit.raw(disc, rm, { x: px, y: 2.7, z: pz + 0.05 });
  kit.raw(disc, rm, { x: px, y: 2.7, z: pz - 0.05, ry: Math.PI });
  kit.add(cbox(0.36, 0.5, 0.12, 0.03), P.sunflower, { x: px, y: 1.7, z: pz + 0.08 });
  const group = kit.build(new THREE.Group());
  group.name = opts.name ?? 'busStop';
  const bench = new THREE.Object3D(); bench.name = 'bench'; bench.position.set(0, 0.55, -Dp / 2 + 0.32); group.add(bench);
  const sign = new THREE.Object3D(); sign.name = 'sign'; sign.position.set(px, 2.7, pz); group.add(sign);
  group.userData.kind = 'busStop';
  group.userData.parts = { bench, sign };
  void rng;
  return group;
}

/** Octagonal striped roof: each face its own colour (candy stripes). */
function stripedNgonRoof(kit, { n = 8, r, h, y, colors, tiers = 4, curve = 1.6, thick = 0.12, rot = Math.PI / 8 }) {
  const ring = (t) => {
    const rr = r * Math.pow(1 - t, curve);
    return Array.from({ length: n }, (_, i) => {
      const a = rot + (i / n) * TAU;
      return [Math.cos(a) * rr, y + t * h, Math.sin(a) * rr];
    });
  };
  for (let k = 0; k < tiers; k++) {
    const t0 = k / tiers, t1 = (k + 1) / tiers;
    const A = ring(t0), B = ring(t1);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const lip = k === 0 ? 1.04 : 1.0;
      const a0 = A[i].map((v, d) => (d === 1 ? v : v * lip)), a1 = A[j].map((v, d) => (d === 1 ? v : v * lip));
      const b0 = B[i], b1 = B[j];
      const down = (p) => [p[0] * 0.97, p[1] - thick, p[2] * 0.97];
      const g = polySolid([[a0, a1, b1, b0], [down(a0), down(a1), down(b1), down(b0)], [a0, a1, down(a1), down(a0)]], [0, y + t0 * h - thick * 2, 0]);
      kit.add(g, colors[i % colors.length]);
    }
  }
}

/** Victorian bandstand: octagonal platform, columns, balustrade, candy-striped roof. */
export function bandstand(opts = {}) {
  const kit = new Kit('bandstand');
  const R = opts.radius ?? 3.6;
  const white = '#fff8ee';
  const colA = opts.color ?? P.teal;
  const colB = opts.stripe ?? white;
  const base = 0.95;
  const stone = '#e3d6bd';
  kit.add(ngonFrustum(8, R + 0.25, R + 0.1, 0.25, Math.PI / 8), shade(stone, -0.12), { y: 0 });
  kit.add(ngonFrustum(8, R, R, base - 0.25, Math.PI / 8), [shade(stone, -0.05), stone], { y: 0.25 });
  kit.add(ngonFrustum(8, R + 0.15, R + 0.15, 0.14, Math.PI / 8), white, { y: base - 0.06 });
  // steps at the front
  for (let i = 0; i < 3; i++) kit.add(cbox(2.0, 0.24, 0.5, 0.05), shade(stone, -0.04 * i), { y: 0.12 + i * 0.26 - 0.1, z: R + 0.9 - i * 0.42 });
  // columns + balustrade
  const colH = 2.8;
  const pts = Array.from({ length: 8 }, (_, i) => {
    const a = Math.PI / 8 + (i / 8) * TAU;
    return [Math.cos(a) * (R - 0.2), Math.sin(a) * (R - 0.2), a];
  });
  for (const [x, z] of pts) {
    kit.add(cyl(0.11, 0.13, colH, 10), white, { x, y: base + colH / 2, z });
    kit.add(cbox(0.34, 0.14, 0.34, 0.04), white, { x, y: base + colH - 0.07, z });
    kit.add(cbox(0.34, 0.16, 0.34, 0.04), colA, { x, y: base + 0.08, z });
  }
  // front opening faces +Z: the side between columns 1 and 2 (angles 67.5 and 112.5 deg)
  for (let i = 0; i < 8; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % 8];
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const isFront = mz > R * 0.8;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ang = Math.atan2(x1 - x0, z1 - z0);
    // valance frieze under the roof on every side
    kit.add(box(len, 0.22, 0.08), colA, { x: mx, y: base + colH - 0.3, z: mz, ry: ang + Math.PI / 2 });
    kit.add(box(len, 0.06, 0.1), white, { x: mx, y: base + colH - 0.44, z: mz, ry: ang + Math.PI / 2 });
    if (isFront) continue;
    kit.add(cbox(len, 0.1, 0.14, 0.03), white, { x: mx, y: base + 0.95, z: mz, ry: ang + Math.PI / 2 });
    kit.add(box(len, 0.07, 0.1), white, { x: mx, y: base + 0.2, z: mz, ry: ang + Math.PI / 2 });
    const nb = 5;
    for (let b = 1; b <= nb; b++) {
      const t = b / (nb + 1);
      kit.add(cyl(0.045, 0.06, 0.72, 6), white, { x: x0 + (x1 - x0) * t, y: base + 0.58, z: z0 + (z1 - z0) * t });
    }
  }
  // roof
  const roofY = base + colH;
  kit.add(ngonFrustum(8, R + 0.35, R + 0.3, 0.2, Math.PI / 8), colA, { y: roofY - 0.05 });
  stripedNgonRoof(kit, { r: R + 0.3, h: 2.4, y: roofY + 0.14, colors: [colA, colB], tiers: 4, curve: 1.55 });
  // lantern cupola + finial
  const top = roofY + 0.14 + 2.4;
  kit.add(cyl(0.3, 0.36, 0.5, 8), white, { y: top - 0.1 });
  kit.add(cone(0.42, 0.55, 8), colA, { y: top + 0.42 });
  kit.add(ico(0.12, 0), P.gold, { y: top + 0.76 }, materials.glossy);
  kit.add(cyl(0.025, 0.025, 0.7, 5), P.ink, { y: top + 1.1 });
  kit.add(prism([[0, 0], [0.5, -0.12], [0, -0.26]], 0.03), P.tomato, { y: top + 1.42 });
  const group = kit.build(new THREE.Group());
  group.name = opts.name ?? 'bandstand';
  const stage = new THREE.Object3D(); stage.name = 'stage'; stage.position.set(0, base, 0); group.add(stage);
  const finial = new THREE.Object3D(); finial.name = 'finial'; finial.position.set(0, top + 0.8, 0); group.add(finial);
  group.userData.kind = 'bandstand';
  group.userData.parts = { stage, finial };
  group.userData.size = { width: 2 * R + 1, depth: 2 * R + 2, height: top + 1.5 };
  return group;
}

/**
 * Wishing well with a little roof, windlass, crank and bucket.
 *   parts.bucket (Group, move .position.y), parts.crank (rotates about X), parts.rope (scaled in y)
 *   userData.setBucket(level 0 = down the well .. 1 = up), animates in update.
 */
export function wellHouse(opts = {}) {
  const rng = rngOf(opts.seed ?? 'well', 'well');
  const kit = new Kit('wellHouse');
  const R = 0.95;
  const stone = opts.stone ?? '#d9cdb5';
  const roofC = opts.roof ?? P.roofTerracotta;
  // stone ring: lathe wall + chunky cap stones
  kit.add(lathe([[R - 0.24, 0.85], [R - 0.24, 0.1], [R, 0.0], [R + 0.06, 0.4], [R, 0.85]].reverse(), 18), [shade(stone, -0.1), stone]);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    kit.add(cbox(0.5, 0.2, 0.34, 0.06), wobbleColor(rng, stone, 0.05), { x: Math.cos(a) * (R - 0.1), y: 0.92, z: Math.sin(a) * (R - 0.1), ry: -a + Math.PI / 2 + rng.range(-0.06, 0.06) });
  }
  for (let i = 0; i < 10; i++) {
    const a = rng.range(0, TAU);
    kit.add(cbox(0.3, 0.16, 0.08, 0.04), wobbleColor(rng, shade(stone, -0.06), 0.05), { x: Math.cos(a) * (R + 0.04), y: rng.range(0.2, 0.7), z: Math.sin(a) * (R + 0.04), ry: -a + Math.PI / 2 });
  }
  kit.add(new THREE.CircleGeometry(R - 0.25, 16).rotateX(-Math.PI / 2), '#1d4e6b', { y: 0.45 });
  // posts, beam, roof
  const postH = 2.1;
  for (const s of [-1, 1]) kit.add(cbox(0.16, postH, 0.16, 0.04), P.woodDark, { x: s * (R + 0.02), y: postH / 2 + 0.2 });
  kit.add(cbox(2 * R + 0.5, 0.14, 0.2, 0.04), P.woodDark, { y: postH + 0.25 });
  kit.at({ y: postH + 0.3, ry: Math.PI / 2 }, () => {
    gableRoof(kit, { span: 1.7, length: 2 * R + 0.3, yW: 0, pitch: 42 * DEG, color: roofC, rng, gutter: null, rows: 3, gable: P.woodDark, ovL: 0.3, ovR: 0.3, t: 0.14 });
  });
  const group = kit.build(new THREE.Group());
  group.name = opts.name ?? 'wellHouse';

  // windlass: axle drum with rope + crank (crank spins)
  const axleY = 1.45;
  const crank = new THREE.Group();
  crank.name = 'crank';
  const ck = new Kit('crank');
  ck.add(cyl(0.1, 0.1, 2 * R + 0.1, 10), P.wood, { rz: Math.PI / 2 });
  ck.add(cyl(0.16, 0.16, 0.6, 10), '#d9b77a', { rz: Math.PI / 2 });
  ck.add(box(0.06, 0.45, 0.06), P.metalDark, { x: R + 0.1, y: -0.2 });
  ck.add(cyl(0.04, 0.04, 0.3, 6), P.woodDark, { x: R + 0.25, y: -0.4, rz: Math.PI / 2 });
  ck.build(crank);
  crank.position.set(0, axleY, 0);
  group.add(crank);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 5).translate(0, -0.5, 0), materials.solid('#c9a46a'));
  rope.name = 'rope';
  rope.position.set(0, axleY - 0.12, 0.12);
  group.add(rope);
  const bucket = new THREE.Group();
  bucket.name = 'bucket';
  const bk = new Kit('bucket');
  bk.add(cyl(0.2, 0.15, 0.3, 10), P.wood, { y: -0.17 });
  for (const y of [-0.08, -0.26]) bk.add(cyl(0.2 - (y + 0.08) * -0.15, 0.2 - (y + 0.08) * -0.15, 0.04, 10), P.metalDark, { y });
  bk.add(torus(0.19, 0.018, 4, 12, Math.PI), P.metalDark, { y: 0 });
  bk.build(bucket);
  addCollider(bucket, 0.35, [0, -0.15, 0]);
  group.add(bucket);
  const state = { level: opts.bucketUp ?? 1, target: opts.bucketUp ?? 1 };
  const place = () => {
    const y = THREE.MathUtils.lerp(0.2, axleY - 0.55, state.level);
    bucket.position.set(0, y, 0.12);
    rope.scale.y = Math.max(0.05, axleY - 0.12 - y);
  };
  place();
  group.userData.kind = 'wellHouse';
  group.userData.parts = { crank, bucket, rope };
  group.userData.setBucket = (level = 1) => { state.target = THREE.MathUtils.clamp(level, 0, 1); };
  group.userData.update = (dt) => {
    const d = state.target - state.level;
    if (Math.abs(d) > 1e-3) {
      const step = Math.sign(d) * Math.min(Math.abs(d), dt * 0.5);
      state.level += step;
      crank.rotation.x += step * 25;
      place();
    }
  };
  return group;
}
