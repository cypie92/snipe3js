// Geometry kit for the "bean folk": body, head, face, hair, hats, outfits and worn accessories,
// all merged into one skinned vertex-coloured blueprint (see rig.js). Faces +Z, feet at y = 0,
// character's LEFT is +X. Blueprints are cached by config so identical people share geometry.
import * as THREE from 'three';
import { RigBuilder, G, tf, lathe, blendY, shade, mix } from './rig.js';
import { P } from '../../gfx/palette.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const M = (base, t) => base.clone().multiply(tf(t));
const smooth01 = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

// Segment budget (tuned so a typical villager is ~2.3-3k triangles in one draw call).
const Q = { body: 12, head: 14, headRows: 9, eye: [10, 7], pupil: [7, 5], lid: [10, 3], limb: [1, 7, 3], hand: [7, 5], shoe: [7, 5], hair: [11, 8], puff: [7, 5], small: [6, 4] };

export const FACE = { white: '#fbfaf4', pupil: '#262634', mouth: '#5b2333', tongue: '#ff8a95', lash: '#2b2b3a' };

/** Body dimensions derived from build factors. */
export function dims(cfg) {
  const b = cfg.build;
  const H = b.height, W = b.width, HS = b.head, L = b.legs;
  const d = { H, W, HS, L };
  d.hipY = 0.335 * H * L;
  d.bodyBottom = d.hipY - 0.085 * H;
  d.bodyH = 0.715 * H;
  d.bodyTop = d.bodyBottom + d.bodyH;
  d.waistY = d.bodyBottom + d.bodyH * 0.3;
  d.bodyR = 0.24 * W;
  d.bodyD = 0.9; // depth squash
  d.neckY = d.bodyTop - 0.035 * H;
  d.R = 0.325 * HS; // head radius
  d.Rx = d.R * 0.97;
  d.Rz = d.R * 0.94;
  d.headC = d.neckY + d.R * 0.9;
  d.headZ = 0.01;
  d.shY = d.bodyBottom + d.bodyH * 0.76;
  d.shX = d.bodyR * profR(0.76, b.belly) * 0.93;
  d.armR = 0.058 * Math.sqrt(W) * (cfg.kid ? 1.05 : 1);
  d.armLen = 0.27 * H;
  d.handR = 0.068 * (cfg.kid ? 1.05 : 1);
  d.legX = 0.1 * W;
  d.legR = 0.07 * Math.sqrt(W);
  d.ankleY = 0.075;
  d.kneeY = (d.hipY + d.ankleY) / 2;
  d.top = d.headC + d.R;
  return d;
}

// Body profile (normalised): r at height t (0 bottom .. 1 top).
const BODY = [
  [0, 0], [0.62, 0.022], [0.9, 0.085], [0.995, 0.2], [0.995, 0.36], [0.95, 0.52], [0.85, 0.68], [0.66, 0.83], [0.36, 0.95], [0, 1],
];
function profR(t, belly = 0) {
  for (let i = 0; i < BODY.length - 1; i++) {
    const [r0, y0] = BODY[i], [r1, y1] = BODY[i + 1];
    if (t >= y0 && t <= y1) {
      const r = r0 + (r1 - r0) * ((t - y0) / (y1 - y0));
      return r * (1 + belly * 0.17 * Math.exp(-(((t - 0.33) / 0.2) ** 2)));
    }
  }
  return 0;
}
function bodyProfile(d, belly, scaleR = 1, from = 0, to = 1, extra = 0) {
  const pts = [];
  for (const [, y] of BODY) if (y >= from - 1e-6 && y <= to + 1e-6) pts.push([(profR(y, belly) * d.bodyR + extra) * scaleR, y * d.bodyH]);
  return pts;
}

/** Head surface helper (head space: origin at head centre). */
function headSurf(d) {
  const { Rx, R, Rz } = d;
  return {
    z(x, y) { const k = 1 - (x / Rx) ** 2 - (y / R) ** 2; return k > 0 ? Rz * Math.sqrt(k) : 0; },
    normal(x, y) {
      const z = this.z(x, y);
      return V(x / (Rx * Rx), y / (R * R), z / (Rz * Rz)).normalize();
    },
  };
}
const qFromNormal = (n, k = 1) => new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), V(0, 0, 1).lerp(n, k).normalize());

// ---------------------------------------------------------------------------------------------
export function buildPerson(cfg) {
  const d = dims(cfg);
  const rb = new RigBuilder();
  const b = {};
  b.base = rb.bone('base', null, [0, 0, 0]);
  b.hips = rb.bone('hips', b.base, [0, d.hipY, 0]);
  b.spine = rb.bone('spine', b.hips, [0, d.waistY, 0]);
  b.head = rb.bone('head', b.spine, [0, d.neckY, 0]);
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R';
    b['arm' + S] = rb.bone('arm' + S, b.spine, [s * d.shX, d.shY, 0]);
    b['fore' + S] = rb.bone('fore' + S, b['arm' + S], [s * d.shX, d.shY - d.armLen * 0.5, 0]);
    b['hand' + S] = rb.bone('hand' + S, b['fore' + S], [s * d.shX, d.shY - d.armLen, 0]);
    b['leg' + S] = rb.bone('leg' + S, b.hips, [s * d.legX, d.hipY, 0]);
    b['shin' + S] = rb.bone('shin' + S, b['leg' + S], [s * d.legX, d.kneeY, 0]);
  }
  b.prop = rb.bone('prop', b.base, [0.3, 1.4, 0.1]);

  const C = resolveColours(cfg);
  const meta = { d, C, hatHeight: 0, hasHat: !!cfg.hat, faceZ: 0 };
  buildLegs(rb, b, d, cfg, C);
  buildBody(rb, b, d, cfg, C);
  buildArms(rb, b, d, cfg, C);
  buildHead(rb, b, d, cfg, C, meta);
  buildWorn(rb, b, d, cfg, C, meta);
  const bp = rb.build();
  bp.meta = meta;
  return bp;
}

function resolveColours(cfg) {
  const skin = cfg.skin;
  const hair = cfg.hair.color;
  return {
    skin,
    skinDark: shade(skin, 0.9, 0.04),
    lid: shade(skin, 0.94, 0.02),
    nose: cfg.face?.zinc ? '#f2f7fb' : mix(shade(skin, 0.95), '#ff8f7a', 0.12),
    blush: mix(skin, '#ff6f86', 0.5),
    hair,
    brow: shade(hair, hair === '#c8c8d0' || hair === '#f0ece4' ? 0.78 : 0.85),
    top: cfg.top.color,
    top2: cfg.top.color2 || shade(cfg.top.color, 0.8),
    sleeve: cfg.top.sleeveColor || cfg.top.color,
    bottom: cfg.bottom.color,
    shoes: cfg.shoes,
    sole: shade(cfg.shoes, 0.62),
    hand: cfg.gloves || skin,
  };
}

// ---------------------------------------------------------------- legs & shoes
function buildLegs(rb, b, d, cfg, C) {
  const bottom = cfg.bottom.type;
  const hemY = bottom === 'shorts' ? d.kneeY + 0.02 : bottom === 'trunks' ? d.hipY - 0.035 : bottom === 'skirt' || bottom === 'long' ? 99 : -1;
  const legCol = cfg.bottom.legs || (['skirt', 'long', 'shorts', 'trunks'].includes(bottom) ? (cfg.bottom.tights || C.skin) : C.bottom);
  const sock = cfg.socks;
  const bootTop = cfg.boots ? d.kneeY - 0.01 : -1;
  const top = d.hipY + 0.05;
  const len = top - d.ankleY;
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R';
    const cy = (top + d.ankleY) / 2;
    rb.add(G.capsule(d.legR, len, ...Q.limb), (x, y, z, c) => {
      const my = y + cy;
      if (bootTop > 0 && my < bootTop) return c.set(cfg.boots);
      if (sock && my < d.ankleY + 0.07) return c.set(sock);
      c.set(my > hemY ? C.bottom : legCol);
    }, { x: s * d.legX, y: cy }, blendY(b['leg' + S], b['shin' + S], d.kneeY + 0.035, d.kneeY - 0.035));
    if (bootTop > 0) { // welly rim
      rb.add(G.cyl(d.legR * 1.2, d.legR * 1.12, 0.035, 8, true), cfg.boots, { x: s * d.legX, y: bootTop - 0.01 }, b['shin' + S]);
    }
    const sh = cfg.shoeSize || 1;
    const shoeCol = cfg.boots || (cfg.barefoot ? C.skin : C.shoes);
    const sole = cfg.boots ? shade(cfg.boots, 0.6) : cfg.barefoot ? C.skinDark : C.sole;
    rb.add(G.sphere(...Q.shoe), (x, y, z, c) => c.set(y < -0.42 ? sole : shoeCol),
      { x: s * (d.legX + 0.004), y: 0.052 * sh, z: 0.03, sx: 0.076 * sh, sy: 0.058 * sh, sz: 0.112 * sh }, b['shin' + S]);
  }
}

