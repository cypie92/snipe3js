// Boats for Barnacle Bay: fishing boat, rowboat, sailing dinghy, ferry, cargo boat, wrecked galleon.
// Waterline = y 0 (place the group at the water surface), bow = +Z. Floating boats bob via
// userData.bob (amplitude: 0 = still, 1 = default, 2 = choppy). parts.float = the bobbing node.
import * as THREE from 'three';
import { part, merge, xform, rbox, tube } from '../../geo.js';
import { materials } from '../../../gfx/materials.js';
import { P } from '../../../gfx/palette.js';
import { Rng } from '../../../core/rng.js';
import {
  bev, lathe, puck, ball, blob, rod, arc, slab, latheBands, lettering, mesh, pivot, finish, paintFaces,
  LiveMesh, Anims, ease, shade, boxCollider, ballCollider, collider, noise3, goldMaterial, inside,
} from './lib.js';
import { hull, floatRig, digits } from './boatlib.js';

const GLASS = '#4f8fbf';
const INK = '#2b2b3a';
const ROPE = '#e8d9b0';
const RUBBER = '#3a3e4c';
const CREAM = '#fff4e6';
const UP = new THREE.Vector3(0, 1, 0);
const lerp = THREE.MathUtils.lerp;

/** Pose for a decal flush on the hull side at z (side = +1 starboard, -1 port). */
function onHull(h, z, side = 1, out = 0.02) {
  const z0 = h.zAt(0), z1 = h.zAt(1);
  const t = Math.min(0.999, Math.max(0, (z - z0) / (z1 - z0)));
  const b = h.widthAt(t);
  const dt = 0.01;
  const s = (h.widthAt(Math.min(1, t + dt)) - b) / ((z1 - z0) * dt);
  return { x: side * (b + out), ry: Math.atan2(side, -s) };
}

/** Hanging tyre fenders along both sides. */
function fenders(L, h, zs, y) {
  for (const z of zs) {
    for (const side of [-1, 1]) {
      const p = onHull(h, z, side, 0.07);
      L.push(part(new THREE.TorusGeometry(0.19, 0.075, 5, 10), RUBBER, { x: p.x, y, z, ry: p.ry }));
      L.push(part(rod([p.x, y + 0.19, z], [p.x * 0.97, h.gunwaleAt(0.5) + 0.03, z], 0.014, 4), ROPE));
    }
  }
}

function lifebuoyGeo(r = 0.26, t = 0.07) {
  const g = part(new THREE.TorusGeometry(r, t, 6, 16), '#fff');
  return paintFaces(g, (x, y, z, nx, ny, nz, c) => {
    const a = Math.atan2(y, x) + Math.PI;
    c.set(Math.floor(a / (Math.PI / 4)) % 2 ? '#fff8ee' : P.tomato);
  });
}

/** Pennant string (static) between two points. */
function pennants(L, a, b, n, colors, size = 0.16) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  L.push(part(rod(A, B, 0.012, 4), ROPE));
  const dir = new THREE.Vector3().subVectors(B, A);
  const yaw = Math.atan2(dir.x, dir.z);
  for (let i = 0; i < n; i++) {
    const p = new THREE.Vector3().lerpVectors(A, B, (i + 0.5) / n);
    const tri = new THREE.ConeGeometry(size * 0.55, size * 1.2, 3);
    L.push(part(tri, colors[i % colors.length], { x: p.x, y: p.y - size * 0.6, z: p.z, rx: Math.PI, ry: yaw + Math.PI / 2, sz: 0.18 }));
  }
}

function boatFinish(g, { name, parts, surface = 'wood', bob, seed, anims, heave, roll, pitch }) {
  finish(g, { name, parts, surface, anims });
  const node = floatRig(g, { bob, seed, heave, roll, pitch });
  g.userData.parts.float = node;
  g.userData.wobble = (s = 1) => g.userData.anims.play(1.2, (k) => {
    node.rotation.z = Math.sin(k * Math.PI * 4) * (1 - k) * 0.08 * s;
  }, { key: 'wobble' });
  return g;
}

// ---------------------------------------------------------------- fishing boat

/**
 * fishingBoat({ seed, color, number, bob = 1 }) — chunky trawler: wheelhouse, mast with signal
 * pennants, net pile with floats, fish boxes, tyre fenders, hull number on both bows. ~7 m.
 * parts: { float, wheelhouse (Object3D, door side), nets, deck (Object3D on the aft deck) }.
 */
export function fishingBoat({ seed = 1, color, number, bob = 1 } = {}) {
  const rng = new Rng(`fishboat-${seed}`);
  const c = color || rng.pick([P.tomato, P.cobalt, P.teal, '#2f7fd0', P.sunflower]);
  const num = String(number ?? rng.int(2, 98));
  const h = hull({ L: 7.2, W: 2.7, H: 1.05, D: 0.85, sheer: 0.6, sternSheer: 0.1, sternW: 0.8, deck: 'flat', deckDrop: 0.32, rim: 0.1,
    colors: { hull: c, rim: CREAM, deck: '#c9a06a' } });
  const L = [h.geo];
  const dy = h.deckY(0.35);
  // wheelhouse
  const wz = -1.35;
  L.push(part(rbox(1.9, 1.45, 1.7, 0.18, 2), CREAM, { y: dy + 0.72, z: wz }));
  L.push(part(bev(1.56, 0.5, 0.06, 0.03), GLASS, { y: dy + 1.1, z: wz + 0.86 }));
  L.push(part(bev(1.95, 0.42, 1.2, 0.04), GLASS, { y: dy + 1.1, z: wz + 0.05 }));
  L.push(part(new THREE.BoxGeometry(1.98, 0.44, 0.1), CREAM, { y: dy + 1.1, z: wz + 0.05 }));
  L.push(part(bev(0.6, 1.0, 0.05, 0.02), shade(c, -0.25), { y: dy + 0.55, z: wz - 0.86 }));
  L.push(part(bev(2.12, 0.13, 1.95, 0.05), c, { y: dy + 1.5, z: wz }));
  L.push(lifebuoyGeo(0.24, 0.065).applyMatrix4(xform({ x: 0.97, y: dy + 0.62, z: wz + 0.2, ry: Math.PI / 2 })));
  // roof gear: mast, radar, horn, light
  L.push(part(rod([0, dy + 1.55, wz - 0.3], [0, dy + 3.2, wz - 0.3], 0.045, 6), CREAM));
  L.push(part(bev(0.9, 0.06, 0.06, 0.02), CREAM, { y: dy + 2.7, z: wz - 0.3 }));
  L.push(part(ball(0.07, 0), P.sunflower, { y: dy + 3.25, z: wz - 0.3 }));
  L.push(part(puck(0.2, 0.1, 0.03, 10), '#eef2f7', { y: dy + 1.75, z: wz + 0.45 }));
  L.push(part(rod([0, dy + 1.55, wz + 0.45], [0, dy + 1.7, wz + 0.45], 0.03, 5), '#9aa3b2'));
  // foremast + forestay with signal pennants
  const mz = 1.55;
  L.push(part(rod([0, dy, mz], [0, dy + 3.6, mz], 0.06, 6, 0.045), CREAM));
  L.push(part(bev(1.1, 0.07, 0.07, 0.02), CREAM, { y: dy + 3.0, z: mz }));
  const bowTip = [0, h.gunwaleAt(1) + 0.02, h.zAt(1) - 0.05];
  pennants(L, [0, dy + 3.55, mz], bowTip, 6, [P.tomato, P.sunflower, P.cobalt, '#fff8ee', P.teal, P.bubblegum]);
  pennants(L, [0, dy + 3.55, mz], [0, dy + 3.2, wz - 0.3], 5, [P.sunflower, P.tomato, '#fff8ee', P.cobalt, P.teal], 0.14);
  L.push(part(rod([0, dy + 1.4, mz], [0, dy + 2.4, mz - 1.3], 0.035, 5), shade(CREAM, -0.1)));
  // net pile with floats on the foredeck, fish boxes on the aft deck
  const net = part(blob(0.62, 1, 0.12, seed), '#fff', { y: dy + 0.18, z: 0.55, sx: 1.3, sy: 0.42, sz: 0.9 });
  paintFaces(net, (x, y, z, nx, ny, nz, cc) => cc.set((Math.floor(x * 9) + Math.floor(z * 9)) % 2 ? '#3d7a6e' : '#5a9c8c'));
  L.push(net);
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9;
    L.push(part(ball(0.075, 0), i % 2 ? P.tangerine : '#fff8ee', { x: Math.cos(a) * 0.7, y: dy + 0.3 + (i % 3) * 0.04, z: 0.55 + Math.sin(a) * 0.45 }));
  }
  for (const [x, z, k] of [[-0.45, -2.55, 0], [0.4, -2.6, 1], [0, -2.5, 2]]) {
    const by = dy + 0.14 + (k === 2 ? 0.28 : 0);
    L.push(part(bev(0.62, 0.28, 0.42, 0.04), k ? '#3a6ee8' : P.woodLight, { x, y: by, z }));
    for (let f = 0; f < 3; f++) L.push(part(ball(0.07, 0), '#9fb8d0', { x: x - 0.18 + f * 0.18, y: by + 0.16, z, sx: 1.8, sy: 0.6 }));
  }
  fenders(L, h, [-1.9, 0.2], 0.52);
  // hull numbers on both bows
  for (const side of [-1, 1]) {
    const p = onHull(h, 2.1, side, 0.025);
    L.push(digits(num, 0.46, '#fff8ee', 0.03).applyMatrix4(xform({ x: p.x, y: 0.62, z: 2.1, ry: p.ry })));
  }
  const g = new THREE.Group();
  g.add(mesh(L, materials.glossy, 'boat'));
  const wheelhouse = pivot('wheelhouse', 0, dy, wz - 0.9);
  const deck = pivot('deck', 0, dy, -2.5);
  g.add(wheelhouse, deck);
  g.add(boxCollider(2.7, 3.2, 7.2, { y: 1.1 }));
  return boatFinish(g, { name: 'fishingBoat', parts: { wheelhouse, deck }, surface: 'wood', bob, seed });
}

