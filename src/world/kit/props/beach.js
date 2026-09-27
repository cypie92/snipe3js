// Beach props for Barnacle Bay: deckchair, windbreak, sandcastle, beach ball, lifeguard chair,
// bucket & spade, surfboard, decor crab, beach towel, beach parasol. Origin = sand contact point,
// front = +Z (floating ones: waterline y 0).
import * as THREE from 'three';
import { part, merge, xform } from '../../geo.js';
import { materials } from '../../../gfx/materials.js';
import { P } from '../../../gfx/palette.js';
import { Rng } from '../../../core/rng.js';
import {
  bev, lathe, puck, ball, blob, rod, arc, slab, latheBands, mesh, pivot, finish, paintFaces, inside,
  LiveMesh, Anims, ease, shade, boxCollider, ballCollider, noise3, wordSign,
} from './lib.js';
import { floatRig } from './boatlib.js';

const INK = '#2b2b3a';
const SAND = '#ecd49a';
const WET = '#d2b27a';
const CREAM = '#fff8ee';
const STRIPES = [[P.tomato, CREAM], [P.cobalt, CREAM], [P.teal, P.sunflower], [P.bubblegum, CREAM], [P.sunflower, P.tomato], ['#5cb83c', CREAM]];
const lerp = THREE.MathUtils.lerp;