// ---------------------------------------------------------------- body & outfit
function buildBody(rb, b, d, cfg, C) {
  const t = cfg.top.type;
  const belly = cfg.build.belly;
  const bw = blendY(b.spine, b.hips, d.waistY + 0.06, d.waistY - 0.06);
  const H = d.bodyH;
  const waistT = 0.3;
  const beltT = cfg.belt ? [waistT - 0.02, waistT + 0.03] : null;
  const cuts = [waistT * H];
  if (beltT) cuts.push(beltT[0] * H, beltT[1] * H);
  // top pattern bands
  const bands = [];
  if (t === 'stripes' || t === 'sport') {
    const n = t === 'stripes' ? 4 : 0;
    for (let i = 0; i < n; i++) bands.push([0.38 + i * 0.13, 0.38 + i * 0.13 + 0.065]);
  }
  if (t === 'hivis') bands.push([0.44, 0.49], [0.6, 0.65]);
  if (t === 'jumper') bands.push([0.3, 0.37], [0.58, 0.64]);
  if (t === 'police') bands.push([0.3, 0.35]);
  if (t === 'lifeguard') bands.push([0.56, 0.66]);
  if (t === 'swimsuit' && cfg.top.stripes !== false) bands.push([0.12, 0.19], [0.38, 0.45], [0.56, 0.63], [0.73, 0.8]);
  const neckline = t === 'swimsuit' ? 0.86 : t === 'bare' ? -1 : 2; // skin above this height
  if (neckline > 0 && neckline < 1) cuts.push(neckline * H);
  for (const [a, c] of bands) cuts.push(a * H, c * H);
  const bandCol = t === 'hivis' ? '#d7dde6' : C.top2;
  const lowerCol = (t === 'dress' || t === 'raincoat' || t === 'smock' || t === 'swimsuit') ? C.top : C.bottom;
  const g = lathe(bodyProfile(d, belly), Q.body, cuts);
  rb.add(g, (x, y, z, c) => {
    const tt = y / H;
    if (tt > neckline && tt >= waistT) return c.set(C.skin);
    if (t === 'swimsuit') for (const [a, e] of bands) if (tt > a && tt < e) return c.set(bandCol);
    if (tt < waistT) return c.set(lowerCol);
    if (beltT && tt >= beltT[0] && tt <= beltT[1]) return c.set(cfg.belt);
    for (const [a, e] of bands) if (tt > a && tt < e) return c.set(bandCol);
    c.set(C.top);
  }, { y: d.bodyBottom, sz: d.bodyD }, bw);

  const front = (from, to, phi, extra, col, bind = bw, seg = 10, centre = 0) => {
    const pr = bodyProfile(d, belly, 1, from, to, extra);
    return rb.add(lathe(pr, seg, [], centre - phi, phi * 2), col, { y: d.bodyBottom, sz: d.bodyD }, bind);
  };
  const atBody = (tt, ang, out = 0.004) => { // point on body surface at height tt, angle ang (0 = front)
    const r = profR(tt, belly) * d.bodyR + out;
    return V(Math.sin(ang) * r, d.bodyBottom + tt * H, Math.cos(ang) * r * d.bodyD);
  };
  const button = (tt, ang, col, r = 0.016) => {
    const p = atBody(tt, ang, 0.002);
    rb.add(G.sphere(5, 3), col, { x: p.x, y: p.y, z: p.z, sx: r, sy: r, sz: r * 0.6 }, bw);
  };
  const collar = (col, tt = 0.93, r = 0.03) => {
    const rr = profR(tt, belly) * d.bodyR;
    rb.add(G.torus(rr * 0.98, r, 3, 11), col, { y: d.bodyBottom + tt * H, rx: Math.PI / 2, sz: d.bodyD }, b.spine);
  };

  // skirts / coats hanging below the body (front verts follow the thighs when sitting)
  const skirt = (hemY, flare, col, fromT = waistT, colFn) => {
    const topY = d.bodyBottom + fromT * H;
    const r0 = profR(fromT, belly) * d.bodyR + 0.012;
    const r1 = Math.max(r0 + 0.02, d.bodyR * flare);
    const pts = [];
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      pts.push([r0 + (r1 - r0) * Math.pow(k, 0.8), topY - (topY - hemY) * k]);
    }
    pts.reverse();
    const g2 = lathe(pts.map(([r, y]) => [r, y - hemY]), 14);
    rb.add(g2, colFn || col, { y: hemY, sz: 0.92 }, (x, y, z) => {
      const depth = smooth01((d.hipY - y) / (d.hipY - hemY + 1e-3));
      const fr = smooth01((z / (Math.hypot(x, z) + 1e-5) - 0.1) / 0.8);
      const w = depth * fr * 0.85;
      return [b.hips, 1 - w, x > 0 ? b.legL : b.legR, w];
    });
  };

  switch (t) {
    case 'shirt': collar(shade(C.top, 1.1), 0.94, 0.028); button(0.8, 0, shade(C.top, 0.7), 0.013); button(0.66, 0, shade(C.top, 0.7), 0.013); break;
    case 'jumper': collar(C.top2, 0.935, 0.03); break;
    case 'stripes': collar(C.top, 0.935, 0.022); break;
    case 'sport': {
      collar(C.top2, 0.935, 0.02);
      for (const s of [1, -1]) front(0.3, 0.86, 0.1, 0.004, C.top2, bw, 2, s * Math.PI / 2);
      break;
    }
    case 'hivis': {
      collar(cfg.top.sleeveColor, 0.935, 0.03);
      break;
    }
    case 'suit': {
      front(0.52, 0.97, 0.36, 0.006, cfg.top.shirt || '#f6f2ea');
      for (const s of [1, -1]) { // lapels
        const p = atBody(0.75, s * 0.33, 0.012);
        rb.add(G.box(0.07, 0.24, 0.016), shade(C.top, 0.85), { x: p.x, y: p.y, z: p.z, ry: s * 0.33, rz: s * 0.42 }, bw);
      }
      if (cfg.top.bow) {
        const p = atBody(0.9, 0, 0.02);
        for (const s of [1, -1]) rb.add(G.cone(0.035, 0.07, 6), cfg.top.tie, { x: p.x + s * 0.034, y: p.y, z: p.z, rz: s * Math.PI / 2 }, bw);
        rb.add(G.sphere(6, 4), cfg.top.tie, { x: p.x, y: p.y, z: p.z + 0.005, s: 0.02 }, bw);
      } else {
        const p = atBody(0.72, 0, 0.012);
        rb.add(G.sphere(8, 6), cfg.top.tie || P.tomato, { x: p.x, y: p.y, z: p.z, sx: 0.028, sy: 0.14, sz: 0.012, rx: -0.12 }, bw);
      }
      button(0.46, 0, shade(C.top, 0.6), 0.014); button(0.37, 0, shade(C.top, 0.6), 0.014);
      if (cfg.top.flower) { const p = atBody(0.78, 0.55, 0.02); rb.add(G.sphere(8, 6), cfg.top.flower, { x: p.x, y: p.y, z: p.z, s: 0.032 }, bw); }
      break;
    }
    case 'overalls': case 'apron': case 'dungarees': {
      const col = cfg.top.bib || (t === 'apron' ? C.top2 : C.bottom);
      if (t === 'apron') {
        const striped = cfg.top.apronStripe;
        const colFn = striped ? (x, y, z, c) => c.set(Math.floor((Math.atan2(x, z) + 3) / 0.16) % 2 ? striped : col) : col;
        const pr = bodyProfile(d, belly, 1, 0.12, 0.8, 0.012);
        rb.add(lathe(pr, 14, [], -1.0, 2.0), colFn, { y: d.bodyBottom, sz: d.bodyD }, bw);
        skirtFront(rb, b, d, belly, colFn, 1.0);
        collar(col, 0.9, 0.012);
        rb.add(G.torus(profR(waistT + 0.08, belly) * d.bodyR * 1.0, 0.012, 3, 14), shade(col, 0.92), { y: d.bodyBottom + (waistT + 0.08) * H, rx: Math.PI / 2, sz: d.bodyD }, bw);
      } else {
        front(0.26, 0.66, 0.6, 0.008, col);
        for (const s of [1, -1]) {
          front(0.6, 0.995, 0.075, 0.01, col, bw, 2, s * 0.42);
          front(0.5, 0.995, 0.075, 0.01, col, bw, 2, Math.PI + s * 0.42);
          button(0.635, s * 0.42, cfg.top.button || P.sunflower, 0.02);
        }
        const pk = atBody(0.47, 0, 0.012); // bib pocket
        rb.add(G.box(0.12, 0.08, 0.012), shade(col, 0.88), { x: pk.x, y: pk.y, z: pk.z }, bw);
      }
      break;
    }
    case 'dress': case 'wedding': {
      collar(cfg.top.collar || shade(C.top, 1.15), 0.935, 0.03);
      const hem = t === 'wedding' ? 0.045 : d.kneeY - 0.02;
      skirt(hem, t === 'wedding' ? 1.45 : 1.3, C.top, waistT, cfg.top.hem ? (x, y, z, c) => c.set(y < 0.05 ? cfg.top.hem : C.top) : null);
      if (cfg.top.sash) rb.add(G.torus(profR(0.34, belly) * d.bodyR * 1.02, 0.02, 4, 18), cfg.top.sash, { y: d.bodyBottom + 0.34 * H, rx: Math.PI / 2, sz: d.bodyD }, bw);
      break;
    }
    case 'raincoat': case 'smock': {
      collar(t === 'raincoat' ? shade(C.top, 0.9) : C.top, 0.935, 0.032);
      skirt(d.kneeY - 0.01, 1.22, C.top, 0.36);
      if (t === 'raincoat') for (let i = 0; i < 4; i++) button(0.42 + i * 0.12, 0, shade(C.top, 0.55), 0.015);
      else {
        const dots = [P.tomato, P.cobalt, P.sunflower, P.lime, P.bubblegum];
        [[0.55, 0.3], [0.7, -0.4], [0.45, -0.2], [0.8, 0.5], [0.38, 0.55], [0.62, -0.75]].forEach(([tt, a], i) => {
          const p = atBody(tt, a, 0.0);
          rb.add(G.sphere(5, 3), dots[i % dots.length], { x: p.x, y: p.y, z: p.z, sx: 0.035, sy: 0.03, sz: 0.012, ry: a }, bw);
        });
      }
      break;
    }
    case 'chef': {
      collar(C.top, 0.935, 0.03);
      rb.add(G.torus(profR(0.92, belly) * d.bodyR * 1.0, 0.03, 4, 12), cfg.top.scarf || P.tomato, { y: d.bodyBottom + 0.915 * H, rx: Math.PI / 2, sz: d.bodyD }, b.spine);
      const k = atBody(0.87, 0.15, 0.02);
      rb.add(G.sphere(6, 5), cfg.top.scarf || P.tomato, { x: k.x, y: k.y, z: k.z, s: 0.03 }, bw);
      for (let i = 0; i < 3; i++) for (const s of [1, -1]) button(0.5 + i * 0.11, s * 0.28, '#d9d4c8', 0.014);
      break;
    }
    case 'vicar': {
      rb.add(G.torus(profR(0.925, belly) * d.bodyR * 1.0, 0.026, 4, 12), '#fbfaf4', { y: d.bodyBottom + 0.925 * H, rx: Math.PI / 2, sz: d.bodyD }, b.spine);
      const p = atBody(0.89, 0, 0.012);
      rb.add(G.box(0.05, 0.045, 0.02), '#fbfaf4', { x: p.x, y: p.y, z: p.z }, b.spine);
      break;
    }
    case 'police': {
      collar(C.top, 0.935, 0.03);
      for (let i = 0; i < 4; i++) button(0.42 + i * 0.12, 0, '#dfe5ee', 0.017);
      const p = atBody(0.72, 0.5, 0.01);
      rb.add(G.cyl(0.032, 0.032, 0.012, 8), '#dfe5ee', { x: p.x, y: p.y, z: p.z, rx: Math.PI / 2, ry: 0.5 }, bw);
      for (const s of [1, -1]) { // epaulettes
        rb.add(G.box(0.1, 0.02, 0.07), shade(C.top, 0.85), { x: s * d.shX * 0.85, y: d.shY + 0.06, rz: s * -0.5 }, b.spine);
      }
      break;
    }
    case 'postman': {
      collar(cfg.top.trim || P.tomato, 0.935, 0.026);
      button(0.78, 0, shade(C.top, 0.7), 0.012); button(0.64, 0, shade(C.top, 0.7), 0.012);
      break;
    }
    case 'cardigan': {
      collar(shade(C.top, 0.9), 0.935, 0.03);
      for (let i = 0; i < 4; i++) button(0.38 + i * 0.12, 0, cfg.top.button || '#fff1d6', 0.016);
      break;
    }
    case 'hawaiian': {
      collar(C.top, 0.94, 0.028);
      const cols = [cfg.top.color2 || P.bubblegum, P.sunflower, '#fff8ee'];
      [[0.4, 0.4], [0.55, -0.3], [0.7, 0.8], [0.8, -0.9], [0.5, 1.3], [0.62, 0.05], [0.4, -1.1], [0.75, 2.2], [0.5, 2.8], [0.65, -2.3]].forEach(([tt, a], i) => {
        const p = atBody(tt, a, -0.004);
        rb.add(G.sphere(5, 3), cols[i % 3], { x: p.x, y: p.y, z: p.z, sx: 0.04, sy: 0.04, sz: 0.012, ry: a }, bw);
      });
      break;
    }
    case 'swimsuit': case 'bare': {
      if (t === 'bare') { const p = atBody(0.36, 0, -0.004); rb.add(G.sphere(5, 3), C.skinDark, { x: p.x, y: p.y, z: p.z, sx: 0.014, sy: 0.018, sz: 0.008 }, bw); } // belly button
      break;
    }
    case 'lifeguard': {
      collar(C.top, 0.935, 0.026);
      const p = atBody(0.61, 0, 0.006); // white cross on the red band
      rb.add(G.box(0.07, 0.022, 0.012), '#fbf7f0', { x: p.x, y: p.y, z: p.z }, bw);
      rb.add(G.box(0.022, 0.07, 0.012), '#fbf7f0', { x: p.x, y: p.y, z: p.z }, bw);
      break;
    }
    case 'sailor': {
      const navy = cfg.top.collar || '#243056';
      for (const s of [1, -1]) { // front V of the square sailor collar
        const p = atBody(0.8, s * 0.3, 0.01);
        rb.add(G.box(0.075, 0.2, 0.014), navy, { x: p.x, y: p.y, z: p.z, ry: s * 0.3, rz: s * 0.55 }, bw);
      }
      const bk = atBody(0.83, Math.PI, 0.012); // back flap
      rb.add(G.box(0.26, 0.17, 0.014), navy, { x: bk.x, y: bk.y, z: bk.z, rx: 0.42 }, b.spine);
      rb.add(G.box(0.24, 0.012, 0.016), '#fbf7f0', { x: bk.x, y: bk.y - 0.055, z: bk.z - 0.02, rx: 0.42 }, b.spine);
      const k = atBody(0.69, 0, 0.022); // neckerchief knot + tails
      rb.add(G.sphere(6, 4), cfg.top.scarf || P.tomato, { x: k.x, y: k.y, z: k.z, s: 0.03 }, bw);
      for (const s of [1, -1]) rb.add(G.cone(0.028, 0.09, 4), cfg.top.scarf || P.tomato, { x: k.x + s * 0.02, y: k.y - 0.05, z: k.z, rx: Math.PI, rz: s * 0.25 }, bw);
      break;
    }
    case 'reefer': { // captain's double-breasted jacket
      front(0.66, 0.97, 0.3, 0.006, cfg.top.shirt || '#f6f2ea');
      for (const s of [1, -1]) {
        const p = atBody(0.76, s * 0.3, 0.012);
        rb.add(G.box(0.07, 0.22, 0.016), shade(C.top, 0.8), { x: p.x, y: p.y, z: p.z, ry: s * 0.3, rz: s * 0.4 }, bw);
        for (let i = 0; i < 3; i++) button(0.42 + i * 0.1, s * 0.2, cfg.top.button || '#ffd23c', 0.017);
      }
      const tp = atBody(0.8, 0, 0.012);
      rb.add(G.sphere(6, 4), cfg.top.tie || '#2b2b3a', { x: tp.x, y: tp.y, z: tp.z, sx: 0.022, sy: 0.07, sz: 0.01, rx: -0.12 }, bw);
      for (const s of [1, -1]) rb.add(G.box(0.1, 0.02, 0.07), cfg.top.button || '#ffd23c', { x: s * d.shX * 0.86, y: d.shY + 0.06, rz: s * -0.5 }, b.spine);
      break;
    }
    default: collar(C.top, 0.935, 0.024);
  }

  if (cfg.bottom.type === 'skirt' && t !== 'dress' && t !== 'wedding') skirt(d.kneeY + 0.01, 1.18, C.bottom);
  if (cfg.bottom.type === 'long' && t !== 'dress' && t !== 'wedding') skirt(0.06, 1.3, C.bottom);
  if (cfg.belt) { // buckle
    const p = atBody(waistT + 0.005, 0, 0.012);
    rb.add(G.box(0.05, 0.04, 0.012), '#ffd76a', { x: p.x, y: p.y, z: p.z }, bw);
  }
}

