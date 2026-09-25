// Street furniture: lamp posts, benches, bins, bollards, planters, signposts, notice boards,
// bike racks, hydrants, traffic cones, garden taps. Origin = ground centre, front = +Z.
import * as THREE from 'three';
import { part, merge } from '../../geo.js';
import { materials } from '../../../gfx/materials.js';
import { P } from '../../../gfx/palette.js';
import { Rng } from '../../../core/rng.js';
import {
  bev, lathe, puck, ball, rod, arc, slab, latheBands, lettering, mesh, pivot, finish,
  boxCollider, ballCollider, Anims, ease, LiveMesh, shade, lean,
} from './lib.js';

const TYRE = '#3b3f4f';
const lerp = THREE.MathUtils.lerp;

// ---------------------------------------------------------------- lamp post

const LAMP_COLORS = ['#2f6e5c', '#34466e', '#2f5f8a', '#7a3b52'];
const bulbOff = () => materials.solid('#efe6c8', { roughness: 0.35 });

/**
 * lampPost({ seed, height = 4.4, color, arms: 1|2, lit = true, tilt = 0.03 (seeded hand-made lean) })
 * parts: { bulb (emissive mesh, has collider), post }. userData: setLit(bool), setFlicker(bool), lit.
 */
export function lampPost({ seed = 1, height = 4.4, color, arms = 1, lit = true, tilt = 0.03 } = {}) {
  const rng = new Rng(`lamp-${seed}`);
  const c = color || rng.pick(LAMP_COLORS);
  const gold = P.gold;
  const H = height;
  const L = [];
  const B = [];
  const bulbCentres = [];
  L.push(latheBands([[0, 0], [0.32, 0], [0.32, 0.09], [0.26, 0.15], [0.2, 0.52], [0.25, 0.57], [0.18, 0.66], [0, 0.66]], 10, () => c));
  L.push(part(puck(0.17, 0.07, 0.025, 10), gold, { y: 0.68 }));
  const topY = arms === 2 ? H - 0.1 : H - 1.0;
  L.push(part(new THREE.CylinderGeometry(0.075, 0.105, topY - 0.66, 8), c, { y: (topY + 0.66) / 2 }));
  L.push(part(puck(0.12, 0.09, 0.03, 10), gold, { y: H * 0.5 }));
  const lantern = (x, y) => {
    L.push(part(lathe([[0.04, -0.12], [0.1, -0.04], [0.22, 0.1], [0.23, 0.15], [0.19, 0.17]], 4), c, { x, y, ry: Math.PI / 4 }));
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      L.push(part(new THREE.BoxGeometry(0.055, 0.56, 0.055), c, { x: x + sx * 0.14, y: y + 0.44, z: sz * 0.14 }));
    }
    L.push(part(bev(0.36, 0.06, 0.36, 0.025), gold, { x, y: y + 0.74 }));
    L.push(part(new THREE.ConeGeometry(0.34, 0.32, 4), c, { x, y: y + 0.92, ry: Math.PI / 4 }));
    L.push(part(ball(0.075, 0), gold, { x, y: y + 1.13 }));
    B.push(part(ball(0.17, 1), '#fff', { x, y: y + 0.42, sy: 1.3 }));
    bulbCentres.push([x, y + 0.42]);
  };
  if (arms === 2) {
    L.push(part(bev(1.55, 0.1, 0.1, 0.035), c, { y: H - 0.05 }));
    L.push(part(ball(0.1, 1), gold, { y: H + 0.08 }));
    for (const sx of [-1, 1]) {
      L.push(part(arc(0.2, 0.035, Math.PI / 2, 5, 6), c, { x: sx * 0.28, y: H - 0.3, rz: sx > 0 ? Math.PI / 2 : 0 }));
      L.push(part(ball(0.06, 0), gold, { x: sx * 0.78, y: H - 0.05 }));
      L.push(part(rod([sx * 0.66, H - 0.1, 0], [sx * 0.66, H - 0.3, 0], 0.025, 5), c));
      lantern(sx * 0.66, H - 1.45);
    }
  } else {
    L.push(part(bev(0.64, 0.07, 0.07, 0.025), c, { y: topY - 0.4 }));
    L.push(part(ball(0.05, 0), gold, { x: 0.34, y: topY - 0.4 }), part(ball(0.05, 0), gold, { x: -0.34, y: topY - 0.4 }));
    lantern(0, topY + 0.12);
  }
  const g = new THREE.Group();
  const post = mesh(L, materials.toy, 'post');
  const bulb = mesh(B, materials.emissive('#ffe6a0', 2.2), 'bulb');
  bulb.castShadow = false;
  for (const [x, y] of bulbCentres) bulb.add(ballCollider(0.34, { x, y }));
  g.add(post, bulb);
  lean(g, rng, tilt);
  const anims = new Anims();
  let flicker = false;
  let flickT = 0;
  finish(g, {
    name: 'lampPost', parts: { bulb, post }, surface: 'metal', anims,
    tick: (dt) => {
      if (!flicker || !g.userData.lit) return;
      flickT -= dt;
      if (flickT <= 0) {
        flickT = Math.random() < 0.3 ? 0.05 + Math.random() * 0.1 : 0.15 + Math.random() * 0.8;
        bulb.material = bulb.material === bulbOff() ? materials.emissive('#ffe6a0', 2.2) : bulbOff();
      }
    },
  });
  g.userData.setLit = (on) => {
    g.userData.lit = !!on;
    bulb.material = on ? materials.emissive('#ffe6a0', 2.2) : bulbOff();
  };
  g.userData.setFlicker = (on) => {
    flicker = !!on;
    if (!on && g.userData.lit) bulb.material = materials.emissive('#ffe6a0', 2.2);
  };
  g.userData.setLit(lit);
  return g;
}