// ---------------------------------------------------------------- rowboat

/**
 * rowboat({ seed, color, bob = 1 }) — clinker-style rowing boat with seats and resting oars.
 * The anchor hangs over the bow on its rope. parts: { float, anchor (pivot), anchorRope (pivot, collider),
 * splash (Object3D where the anchor hits the water), seat (Object3D for a rower/snoozer), oars [L, R]
 * (pivots at the oarlocks) }. userData: dropAnchor() -> Promise (anchor drops, sinks; onSplash(worldPos)
 * fires), anchored, rowing (bool: oars sweep in a rowing stroke).
 */
export function rowboat({ seed = 1, color, bob = 1 } = {}) {
  const rng = new Rng(`rowboat-${seed}`);
  const c = color || rng.pick([P.teal, '#5fb0e8', P.sunflower, P.tomato, '#8ad14f']);
  const h = hull({ L: 3.3, W: 1.4, H: 0.44, D: 0.3, sheer: 0.2, sternSheer: 0.05, sternW: 0.72, deck: 'open', rim: 0.07,
    colors: { hull: c, rim: CREAM, inner: '#e0bd86', deck: '#c0824a' } });
  const L = [h.geo];
  const gw = h.gunwaleAt(0.5);
  // clinker lines along the hull sides
  for (const y of [0.18, 0.3]) {
    for (const side of [-1, 1]) {
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const t = 0.02 + i * 0.12;
        const z = h.zAt(t);
        pts.push(new THREE.Vector3(side * (h.widthAt(t) + 0.012), y + 0.03 * Math.max(0, t - 0.6), z));
      }
      L.push(part(tube(pts, 0.012, 16, 3), shade(c, -0.18)));
    }
  }
  for (const [z, w] of [[-0.95, 1.0], [0.15, 1.24], [1.05, 0.8]]) L.push(part(bev(w, 0.06, 0.26, 0.02), P.woodLight, { y: gw - 0.14, z }));
  // oarlocks (static) - the oars themselves are pivots (see below) so they can row
  const oarDefs = [];
  for (const side of [-1, 1]) {
    const lock = new THREE.Vector3(side * 0.68, gw + 0.06, 0.15);
    L.push(part(arc(0.05, 0.014, Math.PI, 4, 6), '#9aa3b2', { x: lock.x, y: lock.y, z: lock.z, ry: Math.PI / 2 }));
    oarDefs.push({ side, lock });
  }
  // bow cleat + ring
  const cleatP = new THREE.Vector3(0, h.gunwaleAt(0.93) + 0.03, h.zAt(0.93));
  L.push(part(bev(0.16, 0.05, 0.07, 0.02), '#9aa3b2', { x: cleatP.x, y: cleatP.y, z: cleatP.z }));
  const g = new THREE.Group();
  g.add(mesh(L, materials.glossy, 'boat'));
  // anchor + rope (LiveMesh pieces so they can move)
  const live = new LiveMesh(materials.toy);
  const anchor = pivot('anchor', 0, 0.12, h.zAt(1) + 0.16);
  anchor.rotation.set(0.1, 0, 0.12);
  const iron = '#4a5566';
  const aparts = [
    part(bev(0.05, 0.42, 0.05, 0.015), iron, { y: -0.2 }),
    part(bev(0.3, 0.05, 0.05, 0.015), iron, { y: -0.06 }),
    part(new THREE.TorusGeometry(0.055, 0.016, 4, 8), iron, { y: 0.03, ry: Math.PI / 2 }),
    part(arc(0.17, 0.026, Math.PI, 5, 8), iron, { y: -0.23, rz: Math.PI }),
  ];
  for (const s of [-1, 1]) aparts.push(part(new THREE.ConeGeometry(0.06, 0.12, 3), iron, { x: s * 0.17, y: -0.2, rz: s * 0.4, sz: 0.4 }));
  live.addPiece(anchor, merge(aparts));
  anchor.add(ballCollider(0.3, { y: -0.2 }));
  const rope = pivot('anchorRope', cleatP.x, cleatP.y, cleatP.z);
  live.addPiece(rope, part(new THREE.CylinderGeometry(0.018, 0.018, 1, 5, 1, true).translate(0, 0.5, 0), ROPE));
  const ropeCol = collider(new THREE.CylinderGeometry(0.16, 0.16, 1, 6, 1).translate(0, 0.5, 0));
  rope.add(ropeCol);
  // oars: pivots at the oarlocks, resting with the blades in the water; userData.rowing sweeps them
  const oars = [];
  for (const { side, lock } of oarDefs) {
    const op = pivot(side > 0 ? 'oarR' : 'oarL', lock.x, lock.y, lock.z);
    const out = new THREE.Vector3(side * 1.25, -0.52, -0.3);
    const inn = new THREE.Vector3(side * -0.48, 0.16, 0.14);
    const dir = out.clone().sub(inn).normalize();
    const yaw = Math.atan2(dir.x, dir.z);
    const blade = out.clone().addScaledVector(dir, -0.14);
    live.addPiece(op, merge([
      part(rod(inn, out, 0.03, 6), P.woodLight),
      part(bev(0.16, 0.03, 0.46, 0.012), '#fff8ee', { x: blade.x, y: blade.y, z: blade.z, ry: yaw, rx: -0.15 }),
      part(bev(0.165, 0.035, 0.12, 0.012), P.tomato, { x: out.x, y: out.y, z: out.z, ry: yaw, rx: -0.15 }),
    ]));
    op.userData.side = side;
    oars.push(op);
  }
  const splash = pivot('splash', anchor.position.x, 0, anchor.position.z);
  const seat = pivot('seat', 0, gw - 0.1, 0.15);
  g.add(anchor, rope, splash, seat, ...oars, live);
  g.add(boxCollider(1.5, 0.9, 3.4, { y: 0.2 }));
  const anims = new Anims();
  const ring = new THREE.Vector3();
  const aimRope = () => {
    ring.set(0, 0.03, 0).applyEuler(anchor.rotation).add(anchor.position);
    const d = ring.clone().sub(rope.position);
    const len = Math.max(0.01, d.length());
    rope.quaternion.setFromUnitVectors(UP, d.normalize());
    rope.scale.set(1, len, 1);
  };
  aimRope();
  live.build();
  boatFinish(g, { name: 'rowboat', parts: { anchor, anchorRope: rope, splash, seat, oars }, surface: 'wood', bob, seed, anims, heave: 0.045, roll: 0.05 });
  let stroke = 0;
  g.userData.rowing = false;
  g.userData.addTick((dt, t) => {
    if (!g.userData.anchored) anchor.rotation.z = 0.12 + Math.sin(t * 1.7 + seed) * 0.08;
    aimRope();
    if (g.userData.rowing || stroke > 0.001) {
      stroke = g.userData.rowing ? Math.min(1, stroke + dt * 2) : Math.max(0, stroke - dt * 2);
      const ph = t * 4.2;
      for (const op of oars) {
        op.rotation.y = op.userData.side * Math.sin(ph) * 0.45 * stroke;
        op.rotation.z = op.userData.side * (Math.cos(ph) * 0.14 - 0.02) * stroke;
      }
    }
    live.sync(t);
  });
  g.userData.dropAnchor = () => {
    if (g.userData.anchored) return Promise.resolve(false);
    g.userData.anchored = true;
    const y0 = anchor.position.y;
    const tHit = Math.sqrt(Math.max(0, y0) / 4.9);
    let splashed = false;
    return anims.play(1.8, (k) => {
      const tt = k * 1.8;
      const y = tt < tHit ? y0 - 4.9 * tt * tt : -1.6 * (tt - tHit);
      anchor.position.y = Math.max(-2.6, y);
      anchor.rotation.z = 0.12 + Math.sin(k * 18) * 0.25 * (1 - k);
      if (!splashed && anchor.position.y < 0) {
        splashed = true;
        const wp = splash.getWorldPosition(new THREE.Vector3());
        g.userData.onSplash?.(wp);
      }
    }, { key: 'anchor' }).then((d) => { if (d) anchor.visible = false; return d; });
  };
  return g;
}

