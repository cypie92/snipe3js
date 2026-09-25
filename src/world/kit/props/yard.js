// Yard clutter: crates (incl. ammo crate), barrels, sacks, wheelbarrows, ladders.
import * as THREE from 'three';
import { part, merge } from '../../geo.js';
import { materials } from '../../../gfx/materials.js';
import { P } from '../../../gfx/palette.js';
import { Rng } from '../../../core/rng.js';
import { bev, lathe, puck, ball, blob, rod, arc, latheBands, lettering, mesh, pivot, finish, paintFaces, Anims, ease, shade, noise3 } from './lib.js';

const DARK = '#3b3f4f';

// ---------------------------------------------------------------- crate

/**
 * crate({ seed, size = 0.9, kind: 'wood'|'ammo', contents: null|'apples'|'oranges' })
 * 'ammo' = olive supply crate (Ammo Hunt mode). contents = open crate filled with fruit.
 */
export function crate({ seed = 1, size = 0.9, kind = 'wood', contents = null } = {}) {
  const rng = new Rng(`crate-${seed}`);
  const s = size;
  const L = [];
  const g = new THREE.Group();
  if (kind === 'ammo') {
    const olive = '#72883c';
    const w = s * 1.3, h = s * 0.7, d = s * 0.8;
    L.push(part(bev(w, h, d, 0.06), olive, { y: h / 2 }));
    L.push(part(bev(w + 0.04, h * 0.18, d + 0.04, 0.04), shade(olive, 0.15), { y: h * 0.92 }));
    for (const x of [-w * 0.35, w * 0.35]) L.push(part(bev(0.08, h + 0.02, d + 0.03, 0.03), shade(olive, -0.25), { x, y: h / 2 }));
    for (const z of [d / 2 + 0.01, -d / 2 - 0.01]) {
      const zz = z > 0 ? 1 : -1;
      L.push(part(bev(w * 0.42, h * 0.46, 0.03, 0.02), P.sunflower, { y: h * 0.46, z }));
      L.push(part(new THREE.CapsuleGeometry(0.045, 0.14, 3, 8), '#e3a13a', { y: h * 0.46, z: z + zz * 0.03, rz: Math.PI / 2, x: -0.03 }));
      L.push(part(new THREE.ConeGeometry(0.045, 0.08, 8), '#c9752e', { x: 0.14, y: h * 0.46, z: z + zz * 0.03, rz: -Math.PI / 2 }));
    }
    for (const sx of [-1, 1]) L.push(part(arc(0.08, 0.02, Math.PI, 4, 8), DARK, { x: sx * (w / 2 + 0.01), y: h * 0.55, ry: Math.PI / 2 }));
    g.add(mesh(L, materials.toy, 'crate'));
    return finish(g, { name: 'ammoCrate', parts: {}, surface: 'wood' });
  }
  const wood = rng.pick([P.woodLight, '#e0b27a', '#d69c5e']);
  const frame = shade(wood, -0.28);
  const open = !!contents;
  const inset = s * 0.92;
  if (open) {
    for (const [w, d, x, z] of [[s, 0.07, 0, s / 2 - 0.035], [s, 0.07, 0, -s / 2 + 0.035], [0.07, s, s / 2 - 0.035, 0], [0.07, s, -s / 2 + 0.035, 0]]) {
      for (let i = 0; i < 3; i++) L.push(part(bev(w, s * 0.3 - 0.02, d, 0.02), shade(wood, (i % 2) * 0.08), { x, y: s * 0.17 + i * s * 0.31, z }));
    }
    L.push(part(bev(s - 0.1, 0.04, s - 0.1, 0.01), frame, { y: 0.03 }));
    const fruit = contents === 'oranges' ? '#ffa01c' : '#ff3b30';
    for (let i = 0; i < 9; i++) {
      const x = ((i % 3) - 1) * s * 0.27, z = (Math.floor(i / 3) - 1) * s * 0.27;
      L.push(part(ball(s * 0.16, 1), shade(fruit, rng.range(-0.08, 0.06)), { x: x + rng.range(-0.02, 0.02), y: s * 0.86, z: z + rng.range(-0.02, 0.02) }));
    }
    for (let i = 0; i < 4; i++) L.push(part(ball(s * 0.16, 1), fruit, { x: ((i % 2) - 0.5) * s * 0.27, y: s * 0.98, z: (Math.floor(i / 2) - 0.5) * s * 0.27 }));
  } else {
    L.push(part(bev(inset, inset, inset, 0.03), wood, { y: s / 2 }));
    for (const y of [0.035, s - 0.035]) {
      for (const z of [-1, 1]) L.push(part(bev(s, 0.08, 0.08, 0.025), frame, { y, z: z * (s / 2 - 0.035) }));
      for (const x of [-1, 1]) L.push(part(bev(0.08, 0.08, s, 0.025), frame, { y, x: x * (s / 2 - 0.035) }));
    }
    for (const x of [-1, 1]) for (const z of [-1, 1]) L.push(part(bev(0.08, s, 0.08, 0.025), frame, { x: x * (s / 2 - 0.035), y: s / 2, z: z * (s / 2 - 0.035) }));
    for (const z of [-1, 1]) L.push(part(bev(s * 1.18, 0.07, 0.05, 0.02), frame, { y: s / 2, z: z * (inset / 2 + 0.01), rz: z * 0.78 }));
    L.push(part(bev(0.05, 0.1, s * 0.5, 0.02), '#c0392b', { x: inset / 2 + 0.01, y: s * 0.55 }));
    L.push(part(new THREE.ConeGeometry(0.09, 0.12, 3), '#c0392b', { x: inset / 2 + 0.01, y: s * 0.55, z: s * 0.27, rx: Math.PI / 2, sz: 0.4 }));
  }
  g.add(mesh(L, materials.toy, 'crate'));
  return finish(g, { name: 'crate', parts: {}, surface: 'wood' });
}