// ---------------------------------------------------------------- bench

/** bench({ seed, length = 1.9, color (iron), wood }) — park bench, 1 draw call. */
export function bench({ seed = 1, length = 1.9, color, wood } = {}) {
  const rng = new Rng(`bench-${seed}`);
  const iron = color || rng.pick(['#2f6e5c', '#3a5fb0', '#c8503a', '#34466e']);
  const w = wood || rng.pick([P.wood, P.woodLight, '#c98a4e']);
  const half = length / 2;
  const L = [];
  for (let i = 0; i < 3; i++) L.push(part(bev(length, 0.075, 0.15, 0.03), shade(w, (i - 1) * 0.07), { y: 0.47, z: 0.17 - i * 0.17 }));
  for (let i = 0; i < 2; i++) L.push(part(bev(length, 0.15, 0.065, 0.03), shade(w, i * 0.06), { y: 0.68 + i * 0.21, z: -0.3 - i * 0.045, rx: -0.2 }));
  for (const sx of [-1, 1]) {
    const x = sx * (half - 0.17);
    L.push(part(bev(0.085, 0.48, 0.1, 0.035), iron, { x, y: 0.23, z: 0.2, rx: -0.14 }));
    L.push(part(bev(0.085, 1.02, 0.1, 0.035), iron, { x, y: 0.5, z: -0.22, rx: -0.2 }));
    L.push(part(bev(0.075, 0.08, 0.6, 0.03), iron, { x, y: 0.42, z: -0.02 }));
    L.push(part(bev(0.1, 0.075, 0.56, 0.035), iron, { x, y: 0.7, z: 0.0 }));
    L.push(part(bev(0.075, 0.24, 0.075, 0.03), iron, { x, y: 0.58, z: 0.22 }));
    L.push(part(arc(0.075, 0.032, Math.PI * 1.4, 5, 8), iron, { x, y: 0.66, z: 0.29, ry: Math.PI / 2, rz: -0.6 }));
    L.push(part(bev(0.12, 0.05, 0.16, 0.02), iron, { x, y: 0.025, z: 0.24 }));
    L.push(part(bev(0.12, 0.05, 0.16, 0.02), iron, { x, y: 0.025, z: -0.13 }));
  }
  const g = new THREE.Group();
  const m = mesh(L, materials.toy, 'bench');
  g.add(m);
  return finish(g, { name: 'bench', parts: { bench: m }, surface: 'wood' });
}

// ---------------------------------------------------------------- bin

/**
 * bin({ seed, color, overflow = false }) — litter bin with hinged domed lid.
 * parts: { lid (pivot at back hinge; rotation.x < 0 opens), body }. userData: setOpen(bool), pop().
 */
