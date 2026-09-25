// Leisure props: bicycle, picnic table, café parasol table. Origin = ground centre, front = +Z.
import * as THREE from 'three';
import { part, merge, xform } from '../../geo.js';
import { materials } from '../../../gfx/materials.js';
import { P } from '../../../gfx/palette.js';
import { Rng } from '../../../core/rng.js';
import { bev, lathe, puck, ball, rod, arc, latheBands, mesh, pivot, finish, paintFaces, inside, Anims, ease, shade, boxCollider } from './lib.js';
import { rigWheels } from './vehicles.js';

const CHROME = '#e4e8ee';
const DARK = '#3b3f4f';
const lerp = THREE.MathUtils.lerp;

// ---------------------------------------------------------------- bicycle

let _bikeWheel = null;
function bikeWheelGeo(hubColor) {
  const key = hubColor;
  _bikeWheel = _bikeWheel || new Map();
  if (_bikeWheel.has(key)) return _bikeWheel.get(key);
  const g = merge([
    part(new THREE.TorusGeometry(0.315, 0.052, 5, 14), '#3a3e4c'),
    part(new THREE.CylinderGeometry(0.29, 0.29, 0.035, 14), '#eef2f7', { rx: Math.PI / 2 }),
    part(new THREE.CylinderGeometry(0.075, 0.075, 0.09, 8), hubColor, { rx: Math.PI / 2 }),
  ]).rotateY(Math.PI / 2);
  _bikeWheel.set(key, g);
  return g;
}

/**
 * bicycle({ seed, color, basket = true }) — chunky toy bike on its kickstand.
 * parts: { frame, wheels: [rear, front] }. userData.speed spins the wheels.
 */
export function bicycle({ seed = 1, color, basket = true } = {}) {
  const rng = new Rng(`bike-${seed}`);
  const c = color || rng.pick([P.bubblegum, P.teal, P.tomato, P.cobalt, P.sunflower]);
  const R = 0.365;
  const zr = -0.55, zf = 0.56;
  const bb = [0, 0.36, -0.02];
  const L = [
    part(rod(bb, [0, 0.9, -0.2], 0.042, 6), c),
    part(rod([0, 0.84, -0.18], [0, 0.88, 0.38], 0.04, 6), c),
    part(rod(bb, [0, 0.74, 0.42], 0.046, 6), c),
    part(rod(bb, [0, R, zr], 0.03, 6), c),
    part(rod([0, 0.84, -0.18], [0, R, zr], 0.03, 6), c),
    part(rod([0, 0.96, 0.38], [0, R, zf], 0.034, 6), c),
    part(rod([0, 0.94, 0.38], [0, 1.1, 0.33], 0.03, 6), CHROME),
    part(rod([-0.29, 1.1, 0.31], [0.29, 1.1, 0.31], 0.028, 6), CHROME),
    part(new THREE.CapsuleGeometry(0.038, 0.1, 2, 6), DARK, { x: 0.32, y: 1.1, z: 0.31, rz: Math.PI / 2 }),
    part(new THREE.CapsuleGeometry(0.038, 0.1, 2, 6), DARK, { x: -0.32, y: 1.1, z: 0.31, rz: Math.PI / 2 }),
    part(rod([0, 0.88, -0.2], [0, 0.98, -0.23], 0.022, 5), CHROME),
    part(bev(0.17, 0.075, 0.28, 0.035), '#6b3a22', { y: 1.0, z: -0.24 }),
    part(puck(0.1, 0.03, 0.01, 10), CHROME, { x: 0.06, y: 0.36, z: -0.02, rz: Math.PI / 2 }),
    part(bev(0.1, 0.03, 0.06, 0.01), DARK, { x: 0.14, y: 0.28, z: 0.06 }),
    part(bev(0.1, 0.03, 0.06, 0.01), DARK, { x: -0.14, y: 0.44, z: -0.1 }),
    part(rod([0.03, 0.36, -0.06], [0.2, 0.01, -0.28], 0.018, 4), DARK),
    part(ball(0.04, 1), P.gold, { x: 0.2, y: 1.14, z: 0.31 }),
    part(arc(0.36, 0.03, Math.PI * 0.55, 4, 7), c, { y: R, z: zr, ry: -Math.PI / 2, rz: Math.PI * 0.28 }),
  ];
  if (basket) {
    L.push(part(bev(0.38, 0.24, 0.3, 0.04), P.woodLight, { y: 0.98, z: 0.6 }));
    L.push(part(bev(0.4, 0.04, 0.32, 0.015), shade(P.woodLight, -0.2), { y: 1.1, z: 0.6 }));
    const extra = rng.pick(['bread', 'flowers']);
    if (extra === 'bread') {
      L.push(part(new THREE.CapsuleGeometry(0.05, 0.4, 3, 8), '#e2a458', { x: 0.05, y: 1.2, z: 0.58, rx: 0.9, rz: 0.2 }));
    } else {
      for (let i = 0; i < 4; i++) L.push(part(ball(0.07, 0), [P.tomato, P.sunflower, P.bubblegum, '#fff4e6'][i], { x: (i % 2 - 0.5) * 0.14, y: 1.17 + (i > 1 ? 0.05 : 0), z: 0.57 + (i > 1 ? 0.07 : -0.05) }));
    }
  }
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'body';
  const frame = mesh(L, materials.glossy, 'frame');
  body.add(frame);
  g.add(body);
  const wheel = bikeWheelGeo(c);
  const anims = new Anims();
  finish(g, { name: 'bicycle', parts: {}, surface: 'metal', anims, bodyForWobble: body });
  const w = rigWheels(g, body, [{ x: 0, y: R, z: zr, r: R, geo: wheel }, { x: 0, y: R, z: zf, r: R, geo: wheel }]);
  g.userData.addTick(w.tick);
  g.userData.parts = { frame, body, wheels: w.pivots };
  return g;
}