/** Double-sided cloth patch over a (u, v) grid; at(u, v) -> [x, y, z]; colorAt(i, j) -> hex. */
function clothPatch(nu, nv, at, colorAt, thick = 0.012) {
  const pos = [], col = [];
  const c = new THREE.Color();
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = at(i / nu, j / nv), b = at((i + 1) / nu, j / nv), cc = at(i / nu, (j + 1) / nv), d = at((i + 1) / nu, (j + 1) / nv);
      c.set(colorAt(i, j));
      for (const side of [1, -1]) {
        const k = side > 0 ? 1 : 0.85;
        const tris = side > 0 ? [a, b, cc, b, d, cc] : [a, cc, b, b, cc, d];
        for (const p of tris) { pos.push(p[0], p[1] + side * thick * 0.5, p[2]); col.push(c.r * k, c.g * k, c.b * k); }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- deckchair

/**
 * deckchair({ seed, colors: [c1, c2] }) — striped canvas deckchair on a wooden frame.
 * parts: { chair (pivot at the chair's middle), seat (Object3D in the canvas sling, facing +Z: sit a
 * sunbather there; `userData.seat` = its height for the characters' deckchair pose) }.
 * userData: collapse() -> Promise (tips onto its back and folds flat with a clatter - the classic
 * deckchair gag; fun hit), reset(), tumbling (true = cartwheels end over end with little hops: move
 * the group along its +/-Z for the runaway deckchair). 1 draw call.
 */
export function deckchair({ seed = 1, colors } = {}) {
  const rng = new Rng(`deckchair-${seed}`);
  const [c1, c2] = colors || rng.pick(STRIPES);
  const wood = rng.pick([P.woodLight, '#e0b27a']);
  const L = [];
  const top = [1.0, -0.42], front = [0.46, 0.44];
  for (const s of [-1, 1]) {
    L.push(part(rod([s * 0.3, 0, 0.3], [s * 0.3, top[0] + 0.04, top[1] - 0.02], 0.035, 5), wood));
    L.push(part(rod([s * 0.33, 0, 0.62], [s * 0.33, front[0], front[1]], 0.033, 5), wood));
    L.push(part(rod([s * 0.33, front[0], front[1]], [s * 0.31, 0.48, -0.08], 0.03, 5), wood));
    L.push(part(rod([s * 0.3, 0.6, -0.1], [s * 0.3, 0, -0.62], 0.03, 5), wood));
  }
  for (const [y, z] of [[top[0], top[1]], [front[0], front[1]], [0.14, 0.58], [0.1, -0.56]]) L.push(part(rod([-0.34, y, z], [0.34, y, z], 0.028, 5), shade(wood, -0.1)));
  const canvas = clothPatch(7, 9, (u, v) => {
    const x = (u - 0.5) * 0.56;
    const y = lerp(top[0] - 0.02, front[0] + 0.02, v) - Math.sin(Math.PI * v) * 0.38;
    const z = lerp(top[1] + 0.02, front[1] - 0.01, v);
    return [x, y, z];
  }, (i) => (i % 2 ? c2 : c1));
  L.push(canvas);
  const CY = 0.45; // chair pivot height (spins about its middle)
  const g = new THREE.Group();
  const chair = pivot('chair', 0, CY, 0);
  const m = mesh(L, materials.toy, 'deckchair');
  m.position.y = -CY;
  chair.add(m); // hit through its canvas + frame: no box collider, so a sunbather in it stays shootable
  const seat = pivot('seat', 0, 0.34 - CY, 0.02);
  chair.add(seat);
  g.add(chair);
  const anims = new Anims();
  finish(g, { name: 'deckchair', parts: { chair, seat }, surface: 'soft', anims, bodyForWobble: chair });
  g.userData.seat = 0.34;
  g.userData.tumbling = false;
  let roll = 0, hop = 0;
  g.userData.addTick((dt) => {
    if (!g.userData.tumbling && roll === 0) return;
    if (g.userData.tumbling) roll += dt * 7.5;
    else { // finish the current flip, then settle upright
      const next = Math.ceil(roll / (Math.PI * 2) - 1e-3) * Math.PI * 2;
      roll = Math.min(next, roll + dt * 7.5);
      if (roll >= next) roll = 0;
    }
    hop = Math.abs(Math.sin(roll * 0.5)) * 0.35;
    chair.rotation.x = roll;
    chair.position.y = CY + hop;
  });
  g.userData.collapse = () => {
    if (g.userData.collapsed) return Promise.resolve(false);
    g.userData.collapsed = true;
    return anims.play(0.7, (k) => {
      chair.rotation.x = -1.32 * k;
      chair.position.set(0, CY - 0.28 * k, -0.18 * k);
      chair.scale.set(1, 1, 1 - 0.55 * k); // the frame folds flat as it lands
    }, { ease: ease.outBounce, key: 'collapse' });
  };
  g.userData.reset = () => {
    anims.cancel('collapse');
    g.userData.collapsed = false;
    g.userData.tumbling = false;
    roll = 0;
    chair.rotation.set(0, 0, 0);
    chair.position.set(0, CY, 0);
    chair.scale.set(1, 1, 1);
  };
  return g;
}

// ---------------------------------------------------------------- windbreak

/** windbreak({ seed, colors, panels = 4 }) — striped canvas windbreak between poles, fluttering. 2 draw calls. */
export function windbreak({ seed = 1, colors, panels = 4 } = {}) {
  const rng = new Rng(`windbreak-${seed}`);
  const [c1, c2] = colors || rng.pick(STRIPES);
  const n = panels + 1;
  const poles = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) - 0.5;
    poles.push(new THREE.Vector3(t * panels * 1.05, 0, -Math.abs(t) * 0.9 + (i % 2 ? 0.12 : 0)));
  }
  const L = [];
  for (const p of poles) {
    L.push(part(rod([p.x, -0.1, p.z], [p.x + rng.range(-0.04, 0.04), 1.45, p.z], 0.04, 6), P.woodLight));
    L.push(part(ball(0.06, 0), P.woodDark, { x: p.x, y: 1.48, z: p.z }));
    L.push(part(new THREE.ConeGeometry(0.16, 0.1, 6), WET, { x: p.x, y: 0.03, z: p.z }));
  }
  const g = new THREE.Group();
  g.add(mesh(L, materials.toy, 'poles'));
  const live = new LiveMesh(materials.toy);
  const flap = [];
  for (let i = 0; i < panels; i++) {
    const A = poles[i], B = poles[i + 1];
    const piv = pivot(`panel${i}`, A.x, 0.15, A.z);
    const dx = B.x - A.x, dz = B.z - A.z;
    const len = Math.hypot(dx, dz);
    piv.rotation.y = Math.atan2(-dz, dx);
    const geo = clothPatch(6, 3, (u, v) => [u * len, v * 1.15, 0], (k) => (Math.floor(k / 2) % 2 ? c2 : c1));
    // clothPatch builds in XZ-ish by y offset; rotate so the panel stands up (v -> y), facing +Z
    piv.add(boxCollider(len, 1.2, 0.16, { x: len / 2, y: 0.58, z: 0.08 })); // thin, per panel: sunbathers in the shelter stay shootable
    g.add(piv);
    const ph = i * 1.3;
    live.addPiece(piv, geo, (v, t) => {
      const u = v.x / len;
      v.z += Math.sin(Math.PI * u) * (0.12 + Math.sin(t * 2.2 + ph + v.y) * 0.05);
    });
    flap.push(piv);
  }
  g.add(live);
  live.build();
  finish(g, { name: 'windbreak', parts: { panels: flap }, surface: 'soft', tick: (dt, t) => live.sync(t) });
  return g;
}

// ---------------------------------------------------------------- sandcastle

/**
 * sandcastle({ seed }) — bucket-tower sandcastle on a mound with a wet moat, shells, starfish and a
 * paper flag on the keep. parts: { flag (pivot) }. 2 draw calls.
 */