export function bin({ seed = 1, color, overflow = false } = {}) {
  const rng = new Rng(`bin-${seed}`);
  const c = color || rng.pick(['#3f9a4e', '#2f7fd0', '#2ec4b6', '#e0643c']);
  const dark = shade(c, -0.3);
  const light = shade(c, 0.3);
  const L = [];
  L.push(latheBands([[0, 0], [0.3, 0], [0.33, 0.05], [0.31, 0.1], [0.34, 0.14], [0.36, 0.3], [0.385, 0.32], [0.385, 0.37], [0.365, 0.39],
    [0.38, 0.84], [0.42, 0.87], [0.42, 0.97], [0.38, 0.985], [0, 0.985]], 14,
  (y) => (y < 0.13 ? dark : y > 0.85 || (y > 0.3 && y < 0.39) ? light : c)));
  L.push(part(bev(0.34, 0.24, 0.05, 0.02), '#fff4e0', { y: 0.6, z: 0.36, rx: -0.03 }));
  L.push(part(arc(0.065, 0.022, Math.PI * 1.5, 5, 8), c, { y: 0.6, z: 0.395 }));
  L.push(part(new THREE.ConeGeometry(0.04, 0.06, 4), c, { x: 0.065, y: 0.58, z: 0.395, rz: Math.PI }));
  const g = new THREE.Group();
  const bodyMesh = mesh(L, materials.toy, 'body');
  g.add(bodyMesh);
  const lidPivot = pivot('lid', 0, 0.985, -0.41);
  const lidMesh = mesh([
    part(lathe([[0, 0], [0.43, 0], [0.43, 0.05], [0.37, 0.1], [0.24, 0.18], [0, 0.2]], 14), c, { z: 0.41 }),
    part(ball(0.065, 1), light, { y: 0.22, z: 0.41 }),
    part(bev(0.3, 0.09, 0.06, 0.025), '#3b3f4f', { y: 0.1, z: 0.41 + 0.32, rx: -0.75 }),
  ], materials.toy, 'lidMesh');
  lidPivot.add(lidMesh);
  g.add(lidPivot);
  if (overflow) {
    const R = [];
    R.push(part(ball(0.11, 0), '#f3ead6', { x: 0.15, y: 1.02, z: 0.05 }), part(ball(0.09, 0), '#e8dcc2', { x: -0.12, y: 1.0, z: 0.14 }));
    R.push(part(lathe([[0, 0], [0.06, 0], [0.06, 0.16], [0.025, 0.22], [0.025, 0.27], [0, 0.27]], 8), '#5fbf7a', { x: -0.08, y: 0.9, z: -0.05, rz: 0.5 }));
    for (let i = 0; i < 3; i++) {
      R.push(part(new THREE.CapsuleGeometry(0.035, 0.16, 2, 6), '#ffd84a', { x: 0.28 + i * 0.05, y: 0.9 - i * 0.04, z: 0.2 + (i - 1) * 0.08, rz: 0.9 + i * 0.25, rx: (i - 1) * 0.5 }));
    }
    R.push(part(ball(0.1, 0), '#f3ead6', { x: 0.55, y: 0.08, z: 0.3 }), part(ball(0.08, 0), '#e8dcc2', { x: -0.45, y: 0.07, z: 0.45 }));
    const rub = mesh(R, materials.toy, 'rubbish');
    g.add(rub);
    lidPivot.rotation.x = -0.5;
  }
  const anims = new Anims();
  const closedAngle = lidPivot.rotation.x;
  finish(g, { name: 'bin', parts: { lid: lidPivot, body: bodyMesh }, surface: 'metal', anims });
  g.userData.setOpen = (open) => {
    const from = lidPivot.rotation.x;
    const to = open ? -1.95 : closedAngle;
    return anims.play(open ? 0.5 : 0.6, (k) => { lidPivot.rotation.x = lerp(from, to, k); }, { ease: open ? ease.outBack : ease.outBounce, key: 'lid' });
  };
  g.userData.pop = () => anims.play(0.9, (k) => {
    const up = Math.sin(Math.min(1, k * 1.6) * Math.PI);
    lidPivot.position.y = 0.985 + up * 0.35;
    lidPivot.rotation.x = closedAngle - up * 0.9 + Math.sin(k * 30) * (1 - k) * 0.08;
  }, { key: 'lid' });
  return g;
}

// ---------------------------------------------------------------- bollard

/** bollard({ seed, color, band }) — chunky street bollard, 1 draw call. */
export function bollard({ seed = 1, color, band, tilt = 0.04 } = {}) {
  const rng = new Rng(`bollard-${seed}`);
  const c = color || rng.pick(['#34466e', '#2f6e5c', '#4a5566']);
  const b = band || rng.pick(['#fff4e0', P.gold]);
  const g = new THREE.Group();
  const m = mesh([latheBands([[0, 0], [0.19, 0], [0.19, 0.05], [0.155, 0.08], [0.14, 0.58], [0.145, 0.6], [0.145, 0.7], [0.14, 0.72],
    [0.15, 0.76], [0.16, 0.8], [0.12, 0.9], [0.06, 0.95], [0, 0.96]], 12,
  (y) => (y > 0.6 && y < 0.72 ? b : y > 0.76 && y < 0.8 ? b : c))], materials.toy, 'bollard');
  g.add(m);
  lean(g, rng, tilt);
  return finish(g, { name: 'bollard', parts: { bollard: m }, surface: 'metal' });
}