// ---------------------------------------------------------------- picnic table

/** picnicTable({ seed, cloth = true, picnic = true }) — A-frame table with gingham cloth + lunch. 1 draw call. */
export function picnicTable({ seed = 1, cloth = true, picnic = true } = {}) {
  const rng = new Rng(`picnic-${seed}`);
  const wood = rng.pick([P.wood, P.woodLight, '#c98a4e']);
  const L = [];
  for (let i = 0; i < 3; i++) L.push(part(bev(1.9, 0.07, 0.25, 0.03), shade(wood, (i - 1) * 0.06), { y: 0.76, z: (i - 1) * 0.26 }));
  for (const s of [-1, 1]) {
    L.push(part(bev(1.9, 0.065, 0.3, 0.03), shade(wood, 0.04), { y: 0.46, z: s * 0.66 }));
    for (const x of [-0.72, 0.72]) {
      L.push(part(bev(0.09, 0.95, 0.12, 0.035), shade(wood, -0.18), { x, y: 0.4, z: s * 0.27, rx: s * 0.62 }));
    }
  }
  for (const x of [-0.72, 0.72]) {
    L.push(part(bev(0.09, 0.09, 1.62, 0.035), shade(wood, -0.18), { x, y: 0.4 }));
    L.push(part(bev(0.09, 0.09, 0.7, 0.035), shade(wood, -0.18), { x, y: 0.7 }));
  }
  if (cloth) {
    const cl = paintFaces(part(new THREE.PlaneGeometry(1.2, 0.86, 8, 6).rotateX(-Math.PI / 2), '#fff'),
      (x, y, z, nx, ny, nz, c) => c.set((Math.floor((x + 0.6) / 0.15) + Math.floor((z + 0.43) / 0.1433)) % 2 ? P.tomato : '#fff4ea'));
    L.push(cl.applyMatrix4(xform({ y: 0.815, ry: rng.range(-0.12, 0.12) })));
  }
  if (picnic) {
    L.push(part(bev(0.42, 0.24, 0.28, 0.05), P.woodLight, { x: -0.45, y: 0.94, z: 0.05, ry: 0.3 }));
    L.push(part(arc(0.17, 0.022, Math.PI, 4, 8), shade(P.woodLight, -0.25), { x: -0.45, y: 1.06, z: 0.05, ry: 0.3 }));
    L.push(latheBands([[0, 0], [0.08, 0], [0.09, 0.14], [0.06, 0.2], [0.065, 0.24], [0, 0.24]], 10, (y) => (y < 0.16 ? '#ffe066' : '#bfe8ff'), { x: 0.35, y: 0.81, z: -0.12 }));
    for (const [x, z] of [[0.15, 0.2], [0.62, 0.12]]) {
      L.push(part(puck(0.13, 0.025, 0.01, 12), '#fff8ee', { x, y: 0.82, z }));
      const ry = rng.range(0, 3);
      L.push(part(new THREE.CylinderGeometry(0.09, 0.09, 0.07, 3), '#f5d08a', { x, y: 0.87, z, ry }));
      L.push(part(new THREE.CylinderGeometry(0.105, 0.105, 0.025, 3), '#7cc653', { x, y: 0.87, z, ry }));
    }
  }
  const g = new THREE.Group();
  const m = mesh(L, materials.toy, 'table');
  g.add(m);
  return finish(g, { name: 'picnicTable', parts: { table: m }, surface: 'wood' });
}

