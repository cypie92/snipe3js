// The job corkboard (one pinned flyer per location, padlocks on locked ones, teaser flyers for
// locations not built yet, sticky notes and a red-string gag) and the trophy shelf (a cup per
// graded location + Inspector Pidge's rubber stamps). Both rebuild their dynamic parts on refresh.
import * as THREE from 'three';
import { part, merge, xform } from '../world/geo.js';
import { materials } from '../gfx/materials.js';
import { P } from '../gfx/palette.js';
import { Rng } from '../core/rng.js';
import { bev, ball, rod, puck, arc, latheBands, goldMaterial } from '../world/kit/props/lib.js';
import { trophy } from '../world/kit/props/index.js';
import { canvasTexture, roundRect, fitFont, stickerText, FONT_UI, FONT_HAND } from '../world/perch/paint.js';
import { decorAtlas, flyerTexture } from './textures.js';
import { meshGroup, decal, hitBox } from './props.js';
import { mergeUV } from './room.js';

export const BOARD = { w: 3.8, h: 2.05 };
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

function padlock() {
  const L = [
    part(bev(0.2, 0.16, 0.07, 0.04), P.sunflower, { y: -0.02 }),
    part(arc(0.065, 0.017, Math.PI, 8, 14), '#c9d2de', { y: 0.06 }),
    part(new THREE.CylinderGeometry(0.017, 0.017, 0.05, 8), '#c9d2de', { x: -0.065, y: 0.045 }),
    part(new THREE.CylinderGeometry(0.017, 0.017, 0.05, 8), '#c9d2de', { x: 0.065, y: 0.045 }),
    part(puck(0.022, 0.01, 0.003, 10), P.ink, { y: -0.02, z: 0.037, rx: Math.PI / 2 }),
    part(bev(0.012, 0.035, 0.012, 0.004), P.ink, { y: -0.045, z: 0.037 }),
  ];
  const m = new THREE.Mesh(merge(L), goldMaterial);
  m.castShadow = true;
  m.name = 'padlock';
  return m;
}