// ---------------------------------------------------------------- planter

/** planter({ seed, w = 1.5, d = 0.7, h = 0.55, plant: 'flowers'|'shrub'|'topiary', color }) — 2 draw calls. */
export function planter({ seed = 1, w = 1.5, d = 0.7, h = 0.55, plant = 'flowers', color } = {}) {
  const rng = new Rng(`planter-${seed}`);
  const box = color || rng.pick([P.wood, '#5b7db1', '#2f9e91', '#c8503a']);
  const L = [];
  const walls = [[w, 0.08, 0, d / 2 - 0.04], [w, 0.08, 0, -d / 2 + 0.04], [0.08, d, w / 2 - 0.04, 0], [0.08, d, -w / 2 + 0.04, 0]];
  for (const [ww, dd, x, z] of walls) {
    for (let i = 0; i < 2; i++) L.push(part(bev(ww, h / 2 - 0.015, dd, 0.025), shade(box, i ? 0.1 : 0), { x, y: h / 4 + i * h / 2, z }));
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    L.push(part(bev(0.12, h + 0.06, 0.12, 0.035), shade(box, -0.22), { x: sx * (w / 2 - 0.03), y: (h + 0.06) / 2, z: sz * (d / 2 - 0.03) }));
    L.push(part(ball(0.07, 0), shade(box, -0.22), { x: sx * (w / 2 - 0.03), y: h + 0.1, z: sz * (d / 2 - 0.03) }));
  }
  L.push(part(bev(w - 0.12, 0.1, d - 0.12, 0.03), '#7a5234', { y: h - 0.07 }));
  const F = [];
  const leafy = ['#3f8f3a', '#5aaa45', '#78c052'];
  if (plant === 'topiary') {
    L.push(part(rod([0, h - 0.05, 0], [0, h + 0.55, 0], 0.035, 6), P.woodDark));
    F.push(part(ball(0.36, 1), leafy[1], { y: h + 0.75 }));
    F.push(part(ball(0.22, 1), leafy[2], { x: 0.45, y: h + 0.2 }), part(ball(0.2, 1), leafy[0], { x: -0.45, y: h + 0.18 }));
  } else if (plant === 'shrub') {
    for (let i = 0; i < 3; i++) F.push(part(ball(0.3, 1), leafy[i], { x: (i - 1) * 0.45, y: h + 0.15, sy: 0.85 }));
  } else {
    const cols = rng.shuffle([P.tomato, P.sunflower, P.bubblegum, '#fff4e6', P.violet, P.tangerine]).slice(0, 2);
    const n = Math.max(3, Math.round(w / 0.22));
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + 0.16 + (i / (n - 1)) * (w - 0.32);
      for (const z of [-0.12, 0.12]) {
        F.push(part(ball(0.15, 0), leafy[(i + (z > 0 ? 1 : 0)) % 3], { x, y: h + 0.06, z, sy: 0.8 }));
        F.push(part(ball(0.085, 0), cols[(i + (z > 0 ? 1 : 0)) % 2], { x: x + rng.range(-0.04, 0.04), y: h + 0.22 + rng.range(0, 0.08), z: z + rng.range(-0.04, 0.04) }));
      }
    }
  }
  const g = new THREE.Group();
  const boxMesh = mesh(L, materials.toy, 'box');
  const plants = mesh(F, materials.foliage, 'plants');
  g.add(boxMesh, plants);
  return finish(g, { name: 'planter', parts: { box: boxMesh, plants }, surface: 'wood' });
}

// ---------------------------------------------------------------- signpost

function arrowShape(len = 0.95, h = 0.26) {
  const s = new THREE.Shape();
  s.moveTo(0, -h / 2);
  s.lineTo(len - h * 0.55, -h / 2);
  s.lineTo(len, 0);
  s.lineTo(len - h * 0.55, h / 2);
  s.lineTo(0, h / 2);
  s.lineTo(0, -h / 2);
  return s;
}

/**
 * signpost({ seed, height = 2.7, arrows: [{ yaw (rad), color, len }] })
 * Each arrow board is a separate pivot (parts.arrows[i], rotate .rotation.y) drawn in 1 LiveMesh.
 * userData: spinArrow(i|board, turns = 1), pointArrow(i|board, yaw). 2 draw calls.
 */
