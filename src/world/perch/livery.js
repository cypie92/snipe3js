// Jack's van livery: one 1024x1024 CanvasTexture atlas (side panels, roof board, rear sticker,
// number plate, bonnet roundel, crow's-nest band) + the shared decal material.
import * as THREE from 'three';
import { P } from '../../gfx/palette.js';
import { canvasTexture, roundRect, fitFont, stickerText, drawTargetLogo, starPath, FONT_UI, FONT_HAND } from './paint.js';

const S = 1024;
// Atlas regions in pixels [x, y, w, h]
const R = {
  side: [0, 0, 1024, 320],
  front: [0, 320, 1024, 176],
  rear: [0, 496, 640, 240],
  plate: [640, 496, 384, 96],
  roundel: [640, 592, 256, 256],
  nest: [0, 736, 640, 96],
  hatch: [0, 832, 384, 128],
};

function drawSide(ctx, [x0, y0, w, h]) {
  ctx.save();
  ctx.translate(x0, y0);
  const r = 58;
  // ink outline + cobalt board + sunflower pinstripe
  ctx.fillStyle = P.ink;
  roundRect(ctx, 4, 4, w - 8, h - 8, r);
  ctx.fill();
  ctx.fillStyle = P.cobalt;
  roundRect(ctx, 16, 16, w - 32, h - 32, r - 12);
  ctx.fill();
  const grad = ctx.createLinearGradient(0, 16, 0, h - 16);
  grad.addColorStop(0, 'rgba(255,255,255,0.16)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(0,0,40,0.14)');
  ctx.fillStyle = grad;
  roundRect(ctx, 16, 16, w - 32, h - 32, r - 12);
  ctx.fill();
  ctx.strokeStyle = P.sunflower;
  ctx.lineWidth = 7;
  roundRect(ctx, 32, 32, w - 64, h - 64, r - 26);
  ctx.stroke();
  // logo
  drawTargetLogo(ctx, 170, h / 2 - 4, 104);
  // title
  let s = fitFont(ctx, "JACK'S ODD JOBS", w - 380, 96);
  stickerText(ctx, "JACK'S ODD JOBS", 318 + (w - 380) / 2, 112, { fill: P.sunflower, size: s, stroke: 0.2, drop: 0.09 });
  // slogan ribbon
  ctx.fillStyle = P.ink;
  roundRect(ctx, 318, 170, w - 380, 70, 22);
  ctx.fill();
  ctx.fillStyle = P.tomato;
  roundRect(ctx, 318, 164, w - 380, 66, 22);
  ctx.fill();
  s = fitFont(ctx, 'No job too small, no shot too long!', w - 420, 50, { weight: 400, family: FONT_HAND });
  stickerText(ctx, 'No job too small, no shot too long!', 318 + (w - 380) / 2, 198, { fill: P.white, outline: null, shadow: 'rgba(43,43,58,0.45)', size: s, drop: 0.06 });
  // phone
  s = fitFont(ctx, 'Call Muddlecombe 4-2-0-0', 420, 30, { weight: 600 });
  stickerText(ctx, 'Call Muddlecombe 4-2-0-0', 318 + (w - 380) / 2, 262, { fill: '#cfe0ff', outline: null, shadow: null, size: s });
  ctx.restore();
}

function drawFront(ctx, [x0, y0, w, h]) {
  ctx.save();
  ctx.translate(x0, y0);
  ctx.fillStyle = P.ink;
  roundRect(ctx, 4, 4, w - 8, h - 8, 48);
  ctx.fill();
  ctx.fillStyle = P.cobalt;
  roundRect(ctx, 14, 14, w - 28, h - 28, 40);
  ctx.fill();
  ctx.strokeStyle = P.sunflower;
  ctx.lineWidth = 6;
  roundRect(ctx, 28, 28, w - 56, h - 56, 28);
  ctx.stroke();
  for (const x of [92, w - 92]) {
    ctx.fillStyle = P.sunflower;
    starPath(ctx, x, h / 2, 38);
    ctx.fill();
    ctx.strokeStyle = P.ink;
    ctx.lineWidth = 6;
    ctx.stroke();
  }
  const s = fitFont(ctx, "JACK'S ODD JOBS", w - 260, 104);
  stickerText(ctx, "JACK'S ODD JOBS", w / 2, h / 2 + 2, { fill: P.white, size: s, stroke: 0.2, drop: 0.08 });
  ctx.restore();
}