function skirtFront(rb, b, d, belly, col, phi) {
  // apron flap below the body: follows the thighs so it lifts when sitting
  const topY = d.bodyBottom + 0.12 * d.bodyH;
  const hemY = d.kneeY - 0.02;
  const r0 = profR(0.12, belly) * d.bodyR + 0.014;
  const pts = [[r0 + 0.045, 0], [r0 + 0.03, (topY - hemY) * 0.5], [r0, topY - hemY]];
  rb.add(lathe(pts, 10, [], -phi, phi * 2), col, { y: hemY, sz: 0.92 }, (x, y) => {
    const w = smooth01((d.hipY - y) / (d.hipY - hemY)) * 0.9;
    return [b.hips, 1 - w, x > 0 ? b.legL : b.legR, w];
  });
}

// ---------------------------------------------------------------- arms & mitten hands
function buildArms(rb, b, d, cfg, C) {
  const sl = cfg.top.sleeves; // 'long' | 'short' | 'none'
  const len = d.armLen + 0.03;
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R';
    const cy = d.shY - len / 2 + 0.015;
    const elbow = d.shY - d.armLen * 0.5;
    rb.add(G.capsule(d.armR, len - d.armR * 2 + 0.02, ...Q.limb), (x, y, z, c) => {
      const my = y + cy;
      if (sl === 'long') return c.set(my < d.shY - d.armLen + 0.04 && cfg.top.cuff ? cfg.top.cuff : C.sleeve);
      if (sl === 'short') return c.set(my > d.shY - 0.1 ? C.sleeve : C.skin);
      c.set(C.skin);
    }, { x: s * d.shX, y: cy }, blendY(b['arm' + S], b['fore' + S], elbow + 0.04, elbow - 0.04));
    const hy = d.shY - d.armLen - d.handR * 0.62;
    rb.add(G.sphere(...Q.hand), C.hand, { x: s * (d.shX + 0.004), y: hy, sx: d.handR * 0.86, sy: d.handR * 1.05, sz: d.handR * 0.92 }, b['hand' + S]);
    rb.add(G.sphere(5, 4), C.hand, { x: s * (d.shX - d.handR * 0.62), y: hy + 0.012, z: d.handR * 0.45, sx: 0.028, sy: 0.034, sz: 0.028 }, b['hand' + S]);
  }
}