// ---------------------------------------------------------------- parasol table

/**
 * parasolTable({ seed, colors: [c1, c2], chairs = 2, open = true })
 * parts: { parasol (pivot at the pole top; folds via scale), table }. userData: setOpen(bool).
 */
export function parasolTable({ seed = 1, colors, chairs = 2, open = true } = {}) {
  const rng = new Rng(`parasol-${seed}`);
  const [c1, c2] = colors || rng.pick([[P.tomato, '#fff4ea'], [P.teal, '#fff4ea'], [P.sunflower, P.tomato], [P.bubblegum, '#fff4ea'], [P.cobalt, P.sunflower]]);
  const metal = '#34466e';
  const L = [
    part(puck(0.46, 0.05, 0.02, 16), '#fff8ee', { y: 0.76 }),
    part(rod([0, 0.05, 0], [0, 0.74, 0], 0.04, 8), metal),
    part(puck(0.28, 0.05, 0.02, 12), metal, { y: 0.025 }),
    part(rod([0, 0.78, 0], [0, 2.3, 0], 0.035, 8), '#fff8ee'),
    latheBands([[0, 0], [0.05, 0], [0.05, 0.14], [0.03, 0.2], [0, 0.2]], 8, () => '#bfe8ff', { x: 0.18, y: 0.785, z: 0.1 }),
  ];
  for (let i = 0; i < chairs; i++) {
    const a = (i / chairs) * Math.PI * 2 + 0.4;
    const cx = Math.sin(a) * 0.82, cz = Math.cos(a) * 0.82;
    const chair = [
      part(puck(0.22, 0.05, 0.02, 12), c1, { y: 0.47 }),
      part(arc(0.2, 0.025, Math.PI, 4, 8), metal, { y: 0.72, z: 0.2 }),
      part(rod([-0.18, 0.47, 0.18], [-0.19, 0.72, 0.2], 0.022, 4), metal),
      part(rod([0.18, 0.47, 0.18], [0.19, 0.72, 0.2], 0.022, 4), metal),
    ];
    for (const [lx, lz] of [[0.15, 0.15], [-0.15, 0.15], [0.15, -0.15], [-0.15, -0.15]]) chair.push(part(rod([lx, 0.45, lz], [lx * 1.25, 0, lz * 1.25], 0.022, 4), metal));
    const cg = merge(chair).applyMatrix4(xform({ x: cx, z: cz, ry: a }));
    L.push(cg);
  }
  const g = new THREE.Group();
  const table = mesh(L, materials.toy, 'table');
  g.add(table);
  const top = pivot('parasol', 0, 2.34, 0);
  const canopy = paintFaces(part(new THREE.ConeGeometry(1.3, 0.5, 8, 1, true), '#fff', { y: -0.25 }),
    (x, y, z, nx, ny, nz, c) => {
      let a = Math.atan2(x, z);
      if (a < 0) a += Math.PI * 2;
      c.set(Math.floor(a / (Math.PI / 4)) % 2 ? c1 : c2);
    });
  const under = paintFaces(inside(part(new THREE.ConeGeometry(1.3, 0.5, 8, 1, true), '#fff', { y: -0.25 })),
    (x, y, z, nx, ny, nz, c) => {
      let a = Math.atan2(x, z);
      if (a < 0) a += Math.PI * 2;
      c.set(shade(Math.floor(a / (Math.PI / 4)) % 2 ? c1 : c2, -0.25));
    });
  const flaps = [];
  for (let i = 0; i < 8; i++) {
    const a = (i + 0.5) * (Math.PI / 4);
    flaps.push(part(new THREE.ConeGeometry(0.16, 0.16, 4), i % 2 ? c1 : c2, { x: Math.sin(a) * 1.18, y: -0.56, z: Math.cos(a) * 1.18, rx: Math.PI, ry: a }));
  }
  const pm = mesh([canopy, under, ...flaps, part(ball(0.07, 1), P.gold, { y: 0.06 })], materials.toy, 'canopy');
  top.add(pm);
  g.add(top);
  const anims = new Anims();
  finish(g, { name: 'parasolTable', parts: { parasol: top, table }, surface: 'wood', anims });
  g.userData.setOpen = (on) => {
    const from = pm.scale.x;
    const to = on ? 1 : 0.16;
    return anims.play(0.6, (k) => {
      const s = lerp(from, to, k);
      pm.scale.set(s, 1 + (1 - s) * 1.6, s);
      pm.position.y = -(1 - s) * 0.5;
    }, { ease: on ? ease.outBack : ease.inOutCubic, key: 'parasol' });
  };
  if (!open) { pm.scale.set(0.16, 1 + 0.84 * 1.6, 0.16); pm.position.y = -0.42; }
  return g;
}

