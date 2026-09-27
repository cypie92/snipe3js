// The job corkboard (one pinned flyer per location, padlocks on locked ones, teaser flyers for
// locations not built yet, sticky notes and a red-string gag) and the trophy shelf (a cup per
// graded location + Inspector Pidge's rubber stamps). Both rebuild their dynamic parts on refresh.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { part, merge, xform } from '../world/geo.js';
import { materials } from '../gfx/materials.js';
import { P } from '../gfx/palette.js';
import { Rng } from '../core/rng.js';
import { bev, ball, rod, puck, arc, latheBands } from '../world/kit/props/lib.js';
import { trophy } from '../world/kit/props/index.js';
import { canvasTexture, roundRect, fitFont, stickerText, FONT_HAND } from '../world/perch/paint.js';
import { flyerTexture, FLYER_TEX } from './textures.js';
import { meshGroup, decal, hitBox } from './props.js';
import { mergeUV } from './room.js';

export const BOARD = { w: 4.45, h: 1.75 };
const ASPECT = FLYER_TEX.w / FLYER_TEX.h;
const TEX_H = FLYER_TEX.h + FLYER_TEX.strip;
const SHEET_V0 = FLYER_TEX.strip / TEX_H; // the sheet samples the flyer, not the white strip below it
const WHITE_UV = [0.5, FLYER_TEX.strip / 2 / TEX_H]; // the pin / padlock sample pure white (= their vertex colour)
const TEASERS = [
  { id: 'soon-harbour', name: 'Barnacle Bay', location: 'The Harbour', parTime: 240 },
  { id: 'soon-farm', name: 'Wobbleton Farm', location: 'Farmyard', parTime: 240 },
  { id: 'soon-park', name: 'Pickle Park', location: 'Park & Pond', parTime: 240 },
  { id: 'soon-air', name: 'Muddlecombe Airfield', location: 'Airfield', parTime: 240 },
];
const PIN_COLORS = [P.tomato, P.cobalt, P.sunflower, P.teal, P.bubblegum, P.tangerine];

function pin(color, t) {
  return [
    part(new THREE.SphereGeometry(0.035, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), color, { ...t, rx: Math.PI / 2 + (t.rx || 0) }),
    part(new THREE.CylinderGeometry(0.02, 0.028, 0.03, 10), color, { ...t, z: (t.z || 0) - 0.02, rx: Math.PI / 2 }),
  ];
}

const _col = new THREE.Color();
/** position/normal/uv/colour part for the flyer material (map x vertex colour). uv: fixed [u, v] or a remap fn. */
function vc(geo, color, t, uv = WHITE_UV) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  const u = g.attributes.uv;
  for (let i = 0; i < n; i++) {
    if (typeof uv === 'function') u.setXY(i, ...uv(u.getX(i), u.getY(i)));
    else u.setXY(i, uv[0], uv[1]);
  }
  _col.set(color);
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set([_col.r, _col.g, _col.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (t) g.applyMatrix4(t.isMatrix4 ? t : xform(t));
  return g;
}

function pinVC(color, t = {}) {
  return [
    vc(new THREE.SphereGeometry(0.042, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), color, xform({ ...t, rx: Math.PI / 2 })),
    vc(new THREE.CylinderGeometry(0.024, 0.032, 0.035, 10), color, xform({ ...t, z: (t.z || 0) - 0.022, rx: Math.PI / 2 })),
    vc(new THREE.SphereGeometry(0.012, 6, 4), '#ffffff', xform({ ...t, x: (t.x || 0) - 0.013, y: (t.y || 0) + 0.014, z: (t.z || 0) + 0.02 })),
  ];
}

/** Chunky toy padlock (vertex-coloured, flyer material) centred at t, facing +Z. */
function padlockVC(t) {
  const m = xform(t);
  const at = (geo, color, tt) => vc(geo, color, m.clone().multiply(xform(tt)));
  return [
    at(bev(0.26, 0.21, 0.08, 0.05), P.sunflower, { y: -0.03 }),
    at(bev(0.2, 0.03, 0.082, 0.012), '#e0a92a', { y: -0.1 }),
    at(arc(0.082, 0.024, Math.PI, 8, 16), '#c9d2de', { y: 0.07 }),
    at(new THREE.CylinderGeometry(0.024, 0.024, 0.06, 8), '#c9d2de', { x: -0.082, y: 0.05 }),
    at(new THREE.CylinderGeometry(0.024, 0.024, 0.06, 8), '#c9d2de', { x: 0.082, y: 0.05 }),
    at(puck(0.03, 0.012, 0.004, 12), P.ink, { y: -0.02, z: 0.042, rx: Math.PI / 2 }),
    at(bev(0.018, 0.05, 0.014, 0.006), P.ink, { y: -0.055, z: 0.044 }),
  ];
}

/** Paper sheet with a gentle curl (bottom corners lift off the cork). */
function sheetGeo(w, h, curl = 1) {
  const g = new THREE.PlaneGeometry(w, h, 8, 10);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / w + 0.5, y = 0.5 - pos.getY(i) / h;
    const lift = Math.max(0, x * y - 0.45) * 0.14 + Math.max(0, (1 - x) * y - 0.62) * 0.08;
    pos.setZ(i, lift * curl + Math.sin(x * Math.PI) * 0.006);
  }
  g.computeVertexNormals();
  return g;
}