// ---------------------------------------------------------------- head & face
function buildHead(rb, b, d, cfg, C, meta) {
  const hm = new THREE.Matrix4().makeTranslation(0, d.headC, d.headZ); // head space -> model
  const surf = headSurf(d);
  const f = cfg.face;
  const { R, Rx, Rz, HS } = d;
  // skull: lathe egg with fuller cheeks
  const prof = [];
  const N = Q.headRows;
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * Math.PI;
    const y0 = -Math.cos(th), r0 = Math.sin(th);
    const cheek = 1 + (f.cheeks ?? 0.05) * Math.exp(-(((y0 + 0.35) / 0.42) ** 2));
    prof.push([r0 * cheek, y0]);
  }
  rb.add(lathe(prof, Q.head), C.skin, M(hm, { sx: Rx, sy: R, sz: Rz }), b.head);

  // ears
  if (!cfg.hair.hidesEars) {
    for (const s of [1, -1]) rb.add(G.sphere(6, 5), C.skin, M(hm, { x: s * Rx * 0.97, y: -0.05 * R, z: -0.04 * R, sx: 0.034 * HS, sy: 0.07 * HS, sz: 0.055 * HS, ry: s * 0.35 }), b.head);
  }

  // eyes (white + pupil + catchlight + eyelid); eye bones are scaled to the eye ellipsoid so lids &
  // pupils rotate "on the eyeball".
  const es = f.eyeSize || 1;
  const ew = 0.064 * HS * es, eh = 0.08 * HS * es, ed = 0.044 * HS;
  const ex = (0.1 + (f.eyeGap || 0) * 0.02) * HS * Math.min(1.08, Math.max(0.94, es)), ey = -0.02 * R / 0.325 + (f.eyeY || 0) * 0.02;
  for (const s of [1, -1]) {
    const S = s > 0 ? 'L' : 'R';
    const x = s * ex;
    const n = surf.normal(x, ey);
    const q = qFromNormal(n, 0.55);
    const sz = surf.z(x, ey);
    const inset = ed * 0.42;
    const pos = V(x, ey, sz).addScaledVector(n, -inset).applyMatrix4(hm);
    const eyeW = new THREE.Matrix4().compose(pos, q, V(ew, eh, ed));
    const eyeEuler = new THREE.Euler().setFromQuaternion(q);
    b['eye' + S] = rb.bone('eye' + S, b.head, pos.toArray(), [eyeEuler.x, eyeEuler.y, eyeEuler.z], [ew, eh, ed]);
    rb.add(G.sphere(...Q.eye), FACE.white, eyeW, b['eye' + S]);
    // pupil looks at a point ~2.5 m ahead (slight inward convergence)
    const focus = V(0, d.headC + ey, 2.5);
    const dirW = focus.clone().sub(pos).normalize();
    const inv = new THREE.Matrix4().copy(eyeW).invert();
    const dirU = dirW.clone().transformDirection(inv); // approx (scale-free direction in unit space)
    dirU.multiply(V(ew, eh, ed)).normalize();
    const qp = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), dirU);
    const pupilW = eyeW.clone().multiply(new THREE.Matrix4().makeRotationFromQuaternion(qp));
    const pupilIdx = rb.bone('pupil' + S, b['eye' + S], [0, 0, 0]);
    rb.bones[pupilIdx].world = pupilW.clone(); // bone lives inside the scaled eye frame
    b['pupil' + S] = pupilIdx;
    const ps = f.pupil || 1;
    rb.add(G.sphere(...Q.pupil), FACE.pupil, M(pupilW, { z: 0.8, sx: 0.6 * ps, sy: 0.64 * ps, sz: 0.3 }), pupilIdx);
    rb.add(G.sphere(5, 3), '#ffffff', M(pupilW, { x: 0.2, y: 0.26, z: 1.06, sx: 0.21, sy: 0.21, sz: 0.1 }), pupilIdx);
    // eyelid: upper hemisphere shell, skin coloured with a dark lash rim
    const lidIdx = rb.bone('lid' + S, b['eye' + S], [0, 0, 0]);
    rb.bones[lidIdx].world = eyeW.clone();
    b['lid' + S] = lidIdx;
    rb.add(G.hemi(...Q.lid), (px, py, pz, c) => c.set(py < 0.16 ? FACE.lash : C.lid), M(eyeW, { s: 1.12 }), lidIdx);
  }
  meta.eye = { ex, ey, ew, eh };

  // brows
  const bst = f.brows || 'normal';
  if (bst !== 'none') {
    const bt = bst === 'thick' ? 0.017 : bst === 'bushy' ? 0.021 : bst === 'thin' ? 0.01 : 0.013;
    const bl = (bst === 'bushy' ? 0.066 : 0.052) * HS;
    for (const s of [1, -1]) {
      const S = s > 0 ? 'L' : 'R';
      const x = s * ex * 1.06, y = ey + eh + 0.048 * HS;
      const n = surf.normal(x, y);
      const p = V(x, y, surf.z(x, y)).addScaledVector(n, 0.004).applyMatrix4(hm);
      b['brow' + S] = rb.bone('brow' + S, b.head, p.toArray());
      const q = qFromNormal(n, 0.8);
      const m = new THREE.Matrix4().compose(p, q, V(1, 1, 1)).multiply(tf({ rz: Math.PI / 2 - s * 0.16, sz: 0.7 }));
      rb.add(G.capsule(bt, bl, 1, 5), C.brow, m, b['brow' + S]);
    }
  }

  // nose
  const ns = f.nose || 1;
  const ny = ey - 0.075 * HS;
  const nz = surf.z(0, ny);
  const nshape = f.noseShape || 'button';
  const nsc = nshape === 'long' ? [0.036, 0.034, 0.06] : nshape === 'big' ? [0.052, 0.046, 0.05] : [0.04, 0.034, 0.038];
  rb.add(G.sphere(7, 5), C.nose, M(hm, { y: ny, z: nz + 0.004, sx: nsc[0] * ns * HS, sy: nsc[1] * ns * HS, sz: nsc[2] * ns * HS }), b.head);

  // mouth: smile arc (scaled by 'mouth' bone) + open mouth (scaled by 'jaw' bone)
  const my = ey - 0.15 * HS;
  const beardOff = cfg.facial === 'beard' || cfg.facial === 'bigbeard' ? 0.026 : 0;
  const mn = surf.normal(0, my);
  const mz = surf.z(0, my);
  const mp = V(0, my, mz).addScaledVector(mn, 0.002 + beardOff).applyMatrix4(hm);
  const mq = qFromNormal(mn, 0.9);
  const mw = new THREE.Matrix4().compose(mp, mq, V(1, 1, 1));
  b.mouth = rb.bone('mouth', b.head, [0, 0, 0]);
  rb.bones[b.mouth].world = mw.clone();
  const mwid = (f.mouthW || 1) * 0.047 * HS;
  rb.add(G.torus(mwid, 0.0125 * HS, 4, 8, Math.PI), FACE.mouth, M(mw, { y: mwid * 0.5, rz: Math.PI, sy: 0.75 }), b.mouth);
  b.jaw = rb.bone('jaw', b.head, [0, 0, 0]);
  rb.bones[b.jaw].world = mw.clone();
  rb.add(G.sphere(8, 5), FACE.mouth, M(mw, { y: -0.028 * HS, z: -0.004, sx: mwid * 1.12, sy: 0.05 * HS, sz: 0.022 * HS }), b.jaw);
  rb.add(G.sphere(5, 3), FACE.tongue, M(mw, { y: -0.052 * HS, z: 0.006, sx: mwid * 0.7, sy: 0.018 * HS, sz: 0.014 * HS }), b.jaw);
  meta.mouthY = my;

  // cheeks blush
  if (f.blush) {
    for (const s of [1, -1]) {
      const x = s * ex * 1.55, y = ey - 0.085 * HS;
      const n = surf.normal(x, y);
      const p = V(x, y, surf.z(x, y)).addScaledVector(n, -0.004).applyMatrix4(hm);
      const m = new THREE.Matrix4().compose(p, qFromNormal(n, 1), V(0.042 * HS, 0.028 * HS, 0.012));
      rb.add(G.sphere(6, 4), C.blush, m, b.head);
    }
  }

  buildHair(rb, b, d, cfg, C, hm);
  buildFaceExtras(rb, b, d, cfg, C, hm, surf, meta);
  buildHat(rb, b, d, cfg, C, hm, meta);
}

