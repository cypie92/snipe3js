// Coastline backdrop for Barnacle Bay: open sea to the horizon (a simple replaceable ocean mesh),
// headland cliffs sweeping out on both sides, patchwork hills behind, distant islands (one with its
// own lighthouse), sea stacks, anchored sailboats and a steamer crossing the horizon.
import { THREE, materials, Kit, cbox, prism, ngonFrustum, rngOf, shade, wobbleColor, DEG, TAU, clamp } from './common.js';
import { box, cyl, ico, cone, sphere, jitter } from '../../geo.js';
import { P } from '../../../gfx/palette.js';
import { backdrop } from './backdrop.js';
import { SEA_LEVEL } from './harbour.js';

/** Faceted island: rock sides, sandy rim, grassy cap. Centre (x, z), radius r, height h above the sea. */
function addIsland(kit, { x, z, r, h, seaLevel, seed }) {
  const g = jitter(new THREE.IcosahedronGeometry(1, 2), 0.14, seed);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    // flatten the top into a plateau, keep the flanks steep
    p.setY(i, y > 0.35 ? 0.35 + (y - 0.35) * 0.35 : y);
  }
  g.computeVertexNormals();
  const sink = h * 0.9;
  const sy = (h + 0.2 * sink) / 0.58; // local top (0.58) lands at seaLevel + h
  const y0 = seaLevel - sink * 0.2;
  const tint = (cx, cz) => ({ range: (a, b) => a + (b - a) * ((Math.sin(cx * 91 + cz * 37) + 1) / 2) });
  kit.addFaces(g, (cx, cy, cz, c) => {
    if (cy > 0.3) c.set(wobbleColor(tint(cx, cz), '#7cc653', 0.04, 0.03, 0.01));
    else if (cy > 0.15) c.set(Math.sin(cx * 40 + cy * 70) > 0 ? '#c2ab86' : '#ab9a80');
    else if (cy > 0.04) c.set('#f0dca6');
    else c.set('#9a8a70');
  }, { x, y: y0, z, sx: r, sy, sz: r * 0.85, ry: seed }, materials.facet);
  return y0 + 0.55 * sy;
}

/**
 * harbourBackdrop(opts): seed, radius (850), inner (105), seaLevel (-1.6), sea (true | false),
 * seaInner (0 = full disc; >0 = ring hole so the level's own basin water shows through),
 * coastDist (95), mouth (150), headlandDepth (430), cliff (16), islands (true), ship (true), shipSpeed (7).
 * parts: sea (Mesh, hide/replace it when the level uses its own water), ship (Group), islands[] (anchors),
 * terrain, windmillSails. userData.update(dt, t), userData.heightAt(x, z), userData.coastZ(x).
 */
