// Telescopic mast: a fixed base sleeve in the van roof + sliding sections, each carrying one section
// of the front extension ladder (the top one climbs through the crow's-nest hatch). Everything is
// drawn by ONE LiveMesh whose pieces follow the section pivots; setExtension(m) slides them.
import * as THREE from 'three';
import { part, merge } from '../geo.js';
import { materials } from '../../gfx/materials.js';
import { P } from '../../gfx/palette.js';
import { bev, puck, ball, arc } from '../kit/props/lib.js';
import { LiveMesh } from '../kit/props/index.js';

const CREAM = '#fff4e0';
const RADII = [0.39, 0.33, 0.275, 0.225, 0.18];
const LADDER_X = 0.22;

function ladder(y0, y1, z, { rungs = true, hoop = 0 } = {}) {
  const L = [];
  for (const s of [-1, 1]) {
    L.push(part(new THREE.CylinderGeometry(0.04, 0.04, y1 - y0, 10), P.sunflower, { x: s * LADDER_X, y: (y0 + y1) / 2, z }));
    L.push(part(ball(0.052, 1), P.sunflower, { x: s * LADDER_X, y: y1, z }));
  }
  if (rungs) {
    for (let y = y0 + 0.2; y < y1 - 0.08; y += 0.3) {
      L.push(part(new THREE.CylinderGeometry(0.03, 0.03, LADDER_X * 2, 8), CREAM, { y, z, rz: Math.PI / 2 }));
    }
  }
  if (hoop) L.push(part(arc(LADDER_X, 0.04, Math.PI, 8, 18), P.sunflower, { y: y1, z }));
  return L;
}

/**
 * opts: { floorY (top of the last section when fully raised), collapsedTop (first section top
 * when stowed), roofY, ladderTopExtra (how far the top ladder reaches above its section top) }.
 * Returns { group, sections, setExtension(m), topY(m), n }.
 */
export function buildMast({ fullTop = 9.96, baseTop = 2.98, collapsedTop = 3.06, ladderAbove = 1.0, hatchZ = -0.82 } = {}) {
  const stagger = 0.06;
  // enough sections that each overlaps its parent by >= 0.55 m with a <= 2.35 m section length
  let n = 4;
  while ((fullTop - (collapsedTop + stagger * (n - 1))) / n > 1.75 && n < RADII.length) n++;
  const cTop = (i) => collapsedTop + stagger * i;
  const travel = (fullTop - cTop(n - 1)) / n;
  const len = Math.max(2.35, travel + stagger + 0.6);

  const group = new THREE.Group();
  group.name = 'mast';
  const live = new LiveMesh(materials.toy);
  live.name = 'mastSections';

  // fixed base sleeve (cobalt) with a sunflower collar
  const base = new THREE.Group();
  base.name = 'mastBase';
  group.add(base);
  const baseR = RADII[0] + 0.05;
  live.addPiece(base, merge([
    part(new THREE.CylinderGeometry(baseR, baseR, baseTop - 0.9, 26), P.cobalt, { y: (baseTop + 0.9) / 2 }),
    part(puck(baseR + 0.06, 0.16, 0.045, 26), P.sunflower, { y: baseTop - 0.06 }),
  ]));

  const sections = [];
  const zs = [];
  for (let i = 0; i < n; i++) zs.push(hatchZ + (n - 1 - i) * 0.045);
  for (let i = 0; i < n; i++) {
    const r = RADII[i];
    const pivot = new THREE.Group();
    pivot.name = `mastSection${i}`;
    pivot.position.y = cTop(i);
    group.add(pivot);
    const top = i === n - 1;
    const z = zs[i];
    const L = [
      part(new THREE.CylinderGeometry(r, r, len, 24), [shadeHex(CREAM, -0.06), CREAM], { y: -len / 2 }),
      part(puck(r + 0.05, 0.16, 0.045, 24), P.tomato, { y: -0.08 }),
      part(new THREE.TorusGeometry(r + 0.012, 0.028, 6, 26), P.cobalt, { y: -0.26, rx: Math.PI / 2 }),
      // ladder bracket from the tube to the ladder section
      part(bev(0.1, 0.08, Math.abs(z) - r + 0.02, 0.025), P.metalDark, { y: -0.36, z: (z - r) / 2 + 0.01 }),
      part(bev(LADDER_X * 2 + 0.1, 0.08, 0.08, 0.025), P.metalDark, { y: -0.36, z }),
    ];
    const lTop = top ? ladderAbove : -0.08;
    L.push(...ladder(-2.2, lTop, z, { hoop: top }));
    if (top) {
      // second bracket high up so the top ladder reads as braced to the nest
      L.push(part(bev(0.1, 0.08, Math.abs(z) - r + 0.02, 0.025), P.metalDark, { y: -1.25, z: (z - r) / 2 + 0.01 }));
    }
    live.addPiece(pivot, merge(L));
    sections.push(pivot);
  }
  group.add(live);
  live.build();

  const smooth = (x) => x * x * (3 - 2 * x);
  const fracs = new Array(n).fill(0);
  /** m 0..1: sections slide out one after another (bottom first) with a little overlap. */
  function setExtension(m) {
    m = Math.min(1, Math.max(0, m));
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const a = i / n - (i ? 0.04 : 0), b = (i + 1) / n + (i < n - 1 ? 0.04 : 0);
      const lin = Math.min(1, Math.max(0, (m - a) / (b - a)));
      fracs[i] = lin * 0.45 + smooth(lin) * 0.55;
      acc += fracs[i] * travel;
      sections[i].position.y = cTop(i) + acc;
    }
    live.sync();
    return sections[n - 1].position.y;
  }
  setExtension(0);
  return { group, live, sections, setExtension, n, travel, len, topY: () => sections[n - 1].position.y };
}

function shadeHex(hex, k) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(1 + k);
  return `#${c.getHexString()}`;
}