/** Build the corkboard. Returns { group, flyers: [flyer], setLevels(entries) }. */
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
  T.push(part(bev(2.2, 0.42, 0.06, 0.03), '#7a4a26', { y: h / 2 + 0.36, z: 0.07 }));
  for (const x of [-0.9, 0.9]) T.push(part(ball(0.035, 1), P.sunflower, { x, y: h / 2 + 0.36, z: 0.1 }));
  const D = [
    decal('cork', w, h, { z: 0.041 }),
    decal('jobs', 2.05, 0.34, { y: h / 2 + 0.36, z: 0.101 }),
  ];
  // decorative notes (static) along the top strip + postcard + lost-cat poster
  const rng = new Rng('board');
  const notes = [
    ['note1', 0.3, 0.3, -1.62, 0.72, 0.08, P.tomato],
    ['note2', 0.3, 0.3, -1.08, 0.74, -0.06, P.cobalt],
    ['postcard', 0.46, 0.3, 0.02, 0.7, 0.05, P.sunflower],
    ['note3', 0.3, 0.3, 0.9, 0.73, -0.1, P.teal],
    ['lostcat', 0.3, 0.39, 1.55, 0.67, 0.06, P.bubblegum],
  ];
  const P2 = [];
  for (const [name, nw, nh, x, y, rz, pc] of notes) {
    D.push(decal(name, nw, nh, { x, y, z: 0.048, rz }));
    P2.push(...pin(pc, { x: x - Math.sin(rz) * nh * 0.42, y: y + Math.cos(rz) * nh * 0.42, z: 0.07 }));
  }
  // red string between the postcard pin and the lost-cat pin (conspiracy gag)
  const a = new THREE.Vector3(0.02, 0.7 + 0.13, 0.075), b = new THREE.Vector3(1.55 - 0.02, 0.67 + 0.16, 0.075), c = new THREE.Vector3(0.9, 0.73 + 0.13, 0.075);
  const curve = new THREE.CatmullRomCurve3([a, new THREE.Vector3(0.45, 0.78, 0.08), c, new THREE.Vector3(1.2, 0.8, 0.08), b]);
  P2.push(part(new THREE.TubeGeometry(curve, 40, 0.007, 4), '#e8203a'));
  const g = meshGroup('corkboardFrame', { toy: T, glossy: P2, decal: D });
  group.add(g);

  const flyerLayer = new THREE.Group();
  flyerLayer.name = 'flyers';
  group.add(flyerLayer);
  const flyers = [];

  /** entries: [{ def, rec, locked, need, teaser }] */
  function setLevels(entries) {
    for (const f of flyers) {
      f.pivot.removeFromParent();
      f.mesh.material.map?.dispose();
      f.mesh.material.dispose();
    }
    flyers.length = 0;
    const n = entries.length;
    const cols = n <= 4 ? Math.max(1, n) : Math.ceil(n / 2);
    const rows = Math.ceil(n / cols);
    const gap = 0.14;
    let fwid = Math.min(0.8, (w - 0.3 - (cols - 1) * gap) / cols);
    let fh = fwid / 0.776;
    const maxH = rows === 1 ? 1.08 : (h - 0.62 - (rows - 1) * 0.1) / rows;
    if (fh > maxH) { fh = maxH; fwid = fh * 0.776; }
    const yTop = rows === 1 ? 0.28 : 0.42;
    entries.forEach((e, i) => {
      const r = Math.floor(i / cols), cIdx = i % cols;
      const inRow = Math.min(cols, n - r * cols);
      const x = (cIdx - (inRow - 1) / 2) * (fwid + gap) + rng.range(-0.03, 0.03);
      const yPin = yTop - r * (fh + 0.1) + rng.range(-0.02, 0.02);
      const pivot = new THREE.Group();
      pivot.name = `flyer:${e.def.id}`;
      pivot.position.set(x, yPin, 0.05);
      pivot.rotation.z = rng.range(-0.05, 0.05);
      const data = { ...e };
      const tex = flyerTexture(data);
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0 });
      mat.name = 'flyer';
      const mesh = new THREE.Mesh(sheetGeo(fwid, fh, 1), mat);
      mesh.position.set(0, -fh / 2 + 0.04, 0.004);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = 'flyerSheet';
      pivot.add(mesh);
      const pm = new THREE.Mesh(merge(pin(PIN_COLORS[i % PIN_COLORS.length], { z: 0.03 })), materials.glossy);
      pm.castShadow = true;
      pivot.add(pm);
      let lock = null;
      if (e.locked) {
        lock = padlock();
        lock.position.set(fwid * 0.22, -fh * 0.2, 0.06);
        lock.rotation.z = -0.12;
        pivot.add(lock);
        const lp = new THREE.Mesh(merge(pin(P.tomato, { z: 0.03 })), materials.glossy);
        lp.position.set(fwid * 0.22, -fh * 0.2 + 0.1, 0.05);
        pivot.add(lp);
      }
      const col = hitBox(fwid + 0.06, fh + 0.06, 0.12, { y: -fh / 2 + 0.04, z: 0.03 });
      pivot.add(col);
      flyerLayer.add(pivot);
      flyers.push({ def: e.def, entry: e, pivot, mesh, lock, collider: col, data, tex, size: [fwid, fh] });
    });
    return flyers;
  }

  return { group, flyers, setLevels, pickables: [g.userData.meshes.toy, g.userData.meshes.decal, g.userData.meshes.glossy] };
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
  const col = hitBox(W + 0.1, 1.2, 0.5, { y: 1.7, z: 0.22 });
  group.add(col);

  function update(levels, progress) {
    for (const c of dyn.children.slice()) {
      c.removeFromParent();
      c.traverse((o) => { if (o.isMesh && o.geometry !== cardMesh?.geometry) o.geometry.dispose?.(); });
    }
    cups.length = 0;
    const real = levels.slice(0, 8);
    state.cards = real.map((d) => ({ name: d.name, grade: progress?.level?.(d.id)?.grade || null }));
    cards.userData.repaint?.();
    const slots = Math.max(4, real.length);
    const per = Math.ceil(slots / 2);
    const quads = [];
    real.forEach((d, i) => {
      const row = i < per ? 0 : 1;
      const k = row ? i - per : i;
      const cnt = row ? slots - per : per;
      const x = (k - (cnt - 1) / 2) * ((W - 0.5) / Math.max(1, cnt)) - (row ? 0.35 : 0);
      const y = ys[row] + 0.03;
      const grade = state.cards[i].grade;
      if (grade) {
        const cup = trophy({ seed: i + 1, metal: METAL[grade] || 'bronze', size: grade === 'S' ? 0.5 : 0.42 });
        cup.position.set(x, y, 0.16);
        cup.rotation.y = (i % 2 ? -1 : 1) * 0.15;
        cup.traverse((o) => { if (o.userData?.collider) o.removeFromParent(); });
        dyn.add(cup);
        cups.push(cup);
      } else {
        const base = new THREE.Mesh(merge([part(bev(0.2, 0.08, 0.2, 0.03), '#e8dcc3', { y: 0.04 }), part(ball(0.03, 1), '#c9bca0', { y: 0.1 })]), materials.toy);
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
  return { group, update, collider: col, cups, pickables: [g.userData.meshes.toy, g.userData.meshes.glossy] };
}