// ---------------------------------------------------------------- hair
export const HAIR_STYLES = ['short', 'bob', 'bun', 'spiky', 'quiff', 'pigtails', 'curly', 'long', 'ponytail', 'bald', 'balding', 'afro', 'mohawk', 'parted'];

function buildHair(rb, b, d, cfg, C, hm) {
  const { R, Rx, Rz } = d;
  let st = cfg.hair.style;
  const hat = cfg.hat?.type;
  if (hat === 'swimcap') return; // all tucked in
  const covers = hat && !['headband', 'veil'].includes(hat);
  if (covers && ['spiky', 'quiff', 'mohawk', 'parted'].includes(st)) st = 'short';
  if (covers && st === 'afro') st = 'curly';
  const col = C.hair;
  const add = (g, t) => rb.add(g, col, M(hm, t), b.head);
  // Toy "helmet" hair: a cap 7% larger than the skull, cut by a tilted plane (high at the forehead,
  // low at the nape) with a rounded rim filling the gap -> crisp hairline, no z-fighting.
  const helmet = ({ k = 1.07, tilt = 0.45, low = 0.1, lift = 0.0, fwd = 0 } = {}) => {
    const th = Math.acos(Math.max(-0.9, Math.min(0.95, low)));
    const m = M(hm, { y: lift * R, z: fwd * R, rx: -tilt, sx: Rx * k, sy: R * k, sz: Rz * k });
    rb.add(new THREE.SphereGeometry(1, Q.hair[0], 6, 0, Math.PI * 2, 0, th), col, m, b.head);
    const rr = Math.sin(th) * 0.965, ry = Math.cos(th) * 0.965;
    rb.add(G.torus(rr, 0.055, 4, Q.hair[0] + 2), col, m.clone().multiply(tf({ y: ry, rx: Math.PI / 2 })), b.head);
  };
  const fringe = (y = 0.56, w = 0.8, z = 0.52) => add(G.sphere(...Q.puff), { y: y * R, z: z * R, sx: w * R, sy: 0.28 * R, sz: 0.4 * R, rx: -0.4 });
  switch (st) {
    case 'bald': break;
    case 'balding':
      for (const s of [1, -1]) add(G.sphere(...Q.small), { x: s * Rx * 0.9, y: 0.1 * R, z: -0.25 * R, sx: 0.2 * R, sy: 0.3 * R, sz: 0.48 * R });
      add(G.sphere(...Q.puff), { y: -0.02 * R, z: -0.74 * R, sx: 0.78 * R, sy: 0.38 * R, sz: 0.32 * R });
      break;
    case 'short': helmet({ tilt: 0.5, low: 0.14 }); break;
    case 'parted':
      helmet({ tilt: 0.5, low: 0.14 });
      add(G.sphere(...Q.puff), { x: 0.3 * R, y: 0.8 * R, z: 0.34 * R, sx: 0.56 * R, sy: 0.3 * R, sz: 0.5 * R, rz: -0.35, rx: -0.3 });
      break;
    case 'bob':
      helmet({ tilt: 0.36, low: 0.06, k: 1.08 });
      for (const s of [1, -1]) add(G.sphere(...Q.puff), { x: s * Rx * 0.86, y: -0.22 * R, z: -0.1 * R, sx: 0.3 * R, sy: 0.62 * R, sz: 0.72 * R, rz: s * 0.08 });
      add(G.sphere(...Q.puff), { y: -0.2 * R, z: -0.5 * R, sx: 0.94 * R, sy: 0.64 * R, sz: 0.55 * R });
      fringe();
      break;
    case 'long':
      helmet({ tilt: 0.36, low: 0.06, k: 1.08 });
      for (const s of [1, -1]) add(G.sphere(...Q.puff), { x: s * Rx * 0.86, y: -0.45 * R, z: -0.12 * R, sx: 0.3 * R, sy: 0.85 * R, sz: 0.7 * R, rz: s * 0.1 });
      add(G.sphere(...Q.puff), { y: -0.55 * R, z: -0.52 * R, sx: 0.96 * R, sy: 0.95 * R, sz: 0.55 * R });
      if (cfg.hair.fringe !== false) fringe(0.55, 0.78);
      break;
    case 'bun':
      helmet({ tilt: 0.42, low: 0.1 });
      if (covers) add(G.sphere(...Q.puff), { y: -0.1 * R, z: -1.02 * R, s: 0.34 * R });
      else {
        add(G.sphere(...Q.puff), { y: 1.0 * R, z: -0.32 * R, s: 0.4 * R });
        rb.add(G.torus(0.3 * R, 0.05 * R, 4, 12), cfg.hair.tie || shade(col, 0.7), M(hm, { y: 0.83 * R, z: -0.28 * R, rx: Math.PI / 2 - 0.3 }), b.head);
      }
      break;
    case 'spiky': {
      helmet({ tilt: 0.5, low: 0.14 });
      const n = 7;
      for (let i = 0; i < n; i++) {
        const a = (i / (n - 1) - 0.5) * 2.2;
        add(G.cone(0.17 * R, 0.55 * R, 5), { x: Math.sin(a) * 0.55 * R, y: 0.95 * R + Math.cos(a) * 0.1 * R, z: -0.05 * R + (i % 2) * -0.25 * R, rz: -a * 0.7, rx: -0.25 - (i % 2) * 0.4 });
      }
      break;
    }
    case 'quiff':
      helmet({ tilt: 0.5, low: 0.14 });
      add(G.sphere(...Q.puff), { y: 0.95 * R, z: 0.34 * R, sx: 0.55 * R, sy: 0.38 * R, sz: 0.62 * R, rx: -0.45 });
      add(G.sphere(...Q.puff), { y: 1.08 * R, z: 0.64 * R, sx: 0.4 * R, sy: 0.24 * R, sz: 0.34 * R, rx: 0.4 });
      break;
    case 'pigtails':
      helmet({ tilt: 0.4, low: 0.1 });
      fringe(0.56, 0.72);
      for (const s of [1, -1]) {
        add(G.sphere(...Q.puff), { x: s * Rx * 1.14, y: -0.05 * R, z: -0.2 * R, sx: 0.28 * R, sy: 0.44 * R, sz: 0.3 * R, rz: s * 0.5 });
        rb.add(G.sphere(...Q.small), cfg.hair.tie || P.bubblegum, M(hm, { x: s * Rx * 1.0, y: 0.14 * R, z: -0.2 * R, s: 0.1 * R }), b.head);
      }
      break;
    case 'ponytail':
      helmet({ tilt: 0.42, low: 0.1 });
      add(G.sphere(...Q.puff), { y: 0.0 * R, z: -1.14 * R, sx: 0.3 * R, sy: 0.62 * R, sz: 0.3 * R, rx: 0.4 });
      rb.add(G.torus(0.16 * R, 0.05 * R, 4, 10), cfg.hair.tie || P.tomato, M(hm, { y: 0.34 * R, z: -1.02 * R, rx: Math.PI / 2 + 0.6 }), b.head);
      break;
    case 'curly': case 'afro': {
      const big = st === 'afro';
      helmet({ tilt: 0.38, low: 0.08, k: big ? 1.1 : 1.07 });
      const n = big ? 18 : 14;
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n;
        const phi = i * 2.399963;
        const yy = 1 - u * (big ? 1.45 : 1.25);
        const r = Math.sqrt(Math.max(0, 1 - yy * yy));
        const px = Math.cos(phi) * r, pz = Math.sin(phi) * r;
        if (pz > 0.35 && yy < 0.55) continue; // keep the face clear
        if (covers && yy > 0.3) continue;
        const k = big ? 1.2 : 1.1;
        add(G.sphere(6, 4), { x: px * Rx * k, y: (yy * 0.97 + 0.08) * R, z: (pz * k - 0.06) * Rz, s: (big ? 0.34 : 0.26) * R });
      }
      break;
    }
    case 'mohawk':
      for (let i = 0; i < 5; i++) add(G.cone(0.15 * R, 0.6 * R, 5), { y: (1.02 - Math.abs(i - 1.5) * 0.1) * R, z: (0.45 - i * 0.28) * R, rx: -0.3 + i * 0.25, sx: 0.5 });
      break;
    default: helmet();
  }
}