export function sandcastle({ seed = 1 } = {}) {
  const rng = new Rng(`sandcastle-${seed}`);
  const sandPaint = (g, base = SAND) => paintFaces(g, (x, y, z, nx, ny, nz, c) => {
    c.set(base);
    c.multiplyScalar(0.93 + noise3(Math.round(x * 25), Math.round(y * 25), Math.round(z * 25) + seed) * 0.12);
  });
  const L = [];
  L.push(part(new THREE.TorusGeometry(1.05, 0.14, 5, 20), WET, { y: 0.02, rx: Math.PI / 2, sy: 0.4 }));
  L.push(part(new THREE.TorusGeometry(1.05, 0.06, 4, 20), '#8fd3f4', { y: 0.05, rx: Math.PI / 2, sy: 0.3 }));
  L.push(sandPaint(part(blob(0.95, 1, 0.08, seed), '#fff', { y: 0.05, sy: 0.22 })));
  const tower = (x, z, r, h) => {
    const t = sandPaint(part(new THREE.CylinderGeometry(r * 0.8, r, h, 10, 2), '#fff', { x, y: 0.2 + h / 2, z }));
    L.push(t);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      L.push(sandPaint(part(new THREE.BoxGeometry(r * 0.35, r * 0.35, r * 0.35), '#fff', { x: x + Math.cos(a) * r * 0.72, y: 0.2 + h + r * 0.15, z: z + Math.sin(a) * r * 0.72, ry: -a })));
    }
  };
  const cs = [[-0.5, -0.45], [0.5, -0.45], [-0.5, 0.45], [0.5, 0.45]];
  for (const [x, z] of cs) tower(x, z, 0.2, 0.42);
  for (let i = 0; i < 4; i++) {
    const [ax, az] = cs[i], [bx, bz] = cs[[1, 3, 0, 2][i]];
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const alongX = Math.abs(bx - ax) > 0.1;
    L.push(sandPaint(part(bev(alongX ? 0.8 : 0.14, 0.28, alongX ? 0.14 : 0.8, 0.03), '#fff', { x: mx, y: 0.34, z: mz })));
  }
  L.push(sandPaint(part(new THREE.CylinderGeometry(0.26, 0.32, 0.72, 10), '#fff', { y: 0.2 + 0.36 })));
  L.push(sandPaint(part(new THREE.ConeGeometry(0.3, 0.42, 10), '#fff', { y: 1.13 }), '#e4c98a'));
  L.push(part(bev(0.18, 0.24, 0.04, 0.02), '#8a6a4a', { y: 0.33, z: 0.3 }));
  for (let i = 0; i < 6; i++) {
    const a = i * 1.1 + 0.3;
    L.push(part(new THREE.ConeGeometry(0.05, 0.08, 5), i % 2 ? '#ffc8d6' : CREAM, { x: Math.cos(a) * 0.82, y: 0.14, z: Math.sin(a) * 0.82, rx: Math.PI / 2 - 0.3, ry: a }));
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    L.push(part(new THREE.ConeGeometry(0.04, 0.14, 4), P.tangerine, { x: 0.85 + Math.cos(a) * 0.06, y: 0.07, z: 0.6 + Math.sin(a) * 0.06, rz: -Math.PI / 2, ry: -a, sy: 1 }));
  }
  const g = new THREE.Group();
  g.add(mesh(L, materials.toy, 'castle'));
  const live = new LiveMesh(materials.toy);
  const flag = pivot('flag', 0.01, 1.7, 0);
  const col = rng.pick([P.tomato, P.cobalt, P.bubblegum, '#5cb83c']);
  const fg = clothPatch(4, 2, (u, v) => [u * 0.28, -v * 0.18, 0], (i, j) => (i === 1 && j === 0 ? CREAM : col), 0.006);
  // clothPatch offsets along y for thickness; flag hangs in the XY plane. The pole flies off with it.
  live.addPiece(flag, fg, (v, t) => { v.z += Math.sin(t * 6 - v.x * 14) * 0.03 * (v.x / 0.28); });
  live.addPiece(flag, part(rod([-0.01, -0.4, 0], [-0.01, 0.03, 0], 0.012, 4), P.woodDark));
  g.add(flag, live);
  live.build();
  g.add(boxCollider(1.9, 1.0, 1.9, { y: 0.4 }));
  const anims = new Anims();
  const castle = g.children[0];
  finish(g, { name: 'sandcastle', parts: { flag, castle }, surface: 'dust', anims, tick: (dt, t) => live.sync(t) });
  const flag0 = flag.position.clone();
  /** Fun hit: the castle slumps into a heap and the flag pops off, spins and sticks in the sand. */
  g.userData.crumble = () => {
    if (g.userData.crumbled) return Promise.resolve(false);
    g.userData.crumbled = true;
    anims.play(0.9, (k) => {
      flag.position.set(flag0.x + k * 0.9, flag0.y + Math.sin(k * Math.PI) * 0.8 - k * (flag0.y - 0.28), flag0.z + k * 0.5);
      flag.rotation.set(0, k * 9, Math.sin(k * Math.PI) * 1.2 + k * 0.25); // tumbles, then sticks in the sand
    }, { key: 'flag' });
    return anims.play(0.8, (k) => { castle.scale.set(1 + 0.18 * k, 1 - 0.62 * k, 1 + 0.18 * k); }, { ease: ease.outBounce, key: 'crumble' });
  };
  g.userData.reset = () => {
    anims.cancel('flag'); anims.cancel('crumble');
    g.userData.crumbled = false;
    castle.scale.set(1, 1, 1);
    flag.position.copy(flag0);
    flag.rotation.set(0, 0, 0);
  };
  return g;
}