// ---------------------------------------------------------------- sailing dinghy

function sailGeo(foot, luff, color, stripe, emblem) {
  // right triangle in the YZ plane: tack (0,0,0), head (0,luff,0), clew (0,0,-foot); double sided grid
  const rows = 6, cols = 4;
  const pos = [], col = [];
  const cA = new THREE.Color(color), cB = new THREE.Color(stripe), cE = new THREE.Color(emblem);
  const P2 = (r, k) => {
    const v = r / rows;
    const u = (k / cols) * (1 - v);
    return [0, v * luff, -u * foot];
  };
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const quad = [[r, k], [r + 1, k], [r, k + 1], [r + 1, k + 1]];
      const [a, b, cc, d] = quad.map(([rr, kk]) => P2(rr, Math.min(kk, cols)));
      const cellColor = r === 1 ? cB : (r === 3 && k === 0) || (r === 4 && k === 0) ? cE : cA;
      const tris = [[a, cc, b], [b, cc, d]];
      for (const [p1, p2, p3] of tris) {
        for (const side of [1, -1]) {
          const o = side * 0.006;
          const seq = side > 0 ? [p1, p2, p3] : [p1, p3, p2];
          for (const p of seq) { pos.push(p[0] + o, p[1], p[2]); col.push(cellColor.r, cellColor.g, cellColor.b); }
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  return g;
}

/**
 * dinghy({ seed, color, sailColor, bob = 1 }) — little sailing dinghy with its sail furled on the boom.
 * parts: { float, cleat (halyard cleat on the mast, collider), sail (pivot), boom (pivot), seat }.
 * userData: hoistSail() -> Promise (sail rises and fills, boom swings out), sailing.
 */
export function dinghy({ seed = 1, color, sailColor = '#fff8ee', bob = 1 } = {}) {
  const rng = new Rng(`dinghy-${seed}`);
  const c = color || rng.pick([P.bubblegum, P.teal, P.sunflower, P.cobalt, P.tangerine]);
  const stripe = rng.pick([P.tomato, P.cobalt, P.teal, P.bubblegum].filter((x) => x !== c));
  const h = hull({ L: 3.4, W: 1.45, H: 0.42, D: 0.32, sheer: 0.16, sternSheer: 0.03, sternW: 0.86, deck: 'open', rim: 0.07,
    colors: { hull: CREAM, boot: c, rim: c, inner: '#e8d2a8', deck: '#c9a06a' } });
  const L = [h.geo];
  const gw = h.gunwaleAt(0.5);
  const mz = 0.75;
  const mastTop = 4.7;
  L.push(part(rod([0, -0.1, mz], [0, mastTop, mz], 0.045, 6, 0.035), '#e4e8ee'));
  L.push(part(new THREE.ConeGeometry(0.12, 0.3, 3), P.tomato, { y: mastTop + 0.02, z: mz - 0.16, rx: Math.PI / 2, sx: 0.15 }));
  L.push(part(bev(1.2, 0.05, 0.24, 0.02), P.woodLight, { y: gw - 0.14, z: 0.1 }));
  L.push(part(bev(0.05, 0.5, 0.36, 0.02), c, { y: -0.12, z: h.zAt(0) - 0.05 }));
  L.push(part(rod([0, 0.35, h.zAt(0) + 0.02], [0, gw + 0.1, h.zAt(0) + 0.7], 0.022, 5), P.woodDark));
  L.push(part(rod([0, mastTop - 0.1, mz], [0, gw + 0.05, h.zAt(1) - 0.1], 0.01, 3), '#9aa3b2'));
  L.push(part(rod([0.05, 1.0, mz], [0.05, mastTop - 0.05, mz], 0.01, 3), ROPE));
  // cleat on the mast (the halyard is made fast here: shoot it to hoist)
  const cleat = pivot('cleat', 0.07, 0.72, mz);
  L.push(part(bev(0.05, 0.16, 0.05, 0.015), '#9aa3b2', { x: 0.07, y: 0.72, z: mz }));
  L.push(part(new THREE.TorusGeometry(0.045, 0.018, 4, 8), ROPE, { x: 0.1, y: 0.72, z: mz, ry: Math.PI / 2 }));
  cleat.add(boxCollider(0.4, 0.45, 0.4, {}));
  // number on the bow
  for (const side of [-1, 1]) {
    const p = onHull(h, 0.95, side, 0.02);
    L.push(digits(String(rng.int(1, 9)), 0.22, stripe, 0.02).applyMatrix4(xform({ x: p.x, y: 0.3, z: 0.95, ry: p.ry })));
  }
  const g = new THREE.Group();
  g.add(mesh(L, materials.glossy, 'boat'), cleat);
  // boom + furled bundle + sail (LiveMesh)
  const live = new LiveMesh(materials.toy);
  const boom = pivot('boom', 0, 1.0, mz);
  const foot = 2.25, luff = mastTop - 1.25;
  live.addPiece(boom, merge([
    part(rod([0, 0, 0], [0, 0, -foot], 0.035, 6), '#e4e8ee'),
    part(rod([0, 0, -foot + 0.1], [0, -0.55, -foot + 0.3], 0.008, 3), '#9aa3b2'),
  ]));
  const bundle = pivot('bundle', 0, 0.08, 0);
  boom.add(bundle);
  const B = [part(new THREE.CapsuleGeometry(0.1, foot - 0.25, 3, 8), sailColor, { z: -foot / 2, rx: Math.PI / 2 })];
  for (const z of [-0.45, -1.1, -1.75]) B.push(part(new THREE.TorusGeometry(0.1, 0.018, 4, 8), stripe, { z }));
  live.addPiece(bundle, merge(B));
  const sail = pivot('sail', 0, 0.05, 0);
  sail.scale.set(1, 0.001, 1);
  sail.visible = false;
  boom.add(sail);
  live.addPiece(sail, sailGeo(foot - 0.05, luff, sailColor, stripe, c), (v, t) => {
    const u = -v.z / foot, w = v.y / luff;
    const belly = Math.sin(Math.PI * Math.min(1, u / (1 - w + 1e-3))) * (1 - w);
    v.x += belly * 0.28 + Math.sin(t * 6 + v.y * 2) * 0.02 * u;
  });
  const seat = pivot('seat', 0, gw - 0.08, 0.1);
  g.add(boom, seat, live);
  g.add(boxCollider(1.5, 0.8, 3.5, { y: 0.2 }));
  const anims = new Anims();
  live.build();
  boatFinish(g, { name: 'dinghy', parts: { cleat, sail, boom, seat }, surface: 'wood', bob, seed, anims, heave: 0.045, roll: 0.045 });
  g.userData.addTick((dt, t) => {
    if (g.userData.sailing) boom.rotation.y = 0.42 + Math.sin(t * 0.8 + seed) * 0.05;
    live.sync(t);
  });
  g.userData.hoistSail = () => {
    if (g.userData.sailing) return Promise.resolve(false);
    g.userData.sailing = true;
    sail.visible = true;
    return anims.play(1.4, (k) => {
      sail.scale.set(1, Math.max(0.001, ease.outBack(k)), 1);
      bundle.scale.setScalar(Math.max(0.001, 1 - ease.outCubic(Math.min(1, k * 1.6))));
      bundle.visible = k < 0.62;
      boom.rotation.y = 0.42 * ease.outCubic(k);
    }, { key: 'sail' });
  };
  return g;
}

// ---------------------------------------------------------------- funnel smoke (world space)

/**
 * Chimney-puff emitter drawn by one InstancedMesh whose puffs live in WORLD space (so smoke trails
 * behind a moving boat). from = Object3D emit point. Returns { mesh, tick(dt, t), burst(n) }.
 */
function smokePuffs(from, { n = 22, rate = 0.38, color = '#eceef2' } = {}) {
  const geo = part(new THREE.IcosahedronGeometry(1, 0), '#ffffff');
  const pm = new THREE.InstancedMesh(geo, materials.toy, n);
  pm.name = 'smoke';
  pm.matrixAutoUpdate = false;
  pm.matrixWorldAutoUpdate = false;
  pm.frustumCulled = false;
  pm.castShadow = false;
  pm.raycast = () => {};
  pm.userData.noHit = true;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const puffs = Array.from({ length: n }, () => ({ life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), s: 0.3, c: new THREE.Color() }));
  for (let i = 0; i < n; i++) { pm.setMatrixAt(i, zero); pm.setColorAt(i, new THREE.Color(color)); }
  let cursor = 0;
  let acc = 0;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const wp = new THREE.Vector3();
  const api = { on: true };
  const emit = (size = 0.3, life = 3) => {
    const p = puffs[cursor];
    cursor = (cursor + 1) % n;
    from.getWorldPosition(p.p);
    p.v.set((Math.random() - 0.5) * 0.3, 1.1 + Math.random() * 0.4, (Math.random() - 0.5) * 0.3);
    p.life = life; p.max = life; p.s = size;
    p.c.set(color).multiplyScalar(0.92 + Math.random() * 0.1);
  };
  api.burst = (k = 4) => { for (let i = 0; i < k; i++) emit(0.5 + Math.random() * 0.2, 3.2); };
  api.mesh = pm;
  api.tick = (dt) => {
    pm.matrixWorld.identity();
    if (api.on) {
      acc += dt;
      while (acc > rate) { acc -= rate; emit(); }
    }
    let alive = 0;
    for (let i = 0; i < n; i++) {
      const p = puffs[i];
      if (p.life <= 0) { pm.setMatrixAt(i, zero); continue; }
      alive++;
      p.life -= dt;
      p.v.multiplyScalar(Math.exp(-dt * 0.6));
      p.p.addScaledVector(p.v, dt);
      p.p.x += dt * 0.35; // gentle breeze
      const k = Math.max(0, p.life / p.max);
      const s = p.s * (1 + (1 - k) * 2.2) * Math.min(1, k / 0.2) * Math.min(1, (1 - k) / 0.08 + 0.2);
      m.compose(p.p, q, sc.setScalar(Math.max(0.001, s)));
      pm.setMatrixAt(i, m);
      pm.setColorAt(i, p.c);
    }
    pm.visible = alive > 0;
    pm.instanceMatrix.needsUpdate = true;
    if (pm.instanceColor) pm.instanceColor.needsUpdate = true;
    return wp;
  };
  return api;
}

// ---------------------------------------------------------------- ferry

/**
 * ferry({ seed, color, funnel, smoke = true, bob = 1 }) — little harbour ferry: saloon with a window
 * band, sun deck with rails, bridge, raked striped funnel puffing smoke, lifebuoys, name boards. ~12 m.
 * parts: { float, funnel, smoke (Object3D at the funnel top), gangway (Object3D at the side door) }.
 * userData: setSmoking(bool), toot() (big puffs + funnel shudder).
 */
export function ferry({ seed = 1, color, funnel: funnelColor, smoke = true, bob = 1 } = {}) {
  const rng = new Rng(`ferry-${seed}`);
  const c = color || rng.pick(['#34466e', P.cobalt, P.teal, '#2f6e5c']);
  const fc = funnelColor || rng.pick([P.sunflower, P.tomato]);
  const h = hull({ L: 12, W: 3.8, H: 1.3, D: 1.0, sheer: 0.5, sternW: 0.86, deck: 'flat', deckDrop: 0.36, rim: 0.12,
    colors: { hull: c, rim: CREAM, deck: '#d8c39a' } });
  const L = [h.geo];
  const dy = h.deckY(0.5);
  const sz = -0.35;
  L.push(part(rbox(3.2, 1.6, 7.0, 0.3, 2), CREAM, { y: dy + 0.8, z: sz }));
  L.push(part(bev(3.26, 0.55, 5.9, 0.06), GLASS, { y: dy + 1.02, z: sz - 0.25 }));
  for (let i = 0; i < 7; i++) L.push(part(new THREE.BoxGeometry(3.3, 0.57, 0.12), CREAM, { y: dy + 1.02, z: sz - 3.1 + i * 0.95 }));
  L.push(part(bev(3.24, 0.14, 6.95, 0.04), c, { y: dy + 0.5, z: sz }));
  for (const side of [-1, 1]) L.push(part(bev(0.05, 1.05, 0.75, 0.02), shade(c, -0.2), { x: side * 1.61, y: dy + 0.53, z: sz + 3.0 }));
  for (const x of [-0.85, 0.85]) L.push(lifebuoyGeo(0.25, 0.07).applyMatrix4(xform({ x, y: dy + 0.95, z: sz + 3.52 })));
  // sun deck: rails + benches
  const ry = dy + 1.6;
  for (let i = 0; i <= 8; i++) {
    const z = sz - 3.3 + i * 0.8;
    for (const side of [-1, 1]) L.push(part(new THREE.BoxGeometry(0.07, 0.5, 0.07), '#f4f0e8', { x: side * 1.48, y: ry + 0.25, z }));
  }
  for (const side of [-1, 1]) L.push(part(new THREE.BoxGeometry(0.08, 0.07, 6.5), '#f4f0e8', { x: side * 1.48, y: ry + 0.5, z: sz - 0.1 }));
  L.push(part(new THREE.BoxGeometry(3.0, 0.07, 0.08), '#f4f0e8', { y: ry + 0.5, z: sz - 3.35 }));
  for (const z of [-2.0, -0.6]) L.push(part(bev(1.9, 0.1, 0.4, 0.03), P.woodLight, { y: ry + 0.3, z: sz + z }));
  // bridge
  const bz = sz + 2.35;
  L.push(part(rbox(2.4, 1.0, 1.5, 0.2, 2), CREAM, { y: ry + 0.5, z: bz }));
  L.push(part(bev(2.1, 0.4, 0.06, 0.03), GLASS, { y: ry + 0.62, z: bz + 0.76 }));
  L.push(part(bev(2.46, 0.36, 1.0, 0.03), GLASS, { y: ry + 0.62, z: bz }));
  L.push(part(bev(2.6, 0.1, 1.7, 0.04), c, { y: ry + 1.05, z: bz }));
  L.push(part(rod([0, ry + 1.1, bz - 0.3], [0, ry + 2.3, bz - 0.3], 0.035, 5), '#f4f0e8'));
  L.push(part(new THREE.ConeGeometry(0.14, 0.4, 3), P.tomato, { y: ry + 2.15, z: bz - 0.52, rx: Math.PI / 2, sx: 0.15 }));
  // name boards + anchor hawses on the bow
  for (const side of [-1, 1]) {
    const p = onHull(h, 3.9, side, 0.02);
    L.push(part(lettering(1.6, 0.18, 1, '#fff8ee', {}, rng, 0.02), '#fff8ee', { x: p.x, y: 0.82, z: 3.9, ry: p.ry }));
    const a = onHull(h, 4.9, side, 0.015);
    L.push(part(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 8), RUBBER, { x: a.x, y: 1.1, z: 4.9, rz: Math.PI / 2, ry: a.ry - side * Math.PI / 2 }));
  }
  fenders(L, h, [-3.6, -1.2, 1.2], 0.62);
  const fz = sz - 2.4;
  const funnelG = latheBands([[0, 0], [0.5, 0], [0.5, 1.0], [0.53, 1.03], [0.53, 1.33], [0.5, 1.36], [0.5, 1.55], [0.42, 1.6], [0, 1.6]], 12,
    (y, i) => (i === 3 ? '#fff8ee' : i >= 5 ? '#3b3f4f' : fc), { y: ry - 0.05, z: fz, sx: 0.78, rx: -0.12 });
  const g = new THREE.Group();
  g.add(mesh(L, materials.glossy, 'boat'));
  const funnel = pivot('funnel', 0, ry - 0.05, fz);
  funnel.add(mesh([funnelG.applyMatrix4(new THREE.Matrix4().makeTranslation(0, -(ry - 0.05), -fz))], materials.glossy, 'funnelMesh'));
  const smokeP = pivot('smoke', 0, 1.75, -0.2);
  funnel.add(smokeP);
  const gangway = pivot('gangway', 1.7, dy, sz + 3.0);
  g.add(funnel, gangway);
  g.add(boxCollider(3.9, 4.2, 12, { y: 1.6 }));
  const puffs = smokePuffs(smokeP);
  puffs.on = !!smoke;
  const anims = new Anims();
  boatFinish(g, { name: 'ferry', parts: { funnel, smoke: smokeP, gangway }, surface: 'metal', bob, seed, anims, heave: 0.04, roll: 0.025 });
  g.add(puffs.mesh);
  g.userData.addTick((dt) => puffs.tick(dt));
  g.userData.setSmoking = (on) => { puffs.on = !!on; };
  g.userData.toot = () => {
    puffs.burst(4);
    return anims.play(0.8, (k) => { const s = 1 + Math.sin(k * Math.PI * 6) * (1 - k) * 0.08; funnel.scale.set(s, 1 + (s - 1) * 1.5, s); }, { key: 'toot' });
  };
  return g;
}

