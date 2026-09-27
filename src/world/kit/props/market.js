// Market: stalls with chunky goods + a melon stack of individually knockable melons.
import * as THREE from 'three';
import { part, merge, xform } from '../../geo.js';
import { materials } from '../../../gfx/materials.js';
import { P } from '../../../gfx/palette.js';
import { Rng } from '../../../core/rng.js';
import {
  bev, lathe, ball, rod, slab, latheBands, mesh, pivot, finish, paintFaces,
  LiveMesh, Anims, ease, shade, ballCollider, noise3, paintedTexture, decalMaterial, fitWords, roundRect,
} from './lib.js';

const sph = (r, w = 6, h = 4) => new THREE.SphereGeometry(r, w, h);
const fr = (r) => new THREE.IcosahedronGeometry(r, 0); // 20-tri "fruit" (smooth normals, glossy)

function scallopShape(w, h, n, depth = 0.1) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, h / 2);
  s.lineTo(w / 2, h / 2);
  s.lineTo(w / 2, -h / 2 + depth);
  const step = w / n;
  for (let i = n; i > 0; i--) {
    const x0 = -w / 2 + i * step;
    s.quadraticCurveTo(x0 - step / 2, -h / 2 - depth, x0 - step, -h / 2 + depth);
  }
  s.lineTo(-w / 2, h / 2);
  return s;
}

/** A heap of goods in a tilted crate: low mound in the goods colour + items on top. */
function mound(G, { x, y, z, w, d, rx = 0 }, base, items) {
  const m = new THREE.SphereGeometry(1, 6, 2, 0, Math.PI * 2, 0, Math.PI / 2);
  G.push(part(m, shade(base, -0.2), { x, y, z, sx: w / 2, sy: 0.12, sz: d / 2, rx }));
  const c = Math.cos(rx), s = Math.sin(rx);
  for (const it of items) {
    const ly = it.y ?? 0.1, lz = it.z;
    G.push(part(it.geo, it.color, { x: x + it.x, y: y + ly * c - lz * s, z: z + ly * s + lz * c, rx: (it.rx || 0) + rx, ry: it.ry || 0, rz: it.rz || 0, sx: it.sx, sy: it.sy, sz: it.sz }));
  }
}

/** n items scattered over a w x d heap (deterministic). */
function heap(n, w, d, rng, make) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996, r = Math.sqrt((i + 0.5) / n);
    out.push({ ...make(i), x: Math.cos(a) * r * w * 0.36 + rng.range(-0.02, 0.02), z: Math.sin(a) * r * d * 0.34, y: 0.12 + (1 - r) * 0.06 });
  }
  return out;
}

