// Painted canvas textures for the office: one decor atlas (chalkboard, map, posters, calendar,
// clock face, signs, sticky notes, cork), a repeating wallpaper, and per-level job flyers.
import * as THREE from 'three';
import { P } from '../gfx/palette.js';
import { mulberry32 } from '../core/rng.js';
import {
  canvasTexture, roundRect, fitFont, stickerText, starPath, drawTargetLogo, speckle, FONT_UI, FONT_HAND,
} from '../world/perch/paint.js';

const INK = P.ink;
const PAPER = '#fff8ee';

// ------------------------------------------------------------------ small drawing helpers
function hand(ctx, text, x, y, size, color = INK, { align = 'center', weight = 400, maxW } = {}) {
  ctx.font = `${weight} ${size}px ${FONT_HAND}`;
  if (maxW) {
    const w = ctx.measureText(text).width;
    if (w > maxW) ctx.font = `${weight} ${Math.floor((size * maxW) / w)}px ${FONT_HAND}`;
  }
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

function title(ctx, text, x, y, maxW, maxH, fill, opts = {}) {
  const s = fitFont(ctx, text, maxW, maxH, { weight: 700 });
  stickerText(ctx, text, x, y, { fill, size: s, stroke: 0.2, drop: 0.07, ...opts });
  return s;
}

/** Chalk lettering: several jittered, semi-transparent passes = dusty chalk. */
function chalk(ctx, text, x, y, size, color, rng, { align = 'left', family = FONT_HAND, weight = 400 } = {}) {
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  for (let i = 0; i < 4; i++) {
    ctx.globalAlpha = i === 0 ? 0.9 : 0.25;
    ctx.fillText(text, x + (rng() - 0.5) * size * 0.05, y + (rng() - 0.5) * size * 0.05);
  }
  ctx.globalAlpha = 1;
}

function chalkLine(ctx, pts, color, width, rng) {
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let k = 0; k < 3; k++) {
    ctx.globalAlpha = k ? 0.3 : 0.85;
    ctx.lineWidth = width * (k ? 1.3 : 1);
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      const jx = x + (rng() - 0.5) * width * 0.4, jy = y + (rng() - 0.5) * width * 0.4;
      if (i) ctx.lineTo(jx, jy); else ctx.moveTo(jx, jy);
    });
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function inkStroke(ctx, w = 6) {
  ctx.strokeStyle = INK;
  ctx.lineWidth = w;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

function blob(ctx, x, y, rx, ry, fill, w = 6) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (w) inkStroke(ctx, w);
}

function paperBg(ctx, w, h, color = PAPER, seed = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(120,90,40,0.10)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, Math.round((w * h) / 900), ['#a08060', '#ffffff'], mulberry32(seed), { min: 0.6, max: 1.6, alpha: 0.12 });
}

// ------------------------------------------------------------------ doodles (flyers, map, posters)
function house(ctx, x, y, s, wall, roof) {
  ctx.beginPath();
  ctx.rect(x - s * 0.5, y - s * 0.6, s, s * 0.6);
  ctx.fillStyle = wall;
  ctx.fill();
  inkStroke(ctx, s * 0.06);
  ctx.beginPath();
  ctx.moveTo(x - s * 0.62, y - s * 0.58);
  ctx.lineTo(x, y - s * 1.08);
  ctx.lineTo(x + s * 0.62, y - s * 0.58);
  ctx.closePath();
  ctx.fillStyle = roof;
  ctx.fill();
  inkStroke(ctx, s * 0.06);
  ctx.beginPath();
  ctx.rect(x - s * 0.1, y - s * 0.3, s * 0.2, s * 0.3);
  ctx.fillStyle = P.cobalt;
  ctx.fill();
  inkStroke(ctx, s * 0.04);
  ctx.beginPath();
  ctx.rect(x + s * 0.18, y - s * 0.45, s * 0.18, s * 0.14);
  ctx.fillStyle = '#bfe3ff';
  ctx.fill();
  inkStroke(ctx, s * 0.035);
}

function tree(ctx, x, y, s, c = '#5fae44') {
  ctx.beginPath();
  ctx.rect(x - s * 0.07, y - s * 0.35, s * 0.14, s * 0.35);
  ctx.fillStyle = P.woodDark;
  ctx.fill();
  inkStroke(ctx, s * 0.05);
  blob(ctx, x, y - s * 0.62, s * 0.34, s * 0.34, c, s * 0.05);
}

