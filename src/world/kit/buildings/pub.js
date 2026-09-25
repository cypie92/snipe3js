// "The Wonky Pint" village pub: tudor upper floor, green-painted frontage with a gold fascia,
// bay windows, barrels, and a hinged hanging sign for the "fix the pub sign" job.
//   parts.signPivot  Object3D at the outer chain's hinge (rotate .z to swing / tilt the board)
//   parts.sign       the board (+chains) under the pivot
//   parts.bolt       small loose bolt on the arm (has an enlarged invisible collider child)
// opts.crooked = true hangs the board by one chain, tilted ~35 deg. userData.setCrooked(bool).
import { THREE, materials, Kit, cbox, polySolid, cylBetween, lathe, rngOf, shade, DEG, TAU, addCollider } from './common.js';
import { box, cyl, ico, torus } from '../../geo.js';
import { P } from '../../../gfx/palette.js';
import { buildHouse } from './house.js';
import { addWindow, addDoor, addHangingBasket } from './facade.js';
import { paintedTexture, decalMaterial, fitFont, toyText, roundRect } from './signs.js';

const PUB_GREEN = '#2f7d62';

// ------------------------------------------------------------ painted pub atlas
const atlasCache = new Map();
/** One canvas: fascia strip (top 1/8) + hanging-sign art (bottom). */
export function pubAtlas(name = 'The Wonky Pint', { ground = PUB_GREEN, gold = P.gold } = {}) {
  const key = `${name}|${ground}`;
  if (atlasCache.has(key)) return atlasCache.get(key);
  const W = 1024, H = 1024, FH = 128;
  const tex = paintedTexture(W, H, (ctx) => {
    // fascia
    ctx.fillStyle = shade2(ground, -0.08);
    ctx.fillRect(0, 0, W, FH);
    ctx.strokeStyle = gold;
    ctx.lineWidth = 6;
    roundRect(ctx, 10, 10, W - 20, FH - 20, 18);
    ctx.stroke();
    const up = name.toUpperCase();
    const fs = fitFont(ctx, up, W - 120, FH * 0.66);
    toyText(ctx, up, W / 2, FH * 0.54, { fill: gold, outline: '#1d3d31', size: fs, stroke: 0.12 });
    for (const x of [34, W - 34]) { ctx.fillStyle = gold; ctx.beginPath(); ctx.arc(x, FH / 2, 9, 0, TAU); ctx.fill(); }
    // hanging sign (y from FH+16 to H)
    const y0 = FH + 16, sh = H - y0;
    ctx.save();
    ctx.translate(0, y0);
    ctx.fillStyle = '#2b5d49';
    roundRect(ctx, 0, 0, W, sh, 60);
    ctx.fill();
    ctx.fillStyle = '#fff1d6';
    roundRect(ctx, 34, 34, W - 68, sh - 68, 40);
    ctx.fill();
    ctx.strokeStyle = gold;
    ctx.lineWidth = 10;
    roundRect(ctx, 56, 56, W - 112, sh - 112, 30);
    ctx.stroke();
    // sunburst behind the glass
    ctx.save();
    ctx.translate(W / 2, sh * 0.54);
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(255,201,60,0.28)' : 'rgba(255,201,60,0.12)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 330, (i / 16) * TAU, ((i + 1) / 16) * TAU);
      ctx.fill();
    }
    // the wonky pint
    ctx.rotate(-0.28);
    const gw = 190, gh = 300;
    ctx.fillStyle = '#f7a928';
    ctx.strokeStyle = P.ink;
    ctx.lineWidth = 14;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-gw * 0.42, gh * 0.48);
    ctx.lineTo(gw * 0.42, gh * 0.48);
    ctx.lineTo(gw * 0.52, -gh * 0.42);
    ctx.lineTo(-gw * 0.52, -gh * 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(-gw * 0.3, -gh * 0.3, 22, gh * 0.62);
    // foam
    ctx.fillStyle = '#fff8ee';
    ctx.beginPath();
    for (const [fx, fy, r] of [[-70, -150, 52], [-15, -172, 60], [50, -158, 56], [90, -128, 40], [-100, -118, 36]]) {
      ctx.moveTo(fx + r, fy);
      ctx.arc(fx, fy, r, 0, TAU);
    }
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(95, -120);
    ctx.quadraticCurveTo(118, -60, 104, -30);
    ctx.lineWidth = 26;
    ctx.strokeStyle = '#fff8ee';
    ctx.stroke();
    ctx.restore();
    // lettering
    const s1 = fitFont(ctx, 'THE WONKY', W - 200, 120);
    toyText(ctx, 'THE WONKY', W / 2, 128, { fill: '#2b5d49', outline: '#fff8ee', size: s1, stroke: 0.1, shadow: 'rgba(43,43,58,0.25)' });
    const s2 = fitFont(ctx, 'PINT', W - 300, 130);
    toyText(ctx, 'PINT', W / 2, sh - 118, { fill: P.tomato, outline: '#fff8ee', size: s2, stroke: 0.1, shadow: 'rgba(43,43,58,0.25)' });
    ctx.restore();
  });
  const mat = decalMaterial(tex, ground, 'pubAtlas');
  const res = { mat, fascia: [0, 1 - FH / H, 1, 1], board: [0, 0, 1, 1 - (FH + 16) / H] };
  atlasCache.set(key, res);
  return res;
}