/** Rounded-rect frame (outer w x h, border b) in the XY plane. */
function frameGeo(w, h, b, r = 0.08) {
  const rr = (s, x, y, ww, hh, rad) => {
    s.moveTo(x + rad, y);
    s.lineTo(x + ww - rad, y);
    s.quadraticCurveTo(x + ww, y, x + ww, y + rad);
    s.lineTo(x + ww, y + hh - rad);
    s.quadraticCurveTo(x + ww, y + hh, x + ww - rad, y + hh);
    s.lineTo(x + rad, y + hh);
    s.quadraticCurveTo(x, y + hh, x, y + hh - rad);
    s.lineTo(x, y + rad);
    s.quadraticCurveTo(x, y, x + rad, y);
  };
  const s = new THREE.Shape();
  rr(s, -w / 2, -h / 2, w, h, r);
  const hole = new THREE.Path();
  rr(hole, -w / 2 + b, -h / 2 + b, w - 2 * b, h - 2 * b, Math.max(0.01, r - b * 0.6));
  s.holes.push(hole);
  return new THREE.ShapeGeometry(s, 6);
}

/** Build the corkboard. Returns { group, flyers: [flyer], setLevels(entries), halo }. */
export function buildBoard() {
  const { w, h } = BOARD;
  const group = new THREE.Group();
  group.name = 'corkboard';
  const T = [];
  const fw = 0.1;
  const wood = '#a8683a';
  T.push(part(bev(w + fw * 2, fw, 0.09, 0.03), wood, { y: h / 2 + fw / 2, z: 0.045 }));
  T.push(part(bev(w + fw * 2, fw, 0.09, 0.03), wood, { y: -h / 2 - fw / 2, z: 0.045 }));
  for (const s of [-1, 1]) T.push(part(bev(fw, h + fw * 2, 0.09, 0.03), wood, { x: s * (w / 2 + fw / 2), z: 0.045 }));
  T.push(part(bev(w, h, 0.04, 0.01), '#b58450', { z: 0.02 }));
  // header plank with the ODD JOBS sign, hung from two pegs
  T.push(part(bev(2.1, 0.36, 0.06, 0.03), '#7a4a26', { y: h / 2 + 0.2, z: 0.09 }));
  for (const x of [-0.93, 0.93]) T.push(part(ball(0.035, 1), P.sunflower, { x, y: h / 2 + 0.2, z: 0.125 }));
  const D = [
    decal('cork', w, h, { z: 0.041 }),
    decal('jobs', 1.96, 0.31, { y: h / 2 + 0.2, z: 0.121 }),
  ];
  // decorative notes (static) along the top strip + postcard + lost-cat poster
  const rng = new Rng('board');
  const notes = [
    ['note1', 0.27, 0.27, -1.85, 0.66, 0.08, P.tomato],
    ['note2', 0.27, 0.27, -1.3, 0.68, -0.06, P.cobalt],
    ['postcard', 0.42, 0.27, -0.12, 0.66, 0.05, P.sunflower],
    ['note3', 0.27, 0.27, 0.92, 0.67, -0.1, P.teal],
    ['lostcat', 0.27, 0.35, 1.8, 0.64, 0.06, P.bubblegum],
  ];
  const P2 = [];
  for (const [name, nw, nh, x, y, rz, pc] of notes) {
    D.push(decal(name, nw, nh, { x, y, z: 0.048, rz }));
    P2.push(...pin(pc, { x: x - Math.sin(rz) * nh * 0.42, y: y + Math.cos(rz) * nh * 0.42, z: 0.07 }));
  }
  // red string between the postcard pin and the lost-cat pin (conspiracy gag)
  const a = new THREE.Vector3(-0.12, 0.66 + 0.12, 0.075), b = new THREE.Vector3(1.8 - 0.02, 0.64 + 0.15, 0.075), c = new THREE.Vector3(0.92, 0.67 + 0.12, 0.075);
  const curve = new THREE.CatmullRomCurve3([a, new THREE.Vector3(0.4, 0.72, 0.08), c, new THREE.Vector3(1.36, 0.74, 0.08), b]);
  P2.push(part(new THREE.TubeGeometry(curve, 40, 0.007, 4), '#e8203a'));
  const g = meshGroup('corkboardFrame', { toy: T, glossy: P2, decal: D });
  group.add(g);

  const flyerLayer = new THREE.Group();
  flyerLayer.name = 'flyers';
  group.add(flyerLayer);
  const flyers = [];
  // hover halo: a sunflower sticker frame that the office parents to the hovered flyer
  const haloMat = materials.emissive('#ffc93c', 0.55);
  const halo = new THREE.Mesh(new THREE.BufferGeometry(), haloMat);
  halo.name = 'flyerHalo';
  halo.visible = false;
  halo.raycast = () => {};

  /** entries: [{ def, rec, locked, need, teaser }] */
  function setLevels(entries) {
    halo.removeFromParent();
    halo.visible = false;
    for (const f of flyers) {
      f.pivot.removeFromParent();
      f.mesh.geometry.dispose();
      f.mesh.material.map?.dispose();
      f.mesh.material.dispose();
    }
    flyers.length = 0;
    const n = entries.length;
    const cols = n <= 4 ? Math.max(1, n) : Math.ceil(n / 2);
    const rows = Math.ceil(n / cols);
    // as big as the board allows, no overlaps (every name stays fully visible)
    const gap = 0.07, side = 0.06, topY = 0.45;
    let fwid = Math.min(1.12, (w - side * 2 - gap * (cols - 1)) / cols);
    let fh = fwid / ASPECT;
    const maxH = (topY + h / 2 - 0.02 - (rows - 1) * gap) / rows;
    if (fh > maxH) { fh = maxH; fwid = fh * ASPECT; }
    const pitch = fwid + gap;
    halo.geometry.dispose();
    halo.geometry = frameGeo(fwid + 0.12, fh + 0.12, 0.075, 0.07);
    halo.geometry.translate(0, -fh / 2 + 0.04, -0.002);
    entries.forEach((e, i) => {
      const r = Math.floor(i / cols), cIdx = i % cols;
      const inRow = Math.min(cols, n - r * cols);
      const x = (cIdx - (inRow - 1) / 2) * pitch + rng.range(-0.012, 0.012);
      const yPin = topY - r * (fh + gap) + rng.range(-0.015, 0.015);
      const pivot = new THREE.Group();
      pivot.name = `flyer:${e.def.id}`;
      pivot.position.set(x, yPin, 0.05 + (i % 2) * 0.006);
      pivot.rotation.z = rng.range(-0.035, 0.035);
      const data = { ...e };
      const tex = flyerTexture(data);
      const mat = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.74, metalness: 0 });
      mat.name = 'flyer';
      const parts = [
        vc(sheetGeo(fwid, fh, 1), '#ffffff', xform({ y: -fh / 2 + 0.04, z: 0.004 }), (u, v) => [u, SHEET_V0 + v * (1 - SHEET_V0)]),
        ...pinVC(PIN_COLORS[i % PIN_COLORS.length], { y: 0.0, z: 0.03 }),
      ];
      // locked: a chunky padlock over the doodle (never over the name)
      const [dy0, dh] = FLYER_TEX.doodle;
      const lockY = 0.04 - ((dy0 + dh * 0.5) / FLYER_TEX.h) * fh;
      if (e.locked) parts.push(...padlockVC({ x: -fwid * 0.08, y: lockY - 0.015, z: 0.055, rz: -0.12, s: Math.min(1.1, fwid / 0.95) }));
      const geo = mergeGeometries(parts, false);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = 'flyerSheet';
      pivot.add(mesh);
      const col = hitBox(fwid + 0.06, fh + 0.06, 0.12, { y: -fh / 2 + 0.04, z: 0.03 });
      pivot.add(col);
      flyerLayer.add(pivot);
      flyers.push({ def: e.def, entry: e, pivot, mesh, lock: null, collider: col, data, tex, size: [fwid, fh], lockY });
    });
    return flyers;
  }

  return { group, flyers, setLevels, halo, pickables: [g.userData.meshes.toy, g.userData.meshes.decal, g.userData.meshes.glossy] };
}