function duck(ctx, x, y, s) {
  blob(ctx, x, y, s * 0.42, s * 0.26, P.sunflower, s * 0.06);
  blob(ctx, x + s * 0.3, y - s * 0.32, s * 0.2, s * 0.2, P.sunflower, s * 0.06);
  ctx.beginPath();
  ctx.moveTo(x + s * 0.46, y - s * 0.34);
  ctx.lineTo(x + s * 0.66, y - s * 0.3);
  ctx.lineTo(x + s * 0.47, y - s * 0.24);
  ctx.closePath();
  ctx.fillStyle = P.tangerine;
  ctx.fill();
  inkStroke(ctx, s * 0.04);
  blob(ctx, x + s * 0.34, y - s * 0.36, s * 0.035, s * 0.035, INK, 0);
}

function boat(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x - s * 0.55, y - s * 0.2);
  ctx.lineTo(x + s * 0.55, y - s * 0.2);
  ctx.lineTo(x + s * 0.38, y + s * 0.08);
  ctx.lineTo(x - s * 0.4, y + s * 0.08);
  ctx.closePath();
  ctx.fillStyle = P.tomato;
  ctx.fill();
  inkStroke(ctx, s * 0.05);
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.22);
  ctx.lineTo(x, y - s * 0.95);
  inkStroke(ctx, s * 0.05);
  ctx.beginPath();
  ctx.moveTo(x + s * 0.03, y - s * 0.9);
  ctx.lineTo(x + s * 0.45, y - s * 0.3);
  ctx.lineTo(x + s * 0.03, y - s * 0.3);
  ctx.closePath();
  ctx.fillStyle = PAPER;
  ctx.fill();
  inkStroke(ctx, s * 0.045);
}

function lighthouse(ctx, x, y, s) {
  for (let i = 0; i < 4; i++) {
    const y0 = y - i * s * 0.22;
    const w0 = s * (0.2 - i * 0.02), w1 = s * (0.18 - i * 0.02);
    ctx.beginPath();
    ctx.moveTo(x - w0, y0);
    ctx.lineTo(x + w0, y0);
    ctx.lineTo(x + w1, y0 - s * 0.22);
    ctx.lineTo(x - w1, y0 - s * 0.22);
    ctx.closePath();
    ctx.fillStyle = i % 2 ? PAPER : P.tomato;
    ctx.fill();
    inkStroke(ctx, s * 0.04);
  }
  blob(ctx, x, y - s * 0.98, s * 0.11, s * 0.1, P.sunflower, s * 0.04);
}

function cow(ctx, x, y, s) {
  blob(ctx, x, y, s * 0.46, s * 0.28, PAPER, s * 0.05);
  blob(ctx, x - s * 0.12, y - s * 0.04, s * 0.12, s * 0.09, INK, 0);
  blob(ctx, x + s * 0.2, y + s * 0.06, s * 0.09, s * 0.07, INK, 0);
  blob(ctx, x + s * 0.48, y - s * 0.18, s * 0.2, s * 0.17, PAPER, s * 0.05);
  blob(ctx, x + s * 0.56, y - s * 0.11, s * 0.13, s * 0.08, P.bubblegum, s * 0.04);
  for (const dx of [-0.3, -0.1, 0.12, 0.3]) {
    ctx.beginPath();
    ctx.moveTo(x + dx * s, y + s * 0.2);
    ctx.lineTo(x + dx * s, y + s * 0.42);
    inkStroke(ctx, s * 0.07);
  }
}

function barn(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x - s * 0.5, y);
  ctx.lineTo(x - s * 0.5, y - s * 0.55);
  ctx.lineTo(x, y - s * 0.9);
  ctx.lineTo(x + s * 0.5, y - s * 0.55);
  ctx.lineTo(x + s * 0.5, y);
  ctx.closePath();
  ctx.fillStyle = P.tomato;
  ctx.fill();
  inkStroke(ctx, s * 0.05);
  ctx.beginPath();
  ctx.rect(x - s * 0.18, y - s * 0.4, s * 0.36, s * 0.4);
  ctx.fillStyle = PAPER;
  ctx.fill();
  inkStroke(ctx, s * 0.04);
  ctx.beginPath();
  ctx.moveTo(x - s * 0.18, y - s * 0.4);
  ctx.lineTo(x + s * 0.18, y);
  ctx.moveTo(x + s * 0.18, y - s * 0.4);
  ctx.lineTo(x - s * 0.18, y);
  inkStroke(ctx, s * 0.035);
}

function fountain(ctx, x, y, s) {
  ctx.beginPath();
  ctx.ellipse(x, y, s * 0.5, s * 0.14, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#5fd0f5';
  ctx.fill();
  inkStroke(ctx, s * 0.05);
  ctx.beginPath();
  ctx.rect(x - s * 0.07, y - s * 0.42, s * 0.14, s * 0.4);
  ctx.fillStyle = P.stone;
  ctx.fill();
  inkStroke(ctx, s * 0.04);
  ctx.strokeStyle = '#5fd0f5';
  ctx.lineWidth = s * 0.05;
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x, y - s * 0.44);
    ctx.quadraticCurveTo(x + d * s * 0.3, y - s * 0.85, x + d * s * 0.42, y - s * 0.1);
    ctx.stroke();
  }
}