// ---------------------------------------------------------------- barrel

/** barrel({ seed, style: 'wood'|'drum', color }) — 1 draw call. */
export function barrel({ seed = 1, style = 'wood', color } = {}) {
  const rng = new Rng(`barrel-${seed}`);
  const L = [];
  const H = 1.05;
  const prof = [];
  for (let i = 0; i <= 6; i++) {
    const y = (i / 6) * H;
    prof.push([0.36 + Math.sin((i / 6) * Math.PI) * 0.07, y]);
  }
  if (style === 'drum') {
    const c = color || rng.pick([P.cobalt, P.tomato, P.teal]);
    L.push(latheBands([[0, 0], [0.38, 0], [0.38, 0.3], [0.395, 0.32], [0.395, 0.36], [0.38, 0.38], [0.38, 0.66], [0.395, 0.68], [0.395, 0.72], [0.38, 0.74], [0.38, H], [0, H]], 16,
      (y, i) => (i === 3 || i === 7 ? shade(c, 0.15) : i === 10 ? shade(c, -0.1) : c)));
    L.push(part(puck(0.07, 0.03, 0.01, 8), shade(c, -0.3), { x: 0.2, y: H + 0.01, z: 0.1 }));
    L.push(part(bev(0.34, 0.2, 0.02, 0.01), '#fff4e0', { y: 0.52, z: 0.385 }));
  } else {
    const wood = color || rng.pick([P.wood, '#b8743f', P.woodLight]);
    const body = part(lathe(prof, 14), '#fff');
    paintFaces(body, (x, y, z, nx, ny, nz, c) => {
      let a = Math.atan2(x, z);
      if (a < 0) a += Math.PI * 2;
      const st = Math.floor(a / (Math.PI * 2 / 14));
      c.set(shade(wood, (st % 3) * 0.06 - 0.04 + (noise3(st, 1, 2) - 0.5) * 0.08));
    });
    L.push(body);
    L.push(part(puck(0.37, 0.05, 0.015, 14), shade(wood, -0.2), { y: H - 0.03 }));
    L.push(part(puck(0.05, 0.03, 0.01, 8), P.woodDark, { x: 0.18, y: H, z: 0.05 }));
    for (const y of [0.1, 0.34, 0.71, 0.95]) {
      const r = 0.36 + Math.sin((y / H) * Math.PI) * 0.07 + 0.012;
      L.push(part(new THREE.CylinderGeometry(r, r, 0.055, 14, 1, true), '#5a6272', { y }));
    }
  }
  const g = new THREE.Group();
  const m = mesh(L, materials.toy, 'barrel');
  g.add(m);
  return finish(g, { name: 'barrel', parts: { barrel: m }, surface: style === 'drum' ? 'metal' : 'wood' });
}