// ---------------------------------------------------------------- beach ball

/**
 * beachBall({ seed, size = 0.36 (radius), bob = 0 }) — six-gore glossy beach ball. Origin = contact
 * point. parts: { ball (pivot at the ball centre, collider) }. userData: bounce(height = 1.6) -> Promise
 * (big squashy bounces), toss(to, { height, duration, world }) -> Promise (arcs to a point and bounces:
 * seals playing catch), bob (floats on water if > 0). 1 draw call.
 */
export function beachBall({ seed = 1, size = 0.36, bob = 0 } = {}) {
  const rng = new Rng(`ball-${seed}`);
  const cols = rng.shuffle([P.tomato, P.sunflower, P.cobalt, '#5cb83c', P.bubblegum, P.tangerine]);
  const geo = part(new THREE.SphereGeometry(size, 18, 12), '#fff');
  paintFaces(geo, (x, y, z, nx, ny, nz, c) => {
    if (Math.abs(ny) > 0.93) { c.set(CREAM); return; }
    let a = Math.atan2(x, z);
    if (a < 0) a += Math.PI * 2;
    const k = Math.floor(a / (Math.PI / 3) + 1e-3);
    c.set(k % 2 ? CREAM : cols[k % cols.length]);
  });
  const g = new THREE.Group();
  const ballP = pivot('ball', 0, size, 0);
  ballP.add(mesh([geo, part(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 8), CREAM, { y: size })], materials.glossy, 'ballMesh'));
  ballP.add(ballCollider(size + 0.15, {}));
  ballP.rotation.set(rng.range(0, 1), rng.range(0, 6), rng.range(-0.3, 0.3));
  g.add(ballP);
  const anims = new Anims();
  finish(g, { name: 'beachBall', parts: { ball: ballP }, surface: 'soft', anims, bodyForWobble: ballP });
  if (bob) floatRig(g, { bob, seed, heave: 0.05, roll: 0.3, pitch: 0.2 });
  /**
   * Arc the ball to `to` (group space; world space with { world: true }) - e.g. seals playing catch.
   * Resolves when it lands (a small bounce follows).
   */
  g.userData.toss = (to, { height = 1.8, duration, world = false } = {}) => {
    const target = to.isVector3 ? to.clone() : new THREE.Vector3(to.x ?? to[0], to.y ?? to[1], to.z ?? to[2]);
    if (world) g.worldToLocal(target);
    target.y += size;
    const from = ballP.position.clone();
    const peak = Math.max(from.y, target.y) + height;
    const d = duration ?? 0.7 + from.distanceTo(target) * 0.12;
    const r0 = ballP.rotation.x;
    return anims.play(d, (k) => {
      ballP.position.lerpVectors(from, target, k);
      const up = peak - from.y, down = peak - target.y; // two half-parabolas through the peak
      const kp = Math.sqrt(up) / (Math.sqrt(up) + Math.sqrt(down));
      ballP.position.y = k < kp ? peak - up * (1 - k / kp) ** 2 : peak - down * ((k - kp) / (1 - kp)) ** 2;
      ballP.rotation.x = r0 + k * 8;
      ballP.scale.setScalar(1);
    }, { key: 'bounce' }).then((ok) => (ok ? g.userData.bounce(height * 0.22).then(() => true) : false));
  };
  g.userData.bounce = (height = 1.6) => {
    const hops = [height, height * 0.45, height * 0.18];
    const times = hops.map((hh) => Math.sqrt((2 * hh) / 9.8) * 2);
    const total = times.reduce((a, b) => a + b, 0);
    const r0 = ballP.rotation.x;
    const y0 = ballP.position.y; // bounces from wherever it rests (after a toss too)
    return anims.play(total + 0.15, (k, kk) => {
      let tt = kk * (total + 0.15);
      let y = 0, sq = 0;
      for (let i = 0; i < hops.length; i++) {
        if (tt < times[i]) {
          const v0 = Math.sqrt(2 * 9.8 * hops[i]);
          y = v0 * tt - 4.9 * tt * tt;
          sq = tt < 0.06 ? (0.06 - tt) / 0.06 * 0.25 * (1 - i * 0.3) : 0;
          break;
        }
        tt -= times[i];
        if (i === hops.length - 1) { sq = Math.max(0, 0.15 - tt) * 1.2; }
      }
      ballP.position.y = y0 + Math.max(0, y);
      ballP.scale.set(1 + sq * 0.6, 1 - sq, 1 + sq * 0.6);
      ballP.rotation.x = r0 + kk * 9;
    }, { key: 'bounce' }).then((d) => { ballP.scale.set(1, 1, 1); ballP.position.y = y0; return d; });
  };
  return g;
}