function bouquet(r, seed, cols) {
  const g = part(jitterIco(r, seed), '#fff');
  return paintFaces(g, (x, y, z, nx, ny, nz, c) => {
    if (ny < -0.25) { c.set('#4f9a3c'); return; }
    const a = Math.atan2(z, x) + seed;
    const sector = Math.floor(((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2 / 5));
    const n = noise3(x * 4 + seed, y * 4, z * 4);
    c.set(ny > 0.75 ? cols[2] : n < 0.18 ? '#5aa843' : cols[sector % 2]);
  });
}
function jitterIco(r, seed) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = 1 + (noise3(pos.getX(i) * 9 + seed, pos.getY(i) * 9, pos.getZ(i) * 9) - 0.5) * 0.3;
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

// ---- goods: fill the counter crates (S.crates), back shelf (S.shelfY) and ground spots (S.ground)

function fruitGoods(G, S, rng) {
  const apple = fr(0.1);
  S.crates.forEach((cr, i) => {
    if (i === 2) {
      const items = [];
      for (let k = 0; k < 3; k++) {
        for (let b = 0; b < 2; b++) {
          items.push({ geo: new THREE.CylinderGeometry(0.04, 0.032, 0.24, 5), color: b ? '#ffd84a' : '#ffe066', x: -0.2 + k * 0.2 + b * 0.04, y: 0.13 + b * 0.02, z: -0.02 + b * 0.05, rz: 1.25 - b * 0.3, rx: 0.2 });
        }
      }
      mound(G, cr, '#ffe066', items);
    } else {
      const col = i === 0 ? '#ff3b30' : '#ffa01c';
      mound(G, cr, col, heap(5, cr.w, cr.d, rng, (k) => ({ geo: apple, color: i === 0 && k === 2 ? '#8ad14f' : col })));
    }
  });
  for (const [x, z] of [[-0.75, -0.36], [-0.5, -0.32]]) {
    G.push(part(fr(0.13), '#e8a93c', { x, y: S.shelfY + 0.16, z, sy: 1.4 }));
    for (let k = 0; k < 3; k++) G.push(part(new THREE.ConeGeometry(0.05, 0.24, 3), '#3f9a3e', { x, y: S.shelfY + 0.4, z, rz: (k - 1) * 0.4, ry: k * 1.2 }));
  }
  G.push(part(sph(0.2, 7, 4), '#3f9a3e', { x: 0.55, y: S.shelfY + 0.18, z: -0.33, sx: 1.3 }));
  S.ground.forEach((gc, i) => mound(G, gc, i ? '#ff3b30' : '#8ad14f', heap(3, gc.w, gc.d, rng, () => ({ geo: apple, color: i ? '#ff3b30' : '#8ad14f' }))));
}

function vegGoods(G, S, rng) {
  S.crates.forEach((cr, i) => {
    if (i === 0) {
      const items = [];
      for (let k = 0; k < 7; k++) {
        const x = -0.27 + (k % 4) * 0.17 + (k > 3 ? 0.08 : 0), z = k > 3 ? 0.07 : -0.07;
        items.push({ geo: new THREE.ConeGeometry(0.055, 0.32, 5), color: '#ff8a1c', x, y: 0.12, z, rx: Math.PI / 2 });
        items.push({ geo: new THREE.ConeGeometry(0.05, 0.14, 3), color: '#5cb83c', x, y: 0.14, z: z - 0.21, rx: -Math.PI / 2 });
      }
      mound(G, cr, '#ff8a1c', items);
    } else if (i === 1) {
      mound(G, cr, '#5cb83c', heap(4, cr.w, cr.d, rng, (k) => ({ geo: fr(0.14), color: ['#7cc653', '#5cb83c', '#9bd86a', '#6fbf4a'][k] })));
    } else {
      mound(G, cr, '#e8302a', heap(6, cr.w, cr.d, rng, () => ({ geo: fr(0.085), color: '#ff3b30' })));
    }
  });
  for (let k = 0; k < 4; k++) G.push(part(new THREE.CylinderGeometry(0.05, 0.05, 0.55, 6), k % 2 ? '#e8f5d0' : '#bfe39a', { x: -0.75 + k * 0.1, y: S.shelfY + 0.1, z: -0.35, rz: Math.PI / 2 - 0.25, ry: 0.2 }));
  S.ground.forEach((gc, i) => {
    const r = 0.27 - i * 0.04;
    const pts = [];
    for (let k = 0; k <= 5; k++) { const a = -Math.PI / 2 + (k / 5) * Math.PI; pts.push([Math.cos(a) * r, Math.sin(a) * r * 0.78]); }
    const pg = part(lathe(pts, 8), '#fff', { x: gc.x, y: r * 0.78, z: gc.z });
    paintFaces(pg, (px, py, pz, nx, ny, nz, cc) => {
      const st = Math.floor((Math.atan2(px - gc.x, pz - gc.z) + Math.PI) / (Math.PI / 4));
      cc.set(st % 2 ? '#ff9f1c' : '#f08a14');
    });
    G.push(pg, part(rod([gc.x, r * 1.5, gc.z], [gc.x + 0.04, r * 1.5 + 0.1, gc.z], 0.03, 5), '#5a7a2a'));
  });
  S.groundNoCrate = true;
}

function fishGoods(G, S, rng) {
  const fish = (x, z, col, rot) => [
    { geo: fr(0.08), color: col, x, y: 0.1, z, sx: 2.2, sy: 0.7, ry: rot },
    { geo: new THREE.ConeGeometry(0.07, 0.11, 3), color: shade(col, -0.2), x: x - Math.cos(rot) * 0.2, y: 0.1, z: z + Math.sin(rot) * 0.2, rz: Math.PI / 2, ry: rot, sz: 0.4 },
  ];
  S.crates.forEach((cr) => {
    const items = [];
    for (let k = 0; k < 4; k++) items.push(...fish(-0.16 + (k % 2) * 0.32, k < 2 ? -0.09 : 0.1, rng.pick(['#9fb8d0', '#b8c8dc', '#ff9a8a']), rng.range(-0.3, 0.3)));
    mound(G, cr, '#e9fbff', items);
  });
  const lx = -0.5, ly = S.shelfY + 0.1, lz = -0.34;
  G.push(part(new THREE.CapsuleGeometry(0.09, 0.3, 1, 6), '#e8402a', { x: lx, y: ly, z: lz, rz: Math.PI / 2 }));
  for (const s of [-1, 1]) {
    G.push(part(fr(0.08), '#ff5a3c', { x: lx + 0.3, y: ly + 0.03, z: lz + s * 0.13, sx: 1.4 }));
    G.push(part(rod([lx + 0.12, ly, lz + s * 0.05], [lx + 0.25, ly + 0.02, lz + s * 0.12], 0.025, 4), '#e8402a'));
  }
  G.push(part(sph(0.2, 7, 4), '#9fb8d0', { x: 0.5, y: S.shelfY + 0.12, z: -0.35, sx: 1.9, sy: 0.7 }));
  G.push(part(new THREE.ConeGeometry(0.2, 0.22, 3), '#8aa4c0', { x: 0.1, y: S.shelfY + 0.12, z: -0.35, rz: -Math.PI / 2, sx: 0.5 }));
  S.ground.forEach((gc) => mound(G, gc, '#e9fbff', [...fish(-0.1, -0.03, '#9fb8d0', 0.2), ...fish(0.12, 0.06, '#b8c8dc', -0.3)]));
}

function flowerGoods(G, S, rng) {
  const cols = [P.tomato, P.sunflower, P.bubblegum, P.violet, '#fff4e6', P.tangerine];
  const bucket = (x, y, z, s, i) => {
    G.push(latheBands([[0, 0], [0.12 * s, 0], [0.16 * s, 0.28 * s], [0.17 * s, 0.3 * s], [0, 0.3 * s]], 8, (yy, k) => (k === 2 ? '#8a96a8' : '#b8c2d0'), { x, y, z }));
    G.push(bouquet(0.2 * s, i * 7 + 1, [cols[i % cols.length], cols[(i + 2) % cols.length], '#fff4e6']).applyMatrix4(xform({ x, y: y + 0.42 * s, z, sy: 0.85 })));
  };
  S.crates.forEach((cr, i) => bucket(cr.x, S.counterY, cr.z, 1.15, i));
  for (let k = 0; k < 2; k++) {
    const x = -0.55 + k * 1.1;
    G.push(part(rod([x, S.shelfY, -0.35], [x, S.shelfY + 0.6, -0.35], 0.025, 4), '#4f9a3c'));
    G.push(part(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 8), P.sunflower, { x, y: S.shelfY + 0.64, z: -0.33, rx: Math.PI / 2 - 0.3 }));
    G.push(part(new THREE.CylinderGeometry(0.07, 0.07, 0.07, 6), '#7a4a26', { x, y: S.shelfY + 0.65, z: -0.31, rx: Math.PI / 2 - 0.3 }));
  }
  bucket(S.ground[0].x, 0, S.ground[0].z, 1.6, 3);
  S.groundNoCrate = true;
}