// ---------------------------------------------------------------- sack

/** sack({ seed, color, label }) — lumpy tied burlap sack, 1 draw call. */
export function sack({ seed = 1, color, label } = {}) {
  const rng = new Rng(`sack-${seed}`);
  const c = color || rng.pick(['#d8bf8a', '#e6d3a8', '#cfae78']);
  const lab = label || rng.pick([P.cobalt, P.tomato, P.teal]);
  const prof = [[0, 0], [0.27, 0], [0.34, 0.08], [0.36, 0.28], [0.33, 0.46], [0.22, 0.58], [0.13, 0.63], [0.14, 0.69], [0.21, 0.78], [0.17, 0.83], [0, 0.8]];
  const geo = lathe(prof, 10);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = noise3(Math.round(x * 50), Math.round(y * 50), Math.round(z * 50) + seed) - 0.5;
    const k = y > 0.02 && y < 0.6 ? 1 + n * 0.12 : 1;
    pos.setXYZ(i, x * k, y, z * k * 0.86);
  }
  geo.computeVertexNormals();
  const L = [
    part(geo, c, { rz: rng.range(-0.06, 0.06) }),
    part(puck(0.15, 0.05, 0.02, 10), shade(c, -0.35), { y: 0.64 }),
    part(bev(0.3, 0.2, 0.05, 0.02), '#fff4e0', { y: 0.3, z: 0.29, rx: -0.1 }),
    part(bev(0.3, 0.05, 0.06, 0.015), lab, { y: 0.35, z: 0.3, rx: -0.1 }),
    part(bev(0.3, 0.05, 0.06, 0.015), lab, { y: 0.25, z: 0.31, rx: -0.1 }),
  ];
  const g = new THREE.Group();
  const m = mesh(L, materials.toy, 'sack');
  g.add(m);
  return finish(g, { name: 'sack', parts: { sack: m }, surface: 'soft' });
}

// ---------------------------------------------------------------- wheelbarrow