// ---------------------------------------------------------------- glasses / facial hair
function buildFaceExtras(rb, b, d, cfg, C, hm, surf, meta) {
  const { R, HS } = d;
  const { ex, ey, ew, eh } = meta.eye;
  if (cfg.glasses === 'goggles') {
    const gcol = cfg.glassesColor || '#2ec4b6';
    for (const s of [1, -1]) {
      const x = s * ex, n = surf.normal(x, ey);
      const p = V(x, ey, surf.z(x, ey)).addScaledVector(n, 0.022).applyMatrix4(hm);
      const m = new THREE.Matrix4().compose(p, qFromNormal(n, 0.6), V(1, 1, 1));
      const rr = Math.max(ew, eh) * 1.1;
      rb.add(G.torus(rr, 0.017, 3, 10), gcol, m, b.head);
      rb.add(G.sphere(6, 4), (px, py, pz, c) => c.set(px < -0.2 && py > 0.2 ? '#f4fbff' : '#8fdcff'), M(m, { sx: rr, sy: rr, sz: 0.012 }), b.head);
    }
    rb.add(G.torus(1, 0.012, 3, 14), gcol, M(hm, { y: ey + 0.02, rx: Math.PI / 2 - 0.12, sx: d.Rx * 1.06, sy: d.Rz * 1.06 }), b.head); // strap
    rb.add(G.capsule(0.01, ex * 2 - Math.max(ew, eh) * 2.3, 1, 4), gcol, M(hm, { y: ey + 0.012, z: surf.z(0, ey) + 0.024, rz: Math.PI / 2 }), b.head);
  } else if (cfg.glasses) {
    const gcol = cfg.glassesColor || P.ink;
    const shades = cfg.glasses === 'shades';
    for (const s of [1, -1]) {
      const x = s * ex, n = surf.normal(x, ey);
      const p = V(x, ey, surf.z(x, ey)).addScaledVector(n, 0.03).applyMatrix4(hm);
      const q = qFromNormal(n, 0.5);
      const m = new THREE.Matrix4().compose(p, q, V(1, 1, 1));
      const rr = Math.max(ew, eh) * 1.12;
      if (cfg.glasses === 'square') rb.add(G.torus(rr, 0.011, 3, 4), gcol, M(m, { rz: Math.PI / 4, sx: 1.1 }), b.head);
      else rb.add(G.torus(rr, 0.011, 3, 12), gcol, m, b.head);
      if (shades) rb.add(G.sphere(8, 5), '#1f2a3d', M(m, { sx: rr * 0.98, sy: rr * 0.92, sz: 0.012 }), b.head);
      // arm to the ear
      const ear = V(s * d.Rx * 0.98, ey + 0.01, -0.02).applyMatrix4(hm);
      const edge = V(s * (ex + rr), ey, surf.z(s * (ex + rr * 0.9), ey) + 0.012).applyMatrix4(hm);
      const mid = ear.clone().add(edge).multiplyScalar(0.5);
      const dir = edge.clone().sub(ear);
      const qa = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
      rb.add(G.cyl(0.008, 0.008, dir.length(), 4), gcol, new THREE.Matrix4().compose(mid, qa, V(1, 1, 1)), b.head);
    }
    const bz = surf.z(0, ey) + 0.03;
    rb.add(G.capsule(0.008, ex * 2 - Math.max(ew, eh) * 2.4, 1, 4), gcol, M(hm, { y: ey + 0.01, z: bz, rz: Math.PI / 2 }), b.head);
  }
  const fh = cfg.facial;
  const hc = cfg.facialColor || C.hair;
  if (fh === 'moustache' || fh === 'handlebar') {
    const y = meta.mouthY + 0.036 * HS;
    for (const s of [1, -1]) {
      const x = s * 0.034 * HS;
      const n = surf.normal(x, y);
      const p = V(x, y, surf.z(x, y)).addScaledVector(n, 0.012).applyMatrix4(hm);
      const m = new THREE.Matrix4().compose(p, qFromNormal(n, 0.9), V(1, 1, 1));
      rb.add(G.sphere(8, 6), hc, M(m, { rz: s * -0.28, sx: 0.046 * HS, sy: 0.021 * HS, sz: 0.022 }), b.head);
      if (fh === 'handlebar') rb.add(G.sphere(6, 5), hc, M(m, { x: s * 0.05 * HS, y: 0.012, rz: s * 0.9, sx: 0.028 * HS, sy: 0.012, sz: 0.014 }), b.head);
    }
  } else if (fh === 'beard' || fh === 'bigbeard') {
    const big = fh === 'bigbeard';
    rb.add(G.sphere(10, 7), hc, M(hm, { y: -0.42 * R, z: 0.3 * R, sx: 0.78 * R, sy: (big ? 0.62 : 0.46) * R, sz: 0.62 * R }), b.head);
    for (const s of [1, -1]) rb.add(G.sphere(8, 6), hc, M(hm, { x: s * 0.72 * R, y: -0.25 * R, z: 0.05 * R, sx: 0.22 * R, sy: 0.42 * R, sz: 0.4 * R }), b.head);
    const y = meta.mouthY + 0.038 * HS;
    for (const s of [1, -1]) {
      const x = s * 0.036 * HS, n = surf.normal(x, y);
      const p = V(x, y, surf.z(x, y)).addScaledVector(n, 0.016).applyMatrix4(hm);
      rb.add(G.sphere(8, 6), hc, new THREE.Matrix4().compose(p, qFromNormal(n, 0.9), V(1, 1, 1)).multiply(tf({ rz: s * -0.25, sx: 0.05 * HS, sy: 0.022 * HS, sz: 0.022 })), b.head);
    }
  } else if (fh === 'stubble') {
    rb.add(G.sphere(10, 7), shade(C.skin, 0.8, -0.1), M(hm, { y: -0.36 * R, z: 0.08 * R, sx: 0.9 * R, sy: 0.55 * R, sz: 0.86 * R }), b.head);
  }
  if (cfg.pipe) { // sailor's pipe in the corner of the mouth
    const x0 = 0.05 * HS, y0 = meta.mouthY + 0.004;
    const beard = cfg.facial === 'beard' || cfg.facial === 'bigbeard' ? 0.03 : 0;
    const p = V(x0, y0, surf.z(x0, y0) + 0.01 + beard).applyMatrix4(hm);
    const tip = p.clone().add(V(0.15, -0.02, 0.1));
    const dir = tip.clone().sub(p);
    rb.add(G.cyl(0.011, 0.011, dir.length(), 5), '#3a2a20', new THREE.Matrix4().compose(p.clone().add(tip).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.normalize()), V(1, 1, 1)), b.head);
    rb.add(G.cyl(0.03, 0.024, 0.065, 8), (px, py, pz, c) => c.set(py > 0.026 ? '#2b2b3a' : '#9a6a3a'), { x: tip.x, y: tip.y + 0.028, z: tip.z }, b.head);
  }
  if (cfg.straw) {
    const p = V(0.04 * HS, meta.mouthY, surf.z(0.04, meta.mouthY)).applyMatrix4(hm);
    rb.add(G.cyl(0.007, 0.007, 0.2, 4), '#f2d27a', { x: p.x + 0.07, y: p.y + 0.03, z: p.z + 0.04, rz: -1.2, ry: -0.5, order: 'YXZ' }, b.head);
  }
}

// ---------------------------------------------------------------- hats
export const HATS = ['flatcap', 'bowler', 'tophat', 'beanie', 'hardhat', 'chef', 'sunhat', 'fisherman', 'police', 'postman', 'cap', 'beret', 'straw', 'bucket', 'party', 'veil', 'headband', 'captain', 'swimcap', 'sailor', 'boater'];