function shade2(hex, dl) { return shade(hex, dl); }

function planeUV(w, h, [u0, v0, u1, v1]) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  return g;
}

// ------------------------------------------------------------ small outdoor props
/** Striped parasol canopy (flat-shaded wedges in alternating colours). Apex at y=h above origin. */
export function addParasol(kit, { r = 1.3, h = 0.55, n = 8, colors = [P.tomato, '#fff8ee'], pole = 2.35 } = {}) {
  kit.add(cyl(0.04, 0.04, pole + 0.1, 6), '#fff8ee', { y: (pole + 0.1) / 2 });
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
    const apex = [0, pole + h, 0];
    const p0 = [Math.cos(a0) * r, pole, Math.sin(a0) * r];
    const p1 = [Math.cos(a1) * r, pole, Math.sin(a1) * r];
    const t = 0.05;
    const q0 = [p0[0], p0[1] - t, p0[2]], q1 = [p1[0], p1[1] - t, p1[2]], ap2 = [0, pole + h - t, 0];
    const g = polySolid([[apex, p0, p1], [ap2, q1, q0], [p0, p1, q1, q0], [apex, p0, q0, ap2], [apex, ap2, q1, p1]], [0, pole + h * 0.3 - t, 0]);
    kit.add(g, colors[i % colors.length]);
    // little scallop flap
    const am = (a0 + a1) / 2;
    kit.add(cbox(r * 0.62, 0.2, 0.04, 0.02), colors[i % colors.length], { x: Math.cos(am) * r * 0.93, y: pole - 0.1, z: Math.sin(am) * r * 0.93, ry: -am + Math.PI / 2 });
  }
  kit.add(ico(0.08, 0), '#fff8ee', { y: pole + h + 0.05 });
}

/** Picnic table with two benches (+ optional parasol). Origin at ground centre, long axis X. */
export function addPicnicTable(kit, { rng, parasol = true, colors, wood = P.wood } = {}) {
  const dark = shade(wood, -0.1);
  kit.add(cbox(1.9, 0.09, 0.82, 0.03), wood, { y: 0.76 });
  for (const s of [-1, 1]) {
    kit.add(cbox(1.9, 0.08, 0.3, 0.03), wood, { y: 0.45, z: s * 0.66 });
    // A-frame legs
    for (const x of [-0.72, 0.72]) {
      kit.add(box(0.08, 0.95, 0.1), dark, { x, y: 0.4, z: s * 0.36, rx: s * 0.52 });
    }
  }
  for (const x of [-0.72, 0.72]) kit.add(box(0.07, 0.07, 1.5), dark, { x, y: 0.4 });
  if (parasol) addParasol(kit, { colors: colors ?? [rng ? rng.pick([P.tomato, P.cobalt, P.teal, '#2f7d62']) : P.tomato, '#fff8ee'] });
}