// ---------------------------------------------------------------- lifeguard chair

/**
 * lifeguardChair({ seed, text = 'LIFEGUARD' }) — tall white lifeguard tower with ladder, parasol, red
 * flag, lifebuoy and a painted sign (real words, sign atlas). parts: { seat (Object3D on the seat, facing
 * +Z: sit the lifeguard here), sign }. 2 draw calls.
 */
export function lifeguardChair({ seed = 1, text = 'LIFEGUARD' } = {}) {
  const rng = new Rng(`lifeguard-${seed}`);
  const wood = '#f4efe6';
  const red = P.tomato;
  const L = [];
  const pY = 2.2;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) L.push(part(rod([sx * 0.62, 0, sz * 0.55], [sx * 0.42, pY, sz * 0.36], 0.06, 6), wood));
  for (const s of [-1, 1]) {
    L.push(part(rod([s * 0.58, 0.3, 0.52], [s * 0.45, pY - 0.2, -0.38], 0.03, 4), shade(wood, -0.1)));
    L.push(part(rod([s * 0.58, 0.3, -0.52], [s * 0.45, pY - 0.2, 0.38], 0.03, 4), shade(wood, -0.1)));
  }
  L.push(part(bev(1.05, 0.09, 0.9, 0.03), red, { y: pY }));
  L.push(part(bev(0.72, 0.08, 0.5, 0.03), wood, { y: pY + 0.45, z: -0.05 }));
  L.push(part(bev(0.72, 0.62, 0.08, 0.03), wood, { y: pY + 0.8, z: -0.3, rx: -0.15 }));
  for (const s of [-1, 1]) {
    L.push(part(bev(0.06, 0.4, 0.06, 0.02), wood, { x: s * 0.34, y: pY + 0.24, z: 0.15 }));
    L.push(part(bev(0.06, 0.4, 0.06, 0.02), wood, { x: s * 0.34, y: pY + 0.24, z: -0.25 }));
    L.push(part(bev(0.07, 0.05, 0.55, 0.02), red, { x: s * 0.36, y: pY + 0.62, z: -0.05 }));
  }
  // ladder at the front
  for (const s of [-1, 1]) L.push(part(rod([s * 0.22, 0, 1.0], [s * 0.22, pY, 0.42], 0.03, 4), wood));
  for (let i = 1; i <= 6; i++) {
    const k = i / 7;
    L.push(part(new THREE.BoxGeometry(0.44, 0.04, 0.08), shade(wood, -0.08), { y: k * pY, z: lerp(1.0, 0.42, k) }));
  }
  // parasol
  L.push(part(rod([0.42, pY, -0.34], [0.42, pY + 2.0, -0.34], 0.03, 5), wood));
  const cone = part(new THREE.ConeGeometry(1.0, 0.4, 8, 1, true), '#fff', { x: 0.42, y: pY + 1.85, z: -0.34 });
  paintFaces(cone, (x, y, z, nx, ny, nz, c) => { let a = Math.atan2(x - 0.42, z + 0.34); if (a < 0) a += Math.PI * 2; c.set(Math.floor(a / (Math.PI / 4)) % 2 ? red : CREAM); });
  L.push(cone, paintFaces(inside(cone.clone()), (x, y, z, nx, ny, nz, c) => c.multiplyScalar(0.75)));
  // flag, lifebuoy, sign
  L.push(part(rod([-0.5, pY, -0.4], [-0.5, pY + 1.4, -0.4], 0.02, 4), wood));
  L.push(part(new THREE.ConeGeometry(0.2, 0.5, 3), red, { x: -0.5 + 0.24, y: pY + 1.25, z: -0.4, rz: -Math.PI / 2, sx: 0.8, sz: 0.12 }));
  const RX = -0.56, RY = pY - 0.78; // lifebuoy hangs on the left leg, below the sign
  const ring = part(new THREE.TorusGeometry(0.24, 0.07, 6, 14), '#fff', { x: RX, y: RY, z: 0.44 });
  paintFaces(ring, (x, y, z, nx, ny, nz, c) => { const a = Math.atan2(y - RY, x - RX) + Math.PI; c.set(Math.floor(a / (Math.PI / 4)) % 2 ? CREAM : red); });
  L.push(ring);
  L.push(part(bev(0.92, 0.3, 0.04, 0.02), red, { y: pY - 0.22, z: 0.43 }));
  const g = new THREE.Group();
  g.add(mesh(L, materials.toy, 'tower'));
  const sign = wordSign(text, 0.86, 0.25, { paper: red, ink: CREAM, keyline: 0.8, bounce: 0.6, px: 320, round: 0.03 });
  sign.position.set(0, pY - 0.22, 0.454);
  g.add(sign);
  const seat = pivot('seat', 0, pY + 0.5, -0.05);
  g.add(seat);
  g.add(boxCollider(1.3, pY - 0.1, 1.5, { y: (pY - 0.1) / 2, z: 0.1 })); // legs + ladder only: the lifeguard up top stays shootable
  return finish(g, { name: 'lifeguardChair', parts: { seat, sign }, surface: 'wood' });
}