function buildHat(rb, b, d, cfg, C, hm, meta) {
  const h = cfg.hat;
  if (!h) { meta.hatTop = d.R * 1.05; return; }
  const { R, Rx } = d;
  const col = h.color, col2 = h.color2 || shade(col, 0.72);
  // seat height (head space, x R) so every crown clears the hair helmet (~1.08R)
  const SEAT = { headband: 0.35, flatcap: 0.55, beret: 0.64, party: 0.9, tophat: 0.7, veil: 0.5, swimcap: 0.3, sailor: 0.62, boater: 0.56, captain: 0.52 };
  const baseY = (SEAT[h.type] ?? 0.52) * R;
  const pivot = V(0, baseY, -0.04 * R).applyMatrix4(hm);
  b.hat = rb.bone('hat', b.head, pivot.toArray());
  const hb = new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z).multiply(new THREE.Matrix4().makeRotationX(-0.08));
  const add = (g, c, t) => rb.add(g, c, M(hb, t), b.hat);
  // closed shapes so a hat still looks solid from below (lying down, tumbling through the air)
  const lining = shade(col, 0.62);
  const dome = (c, t, seg = [12, 4]) => { add(G.hemi(...seg), c, t); add(G.disc(seg[0]), lining, t); };
  const brim = (pts, seg, c, t, th = 0.035 * R) => add(lathe([...pts.slice(0, -1).reverse().map(([r, y]) => [r, y - th]), ...pts], seg - 2), c, t);
  let top = 0.6 * R;
  switch (h.type) {
    case 'flatcap':
      add(G.sphere(12, 8), col, { y: 0.14 * R, z: 0.1 * R, sx: 1.06 * R, sy: 0.42 * R, sz: 1.16 * R, rx: 0.12 });
      add(G.sphere(12, 6), col2, { y: 0.02 * R, z: 0.9 * R, sx: 0.78 * R, sy: 0.08 * R, sz: 0.36 * R, rx: 0.2 });
      add(G.sphere(6, 4), col2, { y: 0.54 * R, z: 0.2 * R, s: 0.07 * R });
      top = 0.55 * R;
      break;
    case 'bowler':
      dome(col, { y: -0.06 * R, sx: 1.02 * R, sy: 0.84 * R, sz: 1.06 * R }, [12, 4]);
      add(G.cyl(1.03 * R, 1.03 * R, 0.1 * R, 12), col2, { y: 0.02 * R, sz: 1.04 });
      add(G.cyl(1.32 * R, 1.36 * R, 0.05 * R, 12), col, { y: -0.04 * R, sz: 1.08 });
      top = 0.78 * R;
      break;
    case 'tophat':
      add(G.cyl(0.9 * R, 0.85 * R, 1.15 * R, 12), col, { y: 0.56 * R, sz: 1.05 });
      add(G.cyl(0.87 * R, 0.87 * R, 0.2 * R, 12), h.band || P.tomato, { y: 0.12 * R, sz: 1.06 });
      add(G.cyl(1.3 * R, 1.34 * R, 0.06 * R, 12), col, { y: -0.03 * R, sz: 1.08 });
      top = 1.15 * R;
      break;
    case 'beanie':
      dome(col, { y: -0.28 * R, sx: 1.1 * R, sy: 1.14 * R, sz: 1.14 * R }, [12, 4]);
      add(G.cyl(1.12 * R, 1.14 * R, 0.24 * R, 12), col2, { y: -0.2 * R, sz: 1.04 });
      add(G.sphere(8, 6), h.pom || '#fff8ee', { y: 0.92 * R, s: 0.2 * R });
      top = 1.05 * R;
      break;
    case 'hardhat':
      dome(col, { y: -0.12 * R, sx: 1.06 * R, sy: 0.9 * R, sz: 1.1 * R }, [12, 4]);
      brim([[1.42 * R, 0], [1.3 * R, 0.03 * R], [1.0 * R, 0.07 * R], [0.9 * R, 0.06 * R]], 14, col, { y: -0.14 * R, sz: 1.06 });
      add(G.capsule(0.08 * R, 1.0 * R, 2, 6), shade(col, 0.9), { y: 0.66 * R, rx: Math.PI / 2, sy: 1, sx: 1, sz: 1 });
      top = 0.8 * R;
      break;
    case 'chef':
      add(G.cyl(1.06 * R, 1.04 * R, 0.55 * R, 12), col, { y: 0.14 * R, sz: 1.05 });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        add(G.sphere(7, 5), col, { x: Math.sin(a) * 0.55 * R, y: 0.95 * R, z: Math.cos(a) * 0.55 * R, s: 0.64 * R });
      }
      add(G.sphere(10, 6), col, { y: 1.2 * R, sx: 0.8 * R, sy: 0.55 * R, sz: 0.8 * R });
      top = 1.6 * R;
      break;
    case 'sunhat': case 'straw':
      dome(col, { y: -0.05 * R, sx: 1.01 * R, sy: 0.84 * R, sz: 1.05 * R }, [12, 4]);
      brim([[2.0 * R, -0.16 * R], [1.6 * R, -0.03 * R], [1.0 * R, 0.02 * R], [0.9 * R, 0.03 * R]], 14, (x, y, z, c) => c.set(Math.hypot(x, z) > 1.93 * R && h.type === 'straw' ? shade(col, 0.85) : col), { y: -0.02 * R });
      add(G.cyl(1.02 * R, 1.03 * R, 0.16 * R, 12), h.band || P.bubblegum, { y: 0.06 * R, sz: 1.04 });
      if (h.type === 'sunhat') add(G.sphere(6, 4), h.flower || P.sunflower, { x: 0.6 * R, y: 0.1 * R, z: 0.72 * R, s: 0.16 * R });
      top = 0.75 * R;
      break;
    case 'fisherman':
      dome(col, { y: -0.18 * R, sx: 1.08 * R, sy: 0.95 * R, sz: 1.1 * R }, [12, 4]);
      brim([[1.5 * R, -0.3 * R], [1.3 * R, -0.12 * R], [1.02 * R, 0.0], [0.98 * R, 0.01 * R]], 14, col, { y: -0.14 * R, z: -0.12 * R, rx: -0.18, sz: 1.08 });
      top = 0.78 * R;
      break;
    case 'bucket':
      add(G.cyl(0.86 * R, 1.03 * R, 0.72 * R, 12), col, { y: 0.3 * R, sz: 1.04 });
      brim([[1.46 * R, -0.22 * R], [1.2 * R, -0.08 * R], [0.98 * R, 0]], 14, col2, { y: -0.04 * R, sz: 1.04 });
      top = 0.66 * R;
      break;
    case 'police':
      add(lathe([[1.0 * R, 0], [1.02 * R, 0.3 * R], [0.92 * R, 0.7 * R], [0.7 * R, 1.05 * R], [0.4 * R, 1.26 * R], [0, 1.32 * R]], 14), col, { y: -0.25 * R, s: 1.08, sz: 1.12 });
      add(G.disc(12), lining, { y: -0.25 * R, sx: 1.08 * R, sy: 1, sz: 1.12 * 1.08 * R });
      add(G.cyl(1.12 * R, 1.16 * R, 0.07 * R, 12), col, { y: -0.24 * R, sz: 1.06 });
      add(G.sphere(8, 6), '#dfe5ee', { y: 1.1 * R, s: 0.11 * R });
      add(G.cyl(0.2 * R, 0.2 * R, 0.05 * R, 8), '#e8edf4', { y: 0.28 * R, z: 1.0 * R, rx: Math.PI / 2 - 0.2 });
      add(G.cone(0.22 * R, 0.1 * R, 8), '#ffd76a', { y: 0.28 * R, z: 1.04 * R, rx: Math.PI / 2 - 0.2 });
      top = 1.1 * R;
      break;
    case 'postman': case 'peaked':
      add(G.cyl(1.16 * R, 1.0 * R, 0.66 * R, 12), col, { y: 0.28 * R, sz: 1.05 });
      add(G.cyl(1.03 * R, 1.01 * R, 0.14 * R, 12), h.band || P.tomato, { y: 0.01 * R, sz: 1.06 });
      add(G.sphere(12, 6), P.ink, { y: -0.06 * R, z: 0.86 * R, sx: 0.72 * R, sy: 0.07 * R, sz: 0.42 * R, rx: 0.3 });
      add(G.sphere(6, 4), '#ffd76a', { y: 0.3 * R, z: 1.1 * R, sx: 0.14 * R, sy: 0.12 * R, sz: 0.05 * R });
      top = 0.62 * R;
      break;
    case 'cap':
      dome(col, { y: -0.16 * R, sx: 1.06 * R, sy: 0.94 * R, sz: 1.1 * R }, [12, 4]);
      add(G.sphere(12, 6), col2, { y: -0.14 * R, z: 0.98 * R, sx: 0.7 * R, sy: 0.06 * R, sz: 0.58 * R, rx: 0.1 });
      add(G.sphere(6, 4), col2, { y: 0.74 * R, s: 0.08 * R });
      top = 0.76 * R;
      break;
    case 'beret':
      add(G.sphere(12, 8), col, { x: 0.2 * R, y: 0.12 * R, z: 0.05 * R, sx: 1.18 * R, sy: 0.34 * R, sz: 1.14 * R, rz: -0.22, rx: 0.1 });
      add(G.cyl(0.04 * R, 0.05 * R, 0.16 * R, 6), col2, { x: 0.12 * R, y: 0.48 * R, rz: -0.22 });
      top = 0.5 * R;
      break;
    case 'party':
      add(G.cone(0.62 * R, 1.3 * R, 12), (x, y, z, c) => c.set(Math.floor((y + 0.65 * R) / (0.22 * R)) % 2 ? col : col2), { y: 0.55 * R, rz: 0.15 });
      add(G.sphere(8, 6), h.pom || P.sunflower, { x: -0.19 * R, y: 1.22 * R, s: 0.17 * R });
      top = 1.3 * R;
      break;
    case 'veil': {
      const fl = [P.bubblegum, '#fff8ee', P.sunflower];
      for (let i = 0; i < 9; i++) {
        const a = -1.5 + (i / 8) * 3.0;
        add(G.sphere(5, 3), fl[i % 3], { x: Math.sin(a) * 0.92 * Rx, y: 0.16 * R + Math.cos(a) * 0.1 * R, z: Math.cos(a) * 0.72 * R - 0.12 * R, s: 0.13 * R });
      }
      add(lathe([[0.9 * R, 0], [1.0 * R, -0.5 * R], [1.15 * R, -1.3 * R], [1.3 * R, -2.1 * R]], 12, [], Math.PI - 1.35, 2.7), '#fbf7f0', { y: 0.12 * R, z: -0.08 * R });
      top = 0.35 * R;
      break;
    }
    case 'headband':
      add(G.torus(1.0 * R, 0.09 * R, 5, 18), col, { y: 0.02 * R, rx: Math.PI / 2, sx: 0.98, sy: 1.02 });
      top = 0.2 * R;
      break;
    case 'captain': { // white-topped peaked cap, navy band, gold braid + badge
      add(G.cyl(1.22 * R, 1.02 * R, 0.5 * R, 12), col, { y: 0.34 * R, sz: 1.04 });
      add(G.cyl(1.04 * R, 1.03 * R, 0.2 * R, 12), h.band || '#243056', { y: 0.08 * R, sz: 1.05 });
      add(G.sphere(12, 6), P.ink, { y: -0.03 * R, z: 0.86 * R, sx: 0.74 * R, sy: 0.07 * R, sz: 0.44 * R, rx: 0.28 });
      add(G.capsule(0.045 * R, 0.8 * R, 1, 5), '#ffd23c', { y: 0.06 * R, z: 1.07 * R, rz: Math.PI / 2 });
      add(G.sphere(6, 4), '#ffd23c', { y: 0.3 * R, z: 1.16 * R, sx: 0.2 * R, sy: 0.17 * R, sz: 0.06 * R });
      for (const s of [1, -1]) add(G.sphere(5, 3), '#ffd23c', { x: s * 0.22 * R, y: 0.26 * R, z: 1.12 * R, sx: 0.13 * R, sy: 0.07 * R, sz: 0.05 * R, rz: s * 0.5 });
      top = 0.6 * R;
      break;
    }
    case 'swimcap': { // rubber swim cap with a few flower bumps
      dome(col, { y: -0.3 * R, rx: -0.42, sx: 1.08 * R, sy: 1.05 * R, sz: 1.1 * R }, [12, 5]);
      if (h.flowers !== false) {
        for (const [yaw, el] of [[0.5, 0.9], [-0.9, 0.6], [2.2, 0.8], [-2.4, 0.45], [1.3, 0.35]]) {
          const dir = V(Math.sin(yaw) * Math.cos(el), Math.sin(el), Math.cos(yaw) * Math.cos(el));
          const p = dir.clone().multiply(V(1.07 * R, 1.04 * R, 1.09 * R)).add(V(0, -0.3 * R, 0));
          if (p.z > 0.5 * R && p.y < 0.2 * R) continue; // keep the forehead clear
          const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), dir);
          add(G.sphere(6, 3), (x, y, z, c) => c.set(z > 0.55 ? (h.pom || '#fff8ee') : col2), new THREE.Matrix4().compose(p, q, V(0.16 * R, 0.16 * R, 0.07 * R)));
        }
      }
      top = 0.8 * R;
      break;
    }
    case 'sailor': // white "Dixie cup" sailor hat, worn at a jaunty angle
      add(G.cyl(0.8 * R, 0.92 * R, 0.44 * R, 12), col, { y: 0.2 * R, rx: -0.2, rz: 0.12 });
      add(G.torus(0.95 * R, 0.13 * R, 4, 14), shade(col, 0.95), { y: 0.02 * R, rx: Math.PI / 2 - 0.2, ry: 0, rz: 0.12, order: 'ZYX' });
      if (h.band) add(G.cyl(0.82 * R, 0.84 * R, 0.08 * R, 12), h.band, { y: 0.28 * R, rx: -0.2, rz: 0.12 });
      top = 0.5 * R;
      break;
    case 'boater': // flat-topped straw boater with a ribbon
      add(G.cyl(0.98 * R, 1.02 * R, 0.42 * R, 12), col, { y: 0.2 * R, sz: 1.04 });
      add(G.cyl(1.035 * R, 1.045 * R, 0.15 * R, 12), h.band || '#243056', { y: 0.07 * R, sz: 1.05 });
      add(G.cyl(1.6 * R, 1.6 * R, 0.045 * R, 16), (x, y, z, c) => c.set(Math.hypot(x, z) > 1.5 * R ? shade(col, 0.88) : col), { y: -0.01 * R, sz: 1.04 });
      top = 0.42 * R;
      break;
    default:
      dome(col, { sx: R, sy: 0.7 * R, sz: R }, [12, 4]);
  }
  meta.hatTop = baseY + top;
}

