// Puddleby Green: ambient life — market traders and shoppers, kids, the jogger, a dog
// walking its owner, the painter, a man stuck in a bin, a runaway hat, fête-goers, pub regulars,
// animals, the bus / car / cyclist loops and chimney smoke.
import * as THREE from 'three';
import * as K from '../../world/kit/props/index.js';
import { Person, Walker, Dog, Cat, Gull, Chicken } from '../../world/characters/index.js';
import { P } from '../../gfx/palette.js';
import { put, local, yawTo, facePerch, worldPos, circlePath, sunHat, Leash, v3, every } from './util.js';
import { FOUNTAIN, ROAD_PTS } from './layout.js';

const UP = new THREE.Vector3(0, 1, 0);

/** Moves a vehicle group along a polyline (lane offset), with stops and a hidden wrap-around wait. */
class Drive {
  constructor(obj, pts, { speed = 8, stops = [], wait = 6, start = 0, lane = 1.75, onStop } = {}) {
    this.obj = obj;
    this.speed = speed;
    this.v = speed;
    this.wait = wait;
    this.onStop = onStop;
    const P0 = pts.map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(p[0], 0, p[1])));
    const curve = new THREE.CatmullRomCurve3(P0, false, 'centripetal');
    const n = Math.ceil(curve.getLength() / 1.5);
    const raw = curve.getSpacedPoints(n);
    // offset to the left of travel (UK: keep left)
    this.pts = raw.map((p, i) => {
      const a = raw[Math.max(0, i - 1)], b = raw[Math.min(raw.length - 1, i + 1)];
      const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1;
      return new THREE.Vector3(p.x + (tz / l) * lane, 0, p.z - (tx / l) * lane);
    });
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) this.cum.push(this.cum[i - 1] + this.pts[i].distanceTo(this.pts[i - 1]));
    this.length = this.cum[this.cum.length - 1];
    this.stops = stops.map(([x, z, secs]) => ({ s: this.nearest(x, z), secs, done: false }));
    this.s = start * this.length;
    this.hold = 0;
    this.hidden = 0;
    this._p = new THREE.Vector3();
    this._q = new THREE.Vector3();
    this.place();
  }

  nearest(x, z) {
    let best = 0, bd = Infinity;
    this.pts.forEach((p, i) => { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = i; } });
    return this.cum[best];
  }

  at(s, out) {
    s = Math.max(0, Math.min(this.length, s));
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.cum[m] <= s) lo = m; else hi = m; }
    const k = (s - this.cum[lo]) / (this.cum[hi] - this.cum[lo] || 1);
    return out.lerpVectors(this.pts[lo], this.pts[hi], k);
  }

  place() {
    const p = this.at(this.s, this._p);
    const q = this.at(this.s + 2, this._q);
    this.obj.position.set(p.x, 0, p.z);
    if (q.distanceToSquared(p) > 1e-4) this.obj.rotation.y = Math.atan2(q.x - p.x, q.z - p.z);
  }

  update(dt) {
    const ud = this.obj.userData;
    if (this.hidden > 0) {
      this.hidden -= dt;
      if (this.hidden <= 0) { this.obj.visible = true; this.s = 0; this.stops.forEach((st) => (st.done = false)); }
      ud.speed = 0;
      return;
    }
    if (this.hold > 0) {
      this.hold -= dt;
      ud.speed = 0;
      if (this.hold <= 0) this.v = 0.5;
      return;
    }
    let target = this.speed;
    for (const st of this.stops) {
      if (st.done) continue;
      const d = st.s - this.s;
      if (d > 0 && d < 16) target = Math.min(target, Math.max(0.6, d * 0.55));
      if (d <= 0.3 && d > -2) { st.done = true; this.hold = st.secs; this.onStop?.(this); ud.speed = 0; return; }
    }
    this.v += (target - this.v) * Math.min(1, dt * 1.6);
    this.s += this.v * dt;
    ud.speed = this.v;
    if (this.s >= this.length) { this.obj.visible = false; this.hidden = this.wait; return; }
    this.place();
  }
}