function cakeGoods(G, S, rng) {
  const cake = (x, y, z, r, tiers, icing) => {
    let yy = y;
    for (let t = 0; t < tiers; t++) {
      const rr = r * (1 - t * 0.3);
      G.push(part(new THREE.CylinderGeometry(rr, rr, 0.13, 10), '#c98a4e', { x, y: yy + 0.065, z }));
      G.push(part(new THREE.CylinderGeometry(rr * 1.04, rr * 1.04, 0.05, 10), icing, { x, y: yy + 0.145, z }));
      yy += 0.17;
    }
    G.push(part(fr(0.05), '#e8203a', { x, y: yy + 0.03, z }));
  };
  S.crates.forEach((cr, i) => {
    if (i === 1) { cake(cr.x, S.counterY, cr.z - 0.05, 0.27, 2, '#fff4e6'); return; }
    G.push(part(rod([cr.x, S.counterY, cr.z], [cr.x, S.counterY + 0.14, cr.z], 0.03, 5), '#fff8ee'));
    G.push(part(new THREE.CylinderGeometry(0.23, 0.2, 0.03, 10), '#fff8ee', { x: cr.x, y: S.counterY + 0.15, z: cr.z }));
    cake(cr.x, S.counterY + 0.165, cr.z, 0.19, 1, i ? '#ff9ec4' : '#8a5a3a');
  });
  for (let k = 0; k < 4; k++) {
    G.push(latheBands([[0, 0], [0.07, 0], [0.085, 0.09], [0.05, 0.15], [0, 0.18]], 6,
      (y, i) => (i < 2 ? [P.teal, P.sunflower, '#fff4e6', P.bubblegum][k] : ['#ff9ec4', '#fff4e6', '#c98a4e', '#fff4e6'][k]), { x: -0.8 + k * 0.45, y: S.shelfY, z: -0.35 }));
  }
  S.groundNoCrate = true;
}