// ---------------------------------------------------------------- cargo boat

/**
 * cargoBoat({ seed, color, bob = 1 }) — stubby coaster: stern superstructure with bridge, colourful
 * ribbed containers forward, open hatch aft where cargo is landed. ~14 m.
 * parts: { float, deck (Object3D: where the crane lands a crate), bridge (Object3D) }.
 */
export function cargoBoat({ seed = 1, color, bob = 1 } = {}) {
  const rng = new Rng(`cargo-${seed}`);
  const c = color || rng.pick([P.teal, P.tomato, '#2f7fd0', '#3f9a4e']);
  const h = hull({ L: 14, W: 4.0, H: 1.5, D: 1.1, sheer: 0.45, sternW: 0.9, deck: 'flat', deckDrop: 0.3, rim: 0.12, stations: 16,
    colors: { hull: c, rim: CREAM, deck: '#9aa3b2' } });
  const L = [h.geo];
  const dy = h.deckY(0.5);
  const sz = -4.9;
  L.push(part(rbox(3.3, 2.2, 2.3, 0.2, 2), CREAM, { y: dy + 1.1, z: sz }));
  for (const y of [dy + 0.75, dy + 1.55]) {
    L.push(part(bev(3.36, 0.3, 1.7, 0.04), GLASS, { y, z: sz }));
    L.push(part(new THREE.BoxGeometry(3.4, 0.32, 0.1), CREAM, { y, z: sz }));
  }
  L.push(part(rbox(4.0, 1.0, 1.8, 0.15, 2), CREAM, { y: dy + 2.7, z: sz + 0.2 }));
  L.push(part(bev(4.06, 0.36, 1.4, 0.04), GLASS, { y: dy + 2.78, z: sz + 0.2 }));
  L.push(part(bev(3.4, 0.4, 0.06, 0.03), GLASS, { y: dy + 2.78, z: sz + 1.12 }));
  L.push(part(bev(4.1, 0.1, 1.9, 0.04), c, { y: dy + 3.25, z: sz + 0.2 }));
  L.push(part(rod([0, dy + 3.3, sz], [0, dy + 5.2, sz], 0.05, 6), '#f4f0e8'));
  L.push(part(bev(1.2, 0.08, 0.08, 0.02), '#f4f0e8', { y: dy + 4.6, z: sz }));
  L.push(part(bev(0.7, 0.08, 0.16, 0.03), '#eef2f7', { y: dy + 5.0, z: sz }));
  L.push(part(ball(0.07, 0), P.tomato, { x: 0.6, y: dy + 4.68, z: sz }), part(ball(0.07, 0), '#5cb83c', { x: -0.6, y: dy + 4.68, z: sz }));
  L.push(latheBands([[0, 0], [0.42, 0], [0.42, 0.8], [0.44, 0.82], [0.44, 1.02], [0.42, 1.05], [0.42, 1.2], [0, 1.2]], 10,
    (y, i) => (i === 3 ? '#fff8ee' : i >= 5 ? '#3b3f4f' : P.sunflower), { y: dy + 2.2, z: sz - 1.05, sx: 0.8 }));
  // containers
  const CC = rng.shuffle([P.tomato, P.cobalt, P.sunflower, P.teal, '#8ad14f', P.violet, P.tangerine]);
  let k = 0;
  for (const z of [0.4, 3.2]) {
    for (const x of [-0.92, 0.92]) {
      const levels = rng.chance(0.55) ? 2 : 1;
      for (let lv = 0; lv < levels; lv++) {
        const col = CC[k++ % CC.length];
        const box = paintFaces(part(new THREE.BoxGeometry(1.72, 1.05, 2.6, 1, 1, 7), '#fff'), (px, py, pz, nx, ny, nz, cc) => {
          cc.set(col);
          if (Math.abs(nz) > 0.5) cc.multiplyScalar(0.82);
          else if (Math.abs(nx) > 0.5 && Math.floor((pz + 1.3) / (2.6 / 7)) % 2) cc.multiplyScalar(0.88);
        });
        L.push(box.applyMatrix4(xform({ x, y: dy + 0.53 + lv * 1.07, z, ry: rng.range(-0.02, 0.02) })));
      }
    }
  }
  L.push(part(bev(2.9, 0.18, 1.8, 0.04), '#6b7280', { y: dy + 0.09, z: -2.2 }));
  L.push(part(rod([0, dy, 5.4], [0, dy + 2.6, 5.4], 0.05, 6), '#f4f0e8'), part(ball(0.08, 0), '#fff4c2', { y: dy + 2.66, z: 5.4 }));
  for (const side of [-1, 1]) {
    const p = onHull(h, 4.8, side, 0.02);
    L.push(part(lettering(1.4, 0.2, 1, '#fff8ee', {}, rng, 0.02), '#fff8ee', { x: p.x, y: 1.0, z: 4.8, ry: p.ry }));
  }
  fenders(L, h, [-3, 0, 3], 0.7);
  const g = new THREE.Group();
  g.add(mesh(L, materials.glossy, 'boat'));
  const deck = pivot('deck', 0, dy + 0.18, -2.2);
  const bridge = pivot('bridge', 0, dy + 2.7, sz + 0.2);
  g.add(deck, bridge);
  g.add(boxCollider(4.1, 4.5, 14, { y: 1.8 }));
  return boatFinish(g, { name: 'cargoBoat', parts: { deck, bridge }, surface: 'metal', bob, seed, heave: 0.035, roll: 0.02, pitch: 0.012 });
}

