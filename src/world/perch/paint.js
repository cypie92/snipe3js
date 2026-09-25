// Canvas-texture helpers shared by the perch (van livery) and the office hub (flyers, posters).
// Textures repaint themselves once the web fonts (Fredoka / Patrick Hand) have loaded, and can be
// repainted on demand via tex.userData.repaint() when the data they draw changes.
import * as THREE from 'three';
import { P } from '../../gfx/palette.js';

export const FONT_UI = 'Fredoka, "Arial Rounded MT Bold", "Trebuchet MS", sans-serif';
export const FONT_HAND = '"Patrick Hand", "Comic Sans MS", "Segoe Print", cursive';
const HAS_DOM = typeof document !== 'undefined';

let fontsReady = null;
/** Resolves when the UI fonts are usable in canvas (or immediately without the Font Loading API). */
export function whenFontsReady() {
  if (!HAS_DOM || !document.fonts?.load) return Promise.resolve();
  if (!fontsReady) {
    fontsReady = Promise.all([
      document.fonts.load('700 64px Fredoka'),
      document.fonts.load('600 64px Fredoka'),
      document.fonts.load('400 64px "Patrick Hand"'),
    ]).catch(() => {});
  }
  return fontsReady;
}

/** CanvasTexture painted by draw(ctx, w, h). tex.userData.repaint() redraws it. */
export function canvasTexture(w, h, draw, { anisotropy = 8, repeat = false } = {}) {
  if (!HAS_DOM) return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const repaint = () => {
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    draw(ctx, w, h);
    ctx.restore();
    tex.needsUpdate = true;
  };
  tex.userData.repaint = repaint;
  tex.userData.canvas = canvas;
  repaint();
  whenFontsReady().then(repaint);
  return tex;
}

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

/** Set the largest font (<= maxH px) whose text fits maxW. Returns the size. */
export function fitFont(ctx, text, maxW, maxH, { weight = 700, family = FONT_UI } = {}) {
  let size = Math.floor(maxH);
  ctx.font = `${weight} ${size}px ${family}`;
  const w = ctx.measureText(text).width;
  if (w > maxW) size = Math.max(6, Math.floor((size * maxW) / w));
  ctx.font = `${weight} ${size}px ${family}`;
  return size;
}

/** Chunky sticker lettering: hard offset shadow + ink outline + fill. Font must already be set. */
export function stickerText(ctx, text, x, y, { fill = P.white, outline = P.ink, shadow = P.ink, size = 64, stroke = 0.2, drop = 0.08, align = 'center' } = {}) {
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  if (shadow) {
    ctx.strokeStyle = shadow;
    ctx.fillStyle = shadow;
    ctx.lineWidth = size * stroke;
    ctx.strokeText(text, x, y + size * drop);
    ctx.fillText(text, x, y + size * drop);
  }
  if (outline) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = size * stroke;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** Five-point star path centred at (x, y). */
export function starPath(ctx, x, y, r, inner = 0.48, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + rot + (i * Math.PI) / 5;
    const rr = i % 2 ? r * inner : r;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** Crosshair roundel logo (target + spanner-ish tick marks) used on the van and flyers. */
export function drawTargetLogo(ctx, x, y, r, { ring = P.sunflower, centre = P.tomato, ink = P.ink, letter = 'J' } = {}) {
  ctx.save();
  ctx.lineWidth = r * 0.12;
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.arc(x, y + r * 0.08, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ring;
  ctx.strokeStyle = ink;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = P.white;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.68, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = centre;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // cross ticks
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 0.1;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r * 0.74, y + Math.sin(a) * r * 0.74);
    ctx.lineTo(x + Math.cos(a) * r * 1.18, y + Math.sin(a) * r * 1.18);
    ctx.stroke();
  }
  if (letter) {
    const s = fitFont(ctx, letter, r * 0.7, r * 0.72);
    stickerText(ctx, letter, x, y + s * 0.04, { fill: P.white, size: s, stroke: 0.22, drop: 0.06 });
  }
  ctx.restore();
}

/** Deterministic little speckle noise (paper grain, cork, chalk dust). */
export function speckle(ctx, w, h, n, colors, rng, { min = 1, max = 3, alpha = 0.25 } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[i % colors.length];
    const r = min + rng() * (max - min);
    ctx.beginPath();
    ctx.arc(rng() * w, rng() * h, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Decal quad geometry (position, normal, uv) for one atlas region, facing +Z, centred at the
 * origin, w x h metres. region = [u0, v0, u1, v1] in canvas-pixel fractions (top-left origin).
 */
export function decalQuad(w, h, region = [0, 0, 1, 1], t) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  const [u0, v0, u1, v1] = region;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    uv.setXY(i, u0 + (u1 - u0) * u, 1 - (v0 + (v1 - v0) * (1 - v)));
  }
  if (t) g.applyMatrix4(t);
  return g;
}
