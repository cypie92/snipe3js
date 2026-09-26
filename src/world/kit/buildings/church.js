// Village church: nave with buttresses + stained glass, west tower with clock, open belfry,
// bell, battlements, spire and weathervane. Front (tower door) faces +Z.
//   parts.bell         Group, pivot at the headstock axle (swing = rotation.z)
//   parts.clock        Group at the dial centre (facing +Z)
//   parts.hourHand / parts.minuteHand   pivot at the dial centre (rotation.z, clockwise = negative)
//   parts.weathervane  rotor Group, spins about Y
// userData.update(dt, t), userData.ringBell(strength), userData.clock = { time (s), rate }
import { THREE, materials, Kit, cbox, prism, extrude, lancetPath, archPath, ngonFrustum, lathe, rngOf, shade, wobbleColor, DEG, TAU, addCollider } from './common.js';
import { box, cyl, ico, torus, cone } from '../../geo.js';
import { P } from '../../../gfx/palette.js';
import { gableRoof, ngonRoof } from './roofs.js';
import { clockFaceMaterial, stainedGlassMaterial } from './signs.js';

export const CHURCH_STONE = '#f0dcb2';

/** Lancet window: stone surround + stained glass (one textured material for all of them). */
export function addStainedLancet(kit, { w = 1.1, h = 2.6, stone = CHURCH_STONE, uv = 'lancet' } = {}) {
  const glass = stainedGlassMaterial();
  const shape = lancetPath(w, h);
  const g = new THREE.ShapeGeometry(shape, 4);
  const uva = g.attributes.uv;
  for (let i = 0; i < uva.count; i++) uva.setXY(i, ((uva.getX(i) + w / 2) / w) * 0.5, uva.getY(i) / h);
  kit.raw(g, glass, { z: 0.02 });
  const outer = lancetPath(w + 0.36, h + 0.26);
  outer.holes.push(new THREE.Path(lancetPath(w, h).getPoints()));
  kit.add(extrude(outer, 0.26, { curveSegments: 1 }), shade(stone, 0.05), { z: 0.06 });
  kit.add(box(0.07, h - w * 0.3, 0.06), P.ink, { y: (h - w * 0.3) / 2, z: 0.05 });
  kit.add(cbox(w + 0.6, 0.16, 0.36, 0.05), shade(stone, 0.05), { y: -0.07, z: 0.12 });
}

function addButtress(kit, { h, depth = 0.6, w = 0.75, stone }) {
  const s2 = shade(stone, -0.03);
  const h1 = h * 0.55, h2 = h * 0.33;
  kit.add(cbox(w, h1, depth, 0.06), [shade(s2, -0.05), s2], { y: h1 / 2, z: depth / 2 });
  kit.add(prism([[0, 0], [depth, 0], [0, 0.45]], w - 0.02), s2, { y: h1, ry: -Math.PI / 2 });
  kit.add(cbox(w * 0.8, h2, depth * 0.6, 0.05), s2, { y: h1 + h2 / 2, z: depth * 0.3 });
  kit.add(prism([[0, 0], [depth * 0.6, 0], [0, 0.4]], w * 0.8 - 0.02), s2, { y: h1 + h2, ry: -Math.PI / 2 });
}

