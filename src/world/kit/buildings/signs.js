// Painted canvas textures: shop signs, house-number digits, clock faces, small labels.
// Every texture is redrawn once the web font (Fredoka) finishes loading, so signs never get
// stuck with a fallback font. Works without a DOM (Node stats): textures are simply null.
import { THREE, materials, cbox } from './common.js';
import { P } from '../../../gfx/palette.js';

export const FONT = 'Fredoka, "Arial Rounded MT Bold", "Varela Round", "Nunito", sans-serif';
const HAS_DOM = typeof document !== 'undefined';

/** CanvasTexture painted by draw(ctx, w, h). Returns null without a DOM. */
export function paintedTexture(w, h, draw, { repeat = false, anisotropy = 8 } = {}) {
  if (!HAS_DOM) return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const paint = () => {
    ctx.clearRect(0, 0, w, h);
    draw(ctx, w, h);
    tex.needsUpdate = true;
  };
  paint();
  if (document.fonts?.load) {
    document.fonts.load(`700 48px Fredoka`).then(paint, () => {});
    document.fonts.ready?.then(paint, () => {});
  }
  return tex;
}

/** Textured (non vertex-coloured) material matching the toy material's sheen. */
export function decalMaterial(map, fallback = '#fff8ee', name = 'decal') {
  const m = new THREE.MeshStandardMaterial({ map, color: map ? '#ffffff' : fallback, roughness: 0.6, metalness: 0 });
  m.name = name;
  return m;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Largest bold font size (<= maxH) whose text fits in maxW. Sets ctx.font. */
export function fitFont(ctx, text, maxW, maxH, weight = 700) {
  let size = Math.floor(maxH);
  ctx.font = `${weight} ${size}px ${FONT}`;
  const w = ctx.measureText(text).width;
  if (w > maxW) size = Math.floor((size * maxW) / w);
  ctx.font = `${weight} ${size}px ${FONT}`;
  return size;
}

/** Chunky toy lettering: dark outline + drop shadow + fill. */
export function toyText(ctx, text, x, y, { fill = P.white, outline = P.ink, shadow = 'rgba(43,43,58,0.35)', size = 64, stroke = 0.16 } = {}) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  if (shadow) {
    ctx.fillStyle = shadow;
    ctx.fillText(text, x + size * 0.05, y + size * 0.08);
  }
  if (outline) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = size * stroke;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

// ------------------------------------------------------------------ shop / fascia signs
const signCache = new Map();
/**
 * Material for a painted sign board. opts: { text, bg, fg, border, accent, w, h, icon }
 * (canvas px; keep the aspect equal to the board's). Cached by content.
 */
export function signMaterial({ text = 'SHOP', bg = P.cobalt, fg = P.white, border = P.ink, accent = P.sunflower, w = 1024, h = 192, icon = null, sub = null } = {}) {
  const key = JSON.stringify([text, bg, fg, border, accent, w, h, icon, sub]);
  if (signCache.has(key)) return signCache.get(key);
  const tex = paintedTexture(w, h, (ctx) => {
    const r = h * 0.22;
    ctx.fillStyle = border;
    roundRect(ctx, 0, 0, w, h, r);
    ctx.fill();
    ctx.fillStyle = bg;
    const b = h * 0.075;
    roundRect(ctx, b, b, w - 2 * b, h - 2 * b, r * 0.75);
    ctx.fill();
    // soft top highlight = painted-wood sheen
    const grad = ctx.createLinearGradient(0, b, 0, h - b);
    grad.addColorStop(0, 'rgba(255,255,255,0.18)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.10)');
    ctx.fillStyle = grad;
    roundRect(ctx, b, b, w - 2 * b, h - 2 * b, r * 0.75);
    ctx.fill();
    // pinstripe
    ctx.strokeStyle = accent;
    ctx.lineWidth = h * 0.028;
    roundRect(ctx, b * 2.1, b * 2.1, w - 4.2 * b, h - 4.2 * b, r * 0.5);
    ctx.stroke();
    // end dots
    const pad = icon ? h * 1.0 : h * 0.42;
    ctx.fillStyle = accent;
    for (const x of [h * 0.3, w - h * 0.3]) {
      if (icon) break;
      ctx.beginPath();
      ctx.arc(x, h / 2, h * 0.075, 0, Math.PI * 2);
      ctx.fill();
    }
    if (icon) {
      drawIcon(ctx, icon, h * 0.55, h / 2, h * 0.62, accent, fg);
      drawIcon(ctx, icon, w - h * 0.55, h / 2, h * 0.62, accent, fg);
    }
    const main = sub ? h * 0.5 : h * 0.62;
    const size = fitFont(ctx, text, w - 2 * pad, main);
    toyText(ctx, text, w / 2, sub ? h * 0.42 : h * 0.53, { fill: fg, outline: shadeCss(bg, -0.35), size, stroke: 0.14 });
    if (sub) {
      const s2 = fitFont(ctx, sub, w - 2 * pad, h * 0.2, 600);
      toyText(ctx, sub, w / 2, h * 0.77, { fill: accent, outline: null, shadow: null, size: s2 });
    }
  });
  const m = decalMaterial(tex, bg, `sign:${text}`);
  signCache.set(key, m);
  return m;
}

function shadeCss(hex, dl) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl, THREE.SRGBColorSpace);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + dl)), THREE.SRGBColorSpace);
  return `#${c.getHexString(THREE.SRGBColorSpace)}`;
}