// ---------------------------------------------------------------- wrecked galleon

function tatteredSail(w, h, seed, color = '#e9dfc6') {
  // ragged cloth grid hanging from its top edge (y = 0 .. -h), holes + torn hem, double sided
  const cols = 7, rows = 6;
  const mask = [];
  for (let r = 0; r < rows; r++) {
    let row = '';
    for (let k = 0; k < cols; k++) {
      const n = noise3(k * 1.7 + seed, r * 2.3, seed * 0.7);
      const torn = (r >= rows - 2 && n > 0.45) || (r > 1 && r < rows - 1 && n > 0.83);
      row += torn ? '.' : '#';
    }
    mask.push(row);
  }
  const cw = w / cols, ch = h / rows;
  const pos = [], col = [];
  const c = new THREE.Color();
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      if (mask[r][k] !== '#') continue;
      const x0 = -w / 2 + k * cw, x1 = x0 + cw, y0 = -r * ch, y1 = y0 - ch;
      c.set(color).multiplyScalar(0.86 + noise3(k, r, seed) * 0.16);
      for (const side of [1, -1]) {
        const z = side * 0.01;
        const q = side > 0 ? [[x0, y0], [x0, y1], [x1, y0], [x1, y0], [x0, y1], [x1, y1]] : [[x0, y0], [x1, y0], [x0, y1], [x1, y0], [x1, y1], [x0, y1]];
        for (const [x, y] of q) { pos.push(x, y, z); col.push(c.r, c.g, c.b); }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  return g;
}

function holeShape(w, h, seed) {
  const s = new THREE.Shape();
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 0.7 + (i % 2 ? 0.3 : 0) * noise3(i, seed, 1) + 0.15 * noise3(seed, i, 2);
    const x = Math.cos(a) * (w / 2) * r, y = Math.sin(a) * (h / 2) * r;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  return s;
}

function wreckRock(r, seed, sq = 0.62) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = 1 + (noise3(Math.round(x * 20) + seed, Math.round(y * 20), Math.round(z * 20)) - 0.5) * 0.45;
    pos.setXYZ(i, x * k, y * k * sq, z * k);
  }
  const p = part(g, '#fff');
  p.computeVertexNormals(); // non-indexed -> flat, faceted rock
  return paintFaces(p, (x, y, z, nx, ny, nz, c) => {
    const n = noise3(x * 3 + seed, y * 3, z * 3);
    if (ny > 0.55 && n > 0.45) c.set('#5f9a48');
    else if (y < -r * 0.15) c.set('#6f675c');
    else c.set(n > 0.8 ? '#e8e2d4' : n > 0.4 ? '#a39a8c' : '#8e867a');
  });
}