/** Classic bell (hollow lathe) hanging below an axle at the origin; swings about Z. */
export function makeBell({ r = 0.68, color = P.gold } = {}) {
  const kit = new Kit('bell');
  const s = r / 0.68;
  const outer = [[0.66, 0], [0.68, 0.04], [0.6, 0.15], [0.5, 0.35], [0.42, 0.6], [0.38, 0.85], [0.32, 1.02], [0.2, 1.1], [0.001, 1.12]];
  const inner = [[0.001, 0.98], [0.16, 0.96], [0.3, 0.85], [0.35, 0.6], [0.42, 0.34], [0.52, 0.14], [0.58, 0.03], [0.66, 0.0]];
  const top = -0.25;
  const lipY = top - 1.12 * s;
  kit.add(lathe(outer.map(([x, y]) => [x * s, y * s]), 16), [shade(color, -0.08), shade(color, 0.08)], { y: lipY }, materials.glossy);
  kit.add(lathe(inner.map(([x, y]) => [x * s, y * s]), 16), shade('#8a5a1b', -0.05), { y: lipY });
  kit.add(torus(0.62 * s, 0.05 * s, 5, 16), shade(color, 0.05), { y: lipY + 0.14 * s, rx: Math.PI / 2 }, materials.glossy);
  // headstock + axle + clapper
  kit.add(cbox(0.42, 0.3, 0.95, 0.06), P.woodDark, { y: -0.12 });
  kit.add(cyl(0.07, 0.07, 1.4, 8), P.metalDark, { rx: Math.PI / 2 });
  kit.add(cyl(0.035, 0.035, 1.0 * s, 6), P.metalDark, { y: lipY + 0.5 * s });
  kit.add(ico(0.13 * s, 1), P.metalDark, { y: lipY - 0.02 });
  const g = kit.build(new THREE.Group());
  g.name = 'bell';
  return g;
}

function makeHand(name, len, width, color) {
  const kit = new Kit(name);
  kit.add(cbox(width, len, 0.05, 0.02), color, { y: len / 2 - 0.12 });
  kit.add(prism([[-width * 1.4, 0], [width * 1.4, 0], [0, width * 2.6]], 0.05), color, { y: len - 0.14 });
  kit.add(prism([[-width * 1.2, 0], [0, -width * 1.2], [width * 1.2, 0], [0, width * 1.2]], 0.05), color, { y: len * 0.62 });
  const g = kit.build(new THREE.Group());
  g.name = name;
  return g;
}

/** A gold weathervane rotor: arrow + cockerel silhouette. Pivot at its base. */
export function makeWeathervane({ size = 1, color = P.gold } = {}) {
  const kit = new Kit('weathervane');
  const m = materials.glossy;
  const s = size;
  kit.add(cyl(0.04 * s, 0.04 * s, 0.9 * s, 6), color, { y: 0.45 * s }, m);
  kit.add(cyl(0.035 * s, 0.035 * s, 1.7 * s, 6), color, { x: 0.05 * s, y: 0.55 * s, rz: Math.PI / 2 }, m);
  kit.add(cone(0.14 * s, 0.34 * s, 4), color, { x: 0.95 * s, y: 0.55 * s, rz: -Math.PI / 2 }, m);
  kit.add(prism([[0, 0], [-0.42, 0.26], [-0.42, -0.26]].map(([x, y]) => [x * s, y * s]), 0.04 * s), color, { x: -0.62 * s, y: 0.55 * s }, m);
  const cock = [[-0.1, 0], [0.15, 0], [0.28, 0.12], [0.32, 0.3], [0.42, 0.42], [0.52, 0.44], [0.45, 0.5], [0.47, 0.6], [0.39, 0.64], [0.35, 0.57], [0.3, 0.64], [0.26, 0.56], [0.22, 0.42], [0.1, 0.3], [-0.12, 0.3], [-0.24, 0.58], [-0.36, 0.56], [-0.32, 0.4], [-0.42, 0.44], [-0.44, 0.26], [-0.28, 0.12]];
  const sh = new THREE.Shape();
  cock.forEach(([x, y], i) => (i ? sh.lineTo(x * 1.25 * s, y * 1.25 * s) : sh.moveTo(x * 1.25 * s, y * 1.25 * s)));
  kit.add(extrude(sh, 0.05 * s), color, { y: 0.6 * s }, m);
  const g = kit.build(new THREE.Group());
  g.name = 'weathervane';
  return g;
}

/**
 * church(opts): seed, stone, roof, spire (true), time (seconds since midnight, default 10:08),
 * clockRate (1 = real time), graves (count), bellColor.
 */
