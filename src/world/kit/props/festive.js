// Festive + gameplay props: bunting (with animated unfurl), balloon bunch (pop / release),
// washing line (flapping clothes), flag pole (waving + raise), weathervane.
// Moving sub-objects are named pivots with colliders; they are drawn by one LiveMesh each.
import * as THREE from 'three';
import { part, merge, xform, tube, sagPoints } from '../../geo.js';
import { materials } from '../../../gfx/materials.js';
import { P } from '../../../gfx/palette.js';
import { Rng } from '../../../core/rng.js';
import {
  bev, lathe, puck, ball, rod, arc, slab, latheBands, mesh, pivot, finish, paintFaces, LiveMesh,
  Anims, ease, shade, vec, boxCollider, ballCollider,
} from './lib.js';

const ROPE = '#f4ead2';
const INK = '#2b2b3a';
const UP = new THREE.Vector3(0, 1, 0);
const _m4 = new THREE.Matrix4();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _q = new THREE.Quaternion();
const lerp = THREE.MathUtils.lerp;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Orient obj so local +X follows T and local +Y stays as close to world up as possible. */
function alignToTangent(obj, T) {
  _x.copy(T).normalize();
  _y.copy(UP).addScaledVector(_x, -_x.dot(UP)).normalize();
  _z.crossVectors(_x, _y);
  _m4.makeBasis(_x, _y, _z);
  obj.quaternion.setFromRotationMatrix(_m4);
}