/**
 * wreckedGalleon({ seed, bob = 0, list = 0.24 }) — pirate galleon run aground on rocks: listing hull
 * with planking and gunports, raised castles, snapped main mast lying across the deck, tattered
 * fluttering sails, a jagged hole in the starboard (+X) side with a treasure chest wedged in it. ~12 m.
 * parts: { ship (listing Group), chest (pivot), lid (pivot), lock (pivot, collider), coins (InstancedMesh) }.
 * userData: openChest() -> Promise (lock pops, lid flips, ~44 gold coins spill and settle on the rocks;
 * onOpen(worldPos) fires), opened. Aground, so `bob` is accepted but ignored. Draw calls: 2 (3 with
 * coins out). coinFloor = y (group space) where the coins land.
 */
export function wreckedGalleon({ seed = 1, bob = 0, list = 0.24, coinFloor = 0.35 } = {}) {
  const rng = new Rng(`galleon-${seed}`);
  const plank = ['#8a5530', '#734624'];
  const h = hull({
    L: 11, W: 3.8, H: 1.9, D: 1.0, sheer: 1.0, sternSheer: 0.7, sternW: 0.82, deck: 'flat', deckDrop: 0.42, rim: 0.14, stations: 18,
    colors: {
      rim: '#c0824a', deck: '#a8764a',
      painter: (x, y, z, c) => {
        if (y < 0.15) c.set(noise3(x * 2, y * 4, z * 2) > 0.5 ? '#5f6e3e' : '#4f5f36');
        else if (y > 1.02 && y < 1.26) c.set('#e2a93c');
        else c.set(plank[Math.floor((y + 3) / 0.27) % 2]);
      },
    },
  });
  const S = [h.geo];
  const gw = h.gunwaleAt(0.5);
  // castles: planked walls with a gilded band, wooden roof decks behind a low bulwark with gilded
  // cap rails (open balustrade on the side facing the waist)
  const GILT = '#e2a93c';
  const castle = (w, hgt, d, y0, z, bands) => {
    S.push(part(rbox(w, hgt, d, 0.15, 2), '#8a5530', { y: y0 + hgt / 2, z }));
    for (const [y, c] of bands) S.push(part(bev(w + 0.06, c === GILT ? 0.1 : 0.05, d + 0.06, 0.02), c, { y: y0 + y, z }));
    const top = y0 + hgt;
    S.push(part(bev(w + 0.1, 0.12, d + 0.1, 0.04), '#a8764a', { y: top, z }));
    const wallH = 0.3;
    for (const sx of [-1, 1]) {
      S.push(part(bev(0.1, wallH, d, 0.02), '#8a5530', { x: sx * (w / 2 - 0.02), y: top + wallH / 2, z }));
      S.push(part(bev(0.16, 0.06, d + 0.06, 0.02), GILT, { x: sx * (w / 2 - 0.02), y: top + wallH + 0.02, z }));
    }
    return { top, wallH };
  };
  const aft = h.zAt(0) + 1.6;
  const ac = castle(3.5, 1.8, 3.1, gw - 0.25, aft, [[0.4, '#6e4222'], [1.5, GILT]]);
  // stern wall + open rail to the waist
  S.push(part(bev(3.5, ac.wallH, 0.1, 0.02), '#8a5530', { y: ac.top + ac.wallH / 2, z: aft - 1.53 }));
  S.push(part(bev(3.56, 0.06, 0.16, 0.02), GILT, { y: ac.top + ac.wallH + 0.02, z: aft - 1.53 }));
  S.push(part(bev(3.56, 0.06, 0.12, 0.02), GILT, { y: ac.top + ac.wallH + 0.02, z: aft + 1.53 }));
  for (let i = 0; i < 7; i++) S.push(part(new THREE.CylinderGeometry(0.035, 0.05, ac.wallH, 5), '#6e4222', { x: -1.5 + i * 0.5, y: ac.top + ac.wallH / 2, z: aft + 1.53 }));
  for (const x of [-0.9, 0, 0.9]) {
    S.push(part(bev(0.62, 0.72, 0.06, 0.03), '#2e3b52', { x, y: gw + 0.72, z: aft - 1.56 }));
    S.push(part(bev(0.74, 0.84, 0.04, 0.03), GILT, { x, y: gw + 0.72, z: aft - 1.54 }));
  }
  S.push(part(lathe([[0.05, 0], [0.16, 0.08], [0.16, 0.32], [0.08, 0.42], [0.02, 0.5]], 6), GILT, { x: 1.45, y: ac.top + ac.wallH + 0.05, z: aft - 1.53 }));
  const fore = h.zAt(1) - 1.8;
  const fc = castle(2.4, 0.8, 1.9, h.gunwaleAt(0.83) - 0.2, fore, [[0.62, GILT]]);
  S.push(part(bev(2.1, 0.06, 0.12, 0.02), GILT, { y: fc.top + fc.wallH + 0.02, z: fore + 0.93 }));
  S.push(part(bev(2.1, fc.wallH, 0.08, 0.02), '#8a5530', { y: fc.top + fc.wallH / 2, z: fore + 0.93 }));
  for (let i = 0; i < 5; i++) S.push(part(new THREE.CylinderGeometry(0.035, 0.05, fc.wallH, 5), '#6e4222', { x: -0.9 + i * 0.45, y: fc.top + fc.wallH / 2, z: fore - 0.93 }));
  S.push(part(bev(2.1, 0.06, 0.12, 0.02), GILT, { y: fc.top + fc.wallH + 0.02, z: fore - 0.93 }));
  // gunports along the gold wale
  for (let i = 0; i < 5; i++) {
    const z = -2.6 + i * 1.25;
    for (const side of [-1, 1]) {
      if (side > 0 && Math.abs(z + 0.4) < 0.9) continue; // the hole is here
      const p = onHull(h, z, side, 0.02);
      S.push(part(bev(0.3, 0.26, 0.05, 0.02), '#2a211d', { x: p.x, y: 1.14, z, ry: p.ry }));
    }
  }
  // bowsprit, masts, rigging
  const bow = [0, h.gunwaleAt(1), h.zAt(1)];
  S.push(part(rod([0, bow[1] - 0.2, bow[2] - 0.6], [0, bow[1] + 1.1, bow[2] + 1.7], 0.09, 6, 0.06), '#6e4222'));
  const deckY = h.deckY(0.5);
  S.push(part(rod([0, deckY, 0.2], [0, deckY + 3.1, 0.2], 0.17, 7, 0.15), '#6e4222'));
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05;
    S.push(part(new THREE.ConeGeometry(0.05, 0.42 + (i % 3) * 0.12, 3), '#a8764a', { x: Math.cos(a) * 0.09, y: deckY + 3.25, z: 0.2 + Math.sin(a) * 0.09, rx: Math.sin(a) * 0.35, rz: -Math.cos(a) * 0.35 }));
  }
  const fall = [[0.35, deckY + 2.9, 0.1], [2.9, deckY + 0.2, -3.2]];
  S.push(part(rod(fall[0], fall[1], 0.15, 7, 0.12), '#6e4222'));
  const fz = 3.0;
  S.push(part(rod([0, deckY, fz], [0, deckY + 5.6, fz], 0.13, 7, 0.1), '#6e4222'));
  S.push(part(rod([-1.6, deckY + 4.3, fz], [1.6, deckY + 4.3, fz], 0.07, 5), '#6e4222'));
  S.push(part(latheBands([[0, 0], [0.34, 0], [0.4, 0.2], [0.4, 0.46], [0, 0.46]], 8, (y, i) => (i === 2 ? '#8a5530' : '#6e4222'), { y: deckY + 4.7, z: fz })));
  S.push(part(rod([0, gw + 1.6, aft - 0.3], [0, gw + 3.4, aft - 0.3], 0.1, 6, 0.08), '#6e4222'));
  S.push(part(tube([new THREE.Vector3(0, deckY + 5.5, fz), new THREE.Vector3(0, deckY + 3.4, fz + 2.2), new THREE.Vector3(0, bow[1] + 1.05, bow[2] + 1.6)], 0.022, 10, 3), ROPE));
  S.push(part(tube([new THREE.Vector3(0, deckY + 5.4, fz), new THREE.Vector3(0.3, deckY + 3.5, 1.2), new THREE.Vector3(0.3, deckY + 2.8, 0.25)], 0.02, 10, 3), ROPE));
  // the hole (starboard) with splintered planks
  const hz = -0.4;
  const hp = onHull(h, hz, 1, 0.012);
  S.push(part(slab(holeShape(1.5, 1.15, seed), 0.02, 0, 1), '#2a211d', { x: hp.x, y: 0.95, z: hz, ry: hp.ry }));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    const px = hp.x + 0.04, py = 0.95 + Math.sin(a) * 0.52, pz = hz + Math.cos(a) * 0.68;
    S.push(part(new THREE.BoxGeometry(0.07, 0.1, 0.42), i % 2 ? '#a8764a' : '#8a5530', { x: px + 0.1, y: py, z: pz, ry: hp.ry - Math.PI / 2 + rng.range(-0.4, 0.4), rx: rng.range(-0.5, 0.5) }));
  }
  // seaweed hanging near the waterline
  for (let i = 0; i < 9; i++) {
    const z = h.zAt(0.12 + i * 0.09);
    const side = i % 2 ? 1 : -1;
    const p = onHull(h, z, side, 0.03);
    S.push(part(new THREE.ConeGeometry(0.06, 0.55, 3), '#3f8f3a', { x: p.x, y: 0.12, z, rx: Math.PI, ry: p.ry }));
  }
  const ship = new THREE.Group();
  ship.name = 'ship';
  ship.rotation.set(0.1, 0, list);
  ship.position.y = -0.45;
  ship.updateMatrix();
  const toShip = ship.matrix.clone().invert();
  // rocks + spilled barrels are authored in group space and baked into the ship mesh (1 draw call)
  const R = [];
  for (const [x, z, r, sq] of [[1.2, 4.6, 1.7, 0.55], [-1.9, 2.2, 1.5, 0.6], [2.4, -1.8, 1.4, 0.45], [-2.2, -3.2, 1.6, 0.55], [0.6, -5.9, 1.3, 0.6], [3.6, 2.4, 0.9, 0.7], [-3.4, 0.2, 0.8, 0.7]]) {
    R.push(wreckRock(r, seed + x * 7 + z * 13, sq).applyMatrix4(xform({ x, y: 0.1, z, ry: rng.range(0, 6) })));
  }
  for (const [x, z, rz] of [[3.4, -3.6, 1.3], [4.1, -1.2, 0.2]]) {
    R.push(latheBands([[0, 0], [0.3, 0], [0.36, 0.35], [0.3, 0.7], [0, 0.7]], 8, (y, i) => (i === 1 || i === 2 ? '#8a5530' : '#5a6272'), { x, y: 0.25, z, rz, rx: 0.3 }));
  }
  for (const r of R) S.push(r.applyMatrix4(toShip));
  ship.add(mesh(S, materials.toy, 'hullMesh'));
  // LiveMesh: fluttering sails + flag + chest + lid + lock
  const live = new LiveMesh(materials.toy);
  const sailFore = pivot('sailFore', 0, deckY + 4.28, fz + 0.1);
  live.addPiece(sailFore, tatteredSail(2.9, 2.0, seed + 1), (v, t) => { const d = -v.y / 2.0; v.z += (Math.sin(t * 2.4 + v.x * 1.7) * 0.12 + 0.15) * d; });
  const sailFallen = pivot('sailFallen', 1.9, deckY + 1.4, -2.0);
  sailFallen.rotation.set(0, -0.5, 0.35);
  live.addPiece(sailFallen, tatteredSail(2.0, 1.5, seed + 2, '#ddd2b8'), (v, t) => { const d = -v.y / 1.5; v.z += Math.sin(t * 2.0 + v.x * 2) * 0.08 * d; });
  const flag = pivot('flag', 0, gw + 3.35, aft - 0.3);
  const flagG = tatteredSail(0.9, 0.55, seed + 3, '#3d4a6b');
  flagG.translate(0.47, 0, 0);
  live.addPiece(flag, flagG, (v, t) => { v.z += Math.sin(t * 5 - v.x * 5) * 0.1 * v.x; });
  // treasure chest wedged in the hole, lid hinged at the back, padlock on the front
  const chest = pivot('chest', hp.x + 0.18, 0.72, hz);
  chest.rotation.y = hp.ry;
  const CH = [
    part(bev(0.9, 0.46, 0.6, 0.05), '#8a5530', { y: 0.23 }),
    part(bev(0.94, 0.08, 0.64, 0.02), '#e2a93c', { y: 0.12 }),
    part(bev(0.08, 0.48, 0.64, 0.02), '#e2a93c', { x: -0.3, y: 0.24 }),
    part(bev(0.08, 0.48, 0.64, 0.02), '#e2a93c', { x: 0.3, y: 0.24 }),
    part(blob(0.36, 1, 0.08, seed), P.gold, { y: 0.44, sy: 0.28, sx: 1.15, sz: 0.75 }),
  ];
  live.addPiece(chest, merge(CH));
  const lid = pivot('lid', 0, 0.46, -0.3);
  chest.add(lid);
  const lidG = new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10, 1, false, 0, Math.PI);
  live.addPiece(lid, merge([
    part(lidG, '#8a5530', { z: 0.3, rz: Math.PI / 2, ry: 0 }),
    part(new THREE.CylinderGeometry(0.31, 0.31, 0.08, 10, 1, true, 0, Math.PI), '#e2a93c', { x: -0.3, z: 0.3, rz: Math.PI / 2 }),
    part(new THREE.CylinderGeometry(0.31, 0.31, 0.08, 10, 1, true, 0, Math.PI), '#e2a93c', { x: 0.3, z: 0.3, rz: Math.PI / 2 }),
  ]));
  const lock = pivot('lock', 0, 0.36, 0.33);
  chest.add(lock);
  live.addPiece(lock, merge([
    part(bev(0.16, 0.16, 0.07, 0.03), P.gold, {}),
    part(new THREE.TorusGeometry(0.055, 0.018, 4, 8, Math.PI), '#c9d2de', { y: 0.07 }),
    part(new THREE.BoxGeometry(0.03, 0.05, 0.02), INK, { y: -0.02, z: 0.04 }),
  ]));
  lock.add(ballCollider(0.32, {}));
  chest.add(boxCollider(1.0, 0.8, 0.8, { y: 0.3 }));
  ship.add(sailFore, sailFallen, flag, chest);
  const g = new THREE.Group();
  g.add(ship, live);
  // coins (group space, hidden until the spill)
  const NC = 44;
  const coinGeo = part(new THREE.CylinderGeometry(0.07, 0.07, 0.018, 7), P.gold);
  const coins = new THREE.InstancedMesh(coinGeo, goldMaterial, NC);
  coins.name = 'coins';
  coins.visible = false;
  coins.castShadow = true;
  coins.frustumCulled = false;
  coins.userData.noHit = true;
  coins.raycast = () => {};
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < NC; i++) { coins.setMatrixAt(i, zero); coins.setColorAt(i, new THREE.Color(1, 1, 1).multiplyScalar(0.85 + rng.random() * 0.25)); }
  g.add(coins);
  live.build();
  const anims = new Anims();
  finish(g, { name: 'wreckedGalleon', parts: { ship, chest, lid, lock, coins }, surface: 'wood', anims });
  g.userData.bob = bob; // aground: kept for API symmetry, the wreck does not float
  const cs = Array.from({ length: NC }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), rest: false }));
  let spilling = false;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  g.userData.addTick((dt, t) => {
    live.sync(t);
    if (!spilling) return;
    for (let i = 0; i < NC; i++) {
      const c = cs[i];
      if (!c.rest) {
        c.v.y -= 9.8 * dt;
        c.p.addScaledVector(c.v, dt);
        c.r.x += c.w.x * dt; c.r.y += c.w.y * dt; c.r.z += c.w.z * dt;
        if (c.p.y < coinFloor) {
          c.p.y = coinFloor;
          if (Math.abs(c.v.y) < 1.2) { c.rest = true; c.r.x = Math.PI / 2 * (i % 2 ? 1 : 0.94); c.r.z = 0; }
          c.v.y *= -0.38; c.v.x *= 0.6; c.v.z *= 0.6;
        }
      } else c.r.y += dt * 0.6;
      m4.compose(c.p, q.setFromEuler(c.r), one);
      coins.setMatrixAt(i, m4);
    }
    coins.instanceMatrix.needsUpdate = true;
  });
  g.userData.openChest = () => {
    if (g.userData.opened) return Promise.resolve(false);
    g.userData.opened = true;
    const lp0 = lock.position.clone();
    anims.play(0.9, (k) => {
      lock.position.set(lp0.x, lp0.y + Math.sin(k * Math.PI) * 0.4 - k * k * 0.9, lp0.z + k * 0.9);
      lock.rotation.set(k * 7, 0, k * 3);
    }, { key: 'lock' }).then(() => { lock.visible = false; });
    // coins burst from the chest mouth (group space)
    g.updateMatrixWorld(true);
    const mouth = new THREE.Vector3(0, 0.5, 0.1);
    chest.localToWorld(mouth);
    g.worldToLocal(mouth);
    const out = new THREE.Vector3(0, 0, 1).applyQuaternion(chest.getWorldQuaternion(new THREE.Quaternion()));
    const gq = g.getWorldQuaternion(new THREE.Quaternion()).invert();
    out.applyQuaternion(gq).setY(0).normalize();
    for (let i = 0; i < NC; i++) {
      const c = cs[i];
      c.p.copy(mouth).add(new THREE.Vector3(rng.range(-0.3, 0.3), rng.range(0, 0.1), rng.range(-0.3, 0.3)));
      const sp = rng.range(1.2, 3.2);
      c.v.set(out.x * sp + rng.range(-1.2, 1.2), rng.range(3.2, 5.5), out.z * sp + rng.range(-1.2, 1.2));
      c.r.set(rng.range(0, 6), rng.range(0, 6), rng.range(0, 6));
      c.w.set(rng.range(-12, 12), rng.range(-8, 8), rng.range(-12, 12));
      c.rest = false;
    }
    coins.visible = true;
    spilling = true;
    const wp = mouth.clone();
    g.localToWorld(wp);
    g.userData.onOpen?.(wp);
    return anims.play(0.7, (k) => { lid.rotation.x = -2.05 * k; }, { delay: 0.12, ease: ease.outBack, key: 'lid' });
  };
  return g;
}