export function harbourBackdrop(opts = {}) {
  const seed = opts.seed ?? 11;
  const rng = rngOf(seed, 'harbourBackdrop');
  const seaLevel = opts.seaLevel ?? SEA_LEVEL;
  const radius = opts.radius ?? 850;
  const g = backdrop({
    radius, inner: opts.inner ?? 105, seed, sea: opts.sea, seaInner: opts.seaInner ?? 0,
    bay: { seaLevel, coastDist: opts.coastDist ?? 95, mouth: opts.mouth ?? 150, headlandDepth: opts.headlandDepth ?? 430, cliff: opts.cliff ?? 16 },
    windmillAngle: opts.windmillAngle ?? -1.25, windmillDist: opts.windmillDist ?? 300,
    spireAngle: opts.spireAngle ?? 1.42, spireDist: opts.spireDist ?? 360,
    hamlets: opts.hamlets ?? [[-1.4, 230, 6], [1.5, 250, 6], [-2.2, 300, 5], [2.3, 330, 5], [3.1, 420, 6], [-1.05, 460, 4], [1.1, 520, 4]],
    loneTrees: opts.loneTrees ?? 70, fieldSize: opts.fieldSize ?? 58,
  });
  g.name = opts.name ?? 'harbourBackdrop';
  g.userData.kind = 'harbourBackdrop';
  const heightAt = g.userData.heightAt;
  const kit = new Kit('seaFeatures');
  const parts = g.userData.parts;
  parts.islands = [];

  // ---- islands
  if (opts.islands !== false) {
    const list = opts.islandList ?? [[-0.35, 520, 70, 26], [0.3, 640, 110, 34], [0.85, 470, 55, 20], [-0.9, 760, 140, 44], [0.05, 900, 90, 30]];
    list.forEach(([a, d, r, h], i) => {
      const x = Math.sin(a) * d, z = -Math.cos(a) * d;
      const topY = addIsland(kit, { x, z, r, h, seaLevel, seed: i + 3 });
      parts.islands.push(Object.assign(new THREE.Object3D(), { name: 'island' }));
      parts.islands[i].position.set(x, topY, z);
      if (i === 0) {
        // a little lighthouse on the nearest island
        kit.at({ x: x + r * 0.2, y: topY - 1, z }, () => {
          kit.add(cyl(2.2, 2.8, 14, 10), ['#fff8ee', '#fff8ee'], { y: 7 });
          kit.add(cyl(2.3, 2.3, 3, 10), '#e8413c', { y: 5 });
          kit.add(cyl(2.3, 2.3, 3, 10), '#e8413c', { y: 11 });
          kit.add(cyl(1.5, 1.5, 2.5, 10), '#ffe7a0', { y: 15.2 }, materials.glossy);
          kit.add(cone(2.1, 2.2, 10), '#e8413c', { y: 17.5 });
        });
      } else if (i === 1 || i === 3) {
        for (let k = 0; k < 6; k++) {
          const tx = x + rng.range(-r * 0.4, r * 0.4), tz = z + rng.range(-r * 0.3, r * 0.3);
          kit.add(ico(rng.range(5, 8), 0), ['#4f9a3c', '#7cc653'], { x: tx, y: topY + 4, z: tz, sy: 1.1 }, materials.foliage);
        }
        kit.add(box(8, 5, 6), '#fff1d6', { x: x - r * 0.15, y: topY + 1.5, z });
        kit.add(prism([[-3.6, 0], [3.6, 0], [0, 3.2]], 8.6), P.roofTerracotta, { x: x - r * 0.15, y: topY + 4, z, ry: Math.PI / 2 });
      }
    });
    // sea stacks off the headlands
    for (const [a, d, hgt, r] of opts.stacks ?? [[-0.62, 360, 26, 7], [-0.55, 400, 16, 5], [0.72, 330, 30, 8], [0.66, 372, 18, 5.5], [-0.2, 380, 12, 4]]) {
      const x = Math.sin(a) * d, z = -Math.cos(a) * d;
      const sg = jitter(new THREE.CylinderGeometry(r * 0.7, r, hgt + 6, 7, 3), r * 0.12, a * 10);
      kit.addFaces(sg, (cx, cy, cz, c) => c.set(cy > hgt / 2 + 2 ? '#7cc653' : cy < -hgt / 2 ? '#8f8270' : Math.sin(cy * 1.7 + cx) > 0 ? '#c2ab86' : '#ab9a80'), { x, y: seaLevel + hgt / 2 - 3, z }, materials.facet);
      kit.add(ico(r * 0.72, 1), ['#5fae44', '#8fd35e'], { x, y: seaLevel + hgt + 0.4, z, sy: 0.35 }, materials.foliage);
    }
    // anchored sailboats
    for (let i = 0; i < (opts.sailboats ?? 5); i++) {
      const a = rng.range(-0.9, 0.9), d = rng.range(240, 560);
      const x = Math.sin(a) * d, z = -Math.cos(a) * d;
      if (g.userData.seaMask(x, z) < 0.9) continue;
      kit.at({ x, y: seaLevel, z, ry: rng.range(0, TAU), rz: rng.range(-0.08, 0.08) }, () => {
        kit.add(cbox(9, 1.6, 3, 0.5), rng.pick(['#fff8ee', P.tomato, P.cobalt, '#2f7d62']), { y: 0.4 });
        kit.add(cyl(0.18, 0.18, 11, 5), '#fff8ee', { y: 6.5 });
        kit.add(prism([[0, 0], [5.5, 0], [0, 9.5]], 0.2), rng.pick(['#fff8ee', '#ffe590', '#ffd9e2']), { x: 0.3, y: 1.8 });
        kit.add(prism([[0, 0], [-3.2, 0], [0, 7.5]], 0.2), '#fff8ee', { x: -0.3, y: 1.8 });
      });
    }
  }
  const sf = kit.build(new THREE.Group(), { shadows: false });
  sf.name = 'seaFeatures';
  sf.children.forEach((m) => { m.castShadow = false; m.receiveShadow = false; });
  g.add(sf);

  // ---- steamer crossing the horizon
  let ship = null;
  const smoke = [];
  if (opts.ship !== false) {
    ship = new THREE.Group();
    ship.name = 'ship';
    const sk = new Kit('ship');
    sk.add(cbox(60, 7, 11, 1.6), ['#2f3b52', '#3a4a66'], { y: 1.5 });
    sk.add(prism([[0, -2], [9, 5], [0, 5]], 10.8), '#3a4a66', { x: 30, y: 0 });
    sk.add(box(61, 1.2, 11.2), '#d8433c', { y: -1.4 });
    sk.add(box(62, 0.5, 11.3), '#fff8ee', { y: 4.9 });
    sk.add(cbox(22, 5, 8, 0.6), '#fff8ee', { x: -6, y: 7.5 });
    sk.add(cbox(12, 3.5, 6.5, 0.5), '#fff8ee', { x: -4, y: 11.5 });
    for (let i = 0; i < 6; i++) sk.add(box(1.2, 1.0, 8.2), '#2f5f96', { x: -14 + i * 3.4, y: 8, z: 0 });
    sk.add(cyl(2.2, 2.4, 9, 12), '#e8413c', { x: -2, y: 15.5 });
    sk.add(cyl(2.25, 2.25, 1.8, 12), '#2b2b3a', { x: -2, y: 19.4 });
    sk.add(cyl(0.35, 0.35, 16, 5), '#fff8ee', { x: 16, y: 13 });
    sk.add(cyl(0.3, 0.3, 12, 5), '#fff8ee', { x: -24, y: 11 });
    sk.build(ship, { shadows: false });
    ship.children.forEach((m) => { m.castShadow = false; m.receiveShadow = false; });
    const puffMat = new THREE.MeshStandardMaterial({ color: '#e8e4dc', roughness: 1, flatShading: true });
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6, 0), puffMat);
      m.name = 'smoke';
      ship.add(m);
      smoke.push(m);
    }
    ship.position.set(opts.shipStart ?? -260, seaLevel, opts.shipZ ?? -780);
    g.add(ship);
    parts.ship = ship;
  }
  const baseUpdate = g.userData.update;
  const shipSpeed = opts.shipSpeed ?? 7;
  const sway = { t: 0 };
  g.userData.update = (dt, t) => {
    baseUpdate(dt, t);
    if (!ship) return;
    ship.position.x += shipSpeed * Math.min(dt, 0.1);
    if (ship.position.x > 1400) ship.position.x = -1400;
    ship.rotation.z = Math.sin(t * 0.6) * 0.012;
    sway.t = t;
    smoke.forEach((m, i) => {
      const k = ((t * 0.18 + i / smoke.length) % 1);
      m.position.set(-2 - k * 28, 21 + k * 10, Math.sin(t * 0.5 + i) * 1.5);
      m.scale.setScalar(0.8 + k * 2.2);
    });
  };
  g.userData.update(0, 0);
  g.userData.heightAt = heightAt;
  return g;
}