export function signpost({ seed = 1, height = 2.7, arrows, tilt = 0.05 } = {}) {
  const rng = new Rng(`sign-${seed}`);
  const cols = rng.shuffle([P.tomato, P.teal, P.sunflower, P.cobalt, P.bubblegum]);
  arrows = arrows || [0, 1, 2].map((i) => ({ yaw: rng.range(-2.6, 2.6), color: cols[i], len: rng.range(0.85, 1.05) }));
  const L = [
    part(bev(0.15, height, 0.15, 0.04), P.woodLight, { y: height / 2 }),
    part(new THREE.ConeGeometry(0.14, 0.2, 4), P.woodDark, { y: height + 0.1, ry: Math.PI / 4 }),
    part(bev(0.3, 0.12, 0.3, 0.04), P.woodDark, { y: 0.06 }),
  ];
  const g = new THREE.Group();
  g.add(mesh(L, materials.toy, 'post'));
  const live = new LiveMesh(materials.toy);
  const boards = [];
  arrows.forEach((a, i) => {
    const y = height - 0.3 - i * 0.36;
    const piv = pivot(`arrow${i}`, 0, y, 0);
    piv.rotation.y = a.yaw ?? 0;
    const len = a.len ?? 0.95;
    const col = a.color || cols[i % cols.length];
    const text = a.textColor || (col === P.sunflower ? P.ink : '#fff8ee');
    const geo = merge([
      part(slab(arrowShape(len, 0.27), 0.05, 0.014), col, { x: 0.07 }),
      part(lettering(len * 0.62, 0.12, 1, text, {}, rng, 0.014), text, { x: 0.07 + len * 0.4, z: 0.047 }),
      part(lettering(len * 0.62, 0.12, 1, text, {}, rng, 0.014), text, { x: 0.07 + len * 0.4, z: -0.047 }),
    ]);
    live.addPiece(piv, geo);
    piv.add(boxCollider(len + 0.1, 0.36, 0.16, { x: 0.07 + len / 2 }));
    g.add(piv);
    boards.push(piv);
  });
  g.add(live);
  lean(g, rng, tilt);
  live.build();
  const anims = new Anims();
  finish(g, { name: 'signpost', parts: { arrows: boards }, surface: 'wood', anims, tick: (dt, t) => live.sync(t) });
  const get = (b) => (typeof b === 'number' ? boards[b] : b);
  g.userData.spinArrow = (b, turns = 1) => {
    const p = get(b);
    const from = p.rotation.y;
    return anims.play(0.9 + 0.3 * Math.abs(turns), (k) => { p.rotation.y = from + turns * Math.PI * 2 * k; }, { ease: ease.outBack, key: p.name });
  };
  g.userData.pointArrow = (b, yaw) => {
    const p = get(b);
    const from = p.rotation.y;
    return anims.play(0.8, (k) => { p.rotation.y = lerp(from, yaw, k); }, { ease: ease.outElastic, key: p.name });
  };
  return g;
}

// ---------------------------------------------------------------- notice board

const PAPER = ['#fff4d6', '#ffe590', '#c2e4ff', '#ffc8d6', '#c9f0d6', '#f4e8ff'];

