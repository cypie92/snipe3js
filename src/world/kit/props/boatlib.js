// Shared boat helpers: a parametric toy hull (waterline at y = 0, bow = +Z), a bobbing rig for
// anything that floats, chunky 7-segment numerals for hull numbers and painted hull names.
import * as THREE from 'three';
import { part, merge } from '../../geo.js';
import { paintFaces, inside, wordSign } from './lib.js';

const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

export const ANTIFOUL = '#b8483a';
export const BOOT = '#fff4e6';

/**
 * Toy hull. Waterline y = 0, keel below, bow toward +Z, centred on z = 0.
 * opts: L length, W beam, H freeboard (gunwale above water), D draft, sheer (bow rise), sternSheer,
 * sternW (transom width 0..1), stations, deck: 'flat' | 'open', deckDrop (deck below gunwale),
 * rim (gunwale thickness), colors: { hull, bottom, boot, rim, deck, inner, painter(x, y, z, color) }.
 * Returns { geo (painted, merged), widthAt(t), gunwaleAt(t), zAt(t), deckY(t) } (t: 0 stern .. 1 bow).
 */
export function hull({
  L = 5, W = 2, H = 0.8, D = 0.6, sheer = 0.35, sternSheer = 0.08, sternW = 0.72, stations = 14,
  deck = 'flat', deckDrop = 0.22, rim = 0.08, colors = {}, bootH = 0.14,
} = {}) {
  const C = { hull: '#e0643c', bottom: ANTIFOUL, boot: BOOT, rim: '#fff4e6', deck: '#c0824a', inner: '#d8b27c', ...colors };
  const widthAt = (t) => (t < 0.55
    ? (W / 2) * (sternW + (1 - sternW) * smooth(t / 0.55))
    : (W / 2) * Math.sqrt(Math.max(0, 1 - ((t - 0.55) / 0.45) ** 2)));
  const gunwaleAt = (t) => H + sheer * Math.max(0, (t - 0.45) / 0.55) ** 2 + sternSheer * Math.max(0, (0.25 - t) / 0.25);
  const draftAt = (t) => {
    let d = D;
    if (t > 0.68) d *= 1 - 0.78 * ((t - 0.68) / 0.32) ** 1.4;
    if (t < 0.12) d *= 0.85 + 0.15 * (t / 0.12);
    return d;
  };
  const zAt = (t) => -L / 2 + t * L;
  const deckY = (t) => gunwaleAt(t) - deckDrop;
  // half section (starboard): gunwale -> boot top -> waterline -> bilge curve -> keel
  const PHI = [0.4, 0.8, 1.2, Math.PI / 2];
  const half = (t) => {
    const b = widthAt(t), g = gunwaleAt(t), d = draftAt(t);
    const pts = [[b, g], [b, Math.min(bootH, g - 0.02)], [b * 0.995, 0]];
    for (const f of PHI) pts.push([b * Math.cos(f) ** 0.75, -d * Math.sin(f) ** 0.85]);
    return pts;
  };
  const M = PHI.length + 3;
  const ring = (t) => {
    const h = half(t);
    const out = [];
    for (let i = 0; i < M; i++) out.push([h[i][0], h[i][1]]);
    for (let i = M - 2; i >= 0; i--) out.push([-h[i][0], h[i][1]]);
    return out; // 2M-1 points, starboard gunwale -> keel -> port gunwale
  };
  const S = stations;
  const pos = [];
  const idx = [];
  const R = 2 * M - 1;
  for (let s = 0; s <= S; s++) {
    const t = s / S;
    const z = zAt(t);
    for (const [x, y] of ring(t)) pos.push(x, y, z);
  }
  for (let s = 0; s < S; s++) {
    for (let i = 0; i < R - 1; i++) {
      const a = s * R + i, b = a + 1, c = (s + 1) * R + i, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  let shell = new THREE.BufferGeometry();
  shell.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  shell.setIndex(idx);
  shell.computeVertexNormals();
  // make sure the shell faces outward (starboard mid-ship normal must point +x)
  const nx = shell.attributes.normal.getX(Math.round(S / 2) * R + 1);
  shell = part(shell, '#fff');
  if (nx < 0) inside(shell);
  const paintHull = C.painter || ((x, y, z, c) => c.set(y > bootH + 0.001 ? C.hull : y > 0 ? C.boot : C.bottom));
  paintFaces(shell, (x, y, z, fx, fy, fz, c) => paintHull(x, y, z, c));
  const list = [shell];
  // transom (stern face) as a fan
  const tr = ring(0);
  const tpos = [];
  const z0 = zAt(0);
  const cy = tr.reduce((a, p) => a + p[1], 0) / tr.length;
  for (let i = 0; i < tr.length - 1; i++) {
    const a = tr[i], b = tr[i + 1];
    tpos.push(0, cy, z0, b[0], b[1], z0, a[0], a[1], z0);
  }
  tpos.push(0, cy, z0, tr[0][0], tr[0][1], z0, tr[tr.length - 1][0], tr[tr.length - 1][1], z0);
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(tpos, 3));
  tg.computeVertexNormals();
  let tgp = part(tg, '#fff');
  if (tgp.attributes.normal.getZ(0) > 0) inside(tgp);
  paintFaces(tgp, (x, y, z, fx, fy, fz, c) => paintHull(x, y, z, c));
  list.push(tgp);
  // rim (gunwale cap), inner faces and deck / open interior
  const quads = [];
  const quad = (a, b, c, d, col, mode) => quads.push({ v: [a, b, c, d], col, mode });
  for (let s = 0; s < S; s++) {
    const t0 = s / S, t1 = (s + 1) / S;
    const za = zAt(t0), zb = zAt(t1);
    const b0 = widthAt(t0), b1 = widthAt(t1), g0 = gunwaleAt(t0), g1 = gunwaleAt(t1);
    const i0 = Math.max(0, b0 - rim), i1 = Math.max(0, b1 - rim);
    for (const sx of [1, -1]) {
      quad([sx * b0, g0 + 0.02, za], [sx * b1, g1 + 0.02, zb], [sx * i1, g1 + 0.02, zb], [sx * i0, g0 + 0.02, za], C.rim);
      if (deck === 'flat') {
        quad([sx * i0, g0 + 0.02, za], [sx * i1, g1 + 0.02, zb], [sx * i1, deckY(t1), zb], [sx * i0, deckY(t0), za], C.hull);
      } else {
        const f0 = -draftAt(t0) + 0.14, f1 = -draftAt(t1) + 0.14;
        quad([sx * i0, g0 + 0.02, za], [sx * i1, g1 + 0.02, zb], [sx * i1 * 0.9, (g1 + f1) / 2, zb], [sx * i0 * 0.9, (g0 + f0) / 2, za], C.inner);
        quad([sx * i0 * 0.9, (g0 + f0) / 2, za], [sx * i1 * 0.9, (g1 + f1) / 2, zb], [sx * i1 * 0.55, f1, zb], [sx * i0 * 0.55, f0, za], C.inner);
      }
    }
    if (deck === 'flat') quad([i0, deckY(t0), za], [i1, deckY(t1), zb], [-i1, deckY(t1), zb], [-i0, deckY(t0), za], C.deck);
    else {
      const f0 = -draftAt(t0) + 0.14, f1 = -draftAt(t1) + 0.14;
      quad([i0 * 0.55, f0, za], [i1 * 0.55, f1, zb], [-i1 * 0.55, f1, zb], [-i0 * 0.55, f0, za], C.deck);
    }
  }
  // inner stern wall (so you never see through the transom from inside)
  const ib = Math.max(0, widthAt(0) - rim), ig = gunwaleAt(0);
  const iy = deck === 'flat' ? deckY(0) : -draftAt(0) + 0.14;
  quad([ib, ig + 0.02, z0 + 0.03], [ib, iy, z0 + 0.03], [-ib, iy, z0 + 0.03], [-ib, ig + 0.02, z0 + 0.03], deck === 'flat' ? C.hull : C.inner, '+z');
  const qp = [], qc = [];
  const col = new THREE.Color();
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), cen = new THREE.Vector3(), nrm = new THREE.Vector3();
  for (const q of quads) {
    col.set(q.col);
    // orient: rim/deck up, inner walls toward the centre line
    const [a, b, c, d] = q.v;
    va.fromArray(a); vb.fromArray(b); vc.fromArray(c);
    nrm.subVectors(vb, va).cross(vc.clone().sub(va));
    cen.set((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2);
    const wantUp = Math.abs(a[1] - d[1]) < 1e-4 && Math.abs(b[1] - c[1]) < 1e-4;
    const flip = q.mode === '+z' ? nrm.z < 0 : wantUp ? nrm.y < 0 : nrm.x * cen.x > 0;
    const tri = flip ? [a, c, b, a, d, c] : [a, b, c, a, c, d];
    for (const p of tri) { qp.push(p[0], p[1], p[2]); qc.push(col.r, col.g, col.b); }
  }
  const qg = new THREE.BufferGeometry();
  qg.setAttribute('position', new THREE.Float32BufferAttribute(qp, 3));
  qg.setAttribute('color', new THREE.Float32BufferAttribute(qc, 3));
  qg.computeVertexNormals();
  list.push(qg);
  return { geo: merge(list), widthAt, gunwaleAt, zAt, deckY, draftAt };
}

/**
 * Bobbing for floating props. Wraps the group's current children in a 'float' node that heaves,
 * rolls and pitches; amplitude = g.userData.bob (live: set 0 to settle, 1 = default, 2 = choppy).
 * node.userData.kick = { heave, roll, pitch } is added on top (animate it for hits / toots / wobble).
 * Returns the float node; the tick is registered on the group.
 */
export function floatRig(g, { bob = 1, seed = 1, heave = 0.05, roll = 0.035, pitch = 0.018, speed = 1 } = {}) {
  const node = new THREE.Group();
  node.name = 'float';
  for (const c of [...g.children]) node.add(c);
  g.add(node);
  g.userData.bob = bob;
  const kick = (node.userData.kick = { heave: 0, roll: 0, pitch: 0 });
  const ph = (seed * 2.399) % (Math.PI * 2);
  let amp = bob;
  g.userData.addTick((dt, t) => {
    const a = Number(g.userData.bob) || 0;
    amp += (a - amp) * Math.min(1, dt * 1.5);
    const w = t * speed;
    node.position.y = (Math.sin(w * 1.3 + ph) * 0.7 + Math.sin(w * 2.1 + ph * 1.7) * 0.3) * heave * amp + kick.heave;
    node.rotation.z = Math.sin(w * 0.9 + ph * 1.3) * roll * amp + kick.roll;
    node.rotation.x = Math.sin(w * 0.75 + ph * 2.1) * pitch * amp + kick.pitch;
  });
  return node;
}

const SEGS = { a: [0, 1, 1], b: [1, 0.5, 0], c: [1, -0.5, 0], d: [0, -1, 1], e: [-1, -0.5, 0], f: [-1, 0.5, 0], g: [0, 0, 1] };
const DIGITS = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g' };

/** Chunky 7-segment numerals in the XY plane facing +Z, centred. h = digit height. */
export function digits(str, h, color, depth = 0.02) {
  const w = h * 0.52, s = h * 0.15;
  const list = [];
  const chars = String(str).split('');
  const pitch = w + h * 0.22;
  chars.forEach((ch, k) => {
    const x0 = (k - (chars.length - 1) / 2) * pitch;
    for (const sg of DIGITS[ch] || '') {
      const [sx, sy, horiz] = SEGS[sg];
      const geo = horiz ? new THREE.BoxGeometry(w, s, depth) : new THREE.BoxGeometry(s, h / 2 + s * 0.5, depth);
      list.push(part(geo, color, { x: x0 + sx * (w - s) / 2, y: sy * (h - s) / 2 }));
    }
  });
  return merge(list);
}

/**
 * A painted boat name: letters (`ink`) on the hull colour (`paper`), on strips bent to the hull's plan
 * shape on both sides between z0..z1 (`at: 'sides'`, reads bow -> stern... i.e. correctly from each side)
 * or flat on the transom (`at: 'transom'`). Glossy sign-atlas material; all strips merged: 1 draw call.
 * y = strip centre height above the waterline, height = strip height (keep it between boot top and gunwale).
 */
export function hullName(h, text, { at = 'sides', z0, z1, y = 0.6, height = 0.36, paper = '#e0643c', ink = '#fff8ee', px = 420 } = {}) {
  const paint = { paper, ink, keyline: 0, bounce: 0.5, twoLines: false, pad: 0.06, shadow: 'rgba(43,43,58,0.35)' };
  const geos = [];
  let mat = null;
  const add = (m) => { mat = m.material; geos.push(m.geometry); };
  if (at === 'transom') {
    const t0 = h.zAt(0);
    const w = h.widthAt(0) * 2 * 0.8;
    const m = wordSign(text, w, height, { ...paint, px, round: 0, glossy: true });
    m.geometry.rotateY(Math.PI).translate(0, y, t0 - 0.012);
    add(m);
  } else {
    const len = z1 - z0, zc = (z0 + z1) / 2;
    const span = h.zAt(1) - h.zAt(0);
    for (const side of [1, -1]) {
      const m = wordSign(text, len, height, {
        ...paint, px, round: 0, glossy: true, segs: 10,
        bend: (v) => {
          const z = zc - side * v.x;
          const t = Math.min(1, Math.max(0, (z - h.zAt(0)) / span));
          v.set(side * (h.widthAt(t) + 0.012), y + v.y, z);
        },
      });
      add(m);
    }
  }
  const geo = merge(geos);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'name';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}