/** Board entries from the injected levels + progress (teasers fill the board up to 4). */
export function boardEntries(levels, progress) {
  const stars = progress?.stars ?? 0;
  const list = levels.map((def) => {
    const rec = progress?.level?.(def.id) || {};
    const need = Math.max(0, def.unlockStars || 0);
    return { def, rec, locked: stars < need, need };
  });
  const names = new Set(levels.map((l) => l.name));
  for (const t of TEASERS) {
    if (list.length >= 4) break;
    if (!names.has(t.name)) list.push({ def: t, rec: {}, teaser: true, locked: false, need: 0 });
  }
  return list;
}

// ------------------------------------------------------------------ trophy shelf
const METAL = { S: 'gold', A: 'gold', B: 'silver', C: 'bronze', D: 'bronze' };
const GRADE_COL = { S: '#e39b1b', A: '#2e9e4f', B: P.cobalt, C: P.tangerine, D: '#8a8fa0' };

function cardTexture(state) {
  return canvasTexture(1024, 128, (ctx, w, h) => {
    const n = Math.max(1, state.cards.length);
    const cw = w / 8;
    state.cards.forEach((c, i) => {
      const x = i * cw;
      ctx.fillStyle = '#fff8ee';
      roundRect(ctx, x + 6, 10, cw - 12, h - 20, 14);
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = P.ink;
      ctx.stroke();
      if (c.grade) {
        ctx.fillStyle = GRADE_COL[c.grade] || P.ink;
        ctx.beginPath();
        ctx.arc(x + 30, h / 2, 20, 0, Math.PI * 2);
        ctx.fill();
        const s = fitFont(ctx, c.grade, 26, 30);
        stickerText(ctx, c.grade, x + 30, h / 2 + 1, { fill: '#fff8ee', outline: null, shadow: null, size: s });
      }
      ctx.fillStyle = P.ink;
      const t = c.name.length > 14 ? `${c.name.slice(0, 13)}…` : c.name;
      const s2 = fitFont(ctx, t, cw - (c.grade ? 70 : 26), 30, { weight: 400, family: FONT_HAND });
      ctx.font = `400 ${s2}px ${FONT_HAND}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t, x + (c.grade ? cw / 2 + 22 : cw / 2), h / 2 + 2);
    });
  });
}

function stampProp(letter, color, t) {
  return [
    part(bev(0.12, 0.05, 0.08, 0.015), color, { ...t, y: (t.y || 0) + 0.025 }),
    part(bev(0.13, 0.02, 0.09, 0.008), '#3b3f4f', { ...t, y: (t.y || 0) + 0.005 }),
    part(new THREE.CylinderGeometry(0.018, 0.022, 0.08, 10), '#8a4b22', { ...t, y: (t.y || 0) + 0.09 }),
    part(ball(0.035, 1), '#b86a36', { ...t, y: (t.y || 0) + 0.15 }),
  ];
}

/** Trophy shelf (2 planks on brackets). update(levels, progress) rebuilds the cups + cards. */
export function buildTrophyShelf() {
  const group = new THREE.Group();
  group.name = 'trophyShelf';
  const W = 2.3;
  const ys = [1.28, 1.98];
  const T = [];
  for (const y of ys) {
    T.push(part(bev(W, 0.06, 0.34, 0.02), P.woodLight, { y, z: 0.17 }));
    for (const x of [-W / 2 + 0.25, W / 2 - 0.25]) {
      T.push(part(bev(0.05, 0.22, 0.05, 0.015), P.woodDark, { x, y: y - 0.13, z: 0.03 }));
      T.push(part(rod([x, y - 0.22, 0.03], [x, y - 0.04, 0.3], 0.02, 6), P.woodDark));
    }
    T.push(part(bev(W, 0.05, 0.02, 0.01), P.tomato, { y: y - 0.01, z: 0.345 }));
  }
  const stamps = [...stampProp('S', P.tomato, { x: 0.72, y: ys[1] + 0.03, z: 0.2 }), ...stampProp('A', P.cobalt, { x: 0.9, y: ys[1] + 0.03, z: 0.16 })];
  // a few books leaning at the end of the top shelf + a framed licence
  const bookCols = [P.cobalt, P.tomato, P.sunflower, P.teal, P.violet];
  bookCols.forEach((c, i) => {
    const hgt = 0.26 + ((i * 37) % 5) * 0.02;
    T.push(part(bev(0.06, hgt, 0.2, 0.012), c, { x: -1.02 + i * 0.066, y: ys[1] + 0.03 + hgt / 2, z: 0.16, rz: i === 4 ? -0.28 : 0 }));
    T.push(part(bev(0.062, 0.02, 0.202, 0.005), '#fff8ee', { x: -1.02 + i * 0.066, y: ys[1] + 0.03 + hgt * 0.72, z: 0.16, rz: i === 4 ? -0.28 : 0 }));
  });
  T.push(part(bev(0.34, 0.26, 0.03, 0.012), P.gold, { x: -0.55, y: ys[1] + 0.17, z: 0.07, rx: -0.12 }));
  T.push(part(bev(0.28, 0.2, 0.01, 0.004), '#fff8ee', { x: -0.55, y: ys[1] + 0.17, z: 0.09, rx: -0.12 }));
  T.push(part(bev(0.16, 0.02, 0.012, 0.004), P.tomato, { x: -0.55, y: ys[1] + 0.22, z: 0.1, rx: -0.12 }));
  T.push(part(bev(0.12, 0.012, 0.012, 0.004), P.ink, { x: -0.55, y: ys[1] + 0.17, z: 0.1, rx: -0.12 }));
  const ink = [part(puck(0.1, 0.035, 0.012, 16), '#3b3f4f', { x: 0.62, y: ys[1] + 0.05, z: 0.08, rx: 0 }), part(puck(0.085, 0.01, 0.004, 16), '#8a2030', { x: 0.62, y: ys[1] + 0.07, z: 0.08 })];
  const g = meshGroup('shelf', { toy: [...T, ...ink], glossy: stamps });
  group.add(g);
  const dyn = new THREE.Group();
  dyn.name = 'trophies';
  group.add(dyn);
  const state = { cards: [] };
  const cards = cardTexture(state);
  const cardMat = new THREE.MeshStandardMaterial({ map: cards, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
  cardMat.name = 'trophy-cards';
  let cardMesh = null;
  const cups = [];
  const byId = new Map(); // level id -> its cup (for the office's new-trophy beat)
  const col = hitBox(W + 0.1, 1.2, 0.5, { y: 1.7, z: 0.22 });
  group.add(col);

  function update(levels, progress) {
    for (const c of dyn.children.slice()) {
      c.removeFromParent();
      c.traverse((o) => { if (o.isMesh && o.geometry !== cardMesh?.geometry) o.geometry.dispose?.(); });
    }
    cups.length = 0;
    byId.clear();
    const real = levels.slice(0, 8);
    state.cards = real.map((d) => ({ name: d.name, grade: progress?.level?.(d.id)?.grade || null }));
    cards.userData.repaint?.();
    // cups on the lower shelf (up to 5); any extra go in the middle of the upper shelf
    const lower = Math.min(5, Math.max(3, real.length));
    const quads = [];
    real.forEach((d, i) => {
      const row = i < 5 ? 0 : 1;
      const k = row ? i - 5 : i;
      const cnt = row ? real.length - 5 : lower;
      const pitch = row ? 0.34 : Math.min(0.46, (W - 0.3) / cnt);
      const x = (k - (cnt - 1) / 2) * pitch + (row ? 0.05 : 0);
      const y = ys[row] + 0.03;
      const grade = state.cards[i].grade;
      if (grade) {
        const cup = trophy({ seed: i + 1, metal: METAL[grade] || 'bronze', size: grade === 'S' ? 0.5 : 0.42 });
        cup.position.set(x, y, 0.16);
        cup.rotation.y = (i % 2 ? -1 : 1) * 0.15;
        cup.traverse((o) => { if (o.userData?.collider) o.removeFromParent(); });
        dyn.add(cup);
        cups.push(cup);
        byId.set(d.id, cup);
      } else {
        const ghost = '#d9d2c4';
        const base = new THREE.Mesh(merge([
          part(bev(0.2, 0.08, 0.2, 0.03), '#e8dcc3', { y: 0.04 }),
          latheBands([[0, 0.08], [0.05, 0.08], [0.02, 0.12], [0.02, 0.2], [0.09, 0.26], [0.1, 0.34], [0.085, 0.34], [0, 0.3]], 14, () => ghost),
          part(new THREE.TorusGeometry(0.035, 0.01, 5, 10, Math.PI * 1.2), ghost, { x: 0.1, y: 0.29, rz: -Math.PI * 0.6 }),
          part(new THREE.TorusGeometry(0.035, 0.01, 5, 10, Math.PI * 1.2), ghost, { x: -0.1, y: 0.29, rz: Math.PI * 0.4 }),
        ]), materials.toy);
        base.position.set(x, y, 0.16);
        base.castShadow = true;
        dyn.add(base);
      }
      // name card leaning against the cup's plinth
      const u0 = (i % 8) / 8, u1 = (i % 8 + 1) / 8;
      const q = new THREE.PlaneGeometry(0.3, 0.075);
      const uv = q.attributes.uv;
      for (let j = 0; j < uv.count; j++) uv.setXY(j, u0 + (u1 - u0) * uv.getX(j), uv.getY(j));
      q.applyMatrix4(xform({ x, y: y + 0.035, z: 0.33, rx: -0.35 }));
      quads.push(q);
    });
    if (quads.length) {
      cardMesh = new THREE.Mesh(mergeUV(quads), cardMat);
      cardMesh.name = 'trophyCards';
      dyn.add(cardMesh);
    }
    return cups;
  }
  return { group, update, collider: col, cups, byId, pickables: [g.userData.meshes.toy, g.userData.meshes.glossy] };
}