/** wheelbarrow({ seed, color, load: 'soil'|'pumpkins'|'bricks'|'none' }) — 1 draw call. */
export function wheelbarrow({ seed = 1, color, load } = {}) {
  const rng = new Rng(`barrow-${seed}`);
  const c = color || rng.pick([P.tomato, P.cobalt, P.teal, '#5cb83c']);
  const ld = load || rng.pick(['soil', 'pumpkins', 'bricks']);
  const L = [];
  const y0 = 0.46;
  L.push(part(bev(0.6, 0.06, 0.78, 0.025), c, { y: y0, z: 0.05 }));
  L.push(part(bev(0.06, 0.34, 0.84, 0.025), c, { x: 0.36, y: y0 + 0.15, z: 0.05, rz: -0.35 }));
  L.push(part(bev(0.06, 0.34, 0.84, 0.025), c, { x: -0.36, y: y0 + 0.15, z: 0.05, rz: 0.35 }));
  L.push(part(bev(0.78, 0.36, 0.06, 0.025), c, { y: y0 + 0.16, z: 0.52, rx: 0.55 }));
  L.push(part(bev(0.78, 0.34, 0.06, 0.025), c, { y: y0 + 0.15, z: -0.36, rx: -0.2 }));
  L.push(part(bev(0.9, 0.05, 1.02, 0.02), shade(c, 0.2), { y: y0 + 0.32, z: 0.08 }));
  for (const s of [-1, 1]) {
    L.push(part(rod([s * 0.2, y0 - 0.04, 0.75], [s * 0.26, 0.62, -1.0], 0.04, 6), P.wood));
    L.push(part(new THREE.CapsuleGeometry(0.045, 0.14, 2, 6), DARK, { x: s * 0.265, y: 0.63, z: -1.04, rx: Math.PI / 2 - 0.1 }));
    L.push(part(rod([s * 0.22, y0 - 0.03, -0.3], [s * 0.26, 0.02, -0.36], 0.03, 5), DARK));
    L.push(part(rod([s * 0.2, y0 - 0.03, 0.7], [s * 0.07, 0.24, 0.86], 0.025, 5), DARK));
  }
  L.push(part(new THREE.TorusGeometry(0.19, 0.075, 6, 14), '#3a3e4c', { y: 0.24, z: 0.86, ry: Math.PI / 2 }));
  L.push(part(puck(0.13, 0.09, 0.02, 10), P.sunflower, { y: 0.24, z: 0.86, rz: Math.PI / 2 }));
  if (ld === 'soil') L.push(part(blob(0.4, 1, 0.1, seed), '#7a5234', { y: y0 + 0.24, z: 0.08, sy: 0.45, sx: 0.8 }));
  if (ld === 'pumpkins') {
    for (const [x, z, r] of [[-0.12, 0.2, 0.2], [0.16, -0.08, 0.17]]) {
      const pts = [];
      for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + (i / 6) * Math.PI; pts.push([Math.cos(a) * r, Math.sin(a) * r * 0.8]); }
      const pg = part(lathe(pts, 12), '#fff', { x, y: y0 + 0.2 + r * 0.5, z });
      paintFaces(pg, (px, py, pz, nx, ny, nz, cc) => {
        const st = Math.floor((Math.atan2(px - x, pz - z) + Math.PI) / (Math.PI / 6));
        cc.set(st % 2 ? '#ff9f1c' : '#f08a14');
      });
      L.push(pg, part(rod([x, y0 + 0.2 + r * 1.25, z], [x + 0.03, y0 + 0.2 + r * 1.25 + 0.09, z], 0.025, 5), '#5a7a2a'));
    }
  }
  if (ld === 'bricks') {
    for (let i = 0; i < 5; i++) L.push(part(bev(0.3, 0.12, 0.15, 0.02), '#d9785c', { x: (i % 2 - 0.5) * 0.3, y: y0 + 0.1 + Math.floor(i / 2) * 0.12, z: -0.1 + (i % 3) * 0.16, ry: rng.range(-0.2, 0.2) }));
  }
  const g = new THREE.Group();
  const m = mesh(L, materials.toy, 'wheelbarrow');
  g.add(m);
  return finish(g, { name: 'wheelbarrow', parts: { barrow: m }, surface: 'metal' });
}

// ---------------------------------------------------------------- ladder

/**
 * ladder({ seed, height = 3.2, lean = 0 (rad, tips back toward -Z), color })
 * parts: { ladder (pivot at the feet) }. userData: tip() -> Promise (falls over, gag).
 */
export function ladder({ seed = 1, height = 3.2, lean = 0, color } = {}) {
  const rng = new Rng(`ladder-${seed}`);
  const c = color || rng.pick([P.woodLight, P.sunflower, '#9fb0c4']);
  const L = [];
  for (const s of [-1, 1]) {
    L.push(part(bev(0.08, height, 0.07, 0.025), c, { x: s * 0.25, y: height / 2 }));
    L.push(part(bev(0.1, 0.06, 0.1, 0.02), DARK, { x: s * 0.25, y: 0.03 }));
  }
  const n = Math.floor((height - 0.2) / 0.3);
  for (let i = 1; i <= n; i++) L.push(part(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), shade(c, -0.12), { y: i * 0.3, rz: Math.PI / 2 }));
  const g = new THREE.Group();
  const piv = pivot('ladder');
  piv.rotation.x = -lean;
  piv.add(mesh(L, materials.toy, 'ladderMesh'));
  g.add(piv);
  const anims = new Anims();
  finish(g, { name: 'ladder', parts: { ladder: piv }, surface: 'wood', anims });
  g.userData.tip = () => {
    const from = piv.rotation.x;
    return anims.play(1.1, (k) => { piv.rotation.x = THREE.MathUtils.lerp(from, from < 0 ? -Math.PI / 2 : Math.PI / 2, k); }, { ease: ease.outBounce, key: 'tip' });
  };
  return g;
}