// ---------------------------------------------------------------- easel

const PAINTINGS = {
  landscape: (L, P2) => {
    L.push(part(new THREE.BoxGeometry(0.64, 0.3, 0.012), '#8fd3f4', { y: 0.12 }));
    L.push(part(new THREE.IcosahedronGeometry(0.3, 1), '#7cc653', { y: -0.1, sy: 0.4, sz: 0.04 }));
    L.push(part(new THREE.IcosahedronGeometry(0.2, 1), '#5fae44', { x: 0.18, y: -0.14, sy: 0.4, sz: 0.045 }));
    L.push(part(new THREE.IcosahedronGeometry(0.065, 0), P2.sunflower, { x: 0.2, y: 0.18, sz: 0.3 }));
    L.push(part(new THREE.BoxGeometry(0.1, 0.08, 0.016), '#fff4e0', { x: -0.14, y: -0.05 }));
    L.push(part(new THREE.ConeGeometry(0.08, 0.06, 4), P2.tomato, { x: -0.14, y: 0.02, ry: Math.PI / 4, sz: 0.3 }));
  },
  portrait: (L, P2) => {
    L.push(part(new THREE.BoxGeometry(0.64, 0.54, 0.012), P2.sunflower));
    L.push(part(new THREE.IcosahedronGeometry(0.15, 1), '#ffd9bd', { y: 0.02, sz: 0.2 }));
    L.push(part(new THREE.IcosahedronGeometry(0.17, 1), '#5a3a22', { y: 0.1, sy: 0.6, sz: 0.18 }));
    L.push(part(new THREE.IcosahedronGeometry(0.022, 0), INK2, { x: -0.05, y: 0.03, z: 0.03 }));
    L.push(part(new THREE.IcosahedronGeometry(0.022, 0), INK2, { x: 0.05, y: 0.03, z: 0.03 }));
    L.push(part(new THREE.TorusGeometry(0.05, 0.012, 3, 8, Math.PI), P2.tomato, { y: -0.04, z: 0.03, rz: Math.PI }));
  },
  abstract: (L, P2) => {
    const cols = [P2.tomato, P2.cobalt, P2.sunflower, P2.teal, P2.bubblegum];
    cols.forEach((c, i) => L.push(part(new THREE.IcosahedronGeometry(0.09 + (i % 2) * 0.05, 0), c, { x: -0.22 + i * 0.11, y: (i % 3 - 1) * 0.12, sz: 0.1, rz: i })));
  },
};
const INK2 = '#2b2b3a';