/** noticeBoard({ seed }) — roofed village notice board with pinned notes and a LOST CAT poster. */
export function noticeBoard({ seed = 1, tilt = 0.025 } = {}) {
  const rng = new Rng(`notice-${seed}`);
  const frame = rng.pick([P.woodDark, '#2f6e5c', '#34466e']);
  const L = [];
  for (const sx of [-1, 1]) {
    L.push(part(bev(0.13, 2.25, 0.13, 0.04), frame, { x: sx * 0.86, y: 1.125 }));
    L.push(part(bev(0.2, 0.08, 0.2, 0.03), frame, { x: sx * 0.86, y: 0.04 }));
  }
  L.push(part(bev(1.86, 1.12, 0.12, 0.05), frame, { y: 1.5 }));
  L.push(part(bev(1.64, 0.92, 0.06, 0.02), '#d9a066', { y: 1.5, z: 0.04 }));
  for (const s of [-1, 1]) L.push(part(bev(1.12, 0.07, 0.5, 0.03), P.roofTerracotta, { x: s * 0.5, y: 2.32, z: 0.02, rz: s * -0.45 }));
  L.push(part(bev(0.12, 0.1, 0.52, 0.04), shade(P.roofTerracotta, -0.2), { y: 2.56, z: 0.02 }));
  const notes = [
    [-0.55, 1.68, 0.3, 0.36], [-0.18, 1.72, 0.28, 0.3], [0.52, 1.62, 0.34, 0.44], [-0.5, 1.26, 0.34, 0.28], [0.08, 1.3, 0.3, 0.4],
  ];
  notes.forEach(([x, y, w, h], i) => {
    const rz = rng.range(-0.14, 0.14);
    L.push(part(bev(w, h, 0.016, 0.004), PAPER[i % PAPER.length], { x, y, z: 0.09, rz }));
    L.push(part(lettering(w * 0.7, h * 0.55, 3, '#6b6f86', {}, rng, 0.008), '#6b6f86', { x, y: y - h * 0.08, z: 0.1, rz }));
    L.push(part(ball(0.022, 0), [P.tomato, P.cobalt, P.sunflower][i % 3], { x: x - Math.sin(rz) * h * 0.42, y: y + h * 0.42, z: 0.104 }));
  });
  // LOST CAT poster: orange cat face on white
  const cx = 0.56, cy = 1.28;
  L.push(part(bev(0.34, 0.3, 0.016, 0.004), '#fff8ee', { x: cx, y: cy, z: 0.09, rz: 0.06 }));
  L.push(part(ball(0.085, 1), P.tangerine, { x: cx, y: cy + 0.03, z: 0.108, sz: 0.4 }));
  L.push(part(new THREE.ConeGeometry(0.035, 0.07, 3), P.tangerine, { x: cx - 0.055, y: cy + 0.11, z: 0.108, rz: 0.4 }));
  L.push(part(new THREE.ConeGeometry(0.035, 0.07, 3), P.tangerine, { x: cx + 0.055, y: cy + 0.11, z: 0.108, rz: -0.4 }));
  L.push(part(lettering(0.24, 0.05, 1, P.tomato, {}, rng, 0.008), P.tomato, { x: cx, y: cy - 0.1, z: 0.1 }));
  const g = new THREE.Group();
  const m = mesh(L, materials.toy, 'board');
  g.add(m);
  lean(g, rng, tilt);
  return finish(g, { name: 'noticeBoard', parts: { board: m }, surface: 'wood' });
}

// ---------------------------------------------------------------- bike rack

/** bikeRack({ seed, n = 4, color }) — row of hoop stands, 1 draw call. */
export function bikeRack({ seed = 1, n = 4, color } = {}) {
  const rng = new Rng(`rack-${seed}`);
  const c = color || rng.pick([P.cobalt, P.metal, P.teal, '#34466e']);
  const L = [];
  const len = (n - 1) * 0.6 + 0.4;
  for (const z of [-0.26, 0.26]) L.push(part(bev(len, 0.05, 0.08, 0.02), shade(c, -0.2), { y: 0.025, z }));
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + 0.2 + i * 0.6;
    L.push(part(arc(0.26, 0.042, Math.PI, 6, 10), c, { x, y: 0.55, ry: Math.PI / 2 }));
    for (const z of [-0.26, 0.26]) L.push(part(new THREE.CylinderGeometry(0.042, 0.042, 0.55, 6, 1, true), c, { x, y: 0.275, z }));
  }
  const g = new THREE.Group();
  const m = mesh(L, materials.toy, 'rack');
  g.add(m);
  return finish(g, { name: 'bikeRack', parts: { rack: m }, surface: 'metal' });
}

// ---------------------------------------------------------------- hydrant

/** hydrant({ seed, color }) — chunky fire hydrant. parts: { spout (pivot at the front nozzle, +Z) }. */
export function hydrant({ seed = 1, color } = {}) {
  const rng = new Rng(`hydrant-${seed}`);
  const c = color || rng.pick([P.tomato, P.sunflower, '#ff6f3c']);
  const cap = c === P.sunflower ? P.tomato : P.sunflower;
  const dark = shade(c, -0.25);
  const L = [];
  L.push(latheBands([[0, 0], [0.22, 0], [0.22, 0.07], [0.17, 0.1], [0.155, 0.52], [0.19, 0.54], [0.19, 0.6], [0.15, 0.62],
    [0.14, 0.68], [0.1, 0.75], [0.04, 0.79], [0, 0.8]], 12, (y) => (y < 0.1 ? dark : y > 0.53 && y < 0.62 ? cap : c)));
  L.push(part(puck(0.06, 0.1, 0.02, 5), cap, { y: 0.84 }));
  for (const sx of [-1, 1]) {
    L.push(part(puck(0.065, 0.12, 0.02, 10), c, { x: sx * 0.19, y: 0.4, rz: Math.PI / 2 }));
    L.push(part(puck(0.075, 0.05, 0.02, 10), cap, { x: sx * 0.26, y: 0.4, rz: Math.PI / 2 }));
  }
  L.push(part(puck(0.09, 0.14, 0.02, 12), c, { y: 0.36, z: 0.17, rx: Math.PI / 2 }));
  L.push(part(puck(0.1, 0.06, 0.02, 12), cap, { y: 0.36, z: 0.26, rx: Math.PI / 2 }));
  L.push(part(puck(0.035, 0.04, 0.01, 5), c, { y: 0.36, z: 0.3, rx: Math.PI / 2 }));
  const g = new THREE.Group();
  const m = mesh(L, materials.glossy, 'hydrant');
  g.add(m);
  const spout = pivot('spout', 0, 0.36, 0.31);
  g.add(spout);
  return finish(g, { name: 'hydrant', parts: { spout, body: m }, surface: 'metal' });
}