const GOODS = { fruit: fruitGoods, veg: vegGoods, fish: fishGoods, flowers: flowerGoods, cakes: cakeGoods };

// ---------------------------------------------------------------- painted stall signs

/** Default sign wording per stall type (override with marketStall({ sign: 'TEXT' })). */
export const STALL_SIGNS = { fruit: 'FRUIT & VEG', veg: 'GARDEN VEG', fish: 'FRESH FISH', flowers: 'FLOWERS', cakes: 'CAKES & BAKES' };
const SIGN_INK = '#2b2b3a';
const SIGN_ACCENT = { fruit: '#ff3b30', veg: '#ff8a1c', fish: '#3f8fd8', flowers: '#ff5fa2', cakes: '#ff7eb6' };

/** Chunky toy icon for a stall type, centred at (x, y), radius ~r. */
function drawStallIcon(ctx, goods, x, y, r) {
  ctx.lineWidth = r * 0.13;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = SIGN_INK;
  const shape = (fill, path) => { ctx.beginPath(); path(); ctx.fillStyle = fill; ctx.fill(); ctx.stroke(); };
  const dot = (px, py, pr, fill) => { ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); };
  if (goods === 'fish') {
    shape('#8fc0e8', () => { ctx.moveTo(x - r * 0.5, y); ctx.lineTo(x - r * 1.02, y - r * 0.46); ctx.lineTo(x - r * 0.94, y); ctx.lineTo(x - r * 1.02, y + r * 0.46); ctx.closePath(); });
    shape('#8fc0e8', () => ctx.ellipse(x + r * 0.12, y, r * 0.78, r * 0.46, 0, 0, Math.PI * 2));
    ctx.beginPath(); ctx.moveTo(x - r * 0.1, y - r * 0.4); ctx.quadraticCurveTo(x + r * 0.05, y, x - r * 0.1, y + r * 0.4); ctx.stroke();
    dot(x + r * 0.5, y - r * 0.1, r * 0.11, SIGN_INK);
  } else if (goods === 'flowers') {
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
      shape('#ff8cc6', () => ctx.arc(x + Math.cos(a) * r * 0.52, y + Math.sin(a) * r * 0.52, r * 0.4, 0, Math.PI * 2));
    }
    shape('#ffc93c', () => ctx.arc(x, y, r * 0.34, 0, Math.PI * 2));
  } else if (goods === 'cakes') {
    shape('#6fc3e0', () => { ctx.moveTo(x - r * 0.62, y); ctx.lineTo(x + r * 0.62, y); ctx.lineTo(x + r * 0.44, y + r * 0.82); ctx.lineTo(x - r * 0.44, y + r * 0.82); ctx.closePath(); });
    shape('#ffb3d1', () => { ctx.moveTo(x - r * 0.78, y + r * 0.04); ctx.quadraticCurveTo(x - r * 0.86, y - r * 0.62, x, y - r * 0.66); ctx.quadraticCurveTo(x + r * 0.86, y - r * 0.62, x + r * 0.78, y + r * 0.04); ctx.closePath(); });
    shape('#ff3b30', () => ctx.arc(x, y - r * 0.78, r * 0.2, 0, Math.PI * 2));
  } else if (goods === 'veg') {
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.5);
    for (const a of [-0.45, 0, 0.45]) shape('#5cb83c', () => ctx.ellipse(Math.sin(a) * r * 0.3, -r * 0.72, r * 0.14, r * 0.34, a, 0, Math.PI * 2));
    shape('#ff8a1c', () => { ctx.moveTo(-r * 0.36, -r * 0.46); ctx.quadraticCurveTo(0, -r * 0.62, r * 0.36, -r * 0.46); ctx.lineTo(0, r * 0.98); ctx.closePath(); });
    for (const k of [0, 1, 2]) { ctx.beginPath(); ctx.moveTo(-r * (0.22 - k * 0.05), -r * (0.2 - k * 0.34)); ctx.lineTo(-r * (0.02 - k * 0.02), -r * (0.16 - k * 0.34)); ctx.stroke(); }
    ctx.restore();
  } else {
    shape('#ff3b30', () => { ctx.moveTo(x, y - r * 0.42); ctx.bezierCurveTo(x + r * 0.9, y - r * 0.95, x + r * 1.05, y + r * 0.55, x, y + r * 0.8); ctx.bezierCurveTo(x - r * 1.05, y + r * 0.55, x - r * 0.9, y - r * 0.95, x, y - r * 0.42); ctx.closePath(); });
    ctx.beginPath(); ctx.moveTo(x, y - r * 0.4); ctx.lineTo(x + r * 0.06, y - r * 0.82); ctx.stroke();
    shape('#5cb83c', () => ctx.ellipse(x + r * 0.34, y - r * 0.72, r * 0.3, r * 0.14, -0.5, 0, Math.PI * 2));
    dot(x - r * 0.38, y - r * 0.1, r * 0.13, '#ffffffb0');
  }
}

