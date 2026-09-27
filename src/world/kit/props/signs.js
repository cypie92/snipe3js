// Painted signs: real words in the Fredoka toy font, drawn on canvas.
// Every kit sign paints into a slot of a shared atlas page, so all sign decals share ONE material per
// 1024 px page, and a level's static batcher merges them into one draw call per batch cell.
// Pages repaint once the web font has loaded (document.fonts), so signs never keep a fallback font.
// Without a DOM (Node stats) decals get a plain paper-coloured material.
import * as THREE from 'three';

export const SIGN_FONT = 'Fredoka, "Arial Rounded MT Bold", "Varela Round", "Trebuchet MS", sans-serif';
export const SIGN_INK = '#2b2b3a';
export const SIGN_PAPER = '#fff4e0';
const HAS_DOM = typeof document !== 'undefined';

let fontsReady = null;
/** Resolves once Fredoka is usable in canvas (immediately without a DOM / Font Loading API). */
export function whenFontsReady() {
  if (!HAS_DOM || !document.fonts?.load) return Promise.resolve();
  if (!fontsReady) {
    fontsReady = Promise.all([document.fonts.load('700 64px Fredoka'), document.fonts.load('600 64px Fredoka')])
      .then(() => document.fonts.ready).catch(() => {});
  }
  return fontsReady;
}

/** Sets the largest font (<= maxH px) whose text fits in maxW px. Returns the size. */
export function fitFont(ctx, text, maxW, maxH, weight = 700) {
  let size = Math.floor(maxH);
  ctx.font = `${weight} ${size}px ${SIGN_FONT}`;
  const w = ctx.measureText(text).width;
  if (w > maxW) size = Math.max(6, Math.floor((size * maxW) / w));
  ctx.font = `${weight} ${size}px ${SIGN_FONT}`;
  return size;
}

/** Rounded-rectangle path (canvas). */
export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};
const rand01 = (h, i) => ((Math.imul(h ^ (i * 374761393), 668265263) >>> 0) % 10007) / 10007;

/**
 * Words fitted big into a box centred at (x, y): one line, or two balanced lines when that gives
 * bigger letters. Hand-painted look: each letter gets a tiny seeded tilt/bounce (`bounce` 0..1) and
 * an optional hard offset shadow. Characters in `accentChars` use `accent`. Returns the font size.
 */