export function church(opts = {}) {
  const rng = rngOf(opts.seed ?? 'church', 'church');
  const kit = new Kit('church');
  const stone = opts.stone ?? CHURCH_STONE;
  const roof = opts.roof ?? P.roofSlate;
  const tw = 4.8, nw = 7.6, nl = 13.2;
  const D = tw + nl - 0.6;
  const zt = D / 2 - tw / 2;
  const zn = (-D / 2 + (D / 2 - tw + 0.6)) / 2;
  const wallH = 6.2;
  const parts = {};
  const light = shade(stone, 0.06);

  // ---------------- nave
  kit.add(cbox(nw + 0.36, 0.6, nl + 0.36, 0.1), [shade(stone, -0.2), shade(stone, -0.12)], { y: 0.18, z: zn });
  kit.add(cbox(nw, wallH, nl, 0.12), [shade(stone, -0.06), stone], { y: wallH / 2, z: zn });
  kit.add(cbox(nw + 0.2, 0.22, nl + 0.2, 0.06), light, { y: wallH - 0.1, z: zn });
  let nr;
  kit.at({ ry: Math.PI / 2, z: zn }, () => {
    nr = gableRoof(kit, { span: nw, length: nl, yW: wallH, pitch: 52 * DEG, color: roof, rng, gable: stone, ovL: 0.05, ovR: 0.4, barge: light, gutter: P.metalDark, rows: 9 });
  });
  // buttresses and stained-glass lancets along both sides
  const bays = 4;
  for (const sx of [-1, 1]) {
    for (let i = 0; i <= bays; i++) {
      const z = zn - nl / 2 + 0.6 + (i / bays) * (nl - 1.2);
      kit.at({ x: sx * nw / 2, z, ry: sx * Math.PI / 2 }, () => addButtress(kit, { h: wallH - 0.4, stone }));
    }
    for (let i = 0; i < bays; i++) {
      const z = zn - nl / 2 + 0.6 + ((i + 0.5) / bays) * (nl - 1.2);
      if (sx > 0 && i === bays - 1) continue; // porch here
      kit.at({ x: sx * nw / 2, y: 1.9, z, ry: sx * Math.PI / 2 }, () => addStainedLancet(kit, { w: 1.1, h: 2.9, stone }));
    }
  }
  // east end: rose window in the gable + a tall lancet trio
  kit.at({ z: zn - nl / 2, ry: Math.PI }, () => {
    const ry = wallH + 1.45;
    const R = 1.25;
    const g = new THREE.CircleGeometry(R, 20);
    const uva = g.attributes.uv;
    for (let i = 0; i < uva.count; i++) uva.setXY(i, 0.5 + uva.getX(i) * 0.5, 0.5 + uva.getY(i) * 0.5);
    kit.raw(g, stainedGlassMaterial(), { y: ry, z: 0.04 });
    kit.add(torus(R + 0.1, 0.16, 6, 24), light, { y: ry, z: 0.08 });
    for (let k = -1; k <= 1; k++) kit.at({ x: k * 1.5, y: 1.6 }, () => addStainedLancet(kit, { w: 0.9, h: k === 0 ? 3.4 : 2.8, stone }));
  });
  // side porch on +X near the tower
  kit.at({ x: nw / 2, z: zn + nl / 2 - 2.2 - 0.6, ry: Math.PI / 2 }, () => {
    const pw = 2.8, pd = 2.4, ph = 3.1;
    kit.add(cbox(pw, ph, pd, 0.1), [shade(stone, -0.06), stone], { y: ph / 2, z: pd / 2 });
    const hole = lancetPath(1.3, 2.3);
    const g = new THREE.ShapeGeometry(hole, 4);
    kit.add(g, '#4a3a3a', { z: pd + 0.01 });
    const ring = lancetPath(1.8, 2.65);
    ring.holes.push(new THREE.Path(lancetPath(1.3, 2.3).getPoints()));
    kit.add(extrude(ring, 0.2, { curveSegments: 1 }), light, { z: pd + 0.06 });
    kit.at({ y: ph, z: pd / 2 + 0.05, ry: Math.PI / 2 }, () => {
      gableRoof(kit, { span: pw, length: pd + 0.1, yW: 0, pitch: 50 * DEG, color: roof, rng, gable: stone, ovL: 0.3, ovR: 0.02, gutter: null, rows: 3, barge: light });
    });
    kit.add(cbox(pw + 0.6, 0.2, 1.0, 0.06), shade(stone, -0.12), { y: 0.06, z: pd + 0.45 });
  });

  // ---------------- tower
  const towerH = 11.7;
  kit.at({ z: zt }, () => {
    kit.add(cbox(tw + 0.5, 0.7, tw + 0.5, 0.12), [shade(stone, -0.2), shade(stone, -0.12)], { y: 0.22 });
    kit.add(cbox(tw, towerH, tw, 0.12), [shade(stone, -0.07), stone], { y: towerH / 2 });
    for (const y of [4.9, towerH - 0.1]) kit.add(cbox(tw + 0.24, 0.26, tw + 0.24, 0.07), light, { y });
    // clasping corner buttresses (front)
    for (const sx of [-1, 1]) {
      kit.at({ x: sx * (tw / 2 - 0.35), z: tw / 2, ry: 0 }, () => addButtress(kit, { h: 7.5, depth: 0.55, w: 0.7, stone }));
      kit.at({ x: sx * tw / 2, z: tw / 2 - 0.35, ry: sx * Math.PI / 2 }, () => addButtress(kit, { h: 7.5, depth: 0.55, w: 0.7, stone }));
    }
    // west door: pointed arch, oak, iron straps, steps
    kit.at({ z: tw / 2 }, () => {
      const dw = 1.8, dh = 3.0;
      const door = new THREE.ShapeGeometry(lancetPath(dw, dh), 4);
      kit.add(extrude(lancetPath(dw, dh), 0.14, { curveSegments: 1 }), [shade(P.woodDark, -0.05), shade(P.woodDark, 0.08)], { z: 0.02 });
      for (const y of [0.7, 1.9]) kit.add(box(dw * 0.92, 0.1, 0.05), P.ink, { y, z: 0.1 });
      kit.add(box(0.06, dh * 0.8, 0.05), shade(P.woodDark, -0.15), { y: dh * 0.4, z: 0.1 });
      kit.add(torus(0.1, 0.025, 4, 10), P.gold, { x: 0.3, y: 1.3, z: 0.12 }, materials.glossy);
      const ring = lancetPath(dw + 0.8, dh + 0.55);
      ring.holes.push(new THREE.Path(lancetPath(dw, dh).getPoints()));
      kit.add(extrude(ring, 0.36, { curveSegments: 1 }), light, { z: 0.12 });
      kit.add(cbox(dw + 1.6, 0.22, 1.1, 0.06), shade(stone, -0.14), { y: 0.05, z: 0.5 });
      kit.add(cbox(dw + 1.2, 0.2, 0.7, 0.06), shade(stone, -0.1), { y: 0.24, z: 0.3 });
      void door;
      parts.door = kit.anchor('door', { y: 0.3, z: 1.2 });
      // lancet above the door
      kit.at({ y: 5.45 }, () => addStainedLancet(kit, { w: 0.9, h: 2.0, stone }));
    });
    // small lancets on the tower sides
    for (const sx of [-1, 1]) kit.at({ x: sx * tw / 2, y: 6.2, ry: sx * Math.PI / 2 }, () => addStainedLancet(kit, { w: 0.7, h: 1.6, stone }));
    // clock backing
    kit.add(cbox(2.7, 2.7, 0.24, 0.1), light, { y: 9.25, z: tw / 2 + 0.1 });

    // belfry: four arch-pierced walls, open so the bell reads from afar
    const by0 = towerH, bh = 3.5;
    for (let f = 0; f < 4; f++) {
      const sh = new THREE.Shape();
      sh.moveTo(-tw / 2, 0); sh.lineTo(tw / 2, 0); sh.lineTo(tw / 2, bh); sh.lineTo(-tw / 2, bh); sh.lineTo(-tw / 2, 0);
      sh.holes.push(new THREE.Path(lancetPath(2.0, 2.85).getPoints().map((p) => new THREE.Vector2(p.x, p.y + 0.3))));
      kit.at({ y: by0, ry: (f * Math.PI) / 2 }, () => kit.add(extrude(sh, 0.5, { curveSegments: 1 }), [stone, light], { z: tw / 2 - 0.25 }));
    }
    kit.add(cbox(tw - 0.4, 0.3, tw - 0.4, 0.05), shade(stone, -0.25), { y: by0 + 0.1 });
    kit.add(box(0.34, 0.34, tw - 0.5), P.woodDark, { y: by0 + 2.45 });
    parts.belfry = kit.anchor('belfry', { y: by0 + 1.6 });
    // parapet, battlements, pinnacles
    const py = by0 + bh;
    kit.add(cbox(tw + 0.36, 0.4, tw + 0.36, 0.08), light, { y: py + 0.12 });
    const merl = 4;
    for (let f = 0; f < 4; f++) {
      kit.at({ ry: (f * Math.PI) / 2 }, () => {
        for (let i = 0; i < merl; i++) {
          const x = -tw / 2 + 0.35 + (i / (merl - 1)) * (tw - 0.7);
          if (i === 0 || i === merl - 1) continue;
          kit.add(cbox(0.6, 0.62, 0.42, 0.06), light, { x, y: py + 0.62, z: tw / 2 - 0.05 });
        }
      });
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      kit.at({ x: sx * (tw / 2 - 0.1), z: sz * (tw / 2 - 0.1) }, () => {
        kit.add(cbox(0.66, 0.8, 0.66, 0.06), light, { y: py + 0.7 });
        kit.add(ngonFrustum(4, 0.42, 0.02, 1.5, Math.PI / 4), roof, { y: py + 1.1 });
        kit.add(ico(0.12, 0), P.gold, { y: py + 2.62 }, materials.glossy);
      });
    }
    // octagonal spire
    if (opts.spire !== false) {
      const sy = py + 0.3;
      ngonRoof(kit, { n: 8, r: 1.95, h: 8.6, y: sy, color: roof, rng, tiers: 6, curve: 1.0, lip: 0.07, rot: Math.PI / 8 });
      const top = sy + 0.2 + 8.6;
      kit.add(ico(0.2, 1), P.gold, { y: top + 0.05 }, materials.glossy);
      kit.add(cyl(0.035, 0.035, 0.9, 6), P.ink, { y: top + 0.5 });
      // fixed compass arms
      for (let k = 0; k < 2; k++) kit.add(box(1.1, 0.05, 0.05), P.ink, { y: top + 0.45, ry: (k * Math.PI) / 2 });
      for (let k = 0; k < 4; k++) kit.add(ico(0.07, 0), P.gold, { x: Math.cos((k * Math.PI) / 2) * 0.58, y: top + 0.45, z: Math.sin((k * Math.PI) / 2) * 0.58 }, materials.glossy);
      parts.spireTop = kit.anchor('spireTop', { y: top + 0.95 });
    }
  });

  // ---------------- churchyard: a few friendly, wonky headstones
  const graves = opts.graves ?? 6;
  for (let i = 0; i < graves; i++) {
    const sx = i % 2 ? 1 : -1;
    const x = sx * (nw / 2 + rng.range(2.2, 4.6));
    const z = zn + rng.range(-nl / 2 + 1.5, nl / 2 - 3.5);
    kit.at({ x, z, ry: sx * Math.PI / 2 + rng.range(-0.2, 0.2), rz: rng.range(-0.12, 0.12) }, () => {
      const c = wobbleColor(rng, '#c9c3b8', 0.05);
      if (rng.chance(0.25)) {
        kit.add(cbox(0.18, 1.2, 0.16, 0.04), c, { y: 0.55 });
        kit.add(cbox(0.7, 0.18, 0.16, 0.04), c, { y: 0.85 });
      } else {
        kit.add(extrude(archPath(0.7, 1.0), 0.16, { curveSegments: 1 }), [shade(c, -0.08), c], { y: -0.1 });
      }
      kit.add(cbox(0.9, 0.12, 1.5, 0.05), '#6cbf4a', { y: 0.02, z: 0.9 });
    });
  }

  const group = kit.build(new THREE.Group());
  group.name = opts.name ?? 'church';

  // ---------------- moving parts
  const bell = makeBell({ r: 0.8, color: opts.bellColor ?? P.gold });
  bell.position.set(0, towerH + 2.45, zt);
  group.add(bell);
  addCollider(bell, 0.9, [0, -0.9, 0]);
  const clock = new THREE.Group();
  clock.name = 'clock';
  clock.position.set(0, 9.25, zt + tw / 2 + 0.22);
  const ck = new Kit('clockface');
  const R = 1.05;
  const face = new THREE.CircleGeometry(R, 28);
  ck.raw(face, clockFaceMaterial(), { z: 0.02 });
  ck.add(torus(R + 0.03, 0.09, 6, 28), P.gold, { z: 0.02 }, materials.glossy);
  ck.add(cyl(0.1, 0.1, 0.08, 10), P.gold, { z: 0.1, rx: Math.PI / 2 }, materials.glossy);
  ck.build(clock);
  const minuteHand = makeHand('minuteHand', 0.9, 0.09, P.ink);
  const hourHand = makeHand('hourHand', 0.6, 0.13, P.ink);
  minuteHand.position.z = 0.09;
  hourHand.position.z = 0.06;
  clock.add(hourHand, minuteHand);
  group.add(clock);
  const vane = makeWeathervane({ size: 1 });
  if (parts.spireTop) vane.position.copy(parts.spireTop.position);
  vane.rotation.y = rng.range(0, TAU);
  group.add(vane);

  Object.assign(parts, { bell, clock, hourHand, minuteHand, weathervane: vane });
  group.userData.kind = 'church';
  group.userData.parts = parts;
  group.userData.size = { width: nw + 10, depth: D, height: parts.spireTop ? parts.spireTop.position.y + 1.5 : 17 };
  const clockState = { time: opts.time ?? 10 * 3600 + 8 * 60, rate: opts.clockRate ?? 1 };
  const bellState = { angle: 0, vel: 0 };
  const vaneBase = vane.rotation.y;
  let vaneOverride = null;
  // take control of the weathervane: setVaneOverride((dt, t, vane) => {...}) or vane.userData.manual = true
  group.userData.setVaneOverride = (fn) => { vaneOverride = typeof fn === 'function' ? fn : null; };
  vane.userData.baseYaw = vaneBase;
  group.userData.clock = clockState;
  group.userData.bell = bellState;
  group.userData.ringBell = (strength = 1) => {
    bellState.vel += 2.6 * strength * (bellState.vel >= 0 ? 1 : -1);
  };
  group.userData.update = (dt, t) => {
    dt = Math.min(dt, 0.05);
    clockState.time += dt * clockState.rate;
    const hrs = clockState.time / 3600;
    minuteHand.rotation.z = -(hrs % 1) * TAU;
    hourHand.rotation.z = -((hrs % 12) / 12) * TAU;
    if (vaneOverride) vaneOverride(dt, t, vane);
    else if (!vane.userData.manual) vane.rotation.y = vaneBase + Math.sin(t * 0.21) * 0.6 + Math.sin(t * 1.37) * 0.07;
    const acc = -11 * Math.sin(bellState.angle) - 0.45 * bellState.vel;
    bellState.vel += acc * dt;
    bellState.angle += bellState.vel * dt;
    bell.rotation.z = bellState.angle;
  };
  group.userData.update(0, 0);
  return group;
}