// ---------------------------------------------------------------- worn accessories (merged)
function buildWorn(rb, b, d, cfg, C) {
  const acc = [].concat(cfg.accessory || []);
  const hy = d.shY - d.armLen - d.handR * 0.62;
  // bags carried in the left hand get their own bone so Person can tuck them away when that hand is busy
  if (acc.some((a) => a === 'bag' || a === 'handbag' || a === 'shopping')) b.carryL = rb.bone('carryL', b.handL, [d.shX, d.shY - d.armLen, 0]);
  for (const a of acc) {
    if (a === 'bag' || a === 'handbag') { // handbag hanging from the left hand
      const col = cfg.bagColor || P.roofPlum;
      rb.add(G.torus(0.05, 0.01, 4, 10, Math.PI), shade(col, 0.8), { x: d.shX + 0.02, y: hy - 0.02, rz: Math.PI }, b.carryL);
      rb.add(G.box(0.16, 0.13, 0.08), col, { x: d.shX + 0.03, y: hy - 0.12 }, b.carryL);
      rb.add(G.sphere(6, 4), '#ffd76a', { x: d.shX + 0.03, y: hy - 0.08, z: 0.042, s: 0.013 }, b.carryL);
    } else if (a === 'shopping') {
      const col = cfg.bagColor || '#e8d7b0';
      rb.add(G.box(0.2, 0.2, 0.12), col, { x: d.shX + 0.04, y: hy - 0.13 }, b.carryL);
      rb.add(G.cyl(0.018, 0.018, 0.34, 6), '#e3b56b', { x: d.shX + 0.02, y: hy - 0.02, z: 0.02, rz: 0.25 }, b.carryL);
      for (const k of [-0.035, 0.035]) rb.add(G.sphere(6, 4), P.grassLight, { x: d.shX + 0.08 + k, y: hy + 0.0, z: -0.02, sx: 0.03, sy: 0.07, sz: 0.03 }, b.carryL);
    } else if (a === 'postbag') {
      const col = cfg.bagColor || P.tomato;
      rb.add(G.box(0.2, 0.17, 0.08), col, { x: -d.bodyR * 0.95, y: d.waistY - 0.02, z: 0.02, ry: -0.35 }, b.hips);
      rb.add(G.box(0.2, 0.06, 0.084), shade(col, 0.8), { x: -d.bodyR * 0.95, y: d.waistY + 0.05, z: 0.022, ry: -0.35 }, b.hips);
      const r = profR(0.55, cfg.build.belly) * d.bodyR * 1.03;
      rb.add(G.torus(r, 0.016, 4, 22), shade(col, 0.75), { y: d.bodyBottom + 0.57 * d.bodyH, rx: Math.PI / 2, rz: 0.62, order: 'ZXY', sx: 1.22, sz: d.bodyD }, b.spine);
    } else if (a === 'balloon') {
      const col = cfg.balloonColor || P.tomato;
      const top = V(d.shX + 0.1, 2.3, 0.12);
      const hand = V(d.shX + 0.004, hy - 0.02, 0);
      const len = top.y - hand.y;
      const bb = rb.bones[b.prop];
      bb.world = new THREE.Matrix4().makeTranslation(top.x, top.y, top.z);
      rb.add(G.sphere(12, 10), col, { x: top.x, y: top.y + 0.2, z: top.z, sx: 0.21, sy: 0.25, sz: 0.21 }, b.prop);
      rb.add(G.cone(0.035, 0.05, 6), col, { x: top.x, y: top.y - 0.04, z: top.z, rx: Math.PI }, b.prop);
      const dir = top.clone().sub(hand);
      const mid = hand.clone().add(top).multiplyScalar(0.5);
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
      rb.add(new THREE.CylinderGeometry(0.006, 0.006, len, 3, 6, true), '#fbf7f0', new THREE.Matrix4().compose(mid, q, V(1, 1, 1)), (x, y) => {
        const k = smooth01((y - hand.y) / len);
        return [b.handL, 1 - k, b.prop, k];
      });
    } else if (a === 'whistle') { // lifeguard whistle on a lanyard
      const cord = cfg.lanyardColor || '#ff5a4e';
      const r = profR(0.9, cfg.build.belly) * d.bodyR * 1.02;
      rb.add(G.torus(r, 0.009, 3, 16), cord, { y: d.bodyBottom + 0.86 * d.bodyH, z: 0.02, rx: Math.PI / 2 - 0.55, sz: d.bodyD }, b.spine);
      const p = V(0, d.bodyBottom + 0.7 * d.bodyH, profR(0.7, cfg.build.belly) * d.bodyR * d.bodyD + 0.02);
      rb.add(G.capsule(0.017, 0.04, 2, 6), '#d9e0e8', { x: p.x + 0.015, y: p.y, z: p.z, rz: Math.PI / 2 }, b.spine);
      rb.add(G.cyl(0.018, 0.018, 0.02, 6), '#b8c2cc', { x: p.x - 0.022, y: p.y + 0.012, z: p.z }, b.spine);
    } else if (a === 'watch') {
      const wy = d.shY - d.armLen + 0.04;
      rb.add(G.cyl(0.024, 0.024, 0.014, 8), '#ffd23c', { x: d.shX + d.armR * 0.95, y: wy, rz: Math.PI / 2 }, b.foreL);
      rb.add(G.cyl(0.018, 0.018, 0.016, 8), '#fbf7f0', { x: d.shX + d.armR * 0.95 + 0.002, y: wy, rz: Math.PI / 2 }, b.foreL);
      rb.add(G.torus(d.armR * 1.02, 0.008, 3, 10), '#5a3a22', { x: d.shX, y: wy, rx: Math.PI / 2 }, b.foreL);
    } else if (a === 'scarf') {
      const col = cfg.scarfColor || P.tomato;
      rb.add(G.torus(profR(0.93, cfg.build.belly) * d.bodyR * 1.02, 0.042, 4, 12), col, { y: d.bodyBottom + 0.93 * d.bodyH, rx: Math.PI / 2, sz: d.bodyD }, b.spine);
      rb.add(G.capsule(0.035, 0.18, 2, 5), col, { x: 0.08, y: d.bodyBottom + 0.8 * d.bodyH, z: d.bodyR * 0.9, rz: 0.1 }, b.spine);
    }
  }
}