/** Tiny painted pictograms for sign ends. */
export function drawIcon(ctx, icon, x, y, s, accent, fg) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const ink = P.ink;
  const blob = (fill, path) => { ctx.fillStyle = fill; ctx.strokeStyle = ink; ctx.lineWidth = s * 0.07; path(); ctx.fill(); ctx.stroke(); };
  if (icon === 'bread') {
    blob('#e9a45c', () => { ctx.beginPath(); ctx.ellipse(0, s * 0.05, s * 0.42, s * 0.26, 0, 0, Math.PI * 2); });
    ctx.strokeStyle = '#fff1d6'; ctx.lineWidth = s * 0.05;
    for (const k of [-0.18, 0, 0.18]) { ctx.beginPath(); ctx.moveTo(s * k - s * 0.06, -s * 0.08); ctx.lineTo(s * k + s * 0.06, s * 0.14); ctx.stroke(); }
  } else if (icon === 'fish') {
    blob('#7fc8f8', () => {
      ctx.beginPath(); ctx.ellipse(-s * 0.06, 0, s * 0.3, s * 0.18, 0, 0, Math.PI * 2);
      ctx.moveTo(s * 0.2, 0); ctx.lineTo(s * 0.44, -s * 0.18); ctx.lineTo(s * 0.44, s * 0.18); ctx.closePath();
    });
    ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(-s * 0.2, -s * 0.04, s * 0.045, 0, Math.PI * 2); ctx.fill();
  } else if (icon === 'letter') {
    blob('#fff8ee', () => { ctx.beginPath(); ctx.rect(-s * 0.38, -s * 0.25, s * 0.76, s * 0.5); });
    ctx.beginPath(); ctx.moveTo(-s * 0.38, -s * 0.25); ctx.lineTo(0, s * 0.06); ctx.lineTo(s * 0.38, -s * 0.25); ctx.stroke();
  } else if (icon === 'hammer') {
    blob('#c0824a', () => { ctx.beginPath(); ctx.rect(-s * 0.06, -s * 0.1, s * 0.12, s * 0.5); });
    blob('#a9b4c2', () => { ctx.beginPath(); ctx.rect(-s * 0.3, -s * 0.34, s * 0.6, s * 0.2); });
  } else if (icon === 'apple') {
    blob('#ff5a4e', () => { ctx.beginPath(); ctx.arc(0, s * 0.06, s * 0.3, 0, Math.PI * 2); });
    blob('#7cc653', () => { ctx.beginPath(); ctx.ellipse(s * 0.12, -s * 0.3, s * 0.13, s * 0.07, -0.5, 0, Math.PI * 2); });
  } else if (icon === 'candy') {
    blob('#ff7eb6', () => { ctx.beginPath(); ctx.arc(0, 0, s * 0.22, 0, Math.PI * 2); });
    blob('#ff7eb6', () => { ctx.beginPath(); ctx.moveTo(-s * 0.2, 0); ctx.lineTo(-s * 0.42, -s * 0.16); ctx.lineTo(-s * 0.42, s * 0.16); ctx.closePath(); });
    blob('#ff7eb6', () => { ctx.beginPath(); ctx.moveTo(s * 0.2, 0); ctx.lineTo(s * 0.42, -s * 0.16); ctx.lineTo(s * 0.42, s * 0.16); ctx.closePath(); });
  } else if (icon === 'flower') {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      blob(accent, () => { ctx.beginPath(); ctx.arc(Math.cos(a) * s * 0.2, Math.sin(a) * s * 0.2, s * 0.14, 0, Math.PI * 2); });
    }
    blob('#ffc93c', () => { ctx.beginPath(); ctx.arc(0, 0, s * 0.12, 0, Math.PI * 2); });
  } else if (icon === 'cup') {
    blob('#fff8ee', () => { ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.2); ctx.lineTo(s * 0.22, -s * 0.2); ctx.lineTo(s * 0.16, s * 0.28); ctx.lineTo(-s * 0.24, s * 0.28); ctx.closePath(); });
    ctx.beginPath(); ctx.arc(s * 0.26, s * 0.02, s * 0.12, -1.2, 1.2); ctx.stroke();
  } else if (icon === 'meat') {
    blob('#ff8a80', () => { ctx.beginPath(); ctx.ellipse(-s * 0.05, 0, s * 0.3, s * 0.22, 0.3, 0, Math.PI * 2); });
    blob('#fff8ee', () => { ctx.beginPath(); ctx.arc(s * 0.3, -s * 0.12, s * 0.09, 0, Math.PI * 2); });
  } else {
    blob(accent, () => { ctx.beginPath(); ctx.arc(0, 0, s * 0.25, 0, Math.PI * 2); });
  }
  ctx.restore();
}