// ---------------------------------------------------------------- traffic cone

/** trafficCone({ seed, color }) — 1 draw call. */
export function trafficCone({ seed = 1, color = '#ff7a1c' } = {}) {
  const white = '#fff4ea';
  const L = [
    part(bev(0.52, 0.06, 0.52, 0.035), shade(color, -0.2), { y: 0.03 }),
    latheBands([[0, 0.06], [0.22, 0.06], [0.215, 0.1], [0.17, 0.3], [0.155, 0.38], [0.12, 0.52], [0.105, 0.58], [0.05, 0.76], [0.03, 0.79], [0, 0.8]], 12,
      (y) => ((y > 0.3 && y < 0.38) || (y > 0.52 && y < 0.58) ? white : color)),
  ];
  const g = new THREE.Group();
  const m = mesh(L, materials.glossy, 'cone');
  g.add(m);
  return finish(g, { name: 'trafficCone', parts: { cone: m }, surface: 'soft' });
}

// ---------------------------------------------------------------- garden tap

const BRASS = '#f0b848';

/**
 * gardenTap({ seed, mount: 'post'|'wall', under: 'bucket'|'can'|'none', dripping = false })
 * parts: { handle (pivot, spins about Y), spout (drip spawn point, below the nozzle), drop }
 * userData: setDripping(bool), turnHandle(turns = 1) -> Promise, dripping.
 * 'wall' mount: back plate at z = 0 (stick it on a wall facing +Z).
 */