// ---------------------------------------------------------------- bucket & spade

/** bucketSpade({ seed, color }) — toy bucket of sand, a spade and a turret turned out of the bucket. 1 draw call. */
export function bucketSpade({ seed = 1, color } = {}) {
  const rng = new Rng(`bucket-${seed}`);
  const c = color || rng.pick([P.tomato, P.cobalt, P.sunflower, P.teal, P.bubblegum]);
  const c2 = rng.pick([P.sunflower, P.teal, P.tomato, '#5cb83c'].filter((x) => x !== c));
  const L = [
    latheBands([[0, 0], [0.13, 0], [0.17, 0.24], [0.185, 0.25], [0.185, 0.27], [0.168, 0.27], [0.128, 0.03], [0, 0.03]], 12,
      (y, i) => (i === 3 || i === 4 ? shade(c, 0.2) : c)),
    part(new THREE.CylinderGeometry(0.165, 0.165, 0.02, 12), SAND, { y: 0.22 }),
    part(arc(0.17, 0.012, Math.PI, 4, 10), c2, { y: 0.26, rz: 0.2 }),
    part(new THREE.ConeGeometry(0.05, 0.05, 5), c2, { y: 0.14, z: 0.155, rx: Math.PI / 2, sz: 0.3 }),
  ];
  // spade leaning on the bucket
  const s = new THREE.Shape();
  s.moveTo(-0.08, 0); s.lineTo(0.08, 0); s.lineTo(0.08, 0.14); s.quadraticCurveTo(0, 0.24, -0.08, 0.14); s.lineTo(-0.08, 0);
  L.push(part(slab(s, 0.02, 0.006, 4), c2, { x: 0.3, y: 0.02, z: 0.1, rx: -Math.PI / 2 + 0.35, rz: Math.PI, ry: 0.3 }));
  L.push(part(rod([0.3, 0.07, 0.02], [0.24, 0.42, -0.1], 0.016, 5), c2));
  L.push(part(new THREE.CapsuleGeometry(0.02, 0.1, 2, 5), c2, { x: 0.24, y: 0.44, z: -0.1, rz: Math.PI / 2 }));
  // a turret turned out of the bucket
  L.push(paintFaces(part(new THREE.CylinderGeometry(0.13, 0.17, 0.26, 10, 2), '#fff', { x: -0.42, y: 0.13, z: 0.08 }),
    (x, y, z, nx, ny, nz, cc) => { cc.set(SAND); cc.multiplyScalar(0.93 + noise3(Math.round(x * 30), Math.round(y * 30), seed) * 0.12); }));
  const g = new THREE.Group();
  g.add(mesh(L, materials.glossy, 'bucket'));
  return finish(g, { name: 'bucketSpade', parts: {}, surface: 'soft' });
}

// ---------------------------------------------------------------- surfboard

/**
 * surfboard({ seed, color, stand = true, bob = 0 }) — surfboard stuck upright in the sand, or lying flat
 * (`stand: false`); with `bob` > 0 a flat board floats (waterline y 0) - the dog's paddleboard.
 * parts: { board, deck (Object3D on top of a flat board: stand a dog / character there) }. 1-2 draw calls.
 */