export function buildLife(ctx, S, L, D, J) {
  const root = ctx.root;
  const cast = S.cast;
  const rng = ctx.rng;
  const FC = new THREE.Vector3(FOUNTAIN[0], 0, FOUNTAIN[1]);

  // ------------------------------------------------------------ market traders + shoppers
  const traderLooks = [
    { apronStripe: P.tomato, hat: { type: 'flatcap', color: '#6b5a4a' }, facial: 'moustache' },
    { apronStripe: '#4fa83c', hat: { type: 'beanie', color: '#4fa83c', color2: '#c8ee9a' }, facial: 'beard' },
    { apronStripe: P.bubblegum, hat: { type: 'sunhat', color: '#fff1d6', band: P.bubblegum }, facial: null, hair: { style: 'bun', color: P.hair[3] } },
    { apronStripe: P.teal, hat: { type: 'chef', color: '#fbf7f0' }, facial: 'handlebar' },
  ];
  const jobDone = (id) => ctx.jobs.get(id)?.state === 'done';
  const traderLines = [() => (jobDone('melons') ? ['My poor melons!', 'Half price! Slightly bruised!'] : ['Melons! Lovely melons!', 'Five apples a pound!']), ['Get your carrots here!', 'Fresh as a daisy, these leeks.'], ['Posies for the fête!', 'Roses are red...'], ['Cakes! Scones! Jam!', 'Mind the icing, dear.']];
  J.traders = D.stalls.map((st, i) => {
    const [x, z] = local(st.x, st.z, st.ry, 0.15, -1.05);
    const lk = traderLooks[i];
    const t = cast.person({ preset: 'trader', seed: 2101 + i, hat: lk.hat, facial: lk.facial, ...(lk.hair ? { hair: lk.hair } : {}), top: { type: 'apron', color: '#fbf7f0', color2: '#fbf7f0', apronStripe: lk.apronStripe, sleeves: 'short' } },
      x, z, st.ry, 'talk', { role: 'speak', period: 5 + i }, { name: 'trader', lines: traderLines[i] });
    return t;
  });
  // shoppers in front of the stalls
  const shopSpots = [[-17.8, 4.4, 'talk', 0.2], [-10.1, 5.7, 'idle', -0.2], [10.8, 5.6, 'point', 0.1]];
  const shoppers = shopSpots.map(([x, z, act, dy], i) => {
    const s = cast.person({ seed: 2201 + i, accessory: i === 1 ? 'shopping' : i === 3 ? 'bag' : null }, x, z, Math.PI + dy, act, act === 'point' ? { at: new THREE.Vector3(10.4, 1.2, 2.6) } : { role: 'listen' }, { name: 'shopper', lines: ['Ooh, what lovely rhubarb.', 'How much for the lot?', 'I only came for eggs.'] });
    return s;
  });

  // ------------------------------------------------------------ kids running round the fountain
  const loop = circlePath(FOUNTAIN[0], FOUNTAIN[1], 6.35, 18);
  J.fountainKids = [0, 1].map((i) => {
    const k = cast.person({ age: 'kid', seed: 2301 + i, accessory: null }, 0, 0, 0, 'run', {}, { name: 'kid', lines: ['Tag! You\'re it!', 'Can\'t catch me!'] });
    new Walker(k, loop, { loop: true, speed: 2.35 + i * 0.1, action: 'run', start: i * 0.5, startFraction: true, reverse: false });
    return k;
  });

  // ------------------------------------------------------------ the jogger: laps of the square
  const jogLoop = [[-26.5, -40.2], [27.5, -40.2], [33.2, -14], [34.2, 11.8], [-3, 12.8], [-45.6, 11.8], [-41.5, -5], [-31.5, -31.5]];
  const jogger = cast.person({ preset: 'jogger', seed: 2501 }, 0, 0, 0, 'run', {}, { name: 'jogger', lines: ['Lap nine!', 'Huff... huff...'] });
  new Walker(jogger, jogLoop, { loop: true, speed: 3.1, action: 'run', start: 0.15, startFraction: true });

  // ------------------------------------------------------------ a dog walking its owner (south pavement)
  const dogPath = [[-50, 43.0], [-20, 43.2], [10, 43.2], [44, 42.9], [48.5, 47], [44, 51.3], [10, 51.4], [-20, 51.4], [-50, 51.5], [-54.5, 47.3]];
  const bigDog = new Dog({ seed: 7, scale: 1.45, variant: { coat: '#e3b56b', light: '#fbefd9', patch: '#c8894a', ear: '#c8894a' } });
  cast.animal(bigDog, 0, 0, 0, { name: 'dog' });
  new Walker(bigDog, dogPath, { loop: true, speed: 2.3, action: 'run', start: 0.35, startFraction: true, variety: 0 });
  const owner = cast.person({ seed: 2601, hat: { type: 'bowler', color: '#34384a' }, top: { type: 'suit', color: '#5b6b7a', sleeves: 'long' }, accessory: null, facial: 'moustache' }, 0, 0, 0, 'panic', {}, { name: 'dog owner', lines: ['Heel, Biscuit! HEEL!', 'Whoaaa!', 'He only wants a cuddle!'] });
  const ownerWalker = new Walker(owner, dogPath, { loop: true, speed: 2.3, action: 'panic', start: 0.35, startFraction: true, variety: 0 });
  const leash = new Leash(root, P.tomato, 0.02);
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  ctx.onUpdate(() => {
    // the owner trails 2.4 m behind the dog along the same path, leaning back on the lead
    const dw = bigDog.controller;
    const Lw = ownerWalker.length;
    ownerWalker.s = (((dw.s - 2.4) % Lw) + Lw) % Lw;
    ownerWalker.pauseT = 0;
    owner.bones.handR.getWorldPosition(_a);
    bigDog.root.getWorldPosition(_b);
    _b.y += 0.45 * bigDog.scale;
    _b.addScaledVector(new THREE.Vector3(Math.sin(bigDog.root.rotation.y), 0, Math.cos(bigDog.root.rotation.y)), 0.1);
    leash.set(_a, _b);
  });

  // ------------------------------------------------------------ the painter at his easel (painting the church)
  const PNT = [-19.8, -30.6];
  const churchDoor = L.anchors.churchDoor;
  const easelYaw = yawTo(new THREE.Vector3(PNT[0], 0, PNT[1]), churchDoor);
  const easel = K.easel({ seed: 3, painting: 'landscape' });
  put(root, easel, PNT[0] + Math.sin(easelYaw) * 1.05, PNT[1] + Math.cos(easelYaw) * 1.05, easelYaw + Math.PI);
  ctx.surface(easel, 'wood');
  ctx.onUpdate(easel.userData.update);
  ctx.prop(easel.userData.parts.canvas, { surface: 'soft', onHit: () => easel.userData.splat() });
  const painter = cast.person({ preset: 'painter', seed: 2701 }, PNT[0], PNT[1], easelYaw, 'paint', {}, { name: 'painter', lines: ['Hold still, church!', 'A little more ochre...', 'I call it "Tuesday".'] });
  painter.lookAt(churchDoor.clone().setY(8));

  // ------------------------------------------------------------ the policeman on the south path
  const bobby = cast.person({ preset: 'police', seed: 2801 }, 2.6, 39.4, Math.PI - 0.3, 'idle', {}, { name: 'policeman', lines: ['Evening all. Er, morning all.', 'Move along, nothing to see.', 'Mind the fête traffic.'] });
  const bobbyR = { t: 3, i: 0 };
  ctx.onUpdate((dt) => {
    if (bobby.busy) return;
    bobbyR.t -= dt;
    if (bobbyR.t > 0) return;
    const steps = [['idle', 4], ['point', 2, { at: new THREE.Vector3(-20, 1, 47) }], ['wave', 2], ['idle', 3], ['whistle', 2.2]];
    const [a, d, o] = steps[bobbyR.i++ % steps.length];
    bobby.setAction(a, o || {});
    bobbyR.t = d;
  });

  // ------------------------------------------------------------ a man stuck head-first in a wheelie bin
  const BIN = [26.8, -8.4];
  const wbin = K.wheelieBin({ seed: 4, color: '#3f9a4e', lidColor: P.sunflower, open: true });
  put(root, wbin, BIN[0], BIN[1], facePerch(BIN[0], BIN[1]) - 0.5);
  ctx.surface(wbin, 'soft');
  ctx.onUpdate(wbin.userData.update);
  const binMan = new Person({ seed: 2901, top: { type: 'shirt', color: P.cobalt, sleeves: 'long' }, bottom: { type: 'trousers', color: '#8b5e3c' }, shoes: '#c8503a', socks: P.sunflower, hat: null, accessory: null, shadow: false, scale: 0.9 });
  const mouth = wbin.userData.parts.mouth;
  mouth.add(binMan.root);
  binMan.root.rotation.set(Math.PI, 0.3, 0);
  binMan.root.position.set(0, 0.68, 0.02);
  binMan.setAction('walk', {}, 0);
  binMan.speed = 0.9;
  ctx.actor(binMan, { name: 'man in bin' });
  cast.talkers.push({ p: binMan, lines: ['Help! I dropped my keys!', 'It\'s quite cosy in here actually.', 'Is it Tuesday?'], i: 0 });
  ctx.onUpdate((dt, t) => { wbin.rotation.z = Math.sin(t * 9) * 0.035 + Math.sin(t * 3.1) * 0.02; });

  // ------------------------------------------------------------ a lady chasing her runaway hat
  const hatLoop = [[-27.5, -23.5], [-22, -31.5], [-11.5, -31], [-7.5, -26.5], [-12.5, -21.5], [-22.5, -18.2]];
  const hatLady = cast.person({ seed: 3001, hair: { style: 'bob', color: P.hair[6] }, top: { type: 'dress', color: P.teal, sleeves: 'short' }, hat: null, accessory: 'handbag', age: 'adult' }, 0, 0, 0, 'chase', {}, { name: 'hat lady', lines: ['Come back, my hat!', 'It was a present!', 'Stop that hat!'] });
  const hatWalker = new Walker(hatLady, hatLoop, { loop: true, speed: 2.25, action: 'chase', variety: 0 });
  const hat = sunHat('#ffb8c2', P.violet);
  root.add(hat);
  ctx.prop(hat, { surface: 'soft', onHit: () => { hatHop = 0.6; } });
  let hatHop = 0;
  ctx.onUpdate((dt, t) => {
    hatHop = Math.max(0, hatHop - dt);
    const s = hatWalker.s + 2.3;
    hatWalker.sample(s, _a);
    hatWalker.sample(s + 0.5, _b);
    hat.position.set(_a.x, 0.34 + Math.abs(Math.sin(t * 5.5)) * 0.28 + hatHop * 1.4, _a.z);
    hat.rotation.set(Math.PI / 2 - 0.25, Math.atan2(_b.x - _a.x, _b.z - _a.z) + Math.PI / 2, t * 7);
  });

  // ------------------------------------------------------------ fête: bouncy castle kids, shy thrower, cake lady
  const cst = D.castle;
  J.castleKids = [[-0.9, 0.2], [0.8, -0.3]].map(([lx, lz], i) => {
    const [x, z] = local(cst.x, cst.z, cst.ry, lx, lz);
    const k = cast.person({ age: 'kid', seed: 3101 + i * 7, accessory: null }, x, z, cst.ry + (i ? 0.6 : -0.4), i ? 'dance' : 'cheer', {}, { y: cst.deck, name: 'kid', lines: ['Boing! Boing!', 'Higher! Higher!'] });
    const ph = i * 1.3;
    ctx.onUpdate((dt, t) => { if (!k.busy) k.root.position.y = cst.deck + Math.abs(Math.sin(t * 4.6 + ph)) * 0.62; });
    return k;
  });
  const cakeLady = cast.person({ seed: 3301, top: { type: 'apron', color: P.bubblegum, color2: '#fff8ee', sleeves: 'short' }, hair: { style: 'bun', color: P.hair[2] }, accessory: null }, 0, 0, 0, 'walk', {}, { name: 'cake lady', lines: ['Victoria sponge coming through!', 'Has anyone seen the judge?'] });
  new Walker(cakeLady, [[34.5, 36.6], [40.8, 38.7], [45.2, 33.6], [45.2, 31.2]], { pingPong: true, speed: 0.9, pauseAt: [{ index: 0, duration: 3, action: 'talk' }, { index: 3, duration: 3, action: 'point', actionOptions: { at: new THREE.Vector3(45.8, 1, 29.6) } }] });

  // ------------------------------------------------------------ pub regulars at the picnic tables
  const tables = L.anchors.pubTables;
  const PR = L.pubAt.ry;
  const sits = [[0, -0.45, 1], [0, 0.5, -1], [1, 0.1, 1]];
  sits.forEach(([ti, lx, side], i) => {
    const tb = tables[ti];
    const [x, z] = local(tb.x, tb.z, PR, lx, side * 0.72);
    cast.person({ seed: 3501 + i, age: i === 1 ? 'elder' : 'adult', accessory: null, hat: i === 0 ? { type: 'flatcap', color: '#6b7a5a' } : undefined }, x, z, PR + (side > 0 ? Math.PI : 0), 'sit', { height: 0.49 }, { name: 'regular', lines: () => (jobDone('sign') ? ['Cheers!', 'The sign! It\'s straight! I need a sit down.', 'Another round?'] : ['Cheers!', 'Another round?', 'That sign\'s been wonky since 1974.']) });
  });

  // ------------------------------------------------------------ bus-stop waiter + café customer
  const bb = D.busBench;
  cast.person({ seed: 3601, age: 'elder', accessory: 'newspaper', hat: { type: 'flatcap', color: '#7d8595' } }, bb.x - 0.5, bb.z + 0.28, 0, 'sit', { height: 0.52 }, { name: 'bus waiter', lines: ['The 42 is late again.', 'Twenty minutes, it said.'] });

  // ------------------------------------------------------------ animals
  // a cat sunning itself on Mr Grubb's wall (it's the LOST CAT from the notice board)
  const cw = D.catWall;
  const cat = new Cat({ seed: 9, variant: { coat: '#ff9f43', light: '#fff1d6', patch: '#e07a22' } });
  cast.animal(cat, (cw.a[0] + cw.b[0]) / 2, (cw.a[1] + cw.b[1]) / 2, cw.ry + Math.PI / 2, { y: cw.y, blob: false, name: 'cat' });
  {
    let i = 0, t0 = 2;
    ctx.onUpdate((dt) => {
      if (cat.busy) return;
      t0 -= dt;
      if (t0 > 0) return;
      const st = [['sit', 5], ['lick', 3], ['swish', 4], ['sleep', 8]][i++ % 4];
      cat.setAction(st[0]);
      t0 = st[1];
    });
  }
  // a sleepy dog by the pub door
  const pd = L.anchors.pubDoor;
  const pubDog = new Dog({ seed: 3, variant: { coat: '#fbf7f0', light: '#fbf7f0', patch: '#2b2b3a', ear: '#2b2b3a' } });
  cast.animal(pubDog, pd.x + 1.6, pd.z + 0.9, L.pubAt.ry + 0.8, { name: 'dog' });
  pubDog.setAction('sleep');
  // hens in Mr Grubb's garden
  const G = L.grubb;
  [[-1.5, 5.4], [0.6, 6.2]].forEach(([lx, lz], i) => {
    const [x, z] = local(G.x, G.z, G.ry, lx, lz);
    const hen = new Chicken({ seed: 40 + i });
    cast.animal(hen, x, z, rng.range(0, 6), { name: 'chicken' });
    hen.setAction('peck');
    const home = new THREE.Vector3(x, 0, z);
    new Walker(hen, [[x, z], [x + 1.2, z + 0.6], [x + 0.4, z - 1.1]], { loop: true, speed: 0.35, pauseAt: [{ index: 1, duration: 3, action: 'peck' }, { index: 2, duration: 2.5, action: 'idle' }] });
    void home;
  });
  // gulls wheeling over the square (sea's not far)
  [[0, -18, 26, 20, false], [8, -6, 34, 24, true], [-14, -30, 20, 18, false]].forEach(([x, z, r, h, cwise], i) => {
    const g = new Gull({ seed: 60 + i });
    cast.animal(g, x, z, 0, { blob: false, name: 'gull' });
    g.setAction('circle', { center: new THREE.Vector3(x, 0, z), radius: r, height: h, speed: 5 + i, clockwise: cwise });
    g.mesh.castShadow = false;
    g.noShadow = true;
  });

  // ------------------------------------------------------------ maypole dancers (ribbons from the crown to their hands)
  const MP = D.maypole;
  const dancers = [[3.05, false, 0], [3.05, false, 0.5], [3.7, true, 0.25]].map(([r, rev, st], i) => {
    const k = cast.person({ age: 'kid', seed: 4501 + i * 3, accessory: null, top: { type: i % 2 ? 'dress' : 'tee', color: [P.bubblegum, P.teal, P.sunflower, P.violet][i], sleeves: 'short' } },
      0, 0, 0, 'walk', {}, { name: 'maypole dancer', lines: ['Round and round!', 'Over, under, over...', "I'm dizzy!"] });
    new Walker(k, circlePath(MP.x, MP.z, r, 18), { loop: true, speed: 1.15 + i * 0.03, reverse: rev, start: st, startFraction: true, variety: 0 });
    return k;
  });
  J.maypoleKids = dancers;
  {
    const NR = 8, SEG = 7;
    const cols = [P.tomato, P.sunflower, P.teal, P.bubblegum, P.cobalt, P.lime, P.violet, P.tangerine];
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(NR * SEG * 6 * 3);
    const col = new Float32Array(NR * SEG * 6 * 3);
    const c = new THREE.Color();
    for (let r = 0; r < NR; r++) { c.set(cols[r]); for (let v = 0; v < SEG * 6; v++) col.set([c.r, c.g, c.b], (r * SEG * 6 + v) * 3); }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.55 });
    const ribbons = new THREE.Mesh(geo, mat);
    ribbons.name = 'maypole-ribbons';
    ribbons.frustumCulled = false;
    ribbons.castShadow = false;
    ribbons.raycast = () => {};
    root.add(ribbons);
    const top = new THREE.Vector3(MP.x, MP.top, MP.z);
    const A = new THREE.Vector3(), Bv = new THREE.Vector3(), P0 = new THREE.Vector3(), P1 = new THREE.Vector3(), side = new THREE.Vector3(), dir = new THREE.Vector3();
    const Y = new THREE.Vector3(0, 1, 0);
    const pt = (u, sag, out) => out.lerpVectors(A, Bv, u).setY(A.y + (Bv.y - A.y) * u - Math.sin(Math.PI * u) * sag);
    ctx.onUpdate((dt, t) => {
      let o = 0;
      for (let r = 0; r < NR; r++) {
        const a = (r / NR) * Math.PI * 2 + t * 0.15;
        A.set(top.x + Math.cos(a) * 0.4, top.y, top.z + Math.sin(a) * 0.4);
        if (r < dancers.length) dancers[r].bones.handR.getWorldPosition(Bv);
        else Bv.set(top.x + Math.cos(a) * 0.9, 1.4 + Math.sin(t * 2.3 + r) * 0.25, top.z + Math.sin(a) * 0.9);
        dir.subVectors(Bv, A).normalize();
        side.crossVectors(dir, Y);
        if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
        side.normalize().multiplyScalar(0.045);
        const sag = r < dancers.length ? 0.25 : 0.05;
        for (let k = 0; k < SEG; k++) {
          pt(k / SEG, sag, P0);
          pt((k + 1) / SEG, sag, P1);
          const tw = Math.sin(t * 6 + r + k) * 0.02;
          const q = [P0.x - side.x, P0.y - side.y + tw, P0.z - side.z, P0.x + side.x, P0.y + side.y - tw, P0.z + side.z,
            P1.x + side.x, P1.y + side.y + tw, P1.z + side.z, P1.x - side.x, P1.y - side.y - tw, P1.z - side.z];
          pos.set([q[0], q[1], q[2], q[3], q[4], q[5], q[6], q[7], q[8], q[0], q[1], q[2], q[6], q[7], q[8], q[9], q[10], q[11]], o);
          o += 18;
        }
      }
      geo.attributes.position.needsUpdate = true;
      geo.computeVertexNormals();
    });
  }
  // two grandads snoozing in deckchairs
  D.deckchairs.slice(0, 1).forEach((dc, i) => {
    const [x, z] = local(dc.x, dc.z, dc.ry, 0, 0.22);
    cast.person({ seed: 4601 + i, age: 'elder', hat: i ? { type: 'sunhat', color: '#fff1d6', band: P.teal } : { type: 'flatcap', color: '#8b6b4a' }, accessory: null, top: i ? { type: 'hawaiian', color: P.tomato, color2: P.sunflower, sleeves: 'short' } : { type: 'cardigan', color: '#7d8595', sleeves: 'long' } },
      x, z, dc.ry, 'lie', { pose: 'deckchair', height: dc.seat }, { name: 'snoozer', lines: ['Zzz...', 'Wake me up for the cake judging.'] });
  });

  // ------------------------------------------------------------ vehicles
  const bus = K.bus({ seed: 3, color: P.tomato });
  root.add(bus);
  ctx.surface(bus, 'metal');
  ctx.onUpdate(bus.userData.update);
  ctx.prop(bus, { surface: 'metal', onHit: () => { bus.userData.bump?.(0.8); ctx.sfx('honk', { position: worldPos(bus), pitch: 0.8 }); } });
  const busDrive = new Drive(bus, ROAD_PTS, { speed: 9, stops: [[-24, 45.2, 5]], wait: 14, start: 0.05, lane: 1.8, onStop: () => ctx.sfx('honk', { position: worldPos(bus), pitch: 0.75, volume: 0.6 }) });
  ctx.onUpdate((dt) => busDrive.update(dt));
  const car = K.car({ style: 'beetle', color: P.sunflower, seed: 5 });
  root.add(car);
  ctx.surface(car, 'metal');
  ctx.onUpdate(car.userData.update);
  ctx.prop(car, { surface: 'metal', onHit: () => { car.userData.bump?.(1); ctx.sfx('honk', { position: worldPos(car), pitch: 1.2 }); } });
  const carDrive = new Drive(car, ROAD_PTS.slice().reverse(), { speed: 11, wait: 9, start: 0.55, lane: 1.8 });
  ctx.onUpdate((dt) => carDrive.update(dt));
  // cyclist (pedalling in place on a moving bike)
  const bike = K.bicycle({ seed: 9, color: P.teal, basket: true });
  root.add(bike);
  ctx.surface(bike, 'metal');
  ctx.onUpdate(bike.userData.update);
  const rider = cast.person({ seed: 3801, hat: { type: 'cap', color: P.lime, color2: '#fff8ee' }, accessory: null, top: { type: 'sport', color: P.lime, sleeves: 'short' }, bottom: { type: 'shorts', color: '#34384a' } }, 0, 0, 0, 'walk', {}, { name: 'cyclist', lines: ['Ding ding!', 'On your left!'], blob: false });
  bike.userData.parts.body.add(rider.root);
  rider.root.position.set(0, 0.3, -0.12);
  rider.speed = 0.95;
  const bikeDrive = new Drive(bike, ROAD_PTS, { speed: 4.2, wait: 11, start: 0.62, lane: 3.0 });
  ctx.onUpdate((dt) => { bikeDrive.update(dt); rider.speed = Math.max(0.2, bike.userData.speed * 0.25); });
  every(ctx, 14, () => { if (bike.visible) ctx.sfx('ding', { position: worldPos(bike), pitch: 1.35, volume: 0.5 }); });
  // parked cars along the east lane + a tractor by the fête
  const parked = [
    [K.car({ style: 'hatch', color: P.cobalt, seed: 11 }), 58.2, -16, Math.PI],
    [K.car({ style: 'van', color: '#fff1d6', seed: 12 }), 58.3, -2, Math.PI],
    [K.car({ style: 'pickup', color: P.tomato, seed: 13 }), 58.2, 26, 0],
    [K.tractor({ seed: 14, color: '#4f9a3c' }), 50.2, 31, -0.2],
  ];
  for (const [o, x, z, ry] of parked) {
    put(root, o, x, z, ry);
    ctx.surface(o, 'metal');
    ctx.prop(o, { surface: 'metal', onHit: () => { o.userData.bump?.(1); ctx.sfx('honk', { position: worldPos(o), pitch: 0.9 + rng.range(0, 0.3) }); } });
    ctx.onUpdate(o.userData.update);
  }

  // ------------------------------------------------------------ chimney smoke (a few, lazily)
  const chimneys = [
    ...L.anchors.terraceChimneys.filter((_, i) => i % 2 === 0),
    ...(L.west[1]?.chimneys || []).slice(0, 1), ...(L.west[4]?.chimneys || []).slice(0, 1),
    ...L.anchors.pubChimneys.slice(0, 1), ...L.anchors.grubbChimneys.slice(0, 1), ...L.anchors.cottageNWChimneys.slice(0, 1),
  ];
  for (const c of chimneys) ctx.smoke(c.clone().add(v3(0, 0.25, 0)), { rate: rng.range(0.7, 1.1) });

  return { shoppers, jogger, owner, bigDog, painter, bobby, binMan, hatLady, cakeLady, bus, car, bike };
}

export { Drive, UP };