function splatShape() {
  const s = new THREE.Shape();
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = i % 2 ? 0.07 : 0.13 + (i % 4 === 0 ? 0.04 : 0);
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return s;
}

/**
 * easel({ seed, painting: 'landscape'|'portrait'|'abstract' }) — artist's easel with a painting and palette.
 * parts: { canvas (pivot at the canvas centre + collider) }. userData: splat(color) -> Promise (paint splat
 * pops onto the canvas: fun hit), clean(). 1-2 draw calls.
 */
export function easel({ seed = 1, painting } = {}) {
  const rng = new Rng(`easel-${seed}`);
  const kind = painting || rng.pick(Object.keys(PAINTINGS));
  const wood = P.woodLight;
  const L = [
    part(rod([-0.36, 0, 0.14], [-0.05, 1.74, 0], 0.03, 6), wood),
    part(rod([0.36, 0, 0.14], [0.05, 1.74, 0], 0.03, 6), wood),
    part(rod([0, 1.62, -0.02], [0, 0, -0.58], 0.028, 6), shade(wood, -0.1)),
    part(rod([-0.29, 0.55, 0.1], [0.29, 0.55, 0.1], 0.022, 5), wood),
    part(bev(0.84, 0.05, 0.13, 0.02), shade(wood, -0.08), { y: 0.82, z: 0.15 }),
    part(bev(0.16, 0.06, 0.09, 0.02), shade(wood, -0.08), { y: 1.46, z: 0.07 }),
  ];
  // canvas + painting (tilted back with the legs)
  const C = [part(bev(0.74, 0.6, 0.04, 0.012), '#fff8ee')];
  const pic = [];
  (PAINTINGS[kind] || PAINTINGS.landscape)(pic, P);
  for (const g2 of pic) g2.translate(0, 0, 0.026);
  const canvasG = merge([...C, ...pic]).applyMatrix4(xform({ y: 1.14, z: 0.1, rx: -0.1 }));
  L.push(canvasG);
  // palette hanging on the ledge
  L.push(part(new THREE.CylinderGeometry(0.13, 0.13, 0.02, 10), '#e8c898', { x: 0.3, y: 0.72, z: 0.24, rx: Math.PI / 2 - 0.2 }));
  [P.tomato, P.cobalt, P.sunflower, P.teal].forEach((c, i) => L.push(part(new THREE.IcosahedronGeometry(0.025, 0), c, { x: 0.3 + Math.cos(i * 1.4) * 0.07, y: 0.72 + Math.sin(i * 1.4) * 0.07, z: 0.26, sz: 0.5 })));
  const g = new THREE.Group();
  g.add(mesh(L, materials.toy, 'easel'));
  const canvas = pivot('canvas', 0, 1.14, 0.1);
  canvas.rotation.x = -0.1;
  canvas.add(boxCollider(0.9, 0.8, 0.25, {}));
  g.add(canvas);
  const splatGeo = new THREE.ShapeGeometry(splatShape());
  const splat = new THREE.Mesh(splatGeo, materials.solid(P.tomato, { roughness: 0.3 }));
  splat.name = 'splat';
  splat.visible = false;
  splat.position.set(0, 0, 0.034);
  canvas.add(splat);
  const anims = new Anims();
  finish(g, { name: 'easel', parts: { canvas }, surface: 'wood', anims });
  g.userData.splat = (color = rng.pick([P.tomato, P.cobalt, P.bubblegum, P.teal])) => {
    splat.material = materials.solid(color, { roughness: 0.3 });
    splat.visible = true;
    splat.position.x = rng.range(-0.15, 0.15);
    splat.position.y = rng.range(-0.12, 0.12);
    splat.rotation.z = rng.range(0, Math.PI * 2);
    return anims.play(0.35, (k) => splat.scale.setScalar(Math.max(0.001, ease.outBack(k) * 1.3)), { key: 'splat' });
  };
  g.userData.clean = () => { splat.visible = false; };
  return g;
}