/** Cream board texture: ink border, stall icon on the left, the words fitted big on the right. */
function stallSignTexture(key, text, goods) {
  return paintedTexture(key, 640, 176, (ctx, w, h) => {
    ctx.fillStyle = '#fff4e0';
    ctx.fillRect(0, 0, w, h);
    ctx.lineWidth = 9;
    ctx.strokeStyle = SIGN_INK;
    roundRect(ctx, 11, 11, w - 22, h - 22, 24);
    ctx.stroke();
    const icon = goods in STALL_SIGNS;
    if (icon) drawStallIcon(ctx, goods, 100, h / 2 + 2, 54);
    const x0 = icon ? 176 : 34, x1 = w - 34;
    fitWords(ctx, text, (x0 + x1) / 2, h / 2, x1 - x0, h - 58, { fill: SIGN_INK, shadow: `${SIGN_ACCENT[goods] || '#ffc93c'}99` });
  });
}

/**
 * marketStall({ goods: 'fruit'|'veg'|'fish'|'flowers'|'cakes', awning: [c1, c2], seed, sign = true })
 * ~2.6 m wide, front (customer side) = +Z. `sign`: true = the stall type's words (STALL_SIGNS: FRUIT & VEG,
 * GARDEN VEG, FRESH FISH, FLOWERS, CAKES & BAKES), a string = your own words, false = no sign board.
 * The words are painted in the Fredoka toy font on a CanvasTexture (repainted once fonts load;
 * textures/materials are shared between stalls with the same words).
 * parts: { stall, goods (glossy mesh), sign (painted decal mesh or null) }. 3 draw calls (2 without a sign).
 */