export function gardenTap({ seed = 1, mount = 'post', under = 'bucket', dripping = false } = {}) {
  const rng = new Rng(`tap-${seed}`);
  const L = [];
  const y0 = 0.78;
  const zb = mount === 'wall' ? 0 : 0.09;
  if (mount === 'post') {
    L.push(part(bev(0.18, 1.0, 0.18, 0.04), P.woodLight, { y: 0.5 }));
    L.push(part(new THREE.ConeGeometry(0.15, 0.12, 4), P.wood, { y: 1.06, ry: Math.PI / 4 }));
  }
  L.push(part(puck(0.075, 0.03, 0.01, 10), BRASS, { y: y0, z: zb + 0.015, rx: Math.PI / 2 }));
  L.push(part(rod([0, y0, zb], [0, y0, zb + 0.14], 0.035, 8), BRASS));
  L.push(part(ball(0.075, 1), BRASS, { y: y0, z: zb + 0.16 }));
  L.push(part(rod([0, y0 + 0.01, zb + 0.18], [0, y0 - 0.05, zb + 0.28], 0.032, 8), BRASS));
  L.push(part(rod([0, y0 - 0.04, zb + 0.28], [0, y0 - 0.15, zb + 0.3], 0.03, 8), BRASS));
  L.push(part(puck(0.042, 0.05, 0.012, 8), shade(BRASS, -0.15), { y: y0 - 0.16, z: zb + 0.3 }));
  L.push(part(rod([0, y0 + 0.05, zb + 0.16], [0, y0 + 0.12, zb + 0.16], 0.022, 6), BRASS));
  let waterY = 0.02;
  if (under === 'bucket') {
    const bz = zb + 0.3;
    L.push(latheBands([[0, 0], [0.17, 0], [0.22, 0.3], [0.235, 0.31], [0.235, 0.33], [0.2, 0.33], [0.16, 0.03], [0, 0.03]], 12,
      (y, i) => (i >= 5 ? shade(P.teal, -0.35) : i >= 2 && i < 4 ? shade(P.teal, 0.2) : P.teal), { z: bz }));
    L.push(part(arc(0.22, 0.012, Math.PI, 4, 8), P.metalDark, { y: 0.32, z: bz, rz: 0.25 }));
    L.push(part(puck(0.19, 0.02, 0.005, 12), P.water, { y: 0.2, z: bz }));
    waterY = 0.21;
  } else if (under === 'can') {
    const bz = zb + 0.3;
    L.push(latheBands([[0, 0], [0.16, 0], [0.16, 0.3], [0.12, 0.34], [0, 0.34]], 10, () => P.bubblegum, { z: bz }));
    L.push(part(rod([0, 0.2, bz + 0.12], [0, 0.42, bz + 0.38], 0.03, 6, 0.024), P.bubblegum));
    L.push(part(puck(0.05, 0.04, 0.01, 8), shade(P.bubblegum, -0.2), { y: 0.43, z: bz + 0.4, rx: 1.0 }));
    L.push(part(arc(0.13, 0.02, Math.PI, 4, 8), P.bubblegum, { y: 0.34, z: bz - 0.02, ry: Math.PI / 2 }));
    waterY = 0.34;
  }
  const g = new THREE.Group();
  g.add(mesh(L, materials.toy, 'tap'));
  const handle = pivot('handle', 0, y0 + 0.12, zb + 0.16);
  handle.add(mesh([
    part(bev(0.26, 0.05, 0.06, 0.02), P.tomato, {}),
    part(bev(0.06, 0.05, 0.26, 0.02), P.tomato, {}),
    part(ball(0.045, 1), shade(P.tomato, 0.2), { y: 0.03 }),
  ], materials.toy, 'handleMesh'));
  handle.add(boxCollider(0.4, 0.2, 0.4, {}));
  g.add(handle);
  const spout = pivot('spout', 0, y0 - 0.19, zb + 0.3);
  g.add(spout);
  // droplet (+ puddle when nothing is under the tap) share one LiveMesh
  const water = new LiveMesh(materials.glossy);
  water.castShadow = false;
  const drop = pivot('drop');
  drop.visible = false;
  drop.position.copy(spout.position);
  g.add(drop);
  water.addPiece(drop, part(lathe([[0, -0.04], [0.025, -0.03], [0.03, 0], [0.018, 0.03], [0, 0.06]], 8), P.water));
  let puddle = null;
  if (under === 'none') {
    puddle = pivot('puddle', 0, 0.02, spout.position.z + 0.06);
    puddle.visible = false;
    puddle.scale.setScalar(0.001);
    const pg = new THREE.CircleGeometry(0.36, 14).rotateX(-Math.PI / 2);
    const pp = pg.attributes.position;
    for (let i = 1; i < pp.count; i++) {
      const k = 0.75 + (i % 3) * 0.12 + (i % 5 === 0 ? 0.15 : 0);
      pp.setXYZ(i, pp.getX(i) * k, 0, pp.getZ(i) * k * 0.8);
    }
    pp.setY(0, 0.012);
    pg.computeVertexNormals();
    water.addPiece(puddle, part(pg, '#6fd6ff'));
    g.add(puddle);
  }
  g.add(water);
  water.build();
  const anims = new Anims();
  let drip = false;
  let dt0 = 0;
  const fall = spout.position.y - waterY;
  finish(g, {
    name: 'gardenTap', parts: { handle, spout, drop, puddle }, surface: 'metal', anims,
    tick: (dt, t) => {
      if (drip) {
        dt0 = (dt0 + dt) % 1.1;
        const grow = 0.45;
        if (dt0 < grow) {
          const k = dt0 / grow;
          drop.visible = true;
          drop.scale.set(Math.max(0.001, k), Math.max(0.001, k * (0.8 + k * 0.5)), Math.max(0.001, k));
          drop.position.y = spout.position.y - 0.02 - k * 0.03;
        } else {
          const tt = dt0 - grow;
          const y = spout.position.y - 0.05 - 4.9 * tt * tt;
          drop.visible = y > waterY;
          drop.scale.set(0.85, 1.35, 0.85);
          drop.position.y = Math.max(y, waterY);
        }
      }
      if (puddle) {
        const target = drip ? 1 : 0;
        const s = puddle.scale.x + (target - puddle.scale.x) * Math.min(1, dt * (drip ? 0.6 : 0.35));
        puddle.scale.setScalar(Math.max(0.001, s));
        puddle.visible = s > 0.02;
      }
      water.sync(t);
    },
  });
  g.userData.setDripping = (on) => {
    drip = !!on;
    g.userData.dripping = drip;
    if (!drip) drop.visible = false;
    else if (puddle && puddle.scale.x < 0.3) puddle.scale.setScalar(0.3);
  };
  g.userData.turnHandle = (turns = 1) => {
    const from = handle.rotation.y;
    return anims.play(0.7 * Math.abs(turns) + 0.3, (k) => { handle.rotation.y = from + turns * Math.PI * 2 * k; }, { ease: ease.outBack, key: 'handle' });
  };
  g.userData.fall = fall;
  g.userData.setDripping(dripping);
  return g;
}