export function surfboard({ seed = 1, color, stand = true, bob = 0 } = {}) {
  const rng = new Rng(`surf-${seed}`);
  const c = color || rng.pick([P.sunflower, P.teal, P.bubblegum, P.tangerine, P.cobalt]);
  const c2 = rng.pick([CREAM, P.tomato, P.cobalt].filter((x) => x !== c));
  const s = new THREE.Shape();
  const Lb = 2.1, W = 0.3;
  s.moveTo(0, -Lb / 2);
  s.quadraticCurveTo(W, -Lb / 2, W, -Lb / 2 + 0.35);
  s.lineTo(W * 0.95, Lb / 2 - 0.55);
  s.quadraticCurveTo(W * 0.7, Lb / 2 - 0.05, 0, Lb / 2);
  s.quadraticCurveTo(-W * 0.7, Lb / 2 - 0.05, -W * 0.95, Lb / 2 - 0.55);
  s.lineTo(-W, -Lb / 2 + 0.35);
  s.quadraticCurveTo(-W, -Lb / 2, 0, -Lb / 2);
  const board = part(slab(s, 0.05, 0.025, 6), '#fff');
  paintFaces(board, (x, y, z, nx, ny, nz, cc) => cc.set(Math.abs(x) < 0.05 ? c2 : Math.abs(y - 0.3) < 0.08 && Math.abs(x) < 0.26 ? c2 : c));
  const L = [board, part(new THREE.ConeGeometry(0.1, 0.18, 3), c2, { y: -Lb / 2 + 0.2, z: -0.1, rx: -Math.PI / 2, sx: 0.2 })];
  const geo = merge(L);
  const g = new THREE.Group();
  const m = mesh(geo, materials.glossy, 'board');
  if (stand) {
    m.position.y = Lb / 2 - 0.28;
    m.rotation.set(0.12, rng.range(-0.3, 0.3), rng.range(-0.1, 0.1));
    g.add(mesh([part(new THREE.ConeGeometry(0.3, 0.12, 8), WET, { y: 0.03 })], materials.toy, 'sandMound'));
  } else {
    m.rotation.x = -Math.PI / 2;
    m.position.y = bob ? 0.02 : 0.05;
  }
  g.add(m);
  const deck = pivot('deck', 0, stand ? Lb - 0.28 : m.position.y + 0.05, 0);
  g.add(deck);
  finish(g, { name: 'surfboard', parts: { board: m, deck }, surface: 'soft', bodyForWobble: m });
  if (!stand && bob) g.userData.parts.float = floatRig(g, { bob, seed, heave: 0.04, roll: 0.05, pitch: 0.03 });
  return g;
}

// ---------------------------------------------------------------- crab (decor)

/** crab({ seed, color }) — chunky decor crab with raised claws and stalk eyes (~0.45 m). 1 draw call. */
export function crab({ seed = 1, color } = {}) {
  const rng = new Rng(`crab-${seed}`);
  const c = color || rng.pick([P.tomato, '#ff6f3c', P.tangerine]);
  const L = [part(ball(0.2, 1), c, { y: 0.13, sx: 1.2, sy: 0.55, sz: 0.9 })];
  for (const s of [-1, 1]) {
    L.push(part(rod([s * 0.06, 0.2, 0.12], [s * 0.08, 0.3, 0.15], 0.018, 4), c));
    L.push(part(ball(0.045, 1), CREAM, { x: s * 0.08, y: 0.32, z: 0.16 }));
    L.push(part(ball(0.022, 0), INK, { x: s * 0.085, y: 0.33, z: 0.2 }));
    L.push(part(rod([s * 0.18, 0.14, 0.1], [s * 0.3, 0.3, 0.22], 0.03, 5), c));
    L.push(part(ball(0.09, 0), shade(c, 0.1), { x: s * 0.33, y: 0.36, z: 0.25, sx: 0.8, sy: 1.2, sz: 0.8 }));
    L.push(part(new THREE.ConeGeometry(0.04, 0.14, 4), shade(c, 0.1), { x: s * 0.36, y: 0.46, z: 0.28, rz: s * -0.5 }));
    L.push(part(new THREE.ConeGeometry(0.035, 0.12, 4), shade(c, 0.1), { x: s * 0.29, y: 0.45, z: 0.29, rz: s * 0.4 }));
    for (let i = 0; i < 3; i++) {
      const z = 0.05 - i * 0.08;
      const knee = [s * 0.34, 0.14, z - 0.02];
      L.push(part(rod([s * 0.18, 0.11, z], knee, 0.02, 4), c));
      L.push(part(rod(knee, [s * 0.4, 0, z - 0.05], 0.018, 4), c));
    }
  }
  L.push(part(new THREE.TorusGeometry(0.035, 0.012, 3, 8, Math.PI), INK, { y: 0.16, z: 0.19, rz: Math.PI }));
  const g = new THREE.Group();
  const m = mesh(L, materials.glossy, 'crab');
  m.rotation.y = rng.range(-0.3, 0.3);
  g.add(m);
  return finish(g, { name: 'crab', parts: {}, surface: 'soft' });
}