// ------------------------------------------------------------------ digits (house numbers)
let digitsMat = null;
const DIGIT_W = 64, DIGIT_H = 96;
/** Shared atlas material: cream plate with ink digits 0-9 in 10 cells. */
export function digitsMaterial() {
  if (digitsMat) return digitsMat;
  const tex = paintedTexture(DIGIT_W * 10, DIGIT_H, (ctx, w, h) => {
    ctx.fillStyle = P.white;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = P.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(h * 0.86)}px ${FONT}`;
    for (let i = 0; i < 10; i++) ctx.fillText(String(i), i * DIGIT_W + DIGIT_W / 2, h * 0.55);
  }, { anisotropy: 4 });
  digitsMat = decalMaterial(tex, P.white, 'digits');
  return digitsMat;
}

/**
 * House-number plaque: coloured rim (toy) + digit quads (atlas). Adds to `kit` in its current frame
 * with the plaque face centred at t (facing +Z). Height ~0.34 m: readable at 90 m through 8x.
 */
export function numberPlate(kit, n, t = {}, rim = P.cobalt, height = 0.34) {
  const digits = String(Math.max(0, Math.floor(n)));
  const dh = height;
  const dw = dh * (DIGIT_W / DIGIT_H) * 0.82;
  const tw = dw * digits.length;
  const mat = digitsMaterial();
  kit.at(t, () => {
    kit.add(cbox(tw + 0.12, dh + 0.12, 0.07, 0.05), rim, { z: 0.035 });
    for (let i = 0; i < digits.length; i++) {
      const d = Number(digits[i]);
      const g = new THREE.PlaneGeometry(dw, dh);
      const uv = g.attributes.uv;
      const inset = 0.09;
      for (let k = 0; k < uv.count; k++) {
        const u = uv.getX(k);
        uv.setX(k, (d + inset + u * (1 - 2 * inset)) / 10);
      }
      kit.raw(g, mat, { x: -tw / 2 + dw * (i + 0.5), z: 0.075 });
    }
  });
}

// ------------------------------------------------------------------ misc painted labels
const labelCache = new Map();
/** Simple single-line painted label (TELEPHONE, BUS STOP...). */
export function labelMaterial(text, { bg = P.ink, fg = P.white, w = 512, h = 96, radius = 0.25 } = {}) {
  const key = [text, bg, fg, w, h, radius].join('|');
  if (labelCache.has(key)) return labelCache.get(key);
  const tex = paintedTexture(w, h, (ctx) => {
    ctx.fillStyle = bg;
    roundRect(ctx, 0, 0, w, h, h * radius);
    ctx.fill();
    const size = fitFont(ctx, text, w * 0.9, h * 0.72);
    toyText(ctx, text, w / 2, h * 0.54, { fill: fg, outline: null, shadow: 'rgba(0,0,0,0.25)', size });
  }, { anisotropy: 4 });
  const m = decalMaterial(tex, bg, `label:${text}`);
  labelCache.set(key, m);
  return m;
}

/** Round roundel (bus stop): coloured ring, white middle band with text. */
export function roundelMaterial(text = 'BUS', { ring = P.tomato, band = P.cobalt, fg = P.white } = {}) {
  const key = `roundel|${text}|${ring}|${band}`;
  if (labelCache.has(key)) return labelCache.get(key);
  const tex = paintedTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = P.white;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = ring;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.48, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = P.white;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, w * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = band;
    roundRect(ctx, w * 0.04, h * 0.37, w * 0.92, h * 0.26, h * 0.05);
    ctx.fill();
    const size = fitFont(ctx, text, w * 0.8, h * 0.22);
    toyText(ctx, text, w / 2, h * 0.515, { fill: fg, outline: null, shadow: null, size });
  }, { anisotropy: 4 });
  const m = decalMaterial(tex, ring, `roundel:${text}`);
  labelCache.set(key, m);
  return m;
}

/** Clock face: cream dial, chunky ink numerals, gold rim. Square texture mapped to a circle. */
export function clockFaceMaterial({ face = '#fff6e0', ink = P.ink, rim = P.gold } = {}) {
  const key = `clock|${face}|${ink}|${rim}`;
  if (labelCache.has(key)) return labelCache.get(key);
  const tex = paintedTexture(512, 512, (ctx, w) => {
    const c = w / 2;
    ctx.fillStyle = rim;
    ctx.fillRect(0, 0, w, w);
    ctx.fillStyle = face;
    ctx.beginPath(); ctx.arc(c, c, w * 0.46, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = w * 0.012;
    ctx.beginPath(); ctx.arc(c, c, w * 0.43, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(w * 0.12)}px ${FONT}`;
    for (let i = 1; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x = c + Math.sin(a) * w * 0.335;
      const y = c - Math.cos(a) * w * 0.335 + w * 0.008;
      if (i % 3 === 0) ctx.fillText(String(i), x, y);
      else {
        ctx.beginPath();
        ctx.arc(c + Math.sin(a) * w * 0.36, c - Math.cos(a) * w * 0.36, w * 0.022, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, { anisotropy: 4 });
  const m = decalMaterial(tex, face, 'clockface');
  labelCache.set(key, m);
  return m;
}