export function fitWords(ctx, text, x, y, maxW, maxH, {
  fill = SIGN_INK, shadow = null, accent = null, accentChars = '&!', weight = 700, bounce = 1, twoLines = true,
} = {}) {
  const lines = [[text]];
  const words = text.split(' ');
  if (twoLines && words.length > 1) {
    let best = null;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
      const m = Math.max(a.length, b.length);
      if (!best || m < best.m) best = { m, pair: [a, b] };
    }
    lines.push(best.pair);
  }
  let pick = null;
  for (const L of lines) {
    const h = L.length === 1 ? maxH : maxH * 0.5;
    const size = Math.min(...L.map((t) => fitFont(ctx, t, maxW * 0.97, h * 0.98, weight)));
    if (!pick || size > pick.size * 1.12) pick = { L, size };
  }
  const size = pick.size;
  ctx.font = `${weight} ${size}px ${SIGN_FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const seed = hash(text);
  const lh = size * 1.02;
  const glyphs = [];
  pick.L.forEach((t, li) => {
    const full = ctx.measureText(t).width;
    const yy = y + (li - (pick.L.length - 1) / 2) * lh + size * 0.05;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (ch === ' ') continue;
      const x0 = x - full / 2 + ctx.measureText(t.slice(0, i)).width; // prefix width keeps kerning
      const cw = ctx.measureText(ch).width;
      const k = glyphs.length;
      glyphs.push({
        ch, x: x0 + cw / 2, y: yy + (rand01(seed, k * 2) - 0.5) * 0.07 * size * bounce, cw,
        rot: (rand01(seed, k * 2 + 1) - 0.5) * 0.09 * bounce,
        color: accent && accentChars.includes(ch) ? accent : fill,
      });
    }
  });
  const draw = (g, dy, color) => {
    ctx.save();
    ctx.translate(g.x, g.y + dy);
    ctx.rotate(g.rot);
    ctx.fillStyle = color;
    ctx.fillText(g.ch, -g.cw / 2, 0);
    ctx.restore();
  };
  if (shadow) for (const g of glyphs) draw(g, size * 0.06, shadow);
  for (const g of glyphs) draw(g, 0, g.color);
  return size;
}

/**
 * Standard painted board face (fills the whole w x h box): paper panel, thin ink keyline, big words.
 * opts: { paper, ink, accent (shadow + '&' colour), keyline (0 = none), bounce, twoLines, pad }.
 */
export function paintBoard(ctx, w, h, text, {
  paper = SIGN_PAPER, ink = SIGN_INK, accent = null, keyline = 1, bounce = 1, twoLines = true, pad = 0.14, shadow,
} = {}) {
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, w, h);
  const r = h * 0.16;
  if (keyline) {
    const lw = Math.max(2, h * 0.035) * keyline;
    ctx.lineWidth = lw;
    ctx.strokeStyle = ink;
    roundRect(ctx, h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12, r);
    ctx.stroke();
  }
  const m = h * pad;
  fitWords(ctx, text, w / 2, h / 2, w - m * 2 - h * 0.1, h - m * 2, {
    fill: ink, accent, bounce, twoLines, shadow: shadow === undefined ? (accent ? `${accent}bb` : null) : shadow,
  });
}

// ---------------------------------------------------------------- the shared atlas

const PAGE = 1024;
const PAD = 6;
const pages = [];
const slots = new Map();
let nodeMat = null;

function newPage() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = PAGE;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.62, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  mat.name = `kit-signs${pages.length ? `-${pages.length}` : ''}`;
  const page = { canvas, ctx, tex, mat, slots: [], x: 0, y: 0, shelfH: 0 };
  whenFontsReady().then(() => {
    for (const s of page.slots) paintSlot(page, s);
    tex.needsUpdate = true;
  });
  pages.push(page);
  return page;
}

function paintSlot(page, s) {
  const { ctx } = page;
  ctx.save();
  ctx.beginPath();
  ctx.rect(s.x - PAD, s.y - PAD, s.w + PAD * 2, s.h + PAD * 2);
  ctx.clip();
  ctx.fillStyle = s.bleed;
  ctx.fillRect(s.x - PAD, s.y - PAD, s.w + PAD * 2, s.h + PAD * 2);
  ctx.translate(s.x, s.y);
  s.draw(ctx, s.w, s.h);
  ctx.restore();
  page.tex.needsUpdate = true;
}

/** Shelf-pack a pw x ph slot into the first page with room. */
function allocate(pw, ph) {
  const W = pw + PAD * 2, H = ph + PAD * 2;
  for (const page of pages) {
    if (page.x + W <= PAGE && H <= page.shelfH) return place(page, W, H);
    if (page.y + page.shelfH + H <= PAGE) {
      page.y += page.shelfH;
      page.x = 0;
      page.shelfH = H;
      return place(page, W, H);
    }
  }
  const page = newPage();
  page.shelfH = H;
  return place(page, W, H);
}
function place(page, W, H) {
  const at = { page, x: page.x + PAD, y: page.y + PAD };
  page.x += W;
  return at;
}

/**
 * Atlas slot for a painted sign: draw(ctx, pw, ph) paints it (called again once fonts load).
 * Same key -> same slot. `bleed` = the colour painted round the slot edge (use the sign's background).
 */
export function signSlot(key, pw, ph, draw, bleed = SIGN_PAPER) {
  if (!HAS_DOM) return null;
  let s = slots.get(key);
  if (!s) {
    const at = allocate(Math.round(pw), Math.round(ph));
    s = { key, page: at.page, x: at.x, y: at.y, w: Math.round(pw), h: Math.round(ph), draw, bleed };
    at.page.slots.push(s);
    paintSlot(at.page, s);
    slots.set(key, s);
  }
  return s;
}

/** Map a geometry's (x, y) extent [x0..x0+w] x [y0..y0+h] onto a slot's UVs (planar, facing +Z). */
function mapUV(geo, s, x0, y0, w, h) {
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) - x0) / w, v = (pos.getY(i) - y0) / h;
    uv[i * 2] = s ? (s.x + u * s.w) / PAGE : u;
    uv[i * 2 + 1] = s ? 1 - (s.y + (1 - v) * s.h) / PAGE : v;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** Rounded-rectangle panel geometry (w x h, corner radius r) facing +Z, centred. */
export function panelGeo(w, h, r = Math.min(w, h) * 0.14, seg = 3) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ShapeGeometry(s, seg);
  g.deleteAttribute('uv');
  return g;
}

/** The atlas material for a slot: satin (matches materials.toy) or glossy (matches materials.glossy). */
function slotMaterial(s, glossy) {
  if (!s) {
    if (!nodeMat) { nodeMat = new THREE.MeshStandardMaterial({ color: SIGN_PAPER, roughness: 0.62 }); nodeMat.name = 'kit-signs'; }
    return nodeMat;
  }
  if (!glossy) return s.page.mat;
  if (!s.page.glossy) {
    s.page.glossy = s.page.mat.clone();
    s.page.glossy.roughness = 0.28;
    s.page.glossy.name = `${s.page.mat.name}-glossy`;
  }
  return s.page.glossy;
}

/**
 * A painted sign decal mesh: w x h metres facing +Z (centred on its origin), textured from the shared
 * atlas. `draw(ctx, pw, ph)` paints the face; `px` = texture pixels across (height follows the aspect).
 * `round` (m) rounds the panel corners; `segs` subdivides it along its width (to bend it onto a curved
 * surface: pass `bend(v)` to move each vertex, then normals are rebuilt); `glossy` matches glossy toys.
 * Cast shadows off; the board behind it casts. Reuses the slot for the same key. Tag: userData.sign = key.
 */
export function signDecal(key, w, h, draw, { px = 512, round = 0, bleed = SIGN_PAPER, glossy = false, segs = 1, bend = null } = {}) {
  const pw = px, ph = Math.max(8, Math.round((px * h) / w));
  const s = signSlot(key, pw, ph, draw, bleed);
  const geo = round > 0 ? panelGeo(w, h, round) : new THREE.PlaneGeometry(w, h, segs, 1);
  mapUV(geo, s, -w / 2, -h / 2, w, h);
  if (bend) {
    const pos = geo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) { bend(v.fromBufferAttribute(pos, i)); pos.setXYZ(i, v.x, v.y, v.z); }
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  }
  const m = new THREE.Mesh(geo, slotMaterial(s, glossy));
  m.name = 'sign';
  m.castShadow = false;
  m.receiveShadow = true;
  m.userData.sign = key;
  return m;
}

/** Convenience: a paintBoard() sign decal with the given words. opts = paintBoard's + { px, round, glossy, segs, bend }. */
export function wordSign(text, w, h, opts = {}) {
  const { px = 512, round = Math.min(w, h) * 0.12, glossy = false, segs = 1, bend = null, ...paint } = opts;
  const key = `words|${text}|${w.toFixed(3)}x${h.toFixed(3)}|${px}|${JSON.stringify(paint)}`;
  return signDecal(key, w, h, (ctx, pw, ph) => paintBoard(ctx, pw, ph, text, paint), { px, round, glossy, segs, bend, bleed: paint.paper || SIGN_PAPER });
}

/**
 * Standalone cached CanvasTexture (for one-off textures that must not live in the atlas, e.g. a
 * repeating pattern). Repainted once fonts load. Same key -> same texture. Null without a DOM.
 */
const texCache = new Map();
export function paintedTexture(key, w, h, draw) {
  if (!HAS_DOM) return null;
  if (texCache.has(key)) return texCache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const paint = () => {
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    draw(ctx, w, h);
    ctx.restore();
    tex.needsUpdate = true;
  };
  tex.userData.repaint = paint;
  paint();
  whenFontsReady().then(paint);
  texCache.set(key, tex);
  return tex;
}

/** Atlas pages (debug / sandbox). */
export const signPages = () => pages.map((p) => ({ canvas: p.canvas, slots: p.slots.length, material: p.mat }));