// ---------------------------------------------------------------- beach towel

/**
 * beachTowel({ seed, colors: [c1, c2], w = 0.9, l = 1.8 }) — striped towel lying rumpled on the sand
 * (long side along Z). userData.lie = height for a sunbather lying on it. 1 draw call.
 */
export function beachTowel({ seed = 1, colors, w = 0.9, l = 1.8 } = {}) {
  const rng = new Rng(`towel-${seed}`);
  const [c1, c2] = colors || rng.pick(STRIPES);
  const bands = rng.int(5, 8);
  const geo = clothPatch(4, 9, (u, v) => {
    const x = (u - 0.5) * w, z = (v - 0.5) * l;
    const y = 0.012 + noise3(Math.round(u * 4) + seed, Math.round(v * 9), 3) * 0.035 + (v > 0.92 ? 0.03 : 0); // rolled end = pillow
    return [x, y, z];
  }, (i, j) => (Math.floor((j / 9) * bands) % 2 ? c2 : c1), 0.01);
  const g = new THREE.Group();
  g.add(mesh([geo, part(new THREE.CapsuleGeometry(0.07, w - 0.2, 2, 6), c1, { y: 0.07, z: l / 2 - 0.08, rz: Math.PI / 2 })], materials.toy, 'towel'));
  finish(g, { name: 'beachTowel', parts: {}, surface: 'soft' });
  g.userData.lie = 0.03;
  return g;
}

// ---------------------------------------------------------------- beach parasol

/**
 * beachParasol({ seed, colors: [c1, c2], tilt = 0.2 }) — striped beach umbrella planted in the sand,
 * leaning by `tilt` (rad, toward +Z). parts: { canopy (pivot at the pole top: spins about the pole) }.
 * userData: spin(impulse = 10) (fun hit: the canopy whirls and slows down). 2 draw calls.
 */
export function beachParasol({ seed = 1, colors, tilt = 0.2 } = {}) {
  const rng = new Rng(`parasol-${seed}`);
  const [c1, c2] = colors || rng.pick(STRIPES);
  const H = 2.15, R = 1.15;
  const lean = new THREE.Group();
  lean.name = 'lean';
  lean.rotation.set(tilt, rng.range(-0.3, 0.3), rng.range(-0.05, 0.05));
  lean.updateMatrix();
  const upright = lean.matrix.clone().invert(); // the sand mound stays level while the pole leans
  lean.add(mesh([
    part(rod([0, -0.25, 0], [0, H, 0], 0.028, 6), '#fff4e6'),
    part(bev(0.07, 0.12, 0.07, 0.02), shade(c1, -0.2), { y: 1.2 }),
    part(new THREE.ConeGeometry(0.22, 0.1, 7), WET, { y: 0.03 }).applyMatrix4(upright),
  ], materials.toy, 'pole'));
  const canopy = pivot('canopy', 0, H, 0);
  const cone = part(new THREE.ConeGeometry(R, 0.42, 8, 1, true), '#fff', { y: -0.2 });
  const panel = (x, z) => { let a = Math.atan2(x, z); if (a < 0) a += Math.PI * 2; return Math.floor(a / (Math.PI / 4)) % 2; };
  paintFaces(cone, (x, y, z, nx, ny, nz, c) => c.set(panel(x, z) ? c2 : c1));
  const under = paintFaces(inside(cone.clone()), (x, y, z, nx, ny, nz, c) => c.multiplyScalar(0.72));
  const rim = paintFaces(part(new THREE.CylinderGeometry(R, R, 0.1, 16, 1, true), '#fff', { y: -0.46 }), (x, y, z, nx, ny, nz, c) => c.set(panel(x, z) ? c1 : c2));
  canopy.add(mesh([cone, under, rim, inside(rim.clone()), part(ball(0.06, 0), shade(c1, -0.1), { y: 0.04 })], materials.toy, 'canopyMesh'));
  canopy.add(ballCollider(0.9, { y: -0.25, sy: 0.45 }));
  lean.add(canopy);
  const g = new THREE.Group();
  g.add(lean);
  let vel = 0;
  finish(g, {
    name: 'beachParasol', parts: { canopy }, surface: 'soft',
    tick: (dt) => { if (!vel) return; canopy.rotation.y += vel * dt; vel *= Math.exp(-dt * 1.2); if (Math.abs(vel) < 0.05) vel = 0; },
  });
  g.userData.spin = (impulse = 10) => { vel += impulse; };
  return g;
}