/** Wooden barrel (lathe) with iron hoops. */
export function addBarrel(kit, { t = {}, h = 0.9, r = 0.36, color = P.wood } = {}) {
  kit.at(t, () => {
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const y = (i / 6) * h;
      pts.push([r * (0.84 + 0.16 * Math.sin((i / 6) * Math.PI)), y]);
    }
    kit.add(lathe([[0, 0], ...pts, [0, h]], 10), [shade(color, -0.05), color]);
    for (const y of [0.18, h - 0.18]) kit.add(cyl(r * 0.965, r * 0.965, 0.06, 10), P.metalDark, { y });
  });
}

// ------------------------------------------------------------ the pub
/**
 * pub(opts): name, seed, crooked, width (~10), depth (~7), roof, tables (count, default 2),
 * signMount ('post' | 'wall'). Returns a Group with userData.parts / update / setCrooked.
 */
export function pub(opts = {}) {
  const rng = rngOf(opts.seed ?? 'pub', 'pub');
  const kit = new Kit('pub');
  const W = opts.width ?? 10.2;
  const D = opts.depth ?? 7;
  const ground = opts.color ?? PUB_GREEN;
  const res = buildHouse(kit, {
    seed: opts.seed ?? 'wonky-pint', width: W, depth: D, floors: 2, style: 'tudor', wall: ground,
    upperWall: opts.upperWall ?? P.wallCream, roof: opts.roof ?? P.roofSlate, roofStyle: 'gable', gableFront: false,
    groundFloor: false, windowStyle: 'leaded', trim: '#fff8ee', windowBoxes: true, chimneys: 2, cols: 4,
    wonk: opts.wonk ?? 1.4, lean: opts.lean ?? 0.028, sag: opts.sag ?? 0.32, pitch: 46, flowers: [P.tomato, P.sunflower],
  });
  const parts = res.parts;
  const fz = D / 2;
  const atlas = pubAtlas(opts.name ?? 'The Wonky Pint', { ground });
  const gold = P.gold;
  const cream = '#fff8ee';

  kit.at({ z: fz }, () => {
    // fascia board with the pub name
    kit.add(cbox(W - 0.5, 0.62, 0.2, 0.06), shade(ground, -0.12), { y: 2.52, z: 0.08 });
    kit.raw(planeUV(W - 0.75, 0.5, atlas.fascia), atlas.mat, { y: 2.52, z: 0.21 });
    // two bays with leaded glass either side of the door
    for (const s of [-1, 1]) {
      const x = s * (W / 4 + 0.25);
      const bw = 2.5, bd = 0.7;
      kit.at({ x }, () => {
        kit.add(cbox(bw + 0.25, 0.8, bd + 0.12, 0.07), shade(ground, -0.06), { y: 0.38, z: bd / 2 });
        kit.at({ y: 0.78, z: bd }, () => addWindow(kit, { w: bw - 0.4, h: 1.2, style: 'leaded', trim: cream, rng, frame: 0.12, curtains: '#ff9f6b' }));
        for (const k of [-1, 1]) kit.at({ x: k * (bw / 2 + 0.06), y: 0.78, z: bd / 2, ry: k * Math.PI / 2 }, () => addWindow(kit, { w: 0.36, h: 1.2, style: 'sash', trim: cream, rng, frame: 0.1 }));
        kit.add(cbox(bw + 0.3, 0.16, bd + 0.2, 0.05), cream, { y: 2.12, z: bd / 2 });
        kit.add(cbox(bw + 0.4, 0.2, bd + 0.34, 0.08), shade(opts.roof ?? P.roofSlate, -0.08), { y: 2.26, z: bd / 2 + 0.04, rx: -6 * DEG });
      });
      parts.windows.push(kit.anchor('window', { x, y: 1.4, z: 0.8 }));
      // lanterns flanking the door
      kit.at({ x: s * 1.05, y: 2.0, z: 0.06 }, () => {
        kit.add(box(0.06, 0.06, 0.3), P.ink, { z: 0.15 });
        kit.add(cbox(0.24, 0.34, 0.24, 0.04), P.ink, { y: -0.12, z: 0.36 });
        kit.add(box(0.18, 0.24, 0.26), '#ffe08a', { y: -0.12, z: 0.36 }, materials.glossy);
        kit.add(cyl(0.02, 0.17, 0.12, 4), P.ink, { y: 0.1, z: 0.36, ry: Math.PI / 4 });
      });
      kit.at({ x: s * (W / 2 - 0.55), y: 3.35, z: 0.25 }, () => addHangingBasket(kit, { rng, flowers: [P.tomato, P.bubblegum, P.sunflower, '#fff8ee'] }));
    }
    // big old door
    kit.at({ x: 0 }, () => {
      addDoor(kit, { w: 1.3, h: 2.1, color: P.woodDark, trim: cream, style: 'roundtop', hood: 'none', rng, stepColor: P.stoneDark });
    });
    parts.door = kit.anchor('door', { y: 0.2, z: 0.6 });
    // barrels + a chalk board
    addBarrel(kit, { t: { x: -2.2, z: 1.25 } });
    addBarrel(kit, { t: { x: -2.95, z: 1.3, ry: 0.5 }, h: 0.75, r: 0.3 });
    addBarrel(kit, { t: { x: -2.5, y: 0.9, z: 1.25 }, h: 0.62, r: 0.26, color: P.woodLight });
    kit.at({ x: 2.4, z: 1.35, ry: -0.25 }, () => {
      for (const s of [-1, 1]) kit.add(box(0.7, 1.0, 0.05), P.woodDark, { y: 0.48, z: s * 0.13, rx: s * 0.2 });
      kit.add(box(0.58, 0.78, 0.02), '#34443e', { y: 0.52, z: 0.17, rx: 0.2 });
      for (let i = 0; i < 3; i++) kit.add(box(0.38 - i * 0.08, 0.05, 0.02), [cream, P.sunflower, P.bubblegum][i], { y: 0.72 - i * 0.16, z: 0.19 - i * 0.03 * 0, rx: 0.2 });
    });
  });

  // beer garden: picnic tables with parasols
  const nTables = opts.tables ?? 2;
  parts.tables = [];
  for (let i = 0; i < nTables; i++) {
    const x = (i - (nTables - 1) / 2) * 4.4 + rng.range(-0.3, 0.3);
    const z = fz + 3.2 + rng.range(-0.3, 0.3);
    kit.at({ x, z, ry: rng.range(-0.15, 0.15) }, () => addPicnicTable(kit, { rng, colors: [i % 2 ? '#2f7d62' : P.tomato, cream] }));
    parts.tables.push(kit.anchor('table', { x, y: 0.8, z }));
  }

  // ---- hanging sign (post mount by default so the board faces the perch)
  const mount = opts.signMount ?? 'post';
  const armY = mount === 'post' ? 4.6 : 4.8;
  const armLen = 2.2;
  const side = opts.signSide ?? -1; // which end of the frontage
  const postX = side * (W / 2 + 0.75);
  const postZ = fz + 1.3;
  const boardW = 1.8, boardH = 1.32;
  const chainLen = 0.42;
  const a = new THREE.Vector3(), b = new THREE.Vector3(); // inner (bolt) + outer (pivot) attach points
  if (mount === 'post') {
    kit.at({ x: postX, z: postZ }, () => {
      kit.add(cbox(0.7, 0.4, 0.7, 0.08), P.stone, { y: 0.15 });
      kit.add(cbox(0.24, armY + 0.5, 0.24, 0.05), P.woodDark, { y: (armY + 0.5) / 2 });
      kit.add(ico(0.2, 0), gold, { y: armY + 0.62 }, materials.glossy);
      // arm reaching back over the pavement toward the pub centre
      kit.add(cbox(armLen + 0.2, 0.18, 0.18, 0.04), P.woodDark, { x: -side * (armLen / 2), y: armY });
      kit.add(cylBetween([0, armY - 0.9, 0], [-side * 0.9, armY - 0.05, 0], 0.06, 0.06, 6), P.woodDark);
      kit.add(torus(0.2, 0.03, 4, 10, Math.PI * 1.5), P.ink, { x: -side * 0.35, y: armY - 0.32, rz: side > 0 ? 0 : Math.PI / 2 });
    });
    a.set(postX - side * (armLen - 0.1 - boardW + 0.12), armY - 0.1, postZ);
    b.set(postX - side * (armLen - 0.1), armY - 0.1, postZ);
  } else {
    // traditional wall bracket (board edge-on to the street front)
    const x = side * (W / 2 - 1.2);
    kit.at({ x, y: armY, z: fz + 0.28 }, () => {
      kit.add(box(0.3, 0.5, 0.1), P.ink, { z: -0.05 });
      kit.add(cylBetween([0, 0, 0], [0, 0, armLen], 0.045, 0.045, 6), P.ink);
      kit.add(cylBetween([0, -0.7, 0], [0, 0, armLen * 0.75], 0.035, 0.035, 6), P.ink);
    });
    a.set(x, armY - 0.06, fz + 0.28 + armLen - boardW + 0.05);
    b.set(x, armY - 0.06, fz + 0.28 + armLen - 0.1);
  }

  // pivot sits at the outer chain's hinge; the board hangs toward the inner chain
  const signPivot = new THREE.Object3D();
  signPivot.name = 'signPivot';
  signPivot.position.copy(b);
  if (mount === 'wall') signPivot.rotation.y = -Math.PI / 2; // local +x -> world +z
  const span = a.distanceTo(b);
  const dir = mount === 'wall' ? -1 : Math.sign(a.x - b.x) || -1; // board extends toward dir*x (pivot-local)
  const sign = new THREE.Group();
  sign.name = 'sign';
  const sk = new Kit('pubSign');
  const bx = dir * span / 2; // board centre x (pivot-local)
  const by = -chainLen - boardH / 2;
  // outer chain (always attached)
  addChain(sk, [0, 0, 0], [0, -chainLen - 0.02, 0]);
  // board: wooden frame + painted faces both sides + little finials
  sk.add(cbox(boardW + 0.16, boardH + 0.16, 0.12, 0.05), P.woodDark, { x: bx, y: by });
  sk.add(box(boardW + 0.3, 0.1, 0.16), P.ink, { x: bx, y: by + boardH / 2 + 0.1 });
  for (const s of [-1, 1]) sk.add(ico(0.07, 0), gold, { x: bx + s * (boardW / 2 + 0.15), y: by + boardH / 2 + 0.1 }, materials.glossy);
  const face = planeUV(boardW, boardH, atlas.board);
  sk.raw(face, atlas.mat, { x: bx, y: by, z: 0.082 });
  sk.raw(face, atlas.mat, { x: bx, y: by, z: -0.082, ry: Math.PI });
  sk.build(sign);
  // the loose (inner) chain: its own node so it can dangle or reconnect
  const loose = new THREE.Group();
  loose.name = 'looseChain';
  const lk = new Kit('pubSignChain');
  addChain(lk, [0, 0, 0], [0, chainLen + 0.02, 0]);
  lk.build(loose);
  loose.position.set(dir * span, by + boardH / 2 + 0.1, 0);
  sign.add(loose);
  signPivot.add(sign);
  kit.anchors.push(signPivot);

  // the bolt at the inner attach point
  const bolt = new THREE.Group();
  bolt.name = 'bolt';
  const bk = new Kit('bolt');
  bk.add(cyl(0.06, 0.06, 0.05, 6), P.metal, { y: 0.03 }, materials.toy);
  bk.add(cyl(0.028, 0.028, 0.2, 6), P.metalDark, { y: -0.07 });
  bk.add(torus(0.05, 0.018, 4, 8), P.metalDark, { y: -0.2, rx: Math.PI / 2 });
  bk.build(bolt);
  addCollider(bolt, 0.32, [0, -0.1, 0]);
  bolt.position.copy(a);
  if (mount === 'wall') bolt.rotation.y = -Math.PI / 2;
  kit.anchors.push(bolt);

  const group = kit.build(new THREE.Group());
  group.name = opts.name ?? 'pub';
  const boltHome = bolt.position.clone(); // after the lean warp
  Object.assign(parts, { signPivot, sign, bolt, looseChain: loose });
  group.userData.kind = 'pub';
  group.userData.parts = parts;
  group.userData.size = { ...res.size, depth: D + 5 };

  // ---- sign behaviour: crooked <-> fixed with a springy swing
  const tilt = (opts.tiltDeg ?? 35) * DEG * dir; // board end drops
  const state = { crooked: !!opts.crooked, angle: 0, vel: 0, t: 0 };
  const target = () => (state.crooked ? -tilt : 0);
  state.angle = target();
  const boltLoose = () => {
    bolt.position.copy(boltHome).add(new THREE.Vector3(0, -0.12, 0));
    bolt.rotation.z = 0.7 * dir;
  };
  const boltHomeSet = () => { bolt.position.copy(boltHome); bolt.rotation.z = 0; };
  if (state.crooked) boltLoose(); else boltHomeSet();
  const _q = new THREE.Quaternion();
  const _v = new THREE.Vector3();
  const _w = new THREE.Vector3();
  const _a = new THREE.Vector3();
  group.userData.setCrooked = (on = true) => {
    state.crooked = !!on;
    if (on) boltLoose(); else boltHomeSet();
  };
  group.userData.fixSign = () => group.userData.setCrooked(false);
  group.userData.isCrooked = () => state.crooked;
  group.userData.update = (dt, t) => {
    dt = Math.min(dt, 0.05);
    // damped spring toward the target angle + a gentle breeze
    const breeze = Math.sin(t * 1.3) * 0.02 + Math.sin(t * 2.9) * 0.008;
    const k = 18, c = 3.2;
    const acc = -k * (state.angle - target() - breeze) - c * state.vel;
    state.vel += acc * dt;
    state.angle += state.vel * dt;
    signPivot.rotation.z = state.angle;
    // the loose chain: dangles straight down when crooked, reaches for the bolt when fixed
    loose.updateWorldMatrix(true, false);
    loose.getWorldPosition(_w);
    if (state.crooked) {
      _v.set(0, -1, 0);
      _v.x += Math.sin(t * 2.1) * 0.08;
    } else {
      group.updateWorldMatrix(true, false);
      _a.copy(boltHome).applyMatrix4(group.matrixWorld);
      _v.copy(_a).sub(_w);
    }
    _v.normalize();
    loose.parent.getWorldQuaternion(_q).invert();
    _v.applyQuaternion(_q);
    loose.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _v);
    if (state.crooked) bolt.rotation.y = Math.sin(t * 3) * 0.1;
  };
  group.userData.update(0.016, 0);
  return group;
}

/** Chunky chain of alternating links between two points (current frame). */
function addChain(kit, from, to) {
  const A = new THREE.Vector3(...from), B = new THREE.Vector3(...to);
  const n = Math.max(2, Math.round(A.distanceTo(B) / 0.1));
  for (let i = 0; i < n; i++) {
    const p = A.clone().lerp(B, (i + 0.5) / n);
    kit.add(torus(0.045, 0.016, 4, 8), P.ink, { x: p.x, y: p.y, z: p.z, ry: i % 2 ? Math.PI / 2 : 0, sy: 1.5 });
  }
}