function drawRear(ctx, [x0, y0, w, h]) {
  ctx.save();
  ctx.translate(x0, y0);
  ctx.fillStyle = P.ink;
  roundRect(ctx, 6, 6, w - 12, h - 12, 36);
  ctx.fill();
  ctx.fillStyle = P.white;
  roundRect(ctx, 16, 16, w - 32, h - 32, 28);
  ctx.fill();
  drawTargetLogo(ctx, 98, h / 2, 62, { letter: '' });
  let s = fitFont(ctx, "HOW'S MY AIM?", w - 230, 64);
  stickerText(ctx, "HOW'S MY AIM?", 180 + (w - 210) / 2, 82, { fill: P.tomato, size: s, stroke: 0.18, drop: 0.07 });
  s = fitFont(ctx, 'Call 4-2-0-0 · Jack’s Odd Jobs', w - 230, 40, { weight: 400, family: FONT_HAND });
  stickerText(ctx, 'Call 4-2-0-0 · Jack’s Odd Jobs', 180 + (w - 210) / 2, 160, { fill: P.ink, outline: null, shadow: null, size: s });
  ctx.restore();
}

function drawPlate(ctx, [x0, y0, w, h]) {
  ctx.save();
  ctx.translate(x0, y0);
  ctx.fillStyle = P.ink;
  roundRect(ctx, 2, 2, w - 4, h - 4, 18);
  ctx.fill();
  ctx.fillStyle = '#ffe07a';
  roundRect(ctx, 9, 9, w - 18, h - 18, 12);
  ctx.fill();
  ctx.fillStyle = P.ink;
  const s = fitFont(ctx, 'JACK 1', w - 60, 66);
  ctx.font = `700 ${s}px ${FONT_UI}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('JACK 1', w / 2, h / 2 + 3);
  ctx.restore();
}

function drawRoundel(ctx, [x0, y0, w, h]) {
  ctx.save();
  ctx.translate(x0, y0);
  drawTargetLogo(ctx, w / 2, h / 2 - 6, w * 0.4);
  ctx.restore();
}

function drawNest(ctx, [x0, y0, w, h]) {
  ctx.save();
  ctx.translate(x0, y0);
  ctx.fillStyle = P.tomato;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(43,43,58,0.25)';
  ctx.fillRect(0, h - 10, w, 10);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(0, 0, w, 8);
  for (const x of [44, w - 44]) {
    ctx.fillStyle = P.sunflower;
    starPath(ctx, x, h / 2, 26);
    ctx.fill();
    ctx.strokeStyle = P.ink;
    ctx.lineWidth = 5;
    ctx.stroke();
  }
  const s = fitFont(ctx, "JACK'S ODD JOBS", w - 160, 62);
  stickerText(ctx, "JACK'S ODD JOBS", w / 2, h / 2 + 1, { fill: P.white, size: s, stroke: 0.2, drop: 0.07 });
  ctx.restore();
}

function drawHatch(ctx, [x0, y0, w, h]) {
  // hazard-striped "MIND THE GAP" plate around the ladder hatch
  ctx.save();
  ctx.translate(x0, y0);
  ctx.fillStyle = P.sunflower;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = P.ink;
  for (let i = -4; i < 20; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 40, 0);
    ctx.lineTo(i * 40 + 20, 0);
    ctx.lineTo(i * 40 + 20 + h * 0.4, h);
    ctx.lineTo(i * 40 + h * 0.4, h);
    ctx.fill();
  }
  ctx.fillStyle = P.white;
  roundRect(ctx, 34, 26, w - 68, h - 52, 18);
  ctx.fill();
  const s = fitFont(ctx, 'MIND THE GAP!', w - 110, 52);
  stickerText(ctx, 'MIND THE GAP!', w / 2, h / 2 + 1, { fill: P.tomato, outline: P.ink, shadow: null, size: s, stroke: 0.16 });
  ctx.restore();
}

let atlas = null;
/** Shared livery atlas: { texture, material, uv(name) -> [u0, v0, u1, v1] }. */
export function liveryAtlas() {
  if (atlas) return atlas;
  const texture = canvasTexture(S, S, (ctx) => {
    drawSide(ctx, R.side);
    drawFront(ctx, R.front);
    drawRear(ctx, R.rear);
    drawPlate(ctx, R.plate);
    drawRoundel(ctx, R.roundel);
    drawNest(ctx, R.nest);
    drawHatch(ctx, R.hatch);
  });
  const material = new THREE.MeshStandardMaterial({
    map: texture, color: texture ? '#ffffff' : P.cobalt, roughness: 0.4, metalness: 0,
    alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
  });
  material.name = 'perch-livery';
  const uv = (name) => {
    const [x, y, w, h] = R[name];
    // half-texel inset avoids bleeding from neighbouring regions
    return [(x + 1) / S, (y + 1) / S, (x + w - 1) / S, (y + h - 1) / S];
  };
  atlas = { texture, material, uv, regions: R };
  return atlas;
}