function target(ctx, x, y, s) {
  drawTargetLogo(ctx, x, y, s * 0.45, { letter: '' });
}

function plane(ctx, x, y, s) {
  blob(ctx, x, y, s * 0.55, s * 0.12, P.white, s * 0.05);
  ctx.beginPath();
  ctx.moveTo(x - s * 0.1, y);
  ctx.lineTo(x + s * 0.12, y - s * 0.45);
  ctx.lineTo(x + s * 0.25, y - s * 0.45);
  ctx.lineTo(x + s * 0.15, y);
  ctx.closePath();
  ctx.fillStyle = P.tomato;
  ctx.fill();
  inkStroke(ctx, s * 0.04);
}

export const THEMES = {
  village: { color: P.sunflower, draw: (ctx, x, y, s) => { house(ctx, x - s * 0.62, y, s * 0.62, P.wallPeach, P.roofTerracotta); tree(ctx, x + s * 0.72, y, s * 0.6); fountain(ctx, x + s * 0.08, y, s * 0.55); } },
  harbour: { color: P.teal, draw: (ctx, x, y, s) => { ctx.fillStyle = '#5fd0f5'; ctx.fillRect(x - s * 1.2, y - s * 0.05, s * 2.4, s * 0.35); boat(ctx, x - s * 0.3, y, s * 0.7); lighthouse(ctx, x + s * 0.72, y + s * 0.05, s * 0.8); } },
  farm: { color: P.tomato, draw: (ctx, x, y, s) => { barn(ctx, x - s * 0.55, y, s * 0.8); cow(ctx, x + s * 0.4, y - s * 0.12, s * 0.62); } },
  park: { color: P.lime, draw: (ctx, x, y, s) => { ctx.beginPath(); ctx.ellipse(x, y - s * 0.05, s * 0.95, s * 0.28, 0, 0, Math.PI * 2); ctx.fillStyle = '#5fd0f5'; ctx.fill(); inkStroke(ctx, s * 0.05); duck(ctx, x - s * 0.25, y - s * 0.12, s * 0.55); tree(ctx, x + s * 0.8, y - s * 0.1, s * 0.62); } },
  airfield: { color: P.cobalt, draw: (ctx, x, y, s) => { plane(ctx, x, y - s * 0.3, s); tree(ctx, x - s * 0.8, y, s * 0.5); } },
  range: { color: P.violet, draw: (ctx, x, y, s) => { target(ctx, x, y - s * 0.3, s * 1.1); } },
};

export function themeFor(def) {
  const k = `${def.id} ${def.name} ${def.location || ''}`.toLowerCase();
  if (/harbou?r|bay|sea|port/.test(k)) return 'harbour';
  if (/farm|barn/.test(k)) return 'farm';
  if (/park|pond|pickle/.test(k)) return 'park';
  if (/air|plane/.test(k)) return 'airfield';
  if (/test|range|dev/.test(k)) return 'range';
  return 'village';
}

