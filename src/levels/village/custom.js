// Puddleby Green: bespoke set pieces the kits don't have (phone kiosk with an open door, fête
// marquee, bouncy castle, coconut shy, allotment beds, shed, greenhouse, scarecrow, village sign...).
// Everything is vertex-coloured and merged (1-3 draw calls each) so the static batcher can absorb it.
import * as THREE from 'three';
import * as B from '../../world/kit/buildings/index.js';
import { materials } from '../../gfx/materials.js';
import { P } from '../../gfx/palette.js';
import { Rng } from '../../core/rng.js';
import { TAU } from './util.js';

const { Kit, cbox, prism, lathe, shade } = B;
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 10) => new THREE.CylinderGeometry(rt, rb, h, s);
const ball = (r, d = 1) => new THREE.IcosahedronGeometry(r, d);
const RED = '#e8413c';
const CREAM = '#fff8ee';

/** Flat-top rounded blob (cabbage, bush, heap). */
function blob(r, seed, detail = 1, amp = 0.12) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + (Math.sin(x * 7.1 + seed) * Math.cos(z * 6.3 - seed) + Math.sin(y * 5.7 + seed * 2)) * amp * 0.5;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** A painted banner/board material (CanvasTexture), cached by text. */
const boardCache = new Map();
export function boardMaterial(text, { bg = P.cobalt, fg = CREAM, border = P.ink, sub = null, w = 1024, h = 256, font = 0.62 } = {}) {
  const key = [text, bg, fg, border, sub, w, h].join('|');
  if (boardCache.has(key)) return boardCache.get(key);
  const tex = B.paintedTexture(w, h, (ctx) => {
    const r = h * 0.18;
    const rr = (x, y, ww, hh, rad) => {
      ctx.beginPath();
      ctx.moveTo(x + rad, y);
      ctx.arcTo(x + ww, y, x + ww, y + hh, rad);
      ctx.arcTo(x + ww, y + hh, x, y + hh, rad);
      ctx.arcTo(x, y + hh, x, y, rad);
      ctx.arcTo(x, y, x + ww, y, rad);
      ctx.closePath();
    };
    ctx.fillStyle = border;
    rr(0, 0, w, h, r);
    ctx.fill();
    ctx.fillStyle = bg;
    const b = h * 0.07;
    rr(b, b, w - 2 * b, h - 2 * b, r * 0.7);
    ctx.fill();
    const g = ctx.createLinearGradient(0, b, 0, h - b);
    g.addColorStop(0, 'rgba(255,255,255,0.2)');
    g.addColorStop(0.55, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    rr(b, b, w - 2 * b, h - 2 * b, r * 0.7);
    ctx.fill();
    const mainH = sub ? h * font * 0.8 : h * font;
    let size = mainH;
    ctx.font = `700 ${size}px ${B.FONT}`;
    const tw = ctx.measureText(text).width;
    if (tw > w * 0.88) size = (size * w * 0.88) / tw;
    ctx.font = `700 ${size}px ${B.FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const ty = sub ? h * 0.42 : h * 0.54;
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.16;
    ctx.strokeStyle = P.ink;
    ctx.fillStyle = 'rgba(43,43,58,0.35)';
    ctx.fillText(text, w / 2, ty + size * 0.07);
    ctx.strokeText(text, w / 2, ty);
    ctx.fillStyle = fg;
    ctx.fillText(text, w / 2, ty);
    if (sub) {
      let s2 = h * 0.2;
      ctx.font = `600 ${s2}px ${B.FONT}`;
      const w2 = ctx.measureText(sub).width;
      if (w2 > w * 0.86) s2 = (s2 * w * 0.86) / w2;
      ctx.font = `600 ${s2}px ${B.FONT}`;
      ctx.fillStyle = fg;
      ctx.fillText(sub, w / 2, h * 0.78);
    }
  }, { anisotropy: 8 });
  const m = new THREE.MeshStandardMaterial({ map: tex, color: tex ? '#ffffff' : bg, roughness: 0.6, metalness: 0 });
  m.name = `board:${text}`;
  boardCache.set(key, m);
  return m;
}

// ------------------------------------------------------------------ phone kiosk (door ajar)
let kioskGlass = null;
function glassMat() {
  if (!kioskGlass) {
    kioskGlass = new THREE.MeshStandardMaterial({ color: '#cdefff', transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0, depthWrite: false, envMapIntensity: 1.6 });
    kioskGlass.name = 'kioskGlass';
  }
  return kioskGlass;
}

/** Glazing bars + frame rails of one kiosk side, in the kit's current frame (pane plane z = 0). */
function paneBars(kit, w, x0 = 0) {
  kit.add(box(w, 0.26, 0.08), RED, { x: x0, y: 0.33 });
  kit.add(box(w, 0.12, 0.08), RED, { x: x0, y: 2.12 });
  for (let r = 1; r < 6; r++) kit.add(box(w, 0.05, 0.07), RED, { x: x0, y: 0.46 + (r / 6) * 1.6 });
  for (let c = 1; c < 3; c++) kit.add(box(0.05, 1.6, 0.07), RED, { x: x0 - w / 2 + (c / 3) * w, y: 1.26 });
}

/**
 * Red telephone kiosk with its door swung open (front = +Z). Glazing is see-through (and
 * shoot-through), so whatever sits on the shelf inside can be spotted and hit.
 * parts: { shelf (Object3D on the shelf top), door (pivot) }
 */
export function phoneKiosk({ open = 1.9 } = {}) {
  const kit = new Kit('kiosk');
  const W = 1.12, H = 2.36;
  const pw = W - 0.22;
  const dark = shade(RED, -0.12);
  kit.add(cbox(W + 0.2, 0.2, W + 0.2, 0.05), dark, { y: 0.1 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) kit.add(cbox(0.17, H, 0.17, 0.05), RED, { x: sx * (W / 2 - 0.02), y: 0.2 + H / 2, z: sz * (W / 2 - 0.02) });
  // back + side walls (the front one is the open door)
  for (const f of [1, 2, 3]) kit.at({ ry: (f * Math.PI) / 2, z: 0 }, () => kit.at({ z: W / 2 - 0.02 }, () => paneBars(kit, pw)));
  // TELEPHONE signs on all four sides + stepped domed roof
  for (let f = 0; f < 4; f++) {
    kit.at({ ry: (f * Math.PI) / 2 }, () => {
      kit.add(box(W - 0.16, 0.22, 0.06), CREAM, { y: 2.33, z: W / 2 + 0.02 });
      kit.raw(new THREE.PlaneGeometry(W - 0.26, 0.17), B.labelMaterial('TELEPHONE', { bg: CREAM, fg: P.ink, w: 512, h: 80, radius: 0.1 }), { y: 2.33, z: W / 2 + 0.056 });
    });
  }
  kit.add(cbox(W + 0.16, 0.16, W + 0.16, 0.05), RED, { y: 2.52 });
  kit.add(cbox(W + 0.02, 0.14, W + 0.02, 0.05), RED, { y: 2.66 });
  kit.add(new THREE.SphereGeometry(0.64, 16, 5, 0, TAU, 0, Math.PI / 2), RED, { y: 2.7, sy: 0.34, sx: 0.9, sz: 0.9 });
  kit.add(ball(0.1, 0), P.gold, { y: 2.93 }, materials.glossy);
  // interior: back-wall shelf, black phone, yellow directory, floor
  kit.add(box(W - 0.3, 0.05, 0.34), P.woodDark, { y: 1.02, z: -W / 2 + 0.26 });
  kit.add(cbox(0.3, 0.36, 0.2, 0.04), P.ink, { y: 1.48, z: -W / 2 + 0.14 });
  kit.add(cbox(0.28, 0.07, 0.08, 0.03), '#3a3e4c', { y: 1.7, z: -W / 2 + 0.26 });
  kit.add(cyl(0.05, 0.05, 0.02, 10), '#d9dde6', { y: 1.5, z: -W / 2 + 0.25, rx: Math.PI / 2 });
  kit.add(cbox(0.22, 0.06, 0.28, 0.02), P.sunflower, { x: 0.28, y: 1.08, z: -W / 2 + 0.26 });
  kit.add(box(W - 0.22, 0.02, W - 0.22), '#5a4a42', { y: 0.21 });
  const group = kit.build(new THREE.Group());
  group.name = 'phoneKiosk';
  // see-through glass (no raycast: you can shoot through the panes)
  const panes = [];
  for (const f of [1, 2, 3]) {
    const g = new THREE.PlaneGeometry(pw, 1.62).translate(0, 1.26, W / 2 - 0.02);
    g.applyMatrix4(new THREE.Matrix4().makeRotationY((f * Math.PI) / 2));
    panes.push(g);
  }
  const gl = new THREE.Mesh(mergePlain(panes), glassMat());
  gl.raycast = () => {};
  gl.castShadow = false;
  gl.name = 'kioskGlass';
  group.add(gl);
  // the door, hinged on the front-left post, swung open toward the viewer
  const door = new THREE.Group();
  door.name = 'door';
  door.position.set(-W / 2 + 0.02, 0, W / 2 - 0.02);
  const dk = new Kit('door');
  paneBars(dk, pw, (W - 0.04) / 2);
  dk.add(box(0.06, 0.34, 0.06), P.ink, { x: W - 0.24, y: 1.2, z: 0.05 });
  dk.build(door);
  const dg = new THREE.Mesh(new THREE.PlaneGeometry(pw, 1.62).translate((W - 0.04) / 2, 1.26, 0), glassMat());
  dg.raycast = () => {};
  dg.castShadow = false;
  door.add(dg);
  door.rotation.y = -open;
  group.add(door);
  const shelf = new THREE.Object3D();
  shelf.name = 'shelf';
  shelf.position.set(-0.02, 1.05, -W / 2 + 0.3);
  group.add(shelf);
  group.userData.parts = { shelf, door };
  group.userData.surface = 'metal';
  return group;
}

function mergePlain(list) {
  const n = list.reduce((a, g) => a + g.attributes.position.count, 0);
  const idx = [];
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    for (const i of g.index.array) idx.push(i + o);
    o += g.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

// ------------------------------------------------------------------ fête pieces
/** Striped fête marquee, open at the front (+Z). ~w x d, ridge ~4.3 m. */
export function marquee({ w = 9, d = 6, colors = [RED, CREAM], seed = 1, sign = 'TEA TENT' } = {}) {
  const rng = new Rng(`marquee-${seed}`);
  const kit = new Kit('marquee');
  const wallH = 2.3, ridge = 4.3;
  const n = Math.round(w / 0.75);
  const sw = w / n;
  // back + side walls in stripes
  for (let i = 0; i < n; i++) kit.add(box(sw + 0.01, wallH, 0.08), colors[i % 2], { x: -w / 2 + sw * (i + 0.5), y: wallH / 2, z: -d / 2 });
  const nd = Math.round(d / 0.75);
  const sd = d / nd;
  for (const sx of [-1, 1]) for (let i = 0; i < nd; i++) kit.add(box(0.08, wallH, sd + 0.01), colors[i % 2], { x: sx * w / 2, y: wallH / 2, z: -d / 2 + sd * (i + 0.5) });
  // roof: two slopes of stripes
  const slope = Math.hypot(w / 2, ridge - wallH);
  const ang = Math.atan2(ridge - wallH, w / 2);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < nd; i++) {
      kit.add(box(slope + 0.35, 0.08, sd + 0.01), colors[i % 2], {
        x: sx * (w / 4 + 0.1), y: (wallH + ridge) / 2 + 0.05, z: -d / 2 + sd * (i + 0.5), rz: -sx * ang,
      });
    }
  }
  // gable ends (triangles) front/back
  for (const sz of [-1, 1]) kit.add(prism([[-w / 2, 0], [w / 2, 0], [0, ridge - wallH]], 0.07), colors[0], { y: wallH, z: sz * (d / 2) - (sz > 0 ? 0.07 : 0) });
  // scalloped valance around the eaves
  const scal = (x, z, ry) => kit.add(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 10, 1, false, 0, Math.PI), colors[1], { x, y: wallH - 0.02, z, rx: Math.PI / 2, ry });
  for (let i = 0; i < n; i++) { scal(-w / 2 + sw * (i + 0.5), d / 2 + 0.04, 0); scal(-w / 2 + sw * (i + 0.5), -d / 2 - 0.04, 0); }
  // poles with flag finials
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    kit.add(cyl(0.06, 0.06, wallH + 0.4, 6), CREAM, { x: sx * w / 2, y: (wallH + 0.4) / 2, z: sz * d / 2 });
  }
  for (const sz of [-1, 1]) {
    kit.add(cyl(0.07, 0.07, ridge + 1.1, 6), CREAM, { y: (ridge + 1.1) / 2, z: sz * d / 2 });
    kit.add(prism([[0, 0], [0.7, -0.2], [0, -0.42]], 0.03), rng.pick([P.sunflower, P.teal, P.bubblegum]), { y: ridge + 1.05, z: sz * d / 2 });
    kit.add(ball(0.08, 0), P.gold, { y: ridge + 1.12, z: sz * d / 2 }, materials.glossy);
  }
  // tied-back front flaps
  for (const sx of [-1, 1]) kit.add(new THREE.ConeGeometry(0.45, wallH, 6, 1, true), colors[0], { x: sx * (w / 2 - 0.35), y: wallH / 2, z: d / 2 - 0.1, sx: 0.8, sz: 0.3 });
  // interior: trestle table with cloth + cakes + urn
  kit.add(box(w * 0.7, 0.75, 1.0), CREAM, { y: 0.4, z: -d / 2 + 1.2 });
  kit.add(box(w * 0.7 + 0.04, 0.05, 1.04), '#ffd1dc', { y: 0.78, z: -d / 2 + 1.2 });
  for (let i = 0; i < 7; i++) {
    const x = -w * 0.3 + (i / 6) * w * 0.6;
    const c = rng.pick([P.bubblegum, '#fff1d6', '#c8894a', P.sunflower, '#ff9ec4']);
    kit.add(cyl(0.2, 0.22, 0.2, 12), c, { x, y: 0.92, z: -d / 2 + 1.2 });
    kit.add(cyl(0.21, 0.21, 0.05, 12), rng.pick([CREAM, P.tomato, '#7a4a26']), { x, y: 1.04, z: -d / 2 + 1.2 });
    kit.add(ball(0.04, 0), P.tomato, { x, y: 1.09, z: -d / 2 + 1.2 });
  }
  kit.add(cyl(0.2, 0.22, 0.55, 12), '#a9b4c2', { x: w * 0.36 - 0.2, y: 1.06, z: -d / 2 + 1.2 }, materials.metal);
  // painted sign over the entrance
  kit.add(box(3.2, 0.72, 0.08), P.ink, { y: wallH + 0.5, z: d / 2 + 0.06 });
  kit.raw(new THREE.PlaneGeometry(3.05, 0.62), boardMaterial(sign, { bg: P.teal, fg: CREAM, w: 1024, h: 208 }), { y: wallH + 0.5, z: d / 2 + 0.105 });
  kit.add(box(w - 0.1, 0.04, d - 0.1), '#9bd86a', { y: 0.02 });
  const g = kit.build(new THREE.Group());
  g.name = 'marquee';
  g.userData.surface = 'soft';
  return g;
}

/** Pastel bouncy castle (~5 x 4 m). Returns { group, deck } where deck is the bouncing surface height. */
export function bouncyCastle({ seed = 1 } = {}) {
  const kit = new Kit('bouncy');
  const base = '#7fc8ff', wall = '#ff9ec4', tower = '#ffe590', cap = '#b89adb';
  const Wd = 5, Dp = 4.2;
  kit.add(cbox(Wd, 0.6, Dp, 0.25), base, { y: 0.3 });
  kit.add(cbox(Wd - 0.4, 0.08, Dp - 0.5, 0.04), shade(base, 0.12), { y: 0.62, z: 0.15 });
  // puffy walls (back + sides) with arch windows
  kit.add(cbox(Wd, 1.5, 0.5, 0.24), wall, { y: 1.3, z: -Dp / 2 + 0.25 });
  for (const sx of [-1, 1]) kit.add(cbox(0.5, 1.3, Dp - 0.6, 0.24), wall, { x: sx * (Wd / 2 - 0.25), y: 1.2, z: 0.05 });
  for (let i = -1; i <= 1; i++) kit.add(new THREE.CircleGeometry(0.34, 12), shade(base, 0.2), { x: i * 1.3, y: 1.45, z: -Dp / 2 + 0.51 });
  // turrets at the corners
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    kit.at({ x: sx * (Wd / 2 - 0.2), z: sz * (Dp / 2 - 0.2) }, () => {
      kit.add(new THREE.CapsuleGeometry(0.42, 1.9, 4, 12), tower, { y: 1.35 });
      kit.add(new THREE.ConeGeometry(0.55, 0.9, 12), cap, { y: 2.85 });
      kit.add(ball(0.12, 1), P.tomato, { y: 3.35 });
      for (let k = 0; k < 3; k++) kit.add(new THREE.TorusGeometry(0.43, 0.05, 5, 16), shade(tower, -0.08), { y: 0.7 + k * 0.6, rx: Math.PI / 2 });
    });
  }
  // front ramp
  kit.add(cbox(Wd - 1.2, 0.3, 1.1, 0.14), wall, { y: 0.15, z: Dp / 2 + 0.45, rx: 0.12 });
  // smiley face on the back wall
  kit.add(ball(0.12, 1), P.ink, { x: -0.35, y: 1.75, z: -Dp / 2 + 0.52, sz: 0.3 });
  kit.add(ball(0.12, 1), P.ink, { x: 0.35, y: 1.75, z: -Dp / 2 + 0.52, sz: 0.3 });
  kit.add(new THREE.TorusGeometry(0.34, 0.06, 5, 12, Math.PI), P.ink, { y: 1.5, z: -Dp / 2 + 0.53, rz: Math.PI });
  void seed;
  const g = kit.build(new THREE.Group());
  g.name = 'bouncyCastle';
  g.userData.surface = 'soft';
  g.userData.deck = 0.66;
  g.userData.size = { w: Wd, d: Dp };
  return g;
}

/** Coconut shy: striped booth with five coconuts on posts. */
export function coconutShy({ seed = 2 } = {}) {
  const rng = new Rng(`shy-${seed}`);
  const kit = new Kit('shy');
  const w = 3.6;
  for (const sx of [-1, 1]) kit.add(cbox(0.14, 2.6, 0.14, 0.04), P.woodDark, { x: sx * w / 2, y: 1.3, z: -0.7 });
  for (const sx of [-1, 1]) kit.add(cbox(0.14, 2.3, 0.14, 0.04), P.woodDark, { x: sx * w / 2, y: 1.15, z: 0.7 });
  for (let i = 0; i < 6; i++) kit.add(box(w / 6 + 0.01, 0.08, 1.7), i % 2 ? CREAM : P.cobalt, { x: -w / 2 + (w / 6) * (i + 0.5), y: 2.5, z: 0, rx: -0.14 });
  for (let i = 0; i < 6; i++) kit.add(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 10, 1, false, 0, Math.PI), i % 2 ? CREAM : P.cobalt, { x: -w / 2 + (w / 6) * (i + 0.5), y: 2.38, z: 0.85, rx: Math.PI / 2 });
  kit.add(box(w, 0.9, 0.08), P.tomato, { y: 0.45, z: 0.75 });
  kit.add(box(w, 0.08, 0.3), CREAM, { y: 0.92, z: 0.75 });
  for (let i = 0; i < 5; i++) {
    const x = -1.3 + i * 0.65;
    kit.add(cyl(0.035, 0.035, 1.2, 6), P.woodLight, { x, y: 0.6, z: -0.45 });
    kit.add(cyl(0.1, 0.06, 0.1, 8), P.sunflower, { x, y: 1.24, z: -0.45 });
    kit.add(blob(0.16, i + seed, 1, 0.18), '#7a4a26', { x, y: 1.4, z: -0.45 });
  }
  kit.add(cyl(0.22, 0.18, 0.3, 10), P.teal, { x: 1.4, y: 1.1, z: 0.78 });
  for (let i = 0; i < 4; i++) kit.add(ball(0.07, 0), rng.pick([P.tomato, CREAM, P.sunflower]), { x: 1.35 + (i % 2) * 0.1, y: 1.26 + i * 0.02, z: 0.72 + (i > 1 ? 0.1 : 0) });
  kit.add(box(2.4, 0.5, 0.06), P.ink, { y: 2.8, z: 0.86, rx: -0.14 });
  kit.raw(new THREE.PlaneGeometry(2.3, 0.42), boardMaterial('COCONUT SHY', { bg: P.sunflower, fg: P.tomato, w: 1024, h: 190 }), { y: 2.8, z: 0.9, rx: -0.14 });
  const g = kit.build(new THREE.Group());
  g.name = 'coconutShy';
  g.userData.surface = 'wood';
  return g;
}

/** Tombola table: a striped drum on a stand + prize bottles. */
export function tombola({ seed = 3 } = {}) {
  const rng = new Rng(`tombola-${seed}`);
  const kit = new Kit('tombola');
  kit.add(box(2.2, 0.8, 0.9), CREAM, { y: 0.4 });
  kit.add(box(2.24, 0.06, 0.94), P.bubblegum, { y: 0.82 });
  for (let i = 0; i < 8; i++) {
    const c = rng.pick([P.tomato, P.teal, P.sunflower, P.violet, P.lime]);
    kit.add(cyl(0.06, 0.07, 0.28, 8), c, { x: -0.95 + i * 0.12, y: 1.0, z: 0.2 }, materials.glossy);
    kit.add(cyl(0.025, 0.03, 0.1, 6), c, { x: -0.95 + i * 0.12, y: 1.18, z: 0.2 }, materials.glossy);
  }
  kit.add(cyl(0.34, 0.34, 0.7, 8), P.sunflower, { x: 0.45, y: 1.3, rz: Math.PI / 2 });
  for (let k = 0; k < 8; k += 2) kit.add(cyl(0.345, 0.345, 0.12, 8), P.tomato, { x: 0.45 - 0.3 + k * 0.08, y: 1.3, rz: Math.PI / 2 });
  for (const sx of [0.05, 0.85]) kit.add(box(0.06, 0.5, 0.06), P.woodDark, { x: sx, y: 1.05 });
  kit.add(box(1.6, 0.36, 0.06), P.ink, { y: 1.95, z: -0.2 });
  kit.raw(new THREE.PlaneGeometry(1.52, 0.3), boardMaterial('TOMBOLA', { bg: P.violet, fg: P.sunflower, w: 768, h: 150 }), { y: 1.95, z: -0.165 });
  for (const sx of [-0.7, 0.7]) kit.add(box(0.05, 1.2, 0.05), P.woodDark, { x: sx, y: 1.45, z: -0.25 });
  const g = kit.build(new THREE.Group());
  g.name = 'tombola';
  g.userData.surface = 'wood';
  return g;
}

/** A straw bale (optionally stacked). */
export function hayBales(layout = [[0, 0, 0, 0]], { seed = 4 } = {}) {
  const rng = new Rng(`hay-${seed}`);
  const kit = new Kit('hay');
  for (const [x, y, z, ry] of layout) {
    const c = B.hsl('#f0cf6a', rng.range(-0.01, 0.01), rng.range(-0.05, 0.05), rng.range(-0.04, 0.03));
    kit.add(cbox(1.2, 0.55, 0.62, 0.12), [shade(c, -0.08), c], { x, y: y + 0.275, z, ry });
    for (const s of [-0.3, 0.3]) kit.add(box(0.04, 0.57, 0.64), '#c9a04a', { x: x + Math.cos(ry) * s, y: y + 0.275, z: z - Math.sin(ry) * s, ry });
  }
  const g = kit.build(new THREE.Group());
  g.name = 'hayBales';
  g.userData.surface = 'soft';
  return g;
}

/** Fête banner strung between two poles: "PUDDLEBY FETE TODAY!". */
export function feteBanner({ w = 7, h = 4.2, text = 'PUDDLEBY FÊTE', sub = 'TODAY 2pm · everyone welcome!' } = {}) {
  const kit = new Kit('banner');
  for (const sx of [-1, 1]) {
    kit.add(cyl(0.09, 0.11, h + 0.4, 8), P.woodLight, { x: sx * w / 2, y: (h + 0.4) / 2 });
    kit.add(ball(0.16, 1), P.tomato, { x: sx * w / 2, y: h + 0.5 });
    for (let i = 0; i < 4; i++) kit.add(new THREE.ConeGeometry(0.22, 0.3, 3), [P.sunflower, P.teal, P.bubblegum, P.tomato][i], { x: sx * w / 2 + sx * 0.25, y: h - 0.2 - i * 0.35, rz: sx * Math.PI / 2 });
  }
  kit.add(box(w - 0.3, 1.25, 0.06), P.ink, { y: h - 0.45 });
  kit.raw(new THREE.PlaneGeometry(w - 0.45, 1.1), boardMaterial(text, { bg: P.tomato, fg: CREAM, sub, w: 1400, h: 220, font: 0.7 }), { y: h - 0.45, z: 0.035 });
  kit.raw(new THREE.PlaneGeometry(w - 0.45, 1.1), boardMaterial(text, { bg: P.tomato, fg: CREAM, sub, w: 1400, h: 220, font: 0.7 }), { y: h - 0.45, z: -0.035, ry: Math.PI });
  const g = kit.build(new THREE.Group());
  g.name = 'feteBanner';
  g.userData.surface = 'soft';
  return g;
}

/** "PUDDLEBY GREEN" village sign on two posts with a flower bed in front. */
export function villageSign() {
  const kit = new Kit('villageSign');
  for (const sx of [-1, 1]) {
    kit.add(cbox(0.2, 2.5, 0.2, 0.05), P.woodDark, { x: sx * 1.5, y: 1.25 });
    kit.add(new THREE.ConeGeometry(0.17, 0.25, 4), P.woodDark, { x: sx * 1.5, y: 2.62, ry: Math.PI / 4 });
  }
  kit.add(cbox(3.4, 1.3, 0.14, 0.05), P.woodDark, { y: 1.75 });
  kit.raw(new THREE.PlaneGeometry(3.2, 1.12), boardMaterial('PUDDLEBY GREEN', { bg: '#2f7d62', fg: CREAM, sub: 'Please drive carefully · twinned with Nowhere', w: 1024, h: 360, font: 0.5 }), { y: 1.75, z: 0.075 });
  kit.raw(new THREE.PlaneGeometry(3.2, 1.12), boardMaterial('PUDDLEBY GREEN', { bg: '#2f7d62', fg: CREAM, sub: 'Please drive carefully · twinned with Nowhere', w: 1024, h: 360, font: 0.5 }), { y: 1.75, z: -0.075, ry: Math.PI });
  // little "Best kept village" plaque
  kit.add(cbox(1.3, 0.34, 0.1, 0.03), P.gold, { y: 0.82, z: 0.02 }, materials.glossy);
  kit.raw(new THREE.PlaneGeometry(1.2, 0.26), B.labelMaterial('BEST KEPT VILLAGE 1987', { bg: '#e8b33c', fg: P.ink, w: 768, h: 120, radius: 0.2 }), { y: 0.82, z: 0.075 });
  const g = kit.build(new THREE.Group());
  g.name = 'villageSign';
  g.userData.surface = 'wood';
  return g;
}

// ------------------------------------------------------------------ allotments
const SOIL = '#8b5e3c';
/** Raised veg bed w x d with rows of a crop: cabbage | carrot | lettuce | pumpkin | leek | strawberry. */
export function vegBed(w, d, crop = 'cabbage', { seed = 1, frame = true } = {}) {
  const rng = new Rng(`bed-${seed}-${crop}`);
  const kit = new Kit('bed');
  kit.add(cbox(w, 0.24, d, 0.08), [shade(SOIL, -0.1), SOIL], { y: 0.1 });
  if (frame) {
    for (const sz of [-1, 1]) kit.add(box(w + 0.1, 0.26, 0.08), P.wood, { y: 0.12, z: sz * (d / 2 + 0.02) });
    for (const sx of [-1, 1]) kit.add(box(0.08, 0.26, d + 0.1), P.wood, { x: sx * (w / 2 + 0.02), y: 0.12 });
  }
  const rows = Math.max(1, Math.round(d / 0.7));
  const cols = Math.max(1, Math.round(w / 0.6));
  for (let r = 0; r < rows; r++) {
    const z = -d / 2 + (d / rows) * (r + 0.5);
    for (let c = 0; c < cols; c++) {
      const x = -w / 2 + (w / cols) * (c + 0.5) + rng.range(-0.06, 0.06);
      const s = rng.range(0.85, 1.15);
      if (crop === 'cabbage') {
        kit.add(blob(0.2 * s, rng.range(0, 9), 1, 0.1), rng.pick(['#8fd35e', '#7cc653', '#a6da6c']), { x, y: 0.34, z, sy: 0.8 }, materials.foliage);
        kit.add(blob(0.12 * s, rng.range(0, 9), 1, 0.1), '#c8ee9a', { x, y: 0.44, z }, materials.foliage);
      } else if (crop === 'carrot') {
        for (let k = 0; k < 3; k++) kit.add(new THREE.ConeGeometry(0.05, 0.34 * s, 4), '#5fae44', { x: x + (k - 1) * 0.05, y: 0.38, z, rz: (k - 1) * 0.3 }, materials.foliage);
        kit.add(new THREE.ConeGeometry(0.05, 0.12, 6), P.tangerine, { x, y: 0.26, z, rx: Math.PI });
      } else if (crop === 'lettuce') {
        kit.add(blob(0.17 * s, rng.range(0, 9), 1, 0.25), rng.pick(['#b8e07a', '#9bd86a']), { x, y: 0.32, z, sy: 0.65 }, materials.foliage);
      } else if (crop === 'pumpkin') {
        if ((r + c) % 2) continue;
        kit.add(blob(0.3 * s, rng.range(0, 9), 1, 0.06), P.tangerine, { x, y: 0.4, z, sy: 0.7 }, materials.glossy);
        kit.add(cyl(0.03, 0.04, 0.12, 5), '#5a7a2a', { x, y: 0.62, z });
        kit.add(blob(0.18, rng.range(0, 9), 0, 0.2), '#5fae44', { x: x + 0.25, y: 0.3, z: z + 0.1, sy: 0.4 }, materials.foliage);
      } else if (crop === 'leek') {
        kit.add(cyl(0.04, 0.05, 0.3, 6), '#eef5d6', { x, y: 0.36, z });
        for (let k = 0; k < 2; k++) kit.add(new THREE.ConeGeometry(0.06, 0.4, 3), '#4f9a3c', { x: x + (k ? 0.05 : -0.05), y: 0.65, z, rz: k ? -0.25 : 0.25 }, materials.foliage);
      } else if (crop === 'strawberry') {
        kit.add(blob(0.14, rng.range(0, 9), 0, 0.2), '#5fae44', { x, y: 0.28, z, sy: 0.5 }, materials.foliage);
        kit.add(ball(0.05, 0), P.tomato, { x: x + 0.08, y: 0.26, z: z + 0.06 }, materials.glossy);
      }
    }
  }
  const g = kit.build(new THREE.Group());
  g.name = `bed-${crop}`;
  g.userData.surface = 'dust';
  return g;
}

/** Runner-bean wigwam: canes tied at the top, leafy with red flowers. */
export function beanWigwam({ seed = 1, h = 2.2 } = {}) {
  const rng = new Rng(`bean-${seed}`);
  const kit = new Kit('wigwam');
  const n = 6, r = 0.55;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const top = new THREE.Vector3(0, h, 0), bot = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    kit.add(cylBetween(bot, top, 0.025), '#c9a46a');
    for (let k = 0; k < 4; k++) {
      const p = bot.clone().lerp(top, 0.2 + k * 0.2);
      kit.add(blob(0.16, rng.range(0, 9), 0, 0.3), rng.pick(['#5fae44', '#7cc653', '#4f9a3c']), { x: p.x, y: p.y, z: p.z }, materials.foliage);
      if (rng.chance(0.5)) kit.add(ball(0.04, 0), P.tomato, { x: p.x * 1.2, y: p.y + 0.05, z: p.z * 1.2 });
    }
  }
  const g = kit.build(new THREE.Group());
  g.name = 'beanWigwam';
  g.userData.surface = 'leaves';
  return g;
}

function cylBetween(a, b, r) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, 5);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
}

/** Tall toy sunflowers in a row along +X. */
export function sunflowers(n = 5, { seed = 5, spacing = 0.7 } = {}) {
  const rng = new Rng(`sun-${seed}`);
  const kit = new Kit('sunflowers');
  for (let i = 0; i < n; i++) {
    const h = rng.range(1.8, 2.6);
    const x = (i - (n - 1) / 2) * spacing + rng.range(-0.1, 0.1);
    const lean = rng.range(-0.08, 0.08);
    kit.at({ x, rz: lean }, () => {
      kit.add(cyl(0.035, 0.05, h, 6), '#5a9a3a', { y: h / 2 });
      for (const s of [-1, 1]) kit.add(new THREE.SphereGeometry(0.18, 8, 5), '#5fae44', { x: s * 0.16, y: h * 0.45 + (s > 0 ? 0.2 : 0), sx: 1.4, sy: 0.3, sz: 0.8, rz: s * 0.4 }, materials.foliage);
      kit.at({ y: h, z: 0.05, rx: -0.35 }, () => {
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * TAU;
          kit.add(new THREE.SphereGeometry(0.1, 6, 4), k % 2 ? P.sunflower : '#ffb81c', { x: Math.cos(a) * 0.24, y: Math.sin(a) * 0.24, sx: 0.8, sy: 1.6, sz: 0.3, rz: a - Math.PI / 2 });
        }
        kit.add(cyl(0.17, 0.17, 0.08, 12), '#7a4a26', { rx: Math.PI / 2, z: 0.02 });
      });
    });
  }
  const g = kit.build(new THREE.Group());
  g.name = 'sunflowers';
  g.userData.surface = 'leaves';
  return g;
}

/** Garden shed with a felt roof, door and window (front +Z). */
export function shed({ color = '#8fbf9f', seed = 6 } = {}) {
  const kit = new Kit('shed');
  const w = 2.6, d = 2.0, h = 2.1;
  kit.add(cbox(w, h, d, 0.06), [shade(color, -0.08), color], { y: h / 2 });
  for (let i = 0; i < 7; i++) kit.add(box(w + 0.02, 0.03, 0.02), shade(color, -0.15), { y: 0.3 + i * 0.26, z: d / 2 + 0.005 });
  kit.add(prism([[-w / 2 - 0.15, 0], [w / 2 + 0.15, 0], [0, 0.8]], d + 0.3), '#4a5566', { y: h, z: 0 });
  kit.add(cbox(0.8, 1.7, 0.06, 0.03), shade(color, -0.22), { x: -0.55, y: 0.85, z: d / 2 + 0.03 });
  kit.add(ball(0.04, 0), P.gold, { x: -0.25, y: 0.9, z: d / 2 + 0.08 });
  kit.add(box(0.7, 0.55, 0.05), '#bfe6ff', { x: 0.6, y: 1.35, z: d / 2 + 0.03 }, materials.glossy);
  kit.add(box(0.8, 0.07, 0.08), CREAM, { x: 0.6, y: 1.05, z: d / 2 + 0.05 });
  kit.add(box(0.8, 0.07, 0.08), CREAM, { x: 0.6, y: 1.65, z: d / 2 + 0.05 });
  kit.add(box(0.9, 0.12, 0.3), P.tomato, { x: 0.6, y: 1.0, z: d / 2 + 0.15 });
  for (let k = 0; k < 4; k++) kit.add(ball(0.08, 0), [P.bubblegum, P.sunflower, '#fff8ee', P.violet][k], { x: 0.35 + k * 0.17, y: 1.13, z: d / 2 + 0.16 });
  void seed;
  const g = kit.build(new THREE.Group());
  g.name = 'shed';
  g.userData.surface = 'wood';
  return g;
}

/** Little greenhouse (white frame, glossy glass, tomatoes). Front +Z. */
export function greenhouse({ w = 2.4, d = 3.2 } = {}) {
  const kit = new Kit('greenhouse');
  const h = 1.8, rh = 0.9;
  kit.add(box(w, 0.4, d), '#d9cdb5', { y: 0.2 });
  kit.add(box(w - 0.1, h - 0.4, d - 0.1), '#d4f1ff', { y: 0.4 + (h - 0.4) / 2 }, materials.glossy);
  kit.add(prism([[-w / 2, 0], [w / 2, 0], [0, rh]], d - 0.1), '#d4f1ff', { y: h }, materials.glossy);
  for (let i = 0; i <= 4; i++) {
    const z = -d / 2 + (i / 4) * d;
    kit.add(box(w + 0.04, 0.05, 0.05), CREAM, { y: h, z });
    for (const sx of [-1, 1]) {
      kit.add(box(0.05, h - 0.4, 0.05), CREAM, { x: sx * w / 2, y: 0.4 + (h - 0.4) / 2, z });
      kit.add(box(0.05, Math.hypot(w / 2, rh) + 0.04, 0.05), CREAM, { x: sx * w / 4, y: h + rh / 2, z, rz: sx * Math.atan2(w / 2, rh) });
    }
  }
  kit.add(box(0.06, 0.06, d + 0.05), CREAM, { y: h + rh });
  for (let i = 0; i < 6; i++) kit.add(ball(0.08, 0), P.tomato, { x: (i % 2 ? 0.5 : -0.5) * w * 0.6, y: 1.0 + (i % 3) * 0.2, z: -d / 3 + (i / 5) * (d * 0.66) });
  const g = kit.build(new THREE.Group());
  g.name = 'greenhouse';
  g.userData.surface = 'glass';
  return g;
}

/** Friendly scarecrow with a patched coat and straw hat. */
export function scarecrow({ coat = '#3a6ee8', seed = 7 } = {}) {
  const kit = new Kit('scarecrow');
  kit.add(cyl(0.05, 0.06, 2.2, 6), P.woodDark, { y: 1.1 });
  kit.add(cyl(0.04, 0.04, 1.9, 6), P.woodDark, { y: 1.55, rz: Math.PI / 2 });
  kit.add(cbox(0.6, 0.75, 0.34, 0.1), coat, { y: 1.3 });
  for (const sx of [-1, 1]) {
    kit.add(cbox(0.55, 0.22, 0.24, 0.08), coat, { x: sx * 0.5, y: 1.55 });
    kit.add(new THREE.ConeGeometry(0.1, 0.24, 5), '#f2d27a', { x: sx * 0.86, y: 1.55, rz: sx * Math.PI / 2 });
  }
  kit.add(box(0.18, 0.18, 0.02), P.tomato, { x: 0.12, y: 1.15, z: 0.18 });
  kit.add(box(0.14, 0.14, 0.02), P.sunflower, { x: -0.15, y: 1.45, z: 0.18 });
  kit.add(new THREE.SphereGeometry(0.26, 12, 9), '#e8d2a0', { y: 1.95 });
  for (const sx of [-1, 1]) kit.add(ball(0.045, 0), P.ink, { x: sx * 0.09, y: 2.0, z: 0.22 });
  kit.add(new THREE.TorusGeometry(0.1, 0.02, 4, 10, Math.PI), P.ink, { y: 1.88, z: 0.22, rz: Math.PI });
  kit.add(new THREE.ConeGeometry(0.05, 0.12, 5), P.tangerine, { y: 1.95, z: 0.29, rx: Math.PI / 2 });
  kit.add(cyl(0.48, 0.48, 0.04, 14), '#f2d27a', { y: 2.14 });
  kit.add(cyl(0.2, 0.26, 0.25, 12), '#f2d27a', { y: 2.28 });
  kit.add(cyl(0.265, 0.265, 0.06, 12), P.tomato, { y: 2.2 });
  void seed;
  const g = kit.build(new THREE.Group());
  g.name = 'scarecrow';
  g.userData.surface = 'soft';
  return g;
}

/** Compost bin: slatted box with a lumpy heap. */
export function compost() {
  const kit = new Kit('compost');
  for (let i = 0; i < 4; i++) {
    kit.add(box(1.3, 0.12, 0.06), P.wood, { y: 0.15 + i * 0.2, z: 0.6 });
    kit.add(box(1.3, 0.12, 0.06), P.wood, { y: 0.15 + i * 0.2, z: -0.6 });
    kit.add(box(0.06, 0.12, 1.2), P.wood, { x: -0.62, y: 0.15 + i * 0.2 });
  }
  kit.add(blob(0.6, 3, 1, 0.25), '#6b4a2a', { y: 0.55, sy: 0.7 });
  kit.add(blob(0.2, 5, 0, 0.3), '#8fd35e', { x: 0.2, y: 0.95, z: 0.1 }, materials.foliage);
  const g = kit.build(new THREE.Group());
  g.name = 'compost';
  g.userData.surface = 'dust';
  return g;
}

/** Trestle table with prize produce and rosettes (fête judging table). */
export function prizeTable({ seed = 8 } = {}) {
  const rng = new Rng(`prize-${seed}`);
  const kit = new Kit('prize');
  kit.add(box(2.4, 0.06, 0.8), CREAM, { y: 0.78 });
  kit.add(box(2.42, 0.55, 0.02), '#9fdcf7', { y: 0.52, z: 0.41 });
  for (const sx of [-1, 1]) kit.add(box(0.06, 0.78, 0.7), P.woodDark, { x: sx * 1.05, y: 0.39 });
  const items = [
    () => kit.add(blob(0.16, 1, 1, 0.05), P.tomato, { x: -0.9, y: 0.95, z: 0 }, materials.glossy),
    () => kit.add(blob(0.3, 2, 1, 0.05), P.tangerine, { x: -0.4, y: 1.02, z: 0, sy: 0.75 }, materials.glossy),
    () => kit.add(new THREE.CapsuleGeometry(0.12, 0.5, 4, 10), '#3f8a34', { x: 0.25, y: 0.93, z: 0, rz: Math.PI / 2 }, materials.glossy),
    () => kit.add(cyl(0.22, 0.24, 0.24, 14), '#fff1d6', { x: 0.85, y: 0.94, z: 0 }),
  ];
  items.forEach((f) => f());
  kit.add(cyl(0.23, 0.23, 0.05, 14), P.bubblegum, { x: 0.85, y: 1.08, z: 0 });
  for (let i = 0; i < 3; i++) {
    const x = -0.9 + i * 0.65;
    const c = [P.gold, '#c9d2de', '#d88a4a'][i];
    kit.add(cyl(0.08, 0.08, 0.02, 10), c, { x, y: 0.82, z: 0.25, rx: Math.PI / 2 }, materials.glossy);
    kit.add(box(0.05, 0.14, 0.01), rng.pick([P.cobalt, P.tomato]), { x: x - 0.02, y: 0.72, z: 0.26, rz: 0.2 });
  }
  const g = kit.build(new THREE.Group());
  g.name = 'prizeTable';
  g.userData.surface = 'wood';
  return g;
}

/** Gravel lay-by pad (where the lead parks Jack's van). */
export function gravelPad(w, d, color = '#cdbd9c') {
  const shape = roundRectShape(w, d, Math.min(2.5, w / 2 - 0.1, d / 2 - 0.1));
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false, curveSegments: 6 });
  g.rotateX(-Math.PI / 2);
  const kit = new Kit('gravel');
  kit.add(g, (x, y, z, c) => c.set(B.hsl(color, 0, 0, (Math.sin(x * 3.1) * Math.cos(z * 2.7)) * 0.02)));
  const grp = kit.build(new THREE.Group());
  grp.name = 'gravel';
  grp.userData.surface = 'dust';
  return grp;
}

export function roundRectShape(w, d, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// ------------------------------------------------------------------ green furniture
const BLOOMS = [P.bubblegum, P.sunflower, '#fff4e6', P.tomato, P.violet, P.tangerine, '#ffb8c2', '#9fdcf7'];
const LEAVES = ['#5fae44', '#4f9a3c', '#6cbb4a', '#7cc653'];

/**
 * Flower bed: a low faceted dome of small cells — leafy green flecked with clustered patches of 2-3
 * bloom colours — inside a chunky stone edging. One merged vertex-coloured geometry (~6 tris/m^2).
 * userData.heightAt(x, z) (local) lets instanced flowers stand on its surface.
 */
export function flowerCarpet(r, { seed = 1, colors, edge = '#e8dcc4', dome = 0.1, raised = 0 } = {}) {
  const rng = new Rng(`carpet-${seed}`);
  const pal = colors || rng.shuffle(BLOOMS).slice(0, rng.int(2, 3));
  const H = r * Math.max(dome, raised ? 0.2 : 0) + 0.12 + raised;
  const base0 = 0.06 + raised;
  const hAt = (d) => base0 + (H - base0) * Math.sqrt(Math.max(0, 1 - (d / r) ** 2));
  const cell = 0.3;
  const rings = Math.max(3, Math.round(r / cell));
  const ringPts = [];
  for (let k = 0; k <= rings; k++) {
    const rr = (k / rings) * r;
    const n = k === 0 ? 1 : Math.max(6, Math.round((2 * Math.PI * rr) / cell));
    const a0 = rng.range(0, 1);
    const row = [];
    for (let i = 0; i < n; i++) {
      const a = ((i + a0) / n) * TAU;
      const j = k === 0 || k === rings ? 0 : (hash(k * 31 + i * 7 + seed) - 0.5) * cell * 0.5;
      const x = Math.cos(a) * (rr + j), z = Math.sin(a) * (rr + j);
      row.push([x, hAt(Math.hypot(x, z)) + (k < rings ? (hash(i * 13 + k * 5 + seed) - 0.5) * 0.05 : 0), z, a]);
    }
    ringPts.push(row);
  }
  const pos = [], col = [];
  const c = new THREE.Color();
  const ph = rng.range(0, 10);
  const tri = (A, B, Cc) => {
    const cx = (A[0] + B[0] + Cc[0]) / 3, cz = (A[2] + B[2] + Cc[2]) / 3;
    const n = hash(Math.round(cx * 41 + 500) * 7919 + Math.round(cz * 37 + 500) * 131 + seed);
    const patch = Math.sin(cx * 1.3 + ph) * Math.cos(cz * 1.4 - ph) + 0.6 * Math.sin((cx - cz) * 2.2 + ph);
    const edgeLeaf = Math.hypot(cx, cz) > r - 0.28;
    const leaf = edgeLeaf ? n < 0.7 : n < 0.42;
    const hex = leaf ? LEAVES[Math.floor(n * 97) % LEAVES.length] : pal[Math.floor(((patch + 1.6) / 3.2) * pal.length + n * 0.6) % pal.length];
    c.set(hex).offsetHSL(0, 0, (n - 0.5) * 0.07);
    for (const v of [A, Cc, B]) { pos.push(v[0], v[1], v[2]); col.push(c.r, c.g, c.b); }
  };
  for (let k = 0; k < rings; k++) {
    const inner = ringPts[k], outer = ringPts[k + 1];
    const ni = inner.length, no = outer.length;
    let i = 0, o = 0;
    while (i < ni || o < no) {
      const ai = inner[i % ni][3] + (i >= ni ? TAU : 0), ao = outer[o % no][3] + (o >= no ? TAU : 0);
      const nextI = inner[(i + 1) % ni][3] + (i + 1 >= ni ? TAU : 0), nextO = outer[(o + 1) % no][3] + (o + 1 >= no ? TAU : 0);
      if (o < no && (i >= ni || ni === 1 || nextO <= nextI)) { tri(inner[i % ni], outer[o % no], outer[(o + 1) % no]); o++; }
      else { tri(inner[i % ni], outer[o % no], inner[(i + 1) % ni]); i++; }
      void ai; void ao;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const kit = new Kit('carpet');
  kit.buckets.set(materials.foliage, [g]);
  const segs = Math.max(16, Math.round(r * 9));
  if (raised) {
    // a stone planter wall so the bed stands proud of the lawn instead of lying flat like a pizza
    kit.add(new THREE.CylinderGeometry(r + 0.14, r + 0.2, raised + 0.02, segs, 1, true).translate(0, raised / 2, 0), [shade(edge, -0.18), shade(edge, -0.05)]);
    kit.add(new THREE.TorusGeometry(r + 0.1, 0.14, 5, segs), [shade(edge, -0.08), edge], { y: raised + 0.04, rx: Math.PI / 2 });
  } else kit.add(new THREE.TorusGeometry(r + 0.06, 0.13, 5, segs), [shade(edge, -0.12), edge], { y: 0.05, rx: Math.PI / 2 });
  const grp = kit.build(new THREE.Group(), { shadows: !!raised });
  grp.name = 'flowerCarpet';
  grp.userData.surface = 'leaves';
  grp.userData.heightAt = (x, z) => hAt(Math.min(r, Math.hypot(x, z)));
  return grp;
}

function hash(n) {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Maypole: candy-striped pole, flower crown and gold finial. Ribbons are animated by the level. */
export function maypole({ h = 5.6 } = {}) {
  const kit = new Kit('maypole');
  const pole = new THREE.CylinderGeometry(0.085, 0.11, h, 10, 24).translate(0, h / 2, 0);
  kit.add(pole, (x, y, z, c) => c.set((Math.floor((Math.atan2(z, x) / TAU + y * 0.9) * 2 + 20) % 2) ? P.tomato : '#fff8ee'));
  kit.add(cyl(0.45, 0.55, 0.22, 12), '#fff8ee', { y: 0.11 });
  kit.add(new THREE.TorusGeometry(0.42, 0.11, 6, 16), '#4f9a3c', { y: h - 0.35, rx: Math.PI / 2 }, materials.foliage);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    kit.add(ball(0.07, 0), [P.bubblegum, P.sunflower, '#fff4e6', P.violet][i % 4], { x: Math.cos(a) * 0.42, y: h - 0.26, z: Math.sin(a) * 0.42 });
  }
  kit.add(cyl(0.2, 0.14, 0.12, 12), P.gold, { y: h + 0.02 }, materials.glossy);
  kit.add(ball(0.16, 1), P.gold, { y: h + 0.2 }, materials.glossy);
  const g = kit.build(new THREE.Group());
  g.name = 'maypole';
  g.userData.surface = 'wood';
  g.userData.top = h - 0.3;
  return g;
}

/** Striped canvas deckchair (front +Z). userData.seat = seat height for Person 'lie' {pose: 'deckchair'}. */
export function deckchair({ colors = [P.tomato, '#fff8ee'], seed = 1 } = {}) {
  const kit = new Kit('deckchair');
  const wood = P.woodLight;
  for (const sx of [-1, 1]) {
    kit.add(box(0.05, 0.05, 1.25), wood, { x: sx * 0.3, y: 0.5, z: -0.05, rx: -0.72 });
    kit.add(box(0.05, 0.05, 0.9), wood, { x: sx * 0.33, y: 0.26, z: 0.18, rx: 0.55 });
    kit.add(box(0.05, 0.42, 0.05), wood, { x: sx * 0.33, y: 0.21, z: 0.52 });
  }
  kit.add(box(0.7, 0.04, 0.05), wood, { y: 0.4, z: 0.5 });
  const n = 5;
  for (let i = 0; i < n; i++) {
    const w = 0.56 / n;
    kit.add(box(w + 0.004, 0.02, 1.15), colors[i % 2], { x: -0.28 + w * (i + 0.5), y: 0.43, z: 0.02, rx: -0.62 });
  }
  void seed;
  const g = kit.build(new THREE.Group());
  g.name = 'deckchair';
  g.userData.surface = 'soft';
  g.userData.seat = 0.3;
  return g;
}

/** Gingham picnic blanket with a hamper, plates and a lemonade jug. */
export function picnicBlanket({ w = 2.2, d = 1.7, color = P.tomato } = {}) {
  const kit = new Kit('picnic');
  const n = 6;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const a = (i + j) % 2 === 0;
    kit.add(box(w / n + 0.002, 0.02, d / n + 0.002), a ? color : (i % 2 ? '#fff8ee' : shade(color, 0.28)), { x: -w / 2 + (w / n) * (i + 0.5), y: 0.012, z: -d / 2 + (d / n) * (j + 0.5) });
  }
  kit.add(cbox(0.6, 0.34, 0.4, 0.06), P.woodLight, { x: -0.55, y: 0.19, z: -0.35 });
  kit.add(new THREE.TorusGeometry(0.2, 0.03, 4, 10, Math.PI), P.woodDark, { x: -0.55, y: 0.36, z: -0.35 });
  for (const [x, z] of [[0.4, 0.3], [-0.1, 0.45], [0.55, -0.35]]) {
    kit.add(cyl(0.16, 0.14, 0.03, 12), '#fff8ee', { x, y: 0.035, z });
    kit.add(ball(0.06, 0), [P.tomato, P.sunflower, '#c8894a'][Math.abs(Math.round(x * 10)) % 3], { x, y: 0.08, z });
  }
  kit.add(cyl(0.09, 0.1, 0.26, 10), '#fff3b0', { x: 0.1, y: 0.15, z: -0.25 }, materials.glossy);
  const g = kit.build(new THREE.Group());
  g.name = 'picnicBlanket';
  g.userData.surface = 'soft';
  return g;
}

/**
 * A big furled bundle of bunting hanging from a wall bracket (the fête job tell): a fat roll of cloth
 * with flags poking out, tied with rope. Origin = the wall point; the bracket sticks out along +Z.
 * parts: { bundle (pivot at the hook) }
 */
export function buntingBundle({ out = 0.62, colors = [P.tomato, P.sunflower, P.teal, P.bubblegum, P.cobalt, P.lime, P.violet] } = {}) {
  const kit = new Kit('bracket');
  kit.add(cbox(0.14, 0.4, 0.08, 0.03), P.ink, { y: 0, z: 0.04 });
  kit.add(box(0.07, 0.07, out), P.ink, { y: 0.1, z: out / 2 });
  kit.add(box(0.05, 0.05, out * 0.8), P.ink, { y: -0.06, z: out * 0.42, rx: 0.5 });
  const g = kit.build(new THREE.Group());
  g.name = 'buntingBracket';
  const bundle = new THREE.Group();
  bundle.name = 'bundle';
  bundle.position.set(0, 0.07, out - 0.04);
  const bk = new Kit('bundle');
  bk.add(new THREE.TorusGeometry(0.07, 0.02, 4, 10), '#c9a46a', { y: -0.06 });
  bk.add(cyl(0.014, 0.014, 0.2, 5), '#c9a46a', { y: -0.19 });
  bk.at({ y: -0.52 }, () => {
    // a fat roll wound from rainbow cloth: coloured bands round the drum
    const L0 = 1.0, R0 = 0.34, bands = 7;
    for (let i = 0; i < bands; i++) {
      bk.add(new THREE.CylinderGeometry(R0 + (i % 2) * 0.015, R0 + (i % 2) * 0.015, L0 / bands + 0.004, 14), colors[i % colors.length], { x: -L0 / 2 + (L0 / bands) * (i + 0.5), rz: Math.PI / 2 });
    }
    // flags poking out all round
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU * 3.1;
      const x = -0.42 + (i % 7) * 0.14;
      bk.add(new THREE.ConeGeometry(0.12, 0.26, 3), colors[(i * 3) % colors.length], { x, y: Math.sin(a) * (R0 + 0.06), z: Math.cos(a) * (R0 + 0.06), rx: a + Math.PI / 2 });
    }
    for (const x of [-0.36, 0.36]) bk.add(new THREE.TorusGeometry(R0 + 0.01, 0.03, 4, 16), '#c9a46a', { x, ry: Math.PI / 2 });
    for (const x of [-0.505, 0.505]) bk.add(new THREE.CircleGeometry(R0, 14), '#fff1d6', { x, ry: x > 0 ? Math.PI / 2 : -Math.PI / 2 });
    // a dangling tail of flags
    for (let i = 0; i < 4; i++) bk.add(new THREE.ConeGeometry(0.1, 0.22, 3), colors[i % colors.length], { x: 0.3 + i * 0.05, y: -R0 - 0.12 - i * 0.2, z: 0.04, rx: Math.PI });
  });
  bk.build(bundle);
  g.add(bundle);
  g.userData.parts = { bundle };
  g.userData.surface = 'soft';
  return g;
}

// ------------------------------------------------------------------ round 2: fête + flank pieces
/** Long raised flower border (length along local X): timber edging + a faceted mound of blooms. */
export function flowerBorder(len, w = 0.9, { seed = 1, colors, edge = P.woodLight, h = 0.32 } = {}) {
  const rng = new Rng(`border-${seed}`);
  const pal = colors || rng.shuffle(BLOOMS).slice(0, 3);
  const kit = new Kit('border');
  kit.add(cbox(len + 0.16, h, w + 0.16, 0.04), [shade(edge, -0.2), shade(edge, -0.05)], { y: h / 2 });
  const nx = Math.max(4, Math.round(len / 0.32)), nz = Math.max(2, Math.round(w / 0.3));
  const pos = [], col = [];
  const c = new THREE.Color();
  const hAt = (x, z) => h + 0.05 + 0.2 * Math.cos((z / w) * Math.PI) * (0.8 + 0.2 * Math.sin(x * 2.1 + seed));
  const V = (i, j) => { const x = -len / 2 + (i / nx) * len, z = -w / 2 + (j / nz) * w; return [x, hAt(x, z) + (hash(i * 31 + j * 7 + seed) - 0.5) * 0.06, z]; };
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const a = V(i, j), b = V(i + 1, j), cc = V(i + 1, j + 1), d = V(i, j + 1);
      for (const [A, Bv, Cc, k] of [[a, d, b, 0], [b, d, cc, 1]]) {
        const n = hash(i * 17 + j * 5 + k * 3 + seed);
        const patch = Math.sin(i * 0.9 + seed) + Math.cos(j * 1.7 - seed);
        c.set(n < 0.35 ? LEAVES[Math.floor(n * 40) % LEAVES.length] : pal[Math.floor((patch + 2) * 0.75) % pal.length]).offsetHSL(0, 0, (n - 0.5) * 0.06);
        for (const v of [A, Bv, Cc]) { pos.push(...v); col.push(c.r, c.g, c.b); }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  kit.buckets.set(materials.foliage, [g]);
  const grp = kit.build(new THREE.Group());
  grp.name = 'flowerBorder';
  grp.userData.surface = 'leaves';
  return grp;
}

const waterMat = () => {
  if (!waterMat.m) {
    waterMat.m = new THREE.MeshStandardMaterial({ color: '#58b7e8', roughness: 0.06, metalness: 0.15, envMapIntensity: 1.5 });
    waterMat.m.name = 'tankWater';
  }
  return waterMat.m;
};

/**
 * Dunk tank (front = +Z): a striped water tank, a hinged plank seat over the water and a big
 * bullseye on an arm. parts: { seat (pivot on the back edge; rotation.x < 0 drops it), target
 * (bullseye group), water (surface mesh), board }. userData: waterY, seatY.
 */
export function dunkTank({ text = 'DUNK THE SARGE!', sub = '3 balls 50p' } = {}) {
  const kit = new Kit('dunkTank');
  const W = 2.4, Dp = 1.9, H = 1.3;
  // tank: striped side panels + a rim
  for (const [x, z, w, d] of [[0, Dp / 2, W, 0.1], [0, -Dp / 2, W, 0.1], [W / 2, 0, 0.1, Dp], [-W / 2, 0, 0.1, Dp]]) {
    const n = Math.max(3, Math.round((w > d ? w : d) / 0.4));
    for (let i = 0; i < n; i++) {
      const t = -0.5 + (i + 0.5) / n;
      kit.add(box(w > d ? w / n + 0.004 : w, H, w > d ? d : d / n + 0.004), i % 2 ? CREAM : RED, { x: x + (w > d ? t * w : 0), y: H / 2, z: z + (w > d ? 0 : t * d) });
    }
  }
  kit.add(cbox(W + 0.24, 0.12, Dp + 0.24, 0.04), P.cobalt, { y: H + 0.04 });
  kit.add(cbox(W + 0.3, 0.12, Dp + 0.3, 0.04), shade(P.cobalt, -0.2), { y: 0.06 });
  // frame: two posts at the back with a cross beam, seat bracket
  for (const sx of [-1, 1]) kit.add(cbox(0.14, 2.9, 0.14, 0.03), P.sunflower, { x: sx * (W / 2 - 0.1), y: 1.45, z: -Dp / 2 - 0.08 });
  kit.add(cbox(W, 0.14, 0.14, 0.03), P.sunflower, { y: 2.84, z: -Dp / 2 - 0.08 });
  // ladder at the back
  for (const sx of [-0.25, 0.25]) kit.add(box(0.06, 2.1, 0.06), P.woodLight, { x: sx + 0.7, y: 1.05, z: -Dp / 2 - 0.45, rx: -0.2 });
  for (let i = 0; i < 5; i++) kit.add(box(0.5, 0.05, 0.05), P.woodLight, { x: 0.7, y: 0.35 + i * 0.38, z: -Dp / 2 - 0.4 + i * 0.07 });
  // bullseye arm on the right-hand side
  kit.add(cbox(0.12, 2.2, 0.12, 0.03), P.sunflower, { x: W / 2 + 0.75, y: 1.1, z: 0.2 });
  kit.add(box(0.8, 0.08, 0.08), P.sunflower, { x: W / 2 + 0.36, y: 1.9, z: 0.2 });
  const g = kit.build(new THREE.Group());
  g.name = 'dunkTank';
  // water surface (seen from the perch above)
  const water = new THREE.Mesh(new THREE.BoxGeometry(W - 0.12, 0.04, Dp - 0.12), waterMat());
  water.position.y = H - 0.14;
  water.receiveShadow = true;
  water.name = 'water';
  g.add(water);
  // seat plank: pivot at its back edge so it can flip down
  const seat = new THREE.Group();
  seat.name = 'seat';
  seat.position.set(0, 1.92, -Dp / 2 + 0.05);
  const sk = new Kit('seat');
  sk.add(cbox(1.1, 0.1, 0.62, 0.03), P.woodLight, { z: 0.31 });
  sk.add(cbox(1.1, 0.06, 0.06, 0.02), P.woodDark, { y: -0.06, z: 0.05 });
  sk.build(seat);
  g.add(seat);
  // bullseye: red/white rings, big enough to read from the van
  const target = new THREE.Group();
  target.name = 'target';
  target.position.set(W / 2 + 0.75, 2.32, 0.28);
  const tk = new Kit('bullseye');
  const rings = [[0.5, RED], [0.4, CREAM], [0.3, RED], [0.2, CREAM], [0.1, RED]];
  rings.forEach(([r, c], i) => tk.add(cyl(r, r, 0.06, 24), c, { z: 0.02 + i * 0.012, rx: Math.PI / 2 }));
  tk.add(cyl(0.53, 0.53, 0.05, 24), P.ink, { z: -0.01, rx: Math.PI / 2 });
  tk.build(target);
  g.add(target);
  // sign on top of the frame
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.62), boardMaterial(text, { bg: P.tomato, sub, font: 0.6 }));
  board.position.set(0, 3.3, -Dp / 2 - 0.02);
  board.name = 'board';
  g.add(board);
  const bb = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.7, 0.06), materials.solid(P.sunflower));
  bb.position.set(0, 3.3, -Dp / 2 - 0.07);
  bb.castShadow = true;
  g.add(bb);
  g.userData.parts = { seat, target, water, board };
  g.userData.waterY = H - 0.12;
  g.userData.seatY = 1.97;
  g.userData.surface = 'wood';
  return g;
}

/**
 * Opening ribbon across a gateway (along local X, centred): two halves pinned at the posts that
 * swing down when cut, and a big bow in the middle. parts: { left, right, bow }.
 */
export function openingRibbon({ span = 6.6, y = 1.15, color = '#e8413c' } = {}) {
  const g = new THREE.Group();
  g.name = 'ribbon';
  const half = span / 2;
  const mk = (sx) => {
    const piv = new THREE.Group();
    piv.position.set(sx * half, y, 0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(half, 0.16, 0.02).translate(-sx * half / 2, 0, 0), materials.solid(color, { roughness: 0.5 }));
    m.castShadow = true;
    piv.add(m);
    g.add(piv);
    return piv;
  };
  const left = mk(-1), right = mk(1);
  const bow = new THREE.Group();
  bow.name = 'bow';
  bow.position.set(0, y, 0.03);
  const bk = new Kit('bow');
  for (const sx of [-1, 1]) {
    bk.add(new THREE.TorusGeometry(0.22, 0.07, 6, 14), color, { x: sx * 0.24, sx: 1.2, sy: 0.75 });
    bk.add(box(0.12, 0.42, 0.02), color, { x: sx * 0.12, y: -0.3, rz: sx * 0.35 });
  }
  bk.add(ball(0.1, 1), shade(color, -0.1), {});
  bk.build(bow);
  g.add(bow);
  g.userData.parts = { left, right, bow };
  g.userData.surface = 'soft';
  return g;
}

/** A dumpy green water butt with a brass tap (Mr Grubb's decoy). */
export function waterButt() {
  const kit = new Kit('waterButt');
  kit.add(lathe([[0, 0], [0.38, 0], [0.44, 0.2], [0.46, 0.55], [0.44, 0.9], [0.4, 1.02], [0, 1.02]], 14), [shade('#3f8a4e', -0.1), '#3f8a4e']);
  for (const y of [0.3, 0.75]) kit.add(new THREE.TorusGeometry(0.455, 0.025, 4, 18), shade('#3f8a4e', -0.2), { y, rx: Math.PI / 2 });
  kit.add(cyl(0.42, 0.42, 0.06, 16), '#2f6d3e', { y: 1.05 });
  kit.add(cyl(0.03, 0.03, 0.16, 6), P.gold, { y: 0.24, z: 0.5, rx: Math.PI / 2 }, materials.glossy);
  kit.add(cbox(0.9, 0.2, 0.9, 0.04), '#b9ad98', { y: -0.1 });
  const g = kit.build(new THREE.Group());
  g.name = 'waterButt';
  g.userData.surface = 'soft';
  return g;
}

/** Duck pond: a glassy water disc in a pebbly rim, reeds and lily pads. */
export function pond({ r = 4.5, seed = 3 } = {}) {
  const rng = new Rng(`pond-${seed}`);
  const kit = new Kit('pond');
  const n = 28;
  const pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU; const k = 1 + (hash(i * 3 + seed) - 0.5) * 0.18; pts.push([Math.cos(a) * r * k, Math.sin(a) * r * 0.8 * k]); }
  const rim = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x * 1.12, z * 1.12)));
  const rimG = new THREE.ExtrudeGeometry(rim, { depth: 0.1, bevelEnabled: false });
  rimG.rotateX(-Math.PI / 2);
  kit.add(rimG, '#a99a7c');
  for (let i = 0; i < 22; i++) {
    const a = rng.range(0, TAU), k = rng.range(1.02, 1.14);
    kit.add(ball(rng.range(0.14, 0.26), 0), rng.pick(['#c9bda3', '#b3a58a', '#ddd2bb']), { x: Math.cos(a) * r * k, y: 0.1, z: Math.sin(a) * r * 0.8 * k, sy: 0.6 });
  }
  for (let i = 0; i < 9; i++) {
    const a = rng.range(0.3, 2.6), k = rng.range(0.82, 0.98);
    const x = Math.cos(a) * r * k, z = Math.sin(a) * r * 0.8 * k;
    for (let j = 0; j < 4; j++) kit.add(new THREE.ConeGeometry(0.035, rng.range(0.9, 1.5), 4), rng.pick(['#5a8f3c', '#6fa648', '#4f7f34']), { x: x + rng.range(-0.2, 0.2), y: 0.55, z: z + rng.range(-0.2, 0.2), rz: rng.range(-0.15, 0.15) });
    kit.add(new THREE.CapsuleGeometry(0.05, 0.22, 3, 6), '#7a4a26', { x, y: 1.25, z });
  }
  for (let i = 0; i < 6; i++) {
    const a = rng.range(0, TAU), d = rng.range(0.3, 0.75) * r;
    kit.add(cyl(0.3, 0.3, 0.02, 10), '#5fae44', { x: Math.cos(a) * d, y: 0.13, z: Math.sin(a) * d * 0.8 });
  }
  const g = kit.build(new THREE.Group());
  const water = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z))), 1).rotateX(Math.PI / 2), waterMat());
  water.position.y = 0.11;
  water.receiveShadow = true;
  water.name = 'pondWater';
  g.add(water);
  g.name = 'pond';
  g.userData.surface = 'water';
  g.userData.waterY = 0.11;
  return g;
}

/** Car-boot trestle: odds and ends for sale (a lamp, books, a teapot, a record player...). */
export function bootTable({ seed = 1 } = {}) {
  const rng = new Rng(`boot-${seed}`);
  const kit = new Kit('bootTable');
  kit.add(box(1.9, 0.05, 0.75), '#f3eadb', { y: 0.74 });
  kit.add(box(1.92, 0.3, 0.02), rng.pick([P.teal, P.bubblegum, P.sunflower]), { y: 0.6, z: 0.38 });
  for (const sx of [-1, 1]) kit.add(box(0.05, 0.74, 0.62), P.woodDark, { x: sx * 0.8, y: 0.37 });
  let x = -0.8;
  while (x < 0.75) {
    const k = rng.int(0, 4), c = rng.pick([P.tomato, P.cobalt, P.sunflower, P.violet, P.teal, '#fff8ee']);
    if (k === 0) { for (let i = 0; i < 3; i++) kit.add(box(0.07, 0.24, 0.18), rng.pick([P.tomato, P.cobalt, P.lime, '#8b5e3c']), { x: x + i * 0.08, y: 0.89, z: rng.range(-0.1, 0.1) }); x += 0.32; }
    else if (k === 1) { kit.add(ball(0.12, 1), c, { x: x + 0.12, y: 0.88, z: 0, sy: 0.85 }, materials.glossy); kit.add(cyl(0.02, 0.03, 0.12, 5), c, { x: x + 0.26, y: 0.9, z: 0, rz: -0.9 }); x += 0.36; }
    else if (k === 2) { kit.add(cyl(0.05, 0.07, 0.36, 8), c, { x: x + 0.1, y: 0.95, z: 0 }); kit.add(cyl(0.12, 0.17, 0.16, 10), '#fff1d6', { x: x + 0.1, y: 1.2, z: 0 }); x += 0.3; }
    else if (k === 3) { kit.add(cbox(0.38, 0.1, 0.32, 0.02), '#8b5e3c', { x: x + 0.2, y: 0.82, z: 0 }); kit.add(cyl(0.13, 0.13, 0.01, 14), P.ink, { x: x + 0.2, y: 0.88, z: 0 }); x += 0.44; }
    else { kit.add(cbox(0.3, 0.22, 0.24, 0.03), c, { x: x + 0.16, y: 0.88, z: 0 }); x += 0.36; }
  }
  kit.add(cbox(0.5, 0.3, 0.4, 0.04), P.woodLight, { x: 0.4, y: 0.15, z: -0.7 });
  const g = kit.build(new THREE.Group());
  g.name = 'bootTable';
  g.userData.surface = 'wood';
  return g;
}

/** Hot-air balloon (≈ 14 m tall): gored envelope, burner and a wicker basket. Origin at the basket. */
export function hotAirBalloon({ seed = 2, colors = [P.tomato, P.sunflower, P.teal, '#fff8ee', P.violet, P.cobalt] } = {}) {
  const kit = new Kit('balloon');
  const prof = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const y = 3.2 + t * 10.2;
    const r = t < 0.72 ? 1.2 + Math.sin((t / 0.72) * Math.PI * 0.5) * 3.8 : 5 * Math.cos(((t - 0.72) / 0.28) * Math.PI * 0.5);
    prof.push([Math.max(0.02, r), y]);
  }
  const env = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 18);
  kit.addFaces(env, (x, y, z, c) => c.set(colors[Math.floor(((Math.atan2(z, x) / TAU + 1) % 1) * 18) % colors.length]));
  kit.add(cbox(1.3, 1.0, 1.3, 0.12), '#b0804e', { y: 0.5 });
  kit.add(cbox(1.36, 0.14, 1.36, 0.05), '#7a4a26', { y: 1.0 });
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) kit.add(cyl(0.025, 0.025, 2.4, 4), '#7a4a26', { x: sx * 0.6, y: 2.1, z: sz * 0.6 });
  kit.add(cyl(0.3, 0.36, 0.34, 8), '#6b7280', { y: 3.05 });
  void seed;
  const g = kit.build(new THREE.Group());
  g.name = 'hotAirBalloon';
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return g;
}

export { blob };