/** Double-sided cloth grid from a cell mask (rows top->bottom, '#' = cloth). Top edge at y=0, centred in x. */
function clothGeo(mask, cell, colorAt, thick = 0.012) {
  const rows = mask.length, cols = mask[0].length;
  const pos = [], col = [];
  const c = new THREE.Color();
  const W = cols * cell;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      if (mask[r][k] !== '#') continue;
      const x0 = -W / 2 + k * cell, x1 = x0 + cell, y0 = -r * cell, y1 = y0 - cell;
      c.set(colorAt(k, r, cols, rows));
      for (const side of [1, -1]) {
        const z = side * thick / 2;
        const quad = side > 0
          ? [[x0, y0], [x0, y1], [x1, y0], [x1, y0], [x0, y1], [x1, y1]]
          : [[x0, y0], [x1, y0], [x0, y1], [x1, y0], [x1, y1], [x0, y1]];
        const shadeK = side > 0 ? 1 : 0.86;
        for (const [x, y] of quad) { pos.push(x, y, z); col.push(c.r * shadeK, c.g * shadeK, c.b * shadeK); }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** Subdivided double-sided pennant: top edge on y=0 (width w), tip at y=-h. */
function pennantGeo(w, h, color, rows = 3) {
  const pos = [];
  const pt = (r, k) => {
    const t = r / rows;
    const rw = w * (1 - t);
    const n = rows - r;
    return [n ? -rw / 2 + (k / n) * rw : 0, -t * h];
  };
  for (let r = 0; r < rows; r++) {
    const n = rows - r;
    for (let k = 0; k < n; k++) {
      const a = pt(r, k), b = pt(r, k + 1), cc = pt(r + 1, k);
      pos.push(a, cc, b);
      if (k < n - 1) { const d = pt(r + 1, k + 1); pos.push(b, cc, d); }
    }
  }
  const flat = [];
  for (const tri of pos) flat.push(tri);
  const out = [];
  for (let i = 0; i < flat.length; i += 3) {
    const [a, b, c] = [flat[i], flat[i + 1], flat[i + 2]];
    out.push(a[0], a[1], 0.006, b[0], b[1], 0.006, c[0], c[1], 0.006);
    out.push(a[0], a[1], -0.006, c[0], c[1], -0.006, b[0], b[1], -0.006);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(out.length), 3));
  return part(g, color);
}

/** Rope source: x = u (0..1), (y, z) = unit ring offset; ropeDeform maps it onto a curve. */
function ropeSource(n, radial, color) {
  const pos = [];
  for (let i = 0; i < n; i++) {
    const u0 = i / n, u1 = (i + 1) / n;
    for (let j = 0; j < radial; j++) {
      const a0 = (j / radial) * Math.PI * 2, a1 = ((j + 1) / radial) * Math.PI * 2;
      const A = [u0, Math.cos(a0), Math.sin(a0)], B = [u0, Math.cos(a1), Math.sin(a1)];
      const C = [u1, Math.cos(a0), Math.sin(a0)], D = [u1, Math.cos(a1), Math.sin(a1)];
      pos.push(...A, ...B, ...C, ...B, ...D, ...C);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
  return part(g, color);
}

/** Rope whose shape follows curve(u, out) — frames are rebuilt by update(). */
function makeRope(n, radius, curve) {
  const frames = [];
  for (let i = 0; i <= n; i++) frames.push({ p: new THREE.Vector3(), n: new THREE.Vector3(), b: new THREE.Vector3() });
  const a = new THREE.Vector3(), b = new THREE.Vector3(), t = new THREE.Vector3();
  const update = () => {
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      curve(u, frames[i].p);
      curve(Math.min(1, u + 0.01), a);
      curve(Math.max(0, u - 0.01), b);
      t.subVectors(a, b).normalize();
      frames[i].n.crossVectors(t, UP);
      if (frames[i].n.lengthSq() < 1e-6) frames[i].n.set(0, 0, 1);
      frames[i].n.normalize();
      frames[i].b.crossVectors(t, frames[i].n).normalize();
    }
  };
  const deform = (v) => {
    const f = frames[Math.round(v.x * n)];
    const cy = v.y, cz = v.z;
    v.set(f.p.x + (cy * f.n.x + cz * f.b.x) * radius, f.p.y + (cy * f.n.y + cz * f.b.y) * radius, f.p.z + (cy * f.n.z + cz * f.b.z) * radius);
  };
  return { update, deform };
}

function hookGeo(color = '#6b7280') {
  return merge([
    part(bev(0.1, 0.16, 0.05, 0.02), color, { y: 0.02 }),
    part(arc(0.05, 0.016, Math.PI * 1.3, 4, 8), color, { y: -0.07, z: 0.04, rz: Math.PI * 0.85 }),
  ]);
}

// ---------------------------------------------------------------- bunting

const BUNTING = [P.tomato, P.sunflower, P.teal, P.bubblegum, P.cobalt, P.tangerine, '#8ad14f', P.violet];

/**
 * bunting({ from, to, sag = 0.6, colors, spacing = 0.55, flagSize = 0.42, furled = false, seed, coilSize = 1 })
 * from/to: points in the parent's space (leave the group at the origin). 1 draw call.
 * parts: { flags: [pivots], coil (pivot on the hook at `from`: the furled rainbow roll ~0.8 x 0.5 m hangs
 * just along the line from it, collider covers hook + roll; scale / rotate / hide it freely - the kit only
 * animates its inner nodes; `coilSize` sets its scale), rope, hooks }.
 * userData: setFurled(bool, { instant }) -> Promise (animated unfurl / furl), furled (getter).
 */
export function bunting({ from, to, sag = 0.6, colors = BUNTING, spacing = 0.55, flagSize = 0.42, furled = false, seed = 1, coilSize = 1 } = {}) {
  const A = vec(from, [-3, 3, 0]);
  const B = vec(to, [3, 3, 0]);
  const rng = new Rng(`bunting-${seed}`);
  const len = A.distanceTo(B);
  const n = Math.max(2, Math.floor(len / spacing));
  const g = new THREE.Group();
  const live = new LiveMesh(materials.toy);
  const anims = new Anims();
  let p = furled ? 0 : 1;
  let settle = 0;
  let wob = 1;
  const E = new THREE.Vector3();
  const curve = (u, out) => {
    E.lerpVectors(A, B, p);
    E.y += Math.sin(Math.PI * p) * 0.35;
    out.lerpVectors(A, E, u);
    out.y -= Math.sin(Math.PI * u) * sag * (0.25 + 0.75 * p) * wob;
    return out;
  };
  const rope = makeRope(30, 0.022, curve);
  const ropePivot = pivot('rope');
  g.add(ropePivot);
  const ropePiece = live.addPiece(ropePivot, ropeSource(30, 5, ROPE), rope.deform);
  // hooks at both ends (static pieces)
  const hooks = [];
  for (const [name, pt] of [['hookA', A], ['hookB', B]]) {
    const h = pivot(name, pt.x, pt.y + 0.04, pt.z);
    g.add(h);
    live.addPiece(h, hookGeo());
    hooks.push(h);
  }
  // flags
  const flags = [];
  const fh = flagSize * 1.15;
  for (let i = 0; i < n; i++) {
    const f = pivot(`flag${i}`);
    f.userData.u = (i + 0.5) / n;
    f.userData.phase = i * 0.85 + rng.range(0, 0.5);
    f.add(boxCollider(flagSize * 1.2, fh * 1.1, 0.25, { y: -fh / 2 }));
    g.add(f);
    const ph = f.userData.phase;
    live.addPiece(f, pennantGeo(flagSize, fh, colors[i % colors.length]), (v, t) => {
      const d = -v.y / fh;
      v.z += Math.sin(t * 5.2 + ph + v.x * 7) * 0.035 * d;
    });
    flags.push(f);
  }
  // furled coil: a fat roll of wound bunting hanging on hook A. `coil` is the level-facing pivot
  // (scale / rotate / hide it freely; it is the job target); the kit animates only its inner nodes.
  const coil = pivot('coil', A.x, A.y - 0.02, A.z);
  coil.rotation.y = Math.atan2(-(B.z - A.z), B.x - A.x); // roll axis (local X) along the line
  coil.scale.setScalar(coilSize);
  const coilBody = pivot('coilBody');
  const R0 = 0.25, L0 = 0.78, DX = 0.5; // the roll hangs just along the line from the hook (clear of the wall / post)
  const drum = pivot('drum', DX, -0.46, 0);
  coil.add(coilBody);
  coilBody.add(drum);
  const knot = [DX, -0.1, 0];
  live.addPiece(coilBody, merge([ // rope: hook -> knot -> sling round both tie rings
    part(rod([0, 0.03, 0], knot, 0.026, 5), ROPE),
    part(ball(0.05, 0), ROPE, { x: DX, y: -0.1 }),
    part(rod(knot, [DX - L0 * 0.34, -0.46 + R0 + 0.02, 0], 0.022, 4), ROPE),
    part(rod(knot, [DX + L0 * 0.34, -0.46 + R0 + 0.02, 0], 0.022, 4), ROPE),
  ]));
  const roll = [];
  const nb = 7;
  for (let k = 0; k < nb; k++) {
    const r = R0 + (k % 2) * 0.012;
    roll.push(part(new THREE.CylinderGeometry(r, r, L0 / nb + 0.002, 12, 1, true), colors[k % colors.length], { x: -L0 / 2 + (L0 / nb) * (k + 0.5), rz: Math.PI / 2 }));
  }
  for (const sx of [-1, 1]) {
    // wound-cloth ends: coloured discs with a darker winding line between them
    roll.push(part(new THREE.CircleGeometry(R0 - 0.004, 12), shade(colors[1 % colors.length], 0.25), { x: sx * L0 / 2, ry: sx * Math.PI / 2 }));
    roll.push(part(new THREE.CircleGeometry(R0 * 0.5, 10), shade(colors[2 % colors.length], 0.2), { x: sx * (L0 / 2 + 0.003), ry: sx * Math.PI / 2 }));
    roll.push(part(new THREE.TorusGeometry(R0 * 0.72, 0.016, 3, 10), shade(colors[0], -0.2), { x: sx * (L0 / 2 + 0.004), ry: Math.PI / 2 }));
    roll.push(part(new THREE.TorusGeometry(R0 + 0.02, 0.03, 4, 12), ROPE, { x: sx * L0 * 0.34, ry: Math.PI / 2 }));
  }
  for (let k = 0; k < 11; k++) { // pennant tips poking out of the roll
    const a = k * 2.4 + 0.3;
    const x = -L0 * 0.42 + ((k * 5) % 11) / 10 * L0 * 0.84;
    roll.push(part(new THREE.ConeGeometry(0.1, 0.24, 3), colors[(k * 3) % colors.length], {
      x, y: Math.sin(a) * (R0 + 0.08), z: Math.cos(a) * (R0 + 0.08), rx: Math.PI / 2 - a, sz: 0.35,
    }));
  }
  live.addPiece(drum, merge(roll));
  coilBody.add(ballCollider(0.52, { x: DX * 0.8, y: -0.4, sx: 1.3 })); // covers the hook and the roll
  g.add(coil);
  g.add(live);
  const tan = new THREE.Vector3(), pa = new THREE.Vector3(), pb = new THREE.Vector3();
  const place = (t) => {
    if (settle > 0) wob = 1 + Math.sin((1.2 - settle) * 13) * settle * 0.35;
    else wob = 1;
    if (!ropePiece.frozen) rope.update();
    ropePivot.visible = p > 0.03;
    for (const f of flags) {
      const u = f.userData.u;
      if (u > p - 0.02) { f.visible = false; continue; }
      f.visible = true;
      const uu = u / Math.max(p, 1e-3);
      curve(uu, f.position);
      curve(Math.min(1, uu + 0.01), pa);
      curve(Math.max(0, uu - 0.01), pb);
      tan.subVectors(pa, pb);
      alignToTangent(f, tan);
      _q.setFromAxisAngle(_x.set(1, 0, 0), Math.sin(t * 2.3 + f.userData.phase) * 0.2 + 0.08);
      f.quaternion.multiply(_q);
      const k = clamp01((p - u) / 0.1);
      f.scale.setScalar(Math.max(0.001, ease.outBack(k)));
    }
    const cs = clamp01(1 - p / 0.3);
    coilBody.visible = cs > 0.01;
    coilBody.scale.setScalar(Math.max(0.001, ease.outCubic(cs)));
    coilBody.rotation.x = Math.sin(t * 1.3 + seed) * 0.05;
    coilBody.rotation.z = Math.sin(t * 0.9) * 0.03;
    drum.rotation.x = (1 - cs) * 6;
  };
  let lastP = -1;
  finish(g, {
    name: 'bunting', parts: { flags, coil, rope: ropePivot, hooks }, surface: 'soft', anims,
    tick: (dt, t) => {
      if (settle > 0) settle = Math.max(0, settle - dt);
      ropePiece.frozen = p === lastP && settle === 0;
      lastP = p;
      place(t);
      live.sync(t);
    },
  });
  g.userData.setFurled = (f, { instant = false } = {}) => {
    const to = f ? 0 : 1;
    if (instant) { anims.cancel('furl'); p = to; settle = 0; return Promise.resolve(true); }
    const from = p;
    return anims.play(f ? 1.1 : 1.8, (k) => { p = lerp(from, to, k); }, { ease: f ? ease.inOutCubic : ease.outCubic, key: 'furl' })
      .then((done) => { if (done && !f) settle = 1.2; return done; });
  };
  Object.defineProperty(g.userData, 'furled', { get: () => p < 0.5, enumerable: true });
  place(0);
  live.build();
  return g;
}

// ---------------------------------------------------------------- balloons

const BALLOON_PROFILE = [[0, 0], [0.028, 0.012], [0.045, 0.045], [0.03, 0.07], [0.09, 0.12], [0.18, 0.22], [0.225, 0.34], [0.215, 0.45], [0.16, 0.54], [0.08, 0.59], [0, 0.605]];

/**
 * balloonBunch({ colors, count = 5, seed, height = 2.3, anchor: 'weight'|'none' })
 * parts: { balloons: [pivots (knot at origin), collider each], strings, weight }.
 * userData: popBalloon(b) -> Promise, releaseBalloon(b), reset(), onPop(b) callback hook. 2 draw calls.
 */
export function balloonBunch({ colors, count = 5, seed = 1, height = 2.3, anchor = 'weight' } = {}) {
  const rng = new Rng(`balloons-${seed}`);
  const pal = colors || rng.shuffle([P.tomato, P.sunflower, P.teal, P.bubblegum, P.cobalt, P.tangerine, P.violet, '#8ad14f']);
  const knotY = anchor === 'weight' ? 0.3 : 0;
  const g = new THREE.Group();
  let weight = null;
  if (anchor === 'weight') {
    weight = mesh([
      part(bev(0.26, 0.2, 0.26, 0.06), '#c9ad7f', { y: 0.1 }),
      part(lathe([[0.06, 0], [0.035, 0.05], [0.07, 0.1], [0.02, 0.12]], 8), '#b8955f', { y: 0.19 }),
    ], materials.toy, 'weight');
    g.add(weight);
  }
  const live = new LiveMesh(materials.glossy);
  const strGeo = part(new THREE.CylinderGeometry(0.011, 0.011, 1, 4, 1, true).translate(0, 0.5, 0), '#f6f2ea');
  const balloons = [];
  const strings = [];
  for (let i = 0; i < count; i++) {
    const a = i * 2.4 + rng.range(-0.3, 0.3);
    const r = i === 0 ? 0.05 : rng.range(0.32, 0.55);
    const base = new THREE.Vector3(Math.cos(a) * r, knotY + height + (i === 0 ? 0.35 : rng.range(-0.3, 0.2)), Math.sin(a) * r);
    const b = pivot(`balloon${i}`, base.x, base.y, base.z);
    Object.assign(b.userData, { base, phase: rng.range(0, 6.28), color: pal[i % pal.length], popped: false, released: false, relT: 0, strLen: 1 });
    b.add(ballCollider(0.3, { y: 0.34 }));
    g.add(b);
    live.addPiece(b, part(lathe(BALLOON_PROFILE, 12), pal[i % pal.length], { s: rng.range(0.95, 1.12) }));
    const s = pivot(`string${i}`, 0, knotY, 0);
    g.add(s);
    live.addPiece(s, strGeo);
    b.userData.string = s;
    balloons.push(b);
    strings.push(s);
  }
  g.add(live);
  const anims = new Anims();
  const dir = new THREE.Vector3();
  const tip = new THREE.Vector3();
  const tick = (dt, t) => {
    balloons.forEach((b, i) => {
      const u = b.userData;
      const s = strings[i];
      if (u.released) {
        u.relT += dt;
        b.position.y += (1.1 + u.relT * 0.15) * dt;
        b.position.x += (Math.sin(u.relT * 1.4 + u.phase) * 0.35 + 0.3) * dt;
        b.position.z += Math.cos(u.relT * 1.1 + u.phase) * 0.25 * dt;
        b.rotation.z = Math.sin(u.relT * 2 + u.phase) * 0.2;
        s.position.copy(b.position);
        dir.set(Math.sin(u.relT * 2.1) * 0.25, -1, 0.1).normalize();
        s.quaternion.setFromUnitVectors(UP, dir);
        s.scale.set(1, 0.9, 1);
        if (u.relT > 12) { b.visible = false; s.visible = false; }
        return;
      }
      if (!u.popped) {
        b.position.set(
          u.base.x + Math.sin(t * 0.8 + u.phase) * 0.07,
          u.base.y + Math.sin(t * 1.15 + u.phase) * 0.06,
          u.base.z + Math.cos(t * 0.7 + u.phase) * 0.07,
        );
        b.rotation.set(u.base.z * 0.35 + Math.sin(t * 0.9 + u.phase) * 0.08, 0, -u.base.x * 0.35 + Math.cos(t * 0.8 + u.phase) * 0.08);
        tip.copy(b.position);
        dir.subVectors(tip, s.position);
        const L = dir.length();
        s.quaternion.setFromUnitVectors(UP, dir.normalize());
        s.scale.set(1, L, 1);
      } else {
        // popped: the string collapses towards the knot, then dangles and sways
        u.strLen = Math.max(0.32, u.strLen - dt * 14);
        s.scale.set(1, Math.min(s.scale.y, u.strLen), 1);
        if (u.strLen < 0.6) {
          dir.set(Math.sin(t * 2 + u.phase) * 0.35, -1, Math.cos(t * 1.7 + u.phase) * 0.25).normalize();
          s.quaternion.slerp(_q.setFromUnitVectors(UP, dir), Math.min(1, dt * 5));
        }
      }
    });
    live.sync(t);
  };
  finish(g, { name: 'balloonBunch', parts: { balloons, strings, weight }, surface: 'soft', anims, tick });
  g.userData.popBalloon = (b) => {
    const u = b.userData;
    if (u.popped || u.released) return Promise.resolve(false);
    u.popped = true;
    u.strLen = strings[balloons.indexOf(b)].scale.y;
    return anims.play(0.13, (k) => b.scale.set(1 + 0.45 * k, 1 + 0.25 * k, 1 + 0.45 * k), { key: b.name }).then(() => {
      b.visible = false;
      b.scale.set(1, 1, 1);
      g.userData.onPop?.(b);
      return true;
    });
  };
  g.userData.releaseBalloon = (b) => {
    const u = b.userData;
    if (u.popped || u.released) return false;
    u.released = true;
    u.relT = 0;
    return true;
  };
  g.userData.reset = () => {
    balloons.forEach((b, i) => {
      Object.assign(b.userData, { popped: false, released: false, relT: 0, strLen: 1 });
      b.visible = true;
      b.scale.set(1, 1, 1);
      strings[i].visible = true;
      strings[i].position.set(0, knotY, 0);
    });
  };
  tick(0, 0);
  live.build();
  return g;
}

// ---------------------------------------------------------------- washing line

const CLOTHES = {
  shirt: ['.#####.', '#######', '#######', '.#####.', '.#####.', '.#####.'],
  trousers: ['#####', '#####', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##'],
  dress: ['.#.#.', '.###.', '.###.', '#####', '#####', '#####', '#####'],
  towel: ['#####', '#####', '#####', '#####', '#####', '#####'],
  sock: ['##.', '##.', '##.', '###'],
  pants: ['#####', '#####', '##.##'],
};
const CLOTH_W = { shirt: 7, trousers: 5, dress: 5, towel: 5, sock: 3, pants: 5 };

function clothColors(type, rng) {
  const base = rng.pick([P.tomato, P.sunflower, P.teal, P.cobalt, P.bubblegum, P.tangerine, '#8ad14f', P.violet, '#fff4ea']);
  const alt = base === '#fff4ea' ? rng.pick([P.cobalt, P.tomato]) : '#fff4ea';
  const pattern = type === 'towel' ? 'bands' : type === 'pants' ? 'hearts' : rng.pick(['plain', 'plain', 'plain', 'bands']);
  return (k, r, cols, rows) => {
    if (pattern === 'bands') return r === 1 || r === rows - 2 ? alt : base;
    if (pattern === 'hearts') return r === 1 && (k === 1 || k === cols - 2) ? P.tomato : base;
    if (type === 'shirt' && r === 0) return shade(base, -0.18);
    if (type === 'trousers' && r === 0) return shade(base, -0.25);
    return base;
  };
}

/**
 * washingLine({ from, to, items, sag = 0.35, posts = true, seed })
 * items: ['shirt','trousers','dress','towel','sock','pants'] or [{ type, color }]. Clothes flap in update.
 * parts: { items: [pivots with colliders], posts }. userData: dropItem(item) -> Promise. 2 draw calls.
 */
export function washingLine({ from, to, items, sag = 0.35, posts = true, seed = 1 } = {}) {
  const A = vec(from, [-3, 2, 0]);
  const B = vec(to, [3, 2, 0]);
  const rng = new Rng(`washing-${seed}`);
  const list = (items || rng.shuffle(['shirt', 'trousers', 'sock', 'dress', 'towel', 'pants', 'sock'])).map((it) => (typeof it === 'string' ? { type: it } : it));
  const g = new THREE.Group();
  const L = [];
  const pts = sagPoints(A, B, sag, 16);
  L.push(part(tube(pts, 0.018, 24, 5), ROPE));
  if (posts) {
    const dirH = new THREE.Vector3(B.x - A.x, 0, B.z - A.z).normalize();
    const side = new THREE.Vector3(-dirH.z, 0, dirH.x);
    for (const [pt, s] of [[A, -1], [B, 1]]) {
      L.push(part(rod([pt.x - dirH.x * 0.06 * s, 0, pt.z - dirH.z * 0.06 * s], [pt.x, pt.y + 0.1, pt.z], 0.05, 8), '#f1ece2'));
      L.push(part(rod([pt.x - side.x * 0.3, pt.y + 0.08, pt.z - side.z * 0.3], [pt.x + side.x * 0.3, pt.y + 0.08, pt.z + side.z * 0.3], 0.035, 6), '#f1ece2'));
      L.push(part(bev(0.2, 0.08, 0.2, 0.03), '#d8d0c2', { x: pt.x - dirH.x * 0.06 * s, y: 0.04, z: pt.z - dirH.z * 0.06 * s }));
    }
  }
  const staticMesh = mesh(L, materials.toy, 'line');
  g.add(staticMesh);
  const cell = 0.1;
  const widths = list.map((it) => (CLOTH_W[it.type] || 5) * cell);
  const total = widths.reduce((a, b) => a + b, 0);
  const len = A.distanceTo(B);
  const gap = Math.max(0.05, (len - total - 0.4) / Math.max(1, list.length - 1));
  let cursor = (len - (total + gap * (list.length - 1))) / 2;
  const live = new LiveMesh(materials.toy);
  const pivots = [];
  const curve = new THREE.CatmullRomCurve3(pts);
  const tan = new THREE.Vector3();
  list.forEach((it, i) => {
    const w = widths[i];
    const u = (cursor + w / 2) / len;
    cursor += w + gap;
    const mask = CLOTHES[it.type] || CLOTHES.towel;
    const colorAt = it.color ? () => it.color : clothColors(it.type, rng);
    const h = mask.length * cell;
    const geo = clothGeo(mask, cell, colorAt);
    const pegCol = rng.pick([P.sunflower, P.teal, P.bubblegum, P.woodLight]);
    const pegs = [-w / 2 + 0.06, w / 2 - 0.06].map((x) => part(new THREE.BoxGeometry(0.04, 0.12, 0.05), pegCol, { x, y: -0.01 }));
    const piece = merge([geo, ...pegs]);
    const p = pivot(`${it.type}${i}`);
    curve.getPoint(u, p.position);
    p.position.y -= 0.01;
    curve.getTangent(u, tan);
    alignToTangent(p, tan);
    p.userData.type = it.type;
    p.userData.home = { pos: p.position.clone(), quat: p.quaternion.clone() };
    p.add(boxCollider(w + 0.06, h + 0.06, 0.3, { y: -h / 2 }));
    g.add(p);
    const ph = rng.range(0, 6.28);
    live.addPiece(p, piece, (v, t) => {
      const d = Math.min(1, Math.max(0, -v.y / h));
      v.z += (Math.sin(t * 3.1 + ph + v.x * 3.2) * 0.11 + 0.06) * d ** 1.3;
      v.x += Math.sin(t * 2.3 + ph) * 0.025 * d;
    });
    pivots.push(p);
  });
  g.add(live);
  const anims = new Anims();
  finish(g, { name: 'washingLine', parts: { items: pivots, posts: staticMesh }, surface: 'soft', anims, tick: (dt, t) => live.sync(t) });
  g.userData.dropItem = (p) => {
    if (p.userData.dropped) return Promise.resolve(false);
    p.userData.dropped = true;
    const from = p.position.clone();
    const q0 = p.quaternion.clone();
    const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, rng.range(-1, 1), 0));
    const to = new THREE.Vector3(from.x + rng.range(-0.4, 0.4), 0.03, from.z + rng.range(-0.3, 0.3));
    return anims.play(1.4, (k) => {
      p.position.lerpVectors(from, to, k);
      p.position.x += Math.sin(k * 9) * 0.15 * (1 - k);
      p.quaternion.slerpQuaternions(q0, q1, k);
    }, { ease: ease.inQuad });
  };
  live.build();
  return g;
}

// ---------------------------------------------------------------- flag pole

/**
 * flagPole({ color, color2, height = 7, seed, raised = true, windYaw = 0 })
 * parts: { flag (pivot at the hoist; slides along the pole), pole }.
 * userData: setRaised(bool) -> Promise (flag glides up/down), raised (getter). 2 draw calls.
 */
export function flagPole({ color = P.tomato, color2 = '#fff8ee', height = 7, seed = 1, raised = true, windYaw = 0 } = {}) {
  const rng = new Rng(`flag-${seed}`);
  const H = height;
  const L = [
    part(bev(0.9, 0.3, 0.9, 0.08), P.stone, { y: 0.15 }),
    part(bev(0.6, 0.22, 0.6, 0.06), shade(P.stone, 0.15), { y: 0.4 }),
    part(new THREE.CylinderGeometry(0.055, 0.075, H - 0.5, 10), '#f4f0e8', { y: 0.5 + (H - 0.5) / 2 }),
    part(ball(0.13, 1), P.gold, { y: H + 0.08 }),
    part(puck(0.09, 0.05, 0.015, 10), P.gold, { y: H - 0.02 }),
    part(bev(0.05, 0.16, 0.05, 0.015), '#6b7280', { x: 0.09, y: 1.4 }),
    part(rod([0.075, 1.45, 0], [0.075, H - 0.05, 0], 0.012, 4), ROPE),
  ];
  const g = new THREE.Group();
  const pole = mesh(L, materials.toy, 'pole');
  g.add(pole);
  // Fictional fête banner: swallowtail fly, contrasting hoist band, pixel heart (no real-flag look).
  const fw = 1.8, cell = fw / 10;
  const rows = 6;
  const fhgt = rows * cell;
  const mask = ['##########', '#########.', '########..', '########..', '#########.', '##########'];
  const emblem = new Set(['3,1', '4,1', '6,1', '7,1', '3,2', '4,2', '5,2', '6,2', '7,2', '4,3', '5,3', '6,3', '5,4']);
  const geo = clothGeo(mask, cell, (k, r) => (k < 2 ? color2 : emblem.has(`${k},${r}`) ? P.sunflower : color), 0.016);
  geo.translate(fw / 2, 0, 0);
  const flag = pivot('flag', 0.07, raised ? H - 0.12 : 1.55 + fhgt, 0);
  flag.rotation.y = windYaw;
  flag.add(boxCollider(fw + 0.1, fhgt + 0.1, 0.4, { x: fw / 2, y: -fhgt / 2 }));
  g.add(flag);
  const live = new LiveMesh(materials.toy);
  live.addPiece(flag, geo, (v, t) => {
    const k = v.x / fw;
    v.z += Math.sin(t * 4.6 - v.x * 3.6) * 0.14 * k;
    v.y -= 0.06 * k * k;
    v.x -= Math.abs(Math.sin(t * 4.6 - v.x * 3.6)) * 0.03 * k;
  });
  g.add(live);
  const anims = new Anims();
  let isRaised = raised;
  finish(g, {
    name: 'flagPole', parts: { flag, pole }, surface: 'metal', anims,
    tick: (dt, t) => {
      flag.rotation.y = windYaw + Math.sin(t * 0.31) * 0.22;
      live.sync(t);
    },
  });
  g.userData.setRaised = (on) => {
    isRaised = !!on;
    const from = flag.position.y;
    const to = on ? H - 0.12 : 1.55 + fhgt;
    return anims.play(Math.abs(to - from) / 2.2 + 0.3, (k) => { flag.position.y = lerp(from, to, k); }, { ease: ease.inOutSine, key: 'raise' });
  };
  Object.defineProperty(g.userData, 'raised', { get: () => isRaised, enumerable: true });
  live.build();
  return g;
}

// ---------------------------------------------------------------- weathervane

function roosterShape() {
  const s = new THREE.Shape();
  s.moveTo(-0.3, 0.02);
  s.quadraticCurveTo(-0.34, 0.2, -0.26, 0.34);
  s.quadraticCurveTo(-0.2, 0.2, -0.12, 0.2);
  s.quadraticCurveTo(-0.02, 0.1, 0.1, 0.16);
  s.lineTo(0.12, 0.28);
  s.quadraticCurveTo(0.16, 0.36, 0.22, 0.3);
  s.lineTo(0.3, 0.27);
  s.lineTo(0.23, 0.23);
  s.quadraticCurveTo(0.22, 0.1, 0.16, 0.04);
  s.quadraticCurveTo(0.0, -0.06, -0.3, 0.02);
  return s;
}

/**
 * weathervane({ seed, windYaw = 0, base: 'plinth'|'none' }) — rooster vane over N/E/S/W arms.
 * parts: { vane (pivot, spins about Y) }. userData: spin(impulse = 8) (shot reaction). 2 draw calls.
 */
export function weathervane({ seed = 1, windYaw = 0, base = 'plinth' } = {}) {
  const rng = new Rng(`vane-${seed}`);
  const iron = '#3d4a6b';
  const L = [];
  if (base === 'plinth') {
    L.push(part(lathe([[0, 0], [0.24, 0], [0.24, 0.06], [0.12, 0.18], [0.1, 0.24], [0, 0.26]], 8), shade(iron, 0.1)));
  }
  L.push(part(rod([0, 0.2, 0], [0, 1.55, 0], 0.03, 6), iron));
  L.push(part(ball(0.07, 1), P.gold, { y: 0.95 }));
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const dx = Math.sin(a), dz = Math.cos(a);
    L.push(part(rod([0, 0.95, 0], [dx * 0.42, 0.95, dz * 0.42], 0.018, 5), iron));
    L.push(part(ball(0.045, 0), P.gold, { x: dx * 0.44, y: 0.95, z: dz * 0.44 }));
  }
  // an "N" on the north (+Z... -Z is north in level space? use +Z) arm
  L.push(part(bev(0.025, 0.14, 0.025, 0.008), iron, { x: -0.05, y: 1.12, z: 0.44 }));
  L.push(part(bev(0.025, 0.14, 0.025, 0.008), iron, { x: 0.05, y: 1.12, z: 0.44 }));
  L.push(part(bev(0.025, 0.16, 0.025, 0.008), iron, { y: 1.12, z: 0.44, rz: 0.62 }));
  L.push(part(rod([0, 0.95, 0.44], [0, 1.05, 0.44], 0.01, 4), iron));
  const g = new THREE.Group();
  g.add(mesh(L, materials.toy, 'stand'));
  const vane = pivot('vane', 0, 1.42, 0);
  const V = [
    part(rod([-0.55, 0, 0], [0.5, 0, 0], 0.02, 5), iron),
    part(new THREE.ConeGeometry(0.08, 0.2, 4), iron, { x: 0.58, rz: -Math.PI / 2, sz: 0.3 }),
    part(slab((() => { const s = new THREE.Shape(); s.moveTo(0, 0.15); s.lineTo(0.24, 0); s.lineTo(0, -0.15); s.lineTo(0, 0.15); return s; })(), 0.02, 0.006), iron, { x: -0.74 }),
    part(slab(roosterShape(), 0.035, 0.01, 5), P.gold, { y: 0.02, x: -0.05, s: 1.15 }),
    part(new THREE.ConeGeometry(0.035, 0.06, 4), P.tomato, { x: 0.18, y: 0.43, sz: 0.4 }),
  ];
  vane.add(mesh(V, materials.toy, 'vaneMesh'));
  vane.add(boxCollider(1.4, 0.6, 0.25, { x: -0.05, y: 0.2 }));
  g.add(vane);
  const anims = new Anims();
  let vel = 0;
  let extra = 0;
  finish(g, {
    name: 'weathervane', parts: { vane }, surface: 'metal', anims,
    tick: (dt, t) => {
      vel *= Math.exp(-dt * 0.9);
      extra += vel * dt;
      const target = windYaw + Math.sin(t * 0.37 + seed) * 0.35 + Math.sin(t * 1.9) * 0.05;
      if (Math.abs(vel) < 0.5) {
        extra = ((((extra + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
        extra *= Math.exp(-dt * 1.2);
      }
      vane.rotation.y = target + extra;
    },
  });
  g.userData.spin = (impulse = 8) => { vel += impulse; };
  return g;
}

// ---------------------------------------------------------------- kite

/**
 * kite({ seed, colors: [c1, c2], stuck = true }) — smiley diamond kite with a bow tail, tangled by its
 * string on a branch. The group origin IS the tangled knot: place it in the tree canopy.
 * parts: { knot (job target, enlarged collider), kite (pivot + collider), tail }.
 * userData: free() -> Promise (knot unties, kite floats up and hovers), flyAway() -> Promise (drifts off,
 * hides), freed. 1 draw call (LiveMesh).
 */
export function kite({ seed = 1, colors, stuck = true } = {}) {
  const rng = new Rng(`kite-${seed}`);
  const [c1, c2] = colors || rng.pick([[P.tomato, P.sunflower], [P.cobalt, P.sunflower], [P.bubblegum, P.teal], [P.violet, P.tangerine]]);
  const g = new THREE.Group();
  const live = new LiveMesh(materials.toy);
  const knot = pivot('knot');
  g.add(knot);
  live.addPiece(knot, merge([
    part(ball(0.075, 0), ROPE),
    part(arc(0.065, 0.016, Math.PI * 1.6, 4, 8), ROPE, { x: 0.03, rx: 1.1 }),
    part(arc(0.05, 0.014, Math.PI * 1.4, 4, 8), ROPE, { x: -0.02, y: 0.03, ry: 1.2 }),
  ]));
  knot.add(ballCollider(0.32));
  const home = new THREE.Vector3(0.5, 0.8, 0.05);
  const kp = pivot('kite', home.x, home.y, home.z);
  const tilt0 = stuck ? -0.55 : 0.1;
  kp.rotation.z = tilt0;
  g.add(kp);
  // sail: four coloured quadrants, double sided
  const W = 0.38, T = 0.56, Bt = 0.52, cy = 0.14;
  const pts = [[0, T], [W, cy], [0, -Bt], [-W, cy]];
  const pos = [];
  const col = [];
  const ca = new THREE.Color(c1), cb = new THREE.Color(c2);
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4];
    const cc = i % 2 ? ca : cb;
    pos.push(0, cy, 0.006, b[0], b[1], 0.006, a[0], a[1], 0.006); // corners run clockwise: (c, b, a) faces +Z
    pos.push(0, cy, -0.006, a[0], a[1], -0.006, b[0], b[1], -0.006);
    for (let k = 0; k < 6; k++) col.push(cc.r * (k < 3 ? 1 : 0.85), cc.g * (k < 3 ? 1 : 0.85), cc.b * (k < 3 ? 1 : 0.85));
  }
  const sail = new THREE.BufferGeometry();
  sail.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  sail.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  sail.computeVertexNormals();
  const sailG = sail;
  const knotLocal = new THREE.Vector3().copy(home).negate().applyAxisAngle(new THREE.Vector3(0, 0, 1), -tilt0);
  const K = [
    sailG,
    part(rod([0, -Bt, -0.02], [0, T, -0.02], 0.014, 5), P.woodDark),
    part(rod([-W, cy, -0.02], [W, cy, -0.02], 0.014, 5), P.woodDark),
    part(ball(0.035, 0), INK, { x: -0.1, y: 0.24, z: 0.02, sz: 0.35 }),
    part(ball(0.035, 0), INK, { x: 0.1, y: 0.24, z: 0.02, sz: 0.35 }),
    part(arc(0.1, 0.018, Math.PI, 4, 8), INK, { y: 0.14, z: 0.018, rz: Math.PI }),
    part(tube([new THREE.Vector3(0, 0.02, 0.03), knotLocal.clone().multiplyScalar(0.5).add(new THREE.Vector3(0, -0.12, 0.02)), knotLocal], 0.012, 10, 4), ROPE),
  ];
  live.addPiece(kp, merge(K));
  kp.add(boxCollider(0.9, 1.2, 0.3, { y: 0.05 }));
  // bow tail hanging from the bottom tip, waving
  const tail = pivot('tail', 0, -Bt, 0);
  kp.add(tail);
  const TL = [part(new THREE.BoxGeometry(0.018, 1.4, 0.018, 1, 8, 1), ROPE, { y: -0.7 })];
  for (let i = 0; i < 5; i++) {
    const y = -0.25 - i * 0.26;
    const bc = [c1, c2, '#fff8ee'][i % 3];
    TL.push(part(new THREE.ConeGeometry(0.06, 0.12, 3), bc, { x: 0.06, y, rz: Math.PI / 2 }));
    TL.push(part(new THREE.ConeGeometry(0.06, 0.12, 3), bc, { x: -0.06, y, rz: -Math.PI / 2 }));
  }
  live.addPiece(tail, merge(TL), (v, t) => {
    const d = Math.min(1, Math.max(0, -v.y / 1.4));
    v.x += Math.sin(t * 4.4 + v.y * 3.5) * 0.16 * d;
    v.z += Math.cos(t * 3.1 + v.y * 2.2) * 0.06 * d;
  });
  g.add(live);
  const anims = new Anims();
  let state = stuck ? 'stuck' : 'hover';
  const base = home.clone();
  let tiltBase = tilt0;
  finish(g, {
    name: 'kite', parts: { knot, kite: kp, tail }, surface: 'soft', anims,
    tick: (dt, t) => {
      if (state !== 'flying') {
        const amp = state === 'stuck' ? 1 : 0.6;
        kp.rotation.z = tiltBase + (Math.sin(t * 2.6) * 0.1 + Math.sin(t * 6.1) * 0.04) * amp;
        kp.rotation.x = Math.sin(t * 3.3) * 0.12 * amp;
        if (state === 'hover') kp.position.set(base.x + Math.sin(t * 0.9) * 0.15, base.y + Math.sin(t * 1.3) * 0.12, base.z);
      }
      live.sync(t);
    },
  });
  g.userData.free = () => {
    if (state !== 'stuck') return Promise.resolve(false);
    state = 'rising';
    g.userData.freed = true;
    knot.visible = false;
    const from = kp.position.clone();
    const to = from.clone().add(new THREE.Vector3(0.8, 2.6, 0.3));
    const t0 = tiltBase;
    return anims.play(2.4, (k) => {
      kp.position.lerpVectors(from, to, ease.outCubic(k));
      tiltBase = lerp(t0, 0.12, ease.outCubic(k));
    }, { key: 'kite' }).then((d) => { if (d) { base.copy(to); state = 'hover'; } return d; });
  };
  g.userData.flyAway = () => {
    state = 'flying';
    const from = kp.position.clone();
    return anims.play(6, (k) => {
      kp.position.set(from.x + k * 6, from.y + ease.inQuad(k) * 9, from.z + Math.sin(k * 5) * 0.6);
      kp.rotation.z = 0.12 + Math.sin(k * 20) * 0.15;
    }, { key: 'kite' }).then((d) => { if (d) kp.visible = false; return d; });
  };
  live.build();
  return g;
}