export function marketStall({ goods = 'fruit', awning, seed = 1, sign = true } = {}) {
  const rng = new Rng(`stall-${goods}-${seed}`);
  const [c1, c2] = awning || [P.tomato, '#fff8ee'];
  const W = 2.6;
  const L = [];
  const G = [];
  const wood = P.wood;
  const counterY = 0.95;
  const shelfY = 1.26;
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  L.push(part(bev(W, 0.08, 1.0, 0.03), wood, { y: counterY - 0.04, z: 0.12 }));
  L.push(paintFaces(part(slab(scallopShape(W, 0.78, 10, 0.07), 0.03, 0, 3), '#fff', { y: 0.5, z: 0.63 }),
    (x, y, z, nx, ny, nz, c) => c.set(c1)));
  L.push(part(box(W + 0.02, 0.09, 0.05), c2, { y: 0.86, z: 0.655 }));
  L.push(part(box(W - 0.08, 0.07, 0.38), shade(wood, 0.08), { y: shelfY, z: -0.36 }));
  for (const [x, z, h] of [[-1.26, 0.64, 2.3], [1.26, 0.64, 2.3], [-1.26, -0.55, 2.6], [1.26, -0.55, 2.6]]) {
    L.push(part(box(0.12, h, 0.12), P.woodDark, { x, y: h / 2, z }));
  }
  const aw = paintFaces(part(new THREE.BoxGeometry(2.95, 0.05, 1.5, 10, 1, 1), '#fff'), (x, y, z, nx, ny, nz, c) => {
    c.set(Math.floor((x + 1.475) / 0.295) % 2 ? c2 : c1);
    if (ny < -0.5) c.multiplyScalar(0.72);
  });
  L.push(aw.applyMatrix4(xform({ y: 2.47, z: 0.05, rx: 0.24 })));
  const val = paintFaces(part(slab(scallopShape(2.95, 0.3, 10, 0.07), 0.03, 0, 3), '#fff'),
    (x, y, z, nx, ny, nz, c) => c.set(Math.floor((x + 1.475) / 0.295) % 2 ? c2 : c1));
  L.push(val.applyMatrix4(xform({ y: 2.16, z: 0.8 })));
  const crates = [-0.84, 0, 0.84].map((x) => ({ x, y: counterY + 0.12, z: 0.3, w: 0.74, d: 0.52, rx: 0.28 }));
  const ground = [{ x: -0.62, y: 0.28, z: 1.05, w: 0.6, d: 0.46, rx: 0.2 }, { x: 0.62, y: 0.28, z: 1.05, w: 0.6, d: 0.46, rx: 0.2 }];
  const S = { crates, ground, counterY, shelfY: shelfY + 0.035, groundNoCrate: false };
  (GOODS[goods] || fruitGoods)(G, S, rng);
  const crateWood = shade(P.woodLight, 0.05);
  if (goods !== 'flowers' && goods !== 'cakes') {
    for (const cr of crates) L.push(part(bev(cr.w + 0.06, 0.16, cr.d + 0.06, 0.03), crateWood, { x: cr.x, y: cr.y - 0.04, z: cr.z, rx: cr.rx }));
  }
  if (!S.groundNoCrate) {
    for (const gc of ground) L.push(part(bev(gc.w + 0.06, 0.36, gc.d + 0.06, 0.035), crateWood, { x: gc.x, y: 0.18, z: gc.z }));
  }
  let signMesh = null;
  if (sign) {
    const text = String(typeof sign === 'string' ? sign : STALL_SIGNS[goods] || goods).toUpperCase();
    L.push(part(bev(1.5, 0.44, 0.07, 0.04), '#fff4e0', { y: 2.72, z: 0.74 }));
    L.push(part(box(1.56, 0.07, 0.09), c1, { y: 2.96, z: 0.74 }));
    for (const x of [-0.6, 0.6]) L.push(part(rod([x, 2.3, 0.72], [x, 2.52, 0.74], 0.03, 4), P.woodDark));
    const key = `stall|${goods}|${text}`;
    const plane = new THREE.PlaneGeometry(1.44, 0.396).translate(0, 2.72, 0.7765);
    signMesh = new THREE.Mesh(plane, decalMaterial(key, stallSignTexture(key, text, goods)));
    signMesh.name = 'sign';
    signMesh.receiveShadow = true;
  }
  const g = new THREE.Group();
  const stall = mesh(L, materials.toy, 'stall');
  const goodsMesh = mesh(G, materials.glossy, 'goods');
  g.add(stall, goodsMesh);
  if (signMesh) g.add(signMesh);
  return finish(g, { name: `marketStall-${goods}`, parts: { stall, goods: goodsMesh, sign: signMesh }, surface: 'wood' });
}