const GRADE_COLORS = { S: '#e39b1b', A: '#2e9e4f', B: P.cobalt, C: P.tangerine, D: '#8a8fa0' };
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function stamp(ctx, x, y, r, letter, color, rng, rot = -0.25) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = r * 0.05;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = `700 ${Math.round(r * 1.15)}px ${FONT_UI}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 0, r * 0.06);
  // worn ink: knock out random speckles
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 70; i++) {
    ctx.globalAlpha = 0.5 + rng() * 0.5;
    ctx.beginPath();
    ctx.arc((rng() - 0.5) * r * 2.2, (rng() - 0.5) * r * 2.2, 1 + rng() * r * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Job flyer painter. data = { def, rec: { grade, stars }, locked, need, teaser } (mutable; call
 * tex.userData.repaint() after changing it).
 */
export function flyerTexture(data) {
  return canvasTexture(512, 660, (ctx, w, h) => {
    const { def, rec = {}, locked, need = 0, teaser } = data;
    const th = THEMES[themeFor(def)];
    const rng = mulberry32(def.id.length * 977 + (def.name.charCodeAt(0) || 1));
    paperBg(ctx, w, h, PAPER, def.id.length + 3);
    // header band
    ctx.fillStyle = th.color;
    ctx.fillRect(0, 0, w, 116);
    ctx.fillStyle = 'rgba(43,43,58,0.18)';
    ctx.fillRect(0, 110, w, 8);
    title(ctx, teaser ? 'COMING SOON' : 'ODD JOB!', w / 2, 60, w - 70, 74, PAPER);
    // doodle frame
    ctx.fillStyle = '#e8f6ff';
    roundRect(ctx, 36, 138, w - 72, 214, 18);
    ctx.fill();
    ctx.fillStyle = '#9bd86a';
    ctx.fillRect(38, 300, w - 76, 50);
    ctx.save();
    roundRect(ctx, 36, 138, w - 72, 214, 18);
    ctx.clip();
    th.draw(ctx, w / 2, 316, 150);
    ctx.restore();
    ctx.lineWidth = 6;
    ctx.strokeStyle = INK;
    roundRect(ctx, 36, 138, w - 72, 214, 18);
    ctx.stroke();
    // name + location
    const ns = fitFont(ctx, def.name, w - 60, 62);
    stickerText(ctx, def.name, w / 2, 398, { fill: INK, outline: null, shadow: null, size: ns });
    hand(ctx, def.location || '', w / 2, 446, 38, '#5a5a70', { maxW: w - 80 });
    // stars (4 = 3 for grade + 1 for golden spanners)
    for (let i = 0; i < 4; i++) {
      const x = w / 2 + (i - 1.5) * 62, y = 500;
      starPath(ctx, x, y, 26);
      ctx.fillStyle = i < (rec.stars || 0) ? P.sunflower : '#e9e1cf';
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
    if (!teaser) hand(ctx, `Par ${fmtTime(def.parTime || 180)}`, 110, 552, 34, INK);
    // tear-off tabs
    ctx.setLineDash([8, 7]);
    ctx.strokeStyle = '#b9ab90';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, 584);
    ctx.lineTo(w, 584);
    ctx.stroke();
    for (let i = 1; i < 7; i++) {
      ctx.beginPath();
      ctx.moveTo((i * w) / 7, 584);
      ctx.lineTo((i * w) / 7, h);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    for (let i = 0; i < 7; i++) {
      ctx.save();
      ctx.translate(((i + 0.5) * w) / 7, 624);
      ctx.rotate(-Math.PI / 2);
      hand(ctx, '4-2-0-0', 0, 0, 22, '#6a6a80');
      ctx.restore();
    }
    // grade stamp (best result)
    if (rec.grade && !locked) stamp(ctx, w - 108, 540, 58, rec.grade, GRADE_COLORS[rec.grade] || INK, rng, -0.3);
    else if (!locked && !teaser) {
      ctx.save();
      ctx.translate(w - 104, 546);
      ctx.rotate(0.12);
      ctx.fillStyle = P.tomato;
      roundRect(ctx, -70, -26, 140, 52, 14);
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = INK;
      ctx.stroke();
      title(ctx, 'NEW!', 0, 1, 110, 38, PAPER, { drop: 0.05 });
      ctx.restore();
    }
    if (locked || teaser) {
      ctx.fillStyle = 'rgba(70,74,96,0.42)';
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.translate(w / 2, teaser ? 430 : 470);
      ctx.rotate(-0.16);
      ctx.fillStyle = teaser ? P.cobalt : P.tomato;
      roundRect(ctx, -200, -44, 400, 88, 18);
      ctx.fill();
      ctx.lineWidth = 7;
      ctx.strokeStyle = INK;
      ctx.stroke();
      const label = teaser ? 'SOON!' : `NEEDS ${need} ★`;
      title(ctx, label, 0, 2, 350, 56, PAPER);
      ctx.restore();
    }
  }, { anisotropy: 8 });
}

// ------------------------------------------------------------------ wallpaper (repeating)
export function wallpaperTexture() {
  const tex = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#fbeed2';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f3dfb8';
    for (let x = 0; x < w; x += 64) ctx.fillRect(x + 22, 0, 20, h);
    ctx.fillStyle = '#e7c98f';
    for (let x = 0; x < w; x += 64) ctx.fillRect(x + 30, 0, 4, h);
    // little flower sprigs between stripes
    const rng = mulberry32(7);
    for (let y = 16; y < h; y += 64) {
      for (let x = 0; x < w; x += 64) {
        const cx = x + 8 + (Math.floor(y / 64) % 2) * 0, cy = y + (Math.floor(x / 64) % 2) * 32;
        ctx.fillStyle = ['#ff9f8e', '#8ecfbf', '#ffc93c'][Math.floor(rng() * 3)];
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * 4, cy + Math.sin(a) * 4, 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#fff8ee';
        ctx.beginPath();
        ctx.arc(cx, cy, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, { repeat: true });
  return tex;
}

// ------------------------------------------------------------------ decor atlas
const REGIONS = {
  chalk: [768, 512], map: [576, 416], cork: [512, 288], safety: [320, 416], portrait: [288, 352], calendar: [256, 320],
  lostcat: [256, 336], clock: [256, 256], note1: [192, 192], note2: [192, 192], note3: [192, 192], postcard: [320, 208],
  jobs: [768, 128], workshop: [512, 128], door: [256, 128], nameplate: [320, 80], dial: [256, 72],
  drawer0: [256, 84], drawer1: [256, 84], drawer2: [256, 84], sampler: [288, 224],
};

function pack(W) {
  const out = {};
  const list = Object.entries(REGIONS).sort((a, b) => b[1][1] - a[1][1]);
  let x = 0, y = 0, rowH = 0;
  for (const [name, [w, h]] of list) {
    if (x + w > W) { x = 0; y += rowH + 4; rowH = 0; }
    out[name] = [x, y, w, h];
    x += w + 4;
    rowH = Math.max(rowH, h);
  }
  return { rects: out, height: y + rowH };
}

function drawChalk(ctx, [x0, y0, w, h], rng) {
  ctx.save();
  ctx.translate(x0, y0);
  ctx.fillStyle = '#2f5a4e';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 18; i++) {
    const g = ctx.createRadialGradient(rng() * w, rng() * h, 0, rng() * w, rng() * h, 60 + rng() * 140);
    g.addColorStop(0, 'rgba(255,255,255,0.06)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  chalk(ctx, 'MODES', 40, 64, 76, '#ffe590', rng, { family: FONT_UI, weight: 700 });
  chalkLine(ctx, [[40, 110], [120, 104], [200, 112], [270, 104]], '#ffe590', 6, rng);
  const rows = [['Contracts', true], ['Time Attack', false], ['Ammo Hunt', false], ['Snapshot', false]];
  rows.forEach(([name, on], i) => {
    const y = 170 + i * 72;
    chalkLine(ctx, [[48, y - 16], [78, y - 16], [78, y + 14], [48, y + 14], [48, y - 16]], '#fff8ee', 4, rng);
    if (on) chalkLine(ctx, [[50, y - 2], [62, y + 12], [90, y - 28]], '#9be38a', 6, rng);
    chalk(ctx, name, 100, y, 50, '#fff8ee', rng);
    if (!on) chalk(ctx, '… soon!', 400, y + 4, 40, '#ffb3c7', rng);
  });
  // doodle: Inspector Pidge + tally
  const px = 640, py = 380;
  ctx.strokeStyle = '#dfe9ff';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(px, py, 58, 46, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(px + 22, py - 58, 30, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(px + 50, py - 60);
  ctx.lineTo(px + 72, py - 54);
  ctx.lineTo(px + 50, py - 48);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(px - 8, py - 84);
  ctx.quadraticCurveTo(px + 22, py - 110, px + 52, py - 84);
  ctx.lineTo(px - 8, py - 84);
  ctx.stroke();
  chalk(ctx, 'Pidge is', 560, 470, 30, '#dfe9ff', rng);
  chalk(ctx, 'watching...', 560, 498, 30, '#dfe9ff', rng);
  ctx.restore();
}

function drawMap(ctx, [x0, y0, w, h], rng) {
  ctx.save();
  ctx.translate(x0, y0);
  paperBg(ctx, w, h, '#f4ead0', 11);
  ctx.fillStyle = '#bfe3a0';
  roundRect(ctx, 20, 60, w - 40, h - 80, 16);
  ctx.fill();
  // sea in the corner + river
  ctx.fillStyle = '#8fd8f2';
  ctx.beginPath();
  ctx.moveTo(w - 20, 200);
  ctx.quadraticCurveTo(w - 150, 260, w - 120, h - 20);
  ctx.lineTo(w - 20, h - 20);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#6cc6ea';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(40, 120);
  ctx.bezierCurveTo(180, 170, 250, 120, 330, 230);
  ctx.bezierCurveTo(380, 300, 430, 300, w - 130, 320);
  ctx.stroke();
  // dashed roads
  ctx.setLineDash([12, 10]);
  ctx.strokeStyle = '#b08a5a';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(110, 300);
  ctx.lineTo(260, 250);
  ctx.lineTo(440, 180);
  ctx.moveTo(260, 250);
  ctx.lineTo(300, 360);
  ctx.stroke();
  ctx.setLineDash([]);
  house(ctx, 110, 300, 48, P.wallPeach, P.roofTerracotta);
  boat(ctx, w - 70, 300, 50);
  barn(ctx, 450, 190, 56);
  duck(ctx, 290, 370, 40);
  tree(ctx, 190, 200, 44);
  tree(ctx, 370, 120, 40);
  for (const [x, y] of [[110, 244], [w - 70, 246], [450, 124], [300, 340]]) {
    blob(ctx, x, y, 11, 11, P.tomato, 4);
  }
  title(ctx, 'MUDDLECOMBE', w / 2, 34, w - 80, 44, P.sunflower);
  // compass
  ctx.save();
  ctx.translate(58, h - 58);
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.arc(0, 0, 30, 0, Math.PI * 2);
  ctx.fill();
  inkStroke(ctx, 4);
  ctx.fillStyle = P.tomato;
  ctx.beginPath();
  ctx.moveTo(0, -26);
  ctx.lineTo(8, 0);
  ctx.lineTo(-8, 0);
  ctx.closePath();
  ctx.fill();
  hand(ctx, 'N', 0, 14, 20, INK);
  ctx.restore();
  ctx.restore();
}

function drawCork(ctx, [x0, y0, w, h], rng) {
  ctx.save();
  ctx.translate(x0, y0);
  ctx.fillStyle = '#c99a62';
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, 2600, ['#a8743f', '#e0b47a', '#8f5f30', '#f0c890'], rng, { min: 0.8, max: 2.4, alpha: 0.55 });
  speckle(ctx, w, h, 60, ['#6d4424'], rng, { min: 1.2, max: 1.8, alpha: 0.5 });
  ctx.restore();
}

function drawSafety(ctx, [x0, y0, w, h], rng) {
  ctx.save();
  ctx.translate(x0, y0);
  paperBg(ctx, w, h, '#fff4c8', 5);
  ctx.fillStyle = P.tomato;
  ctx.fillRect(0, 0, w, 84);
  title(ctx, 'SAFETY FIRST!', w / 2, 44, w - 40, 46, PAPER);
  // pigeon in goggles
  blob(ctx, w / 2, 250, 86, 70, '#9aa7c7', 6);
  blob(ctx, w / 2 + 20, 170, 50, 48, '#b3bdd6', 6);
  blob(ctx, w / 2 + 4, 164, 18, 16, '#dff4ff', 5);
  blob(ctx, w / 2 + 40, 164, 18, 16, '#dff4ff', 5);
  ctx.beginPath();
  ctx.moveTo(w / 2 + 64, 176);
  ctx.lineTo(w / 2 + 94, 184);
  ctx.lineTo(w / 2 + 64, 192);
  ctx.closePath();
  ctx.fillStyle = '#3d3d4f';
  ctx.fill();
  hand(ctx, 'Always check', w / 2, 346, 34, INK);
  hand(ctx, 'your target!', w / 2, 382, 34, INK);
  ctx.restore();
}

function drawPortrait(ctx, [x0, y0, w, h], rng) {
  ctx.save();
  ctx.translate(x0, y0);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#bfe3ff');
  g.addColorStop(1, '#ffe7b0');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Jack: bean body, big head, cobalt cap, grin, thumbs up
  blob(ctx, w / 2, 300, 92, 78, P.cobalt, 6);
  blob(ctx, w / 2, 170, 84, 80, P.skin[1], 6);
  ctx.beginPath();
  ctx.moveTo(w / 2 - 88, 140);
  ctx.quadraticCurveTo(w / 2, 50, w / 2 + 88, 140);
  ctx.closePath();
  ctx.fillStyle = P.cobalt;
  ctx.fill();
  inkStroke(ctx, 6);
  ctx.beginPath();
  ctx.ellipse(w / 2 + 66, 142, 56, 14, 0.1, 0, Math.PI * 2);
  ctx.fillStyle = '#2c55c2';
  ctx.fill();
  inkStroke(ctx, 5);
  blob(ctx, w / 2 - 12, 118, 12, 12, P.sunflower, 4);
  for (const dx of [-30, 26]) {
    blob(ctx, w / 2 + dx, 176, 16, 20, PAPER, 5);
    blob(ctx, w / 2 + dx + 3, 180, 7, 9, INK, 0);
  }
  ctx.beginPath();
  ctx.arc(w / 2, 206, 34, 0.15 * Math.PI, 0.85 * Math.PI);
  inkStroke(ctx, 6);
  blob(ctx, w / 2 + 104, 268, 26, 22, P.tangerine, 5);
  ctx.beginPath();
  ctx.ellipse(w / 2 + 108, 236, 9, 20, 0, 0, Math.PI * 2);
  ctx.fillStyle = P.tangerine;
  ctx.fill();
  inkStroke(ctx, 4);
  ctx.fillStyle = PAPER;
  roundRect(ctx, 16, h - 60, w - 32, 48, 10);
  ctx.fill();
  inkStroke(ctx, 4);
  title(ctx, 'EMPLOYEE OF THE MONTH', w / 2, h - 36, w - 56, 26, P.sunflower, { drop: 0.05 });
  ctx.restore();
}

function drawCalendar(ctx, [x0, y0, w, h]) {
  ctx.save();
  ctx.translate(x0, y0);
  paperBg(ctx, w, h, PAPER, 3);
  const d = new Date();
  const months = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  ctx.fillStyle = P.tomato;
  ctx.fillRect(0, 0, w, 78);
  title(ctx, months[d.getMonth()], w / 2, 42, w - 30, 40, PAPER);
  const s = fitFont(ctx, String(d.getDate()), w - 60, 150);
  stickerText(ctx, String(d.getDate()), w / 2, 180, { fill: INK, outline: null, shadow: null, size: s });
  hand(ctx, days[d.getDay()], w / 2, 262, 36, '#5a5a70');
  ctx.fillStyle = '#e8dcc3';
  for (let i = 0; i < 3; i++) ctx.fillRect(10, h - 30 + i * 8, w - 20, 3);
  ctx.restore();
}

function drawLostCat(ctx, [x0, y0, w, h]) {
  ctx.save();
  ctx.translate(x0, y0);
  paperBg(ctx, w, h, PAPER, 9);
  title(ctx, 'LOST CAT', w / 2, 42, w - 30, 46, P.tomato);
  // ginger cat face
  blob(ctx, w / 2, 170, 70, 60, '#f0a04a', 6);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(w / 2 + s * 60, 140);
    ctx.lineTo(w / 2 + s * 52, 86);
    ctx.lineTo(w / 2 + s * 22, 118);
    ctx.closePath();
    ctx.fillStyle = '#f0a04a';
    ctx.fill();
    inkStroke(ctx, 5);
    ctx.beginPath();
    ctx.moveTo(w / 2 + s * 14, 164);
    ctx.lineTo(w / 2 + s * 34, 164);
    inkStroke(ctx, 6);
  }
  blob(ctx, w / 2, 186, 7, 5, P.bubblegum, 3);
  hand(ctx, 'Answers to', w / 2, 262, 30, INK);
  hand(ctx, '"Biscuit"', w / 2, 296, 34, P.tomato);
  ctx.restore();
}

function drawClock(ctx, [x0, y0, w, h]) {
  ctx.save();
  ctx.translate(x0 + w / 2, y0 + h / 2);
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.arc(0, 0, w / 2 - 2, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const big = i % 3 === 0;
    ctx.fillStyle = big ? P.tomato : INK;
    ctx.beginPath();
    ctx.arc(Math.sin(a) * 96, -Math.cos(a) * 96, big ? 10 : 5, 0, Math.PI * 2);
    ctx.fill();
  }
  hand(ctx, "Jack's", 0, 50, 28, '#8a8fa0');
  ctx.restore();
}

function drawNote(ctx, [x0, y0, w, h], color, lines, rot, rng) {
  ctx.save();
  ctx.translate(x0, y0);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  ctx.fillRect(0, 0, w, 24);
  lines.forEach((t, i) => hand(ctx, t, w / 2, 70 + i * 44, 36, INK, { maxW: w - 20 }));
  ctx.restore();
}

function drawPostcard(ctx, [x0, y0, w, h]) {
  ctx.save();
  ctx.translate(x0, y0);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#8fd0ff');
  g.addColorStop(0.55, '#d9f0ff');
  g.addColorStop(0.56, '#3fb6e6');
  g.addColorStop(1, '#1e88c8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  boat(ctx, 110, 150, 70);
  lighthouse(ctx, 250, 160, 90);
  ctx.lineWidth = 10;
  ctx.strokeStyle = PAPER;
  ctx.strokeRect(5, 5, w - 10, h - 10);
  title(ctx, 'Greetings!', w / 2, 36, w - 60, 34, P.sunflower);
  ctx.restore();
}

function drawSign(ctx, [x0, y0, w, h], text, bg, fg, icon) {
  ctx.save();
  ctx.translate(x0, y0);
  ctx.fillStyle = INK;
  roundRect(ctx, 2, 2, w - 4, h - 4, h * 0.3);
  ctx.fill();
  ctx.fillStyle = bg;
  roundRect(ctx, 9, 9, w - 18, h - 18, h * 0.24);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,248,238,0.6)';
  ctx.lineWidth = 3;
  roundRect(ctx, 17, 17, w - 34, h - 34, h * 0.16);
  ctx.stroke();
  const pad = icon ? h * 0.9 : h * 0.35;
  if (icon) {
    for (const x of [h * 0.52, w - h * 0.52]) {
      ctx.fillStyle = fg;
      starPath(ctx, x, h / 2, h * 0.22);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
  }
  title(ctx, text, w / 2, h / 2 + 2, w - pad * 2, h * 0.62, fg);
  ctx.restore();
}

function drawDrawer(ctx, [x0, y0, w, h], text, cog) {
  ctx.save();
  ctx.translate(x0, y0);
  paperBg(ctx, w, h, PAPER, 4);
  ctx.strokeStyle = '#9aa3b2';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, w - 8, h - 8);
  if (cog) {
    ctx.save();
    ctx.translate(44, h / 2);
    ctx.fillStyle = P.cobalt;
    for (let i = 0; i < 8; i++) {
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-6, -26, 12, 14);
    }
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  const s = fitFont(ctx, text, w - (cog ? 100 : 40), h * 0.52);
  stickerText(ctx, text, cog ? w / 2 + 28 : w / 2, h / 2 + 2, { fill: cog ? P.cobalt : INK, outline: null, shadow: null, size: s });
  ctx.restore();
}

function drawDial(ctx, [x0, y0, w, h]) {
  ctx.save();
  ctx.translate(x0, y0);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#ffe9a8');
  g.addColorStop(1, '#ffc75a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  for (let i = 0; i <= 20; i++) {
    const x = 16 + (i / 20) * (w - 32);
    ctx.beginPath();
    ctx.moveTo(x, 10);
    ctx.lineTo(x, i % 5 ? 22 : 30);
    ctx.stroke();
  }
  hand(ctx, '88   96   104', w / 2, 52, 26, INK);
  ctx.fillStyle = P.tomato;
  ctx.fillRect(w * 0.62, 4, 5, h - 8);
  ctx.restore();
}

function drawSampler(ctx, [x0, y0, w, h], rng) {
  ctx.save();
  ctx.translate(x0, y0);
  paperBg(ctx, w, h, '#f5ecd8', 13);
  ctx.strokeStyle = P.tomato;
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 4;
  ctx.strokeRect(14, 14, w - 28, h - 28);
  ctx.setLineDash([]);
  hand(ctx, 'No job too small,', w / 2, 76, 36, P.cobalt);
  hand(ctx, 'no shot too long!', w / 2, 118, 36, P.cobalt);
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i % 2 ? P.tomato : '#5fae44';
    ctx.beginPath();
    ctx.arc(w / 2 + (i - 2) * 36, 170, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

let atlas = null;
/** Shared office decor atlas: { texture, material, uv(name), rect(name) }. */
export function decorAtlas() {
  if (atlas) return atlas;
  const W = 2048;
  const { rects, height } = pack(W);
  const H = 2 ** Math.ceil(Math.log2(height));
  const texture = canvasTexture(W, H, (ctx) => {
    const rng = mulberry32(42);
    drawChalk(ctx, rects.chalk, rng);
    drawMap(ctx, rects.map, rng);
    drawCork(ctx, rects.cork, rng);
    drawSafety(ctx, rects.safety, rng);
    drawPortrait(ctx, rects.portrait, rng);
    drawCalendar(ctx, rects.calendar);
    drawLostCat(ctx, rects.lostcat);
    drawClock(ctx, rects.clock);
    drawNote(ctx, rects.note1, '#fff27a', ['Buy', 'birdseed!!'], 0, rng);
    drawNote(ctx, rects.note2, '#ffb8d2', ['Mrs Pebble', 'AGAIN?'], 0, rng);
    drawNote(ctx, rects.note3, '#b8e7ff', ['Oil the', 'rifle :)'], 0, rng);
    drawPostcard(ctx, rects.postcard);
    drawSign(ctx, rects.jobs, 'ODD JOBS', P.cobalt, P.sunflower, true);
    drawSign(ctx, rects.workshop, 'WORKSHOP', P.teal, PAPER, false);
    drawSign(ctx, rects.door, 'OPEN', P.tomato, PAPER, false);
    drawSign(ctx, rects.nameplate, 'JACK · BOSS', '#7a4a26', P.sunflower, false);
    drawDial(ctx, rects.dial);
    drawDrawer(ctx, rects.drawer0, 'SETTINGS', true);
    drawDrawer(ctx, rects.drawer1, 'BILLS', false);
    drawDrawer(ctx, rects.drawer2, 'MORE BILLS', false);
    drawSampler(ctx, rects.sampler, rng);
  });
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.75, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
  material.name = 'office-decor';
  const uv = (name) => {
    const [x, y, w, h] = rects[name];
    return [(x + 1) / W, (y + 1) / H, (x + w - 1) / W, (y + h - 1) / H];
  };
  atlas = { texture, material, uv, rects, size: [W, H] };
  return atlas;
}