// ---------------------------------------------------------------- melon stack

function melonGeo() {
  const g = part(new THREE.SphereGeometry(0.2, 10, 6), '#fff', { sy: 1.3, rz: Math.PI / 2 });
  return paintFaces(g, (x, y, z, nx, ny, nz, c) => {
    let a = Math.atan2(z, -y); // = the sphere's own longitude, so stripes follow its seams
    if (a < 0) a += Math.PI * 2;
    c.set(Math.floor(a / (Math.PI / 5) + 1e-3) % 2 ? '#2f8a3a' : '#6cc44a');
  });
}

/**
 * melonStack({ seed }) — pyramid of watermelons on a pallet; every melon is its own pivot
 * (parts.melons, with colliders) drawn in 1 LiveMesh. userData.knock(melon, dirX = 1) rolls it off.
 */
export function melonStack({ seed = 1 } = {}) {
  const rng = new Rng(`melons-${seed}`);
  const L = [
    part(bev(1.4, 0.12, 1.0, 0.03), P.woodLight, { y: 0.14 }),
    part(bev(1.4, 0.05, 0.14, 0.02), shade(P.woodLight, -0.2), { y: 0.04, z: 0.4 }),
    part(bev(1.4, 0.05, 0.14, 0.02), shade(P.woodLight, -0.2), { y: 0.04, z: -0.4 }),
    part(bev(1.4, 0.05, 0.14, 0.02), shade(P.woodLight, -0.2), { y: 0.04 }),
  ];
  const g = new THREE.Group();
  g.add(mesh(L, materials.toy, 'pallet'));
  const live = new LiveMesh(materials.glossy);
  const geo = melonGeo();
  const melons = [];
  const layers = [[3, 2], [2, 1], [1, 1]];
  let y = 0.2 + 0.2;
  layers.forEach(([nx, nz], li) => {
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const p = pivot(`melon${melons.length}`, (i - (nx - 1) / 2) * 0.46, y, (j - (nz - 1) / 2) * 0.4 + (li === 2 ? 0 : 0));
      p.rotation.set(rng.range(-0.1, 0.1), rng.range(-0.25, 0.25), rng.range(-0.1, 0.1));
      p.add(ballCollider(0.28, { sx: 1.25 }));
      g.add(p);
      live.addPiece(p, geo);
      melons.push(p);
    }
    y += 0.33;
  });
  g.add(live);
  live.build();
  const anims = new Anims();
  finish(g, { name: 'melonStack', parts: { melons }, surface: 'soft', anims, tick: (dt, t) => live.sync(t) });
  /** Melon mayhem: knock every melon off, top first, alternating sides. */
  g.userData.avalanche = () => {
    const order = melons.filter((m) => !m.userData.knocked).sort((a, b) => b.position.y - a.position.y);
    return Promise.all(order.map((m, i) => anims.play(0.001, () => {}, { delay: i * 0.16 })
      .then(() => g.userData.knock(m, m.position.x > 0.01 ? 1 : m.position.x < -0.01 ? -1 : (i % 2 ? 1 : -1)))));
  };
  g.userData.knock = (m, dir = 1) => {
    if (m.userData.knocked) return Promise.resolve(false);
    m.userData.knocked = true;
    const from = m.position.clone();
    const to = new THREE.Vector3(from.x + dir * rng.range(1.2, 1.8), 0.2, from.z + rng.range(-0.8, 0.8));
    const r0 = m.rotation.z;
    return anims.play(1.1, (k) => {
      m.position.lerpVectors(from, to, k);
      m.position.y = THREE.MathUtils.lerp(from.y, to.y, k) + Math.sin(Math.min(1, k * 1.3) * Math.PI) * 0.5 + Math.abs(Math.sin(k * Math.PI * 3)) * (1 - k) * 0.15;
      m.rotation.z = r0 - dir * k * 7;
    }, { ease: ease.outQuad });
  };
  return g;
}
