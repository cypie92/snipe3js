// Puddleby Green: ambient life — market traders and their queues, kids round the fountain, the
// jogger, a dog walking its owner, the painter, a man stuck in a bin, a runaway hat, a one-man
// band, fête-goers, pub regulars, animals, the bus / car / cyclist on the ring road and chimney smoke
// (the cricket match lives in games.js with the 'catch the six' job).
import * as THREE from 'three';
import * as K from '../../world/kit/props/index.js';
import { Person, Walker, Dog, Cat, Gull, Chicken, Duck, Sheep } from '../../world/characters/index.js';
import { P } from '../../gfx/palette.js';
import { put, local, yawTo, facePerch, worldPos, circlePath, sunHat, Leash, v3, every, routine, part } from './util.js';
import { materials } from '../../gfx/materials.js';
import { FOUNTAIN, ROAD_PTS } from './layout.js';
import { deckchair, picnicBlanket } from './custom.js';

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
  const routineLife = (p, steps) => routine(ctx, p, steps, ctx.rng.range(0, 2));
  const cast = S.cast;
  const rng = ctx.rng;
  const FC = new THREE.Vector3(FOUNTAIN[0], 0, FOUNTAIN[1]);
  const jobDone = (id) => ctx.jobs.get(id)?.state === 'done';

  // ------------------------------------------------------------ market traders + their queues
  const traderLooks = [
    { apronStripe: P.tomato, hat: { type: 'flatcap', color: '#6b5a4a' }, facial: 'moustache' },
    { apronStripe: '#4fa83c', hat: { type: 'beanie', color: '#4fa83c', color2: '#c8ee9a' }, facial: 'beard' },
    { apronStripe: P.bubblegum, hat: { type: 'sunhat', color: '#fff1d6', band: P.bubblegum }, facial: null, hair: { style: 'bun', color: P.hair[3] } },
    { apronStripe: P.teal, hat: { type: 'chef', color: '#fbf7f0' }, facial: 'handlebar' },
    { apronStripe: P.sunflower, hat: { type: 'bucket', color: '#f2d27a' }, facial: null, hair: { style: 'ponytail', color: P.hair[1] } },
    { apronStripe: P.tangerine, hat: { type: 'flatcap', color: '#7d8595' }, facial: 'stubble' },
  ];
  const traderLines = [
    () => (jobDone('melons') ? ['My poor melons!', 'Half price! Slightly bruised!'] : ['Melons! Lovely melons!', 'Five apples a pound!']),
    ['Get your carrots here!', 'Fresh as a daisy, these leeks.'], ['Posies for the fête!', 'Roses are red...'], ['Cakes! Scones! Jam!', 'Mind the icing, dear.'],
    ['Sweet peas! Lovely sweet peas!', 'Two bunches for a pound.'], ['Fresh bread! Buns! Tarts!', 'Iced buns, still warm!'],
  ];
  const tradeStalls = [D.stalls[0], D.stalls[1], D.stalls[2], D.stalls[3], D.stalls[5], D.stalls[6]];
  J.traders = tradeStalls.map((st, i) => {
    const [x, z] = local(st.x, st.z, st.ry, 0.15, -1.05);
    const lk = traderLooks[i];
    return cast.person({ preset: 'trader', seed: 2101 + i, hat: lk.hat, facial: lk.facial, ...(lk.hair ? { hair: lk.hair } : {}), top: { type: 'apron', color: '#fbf7f0', color2: '#fbf7f0', apronStripe: lk.apronStripe, sleeves: 'short' } },
      x, z, st.ry, i === 0 ? 'hawk' : 'talk', { role: 'speak', period: 5 + i }, { name: 'trader', lines: traderLines[i] });
  });
  // shoppers queueing in front of the stalls
  const shopSpots = [[0, 0.3, 1.9, 'talk'], [1, -0.2, 2.0, 'idle'], [2, 0.4, 1.9, 'point'], [3, -0.3, 2.1, 'talk'], [5, 0.1, 1.9, 'idle'], [4, -0.4, 1.9, 'talk'], [4, 0.7, 2.7, 'impatient']];
  const shoppers = shopSpots.map(([si, lx, lz, act], i) => {
    const st = tradeStalls[si];
    const [x, z] = local(st.x, st.z, st.ry, lx, lz);
    const goods = new THREE.Vector3(st.x, 1.1, st.z);
    const s = cast.person({ seed: 2201 + i, accessory: i === 1 ? 'shopping' : i === 3 ? 'bag' : null }, x, z, st.ry + Math.PI, act, act === 'point' ? { at: goods } : { role: 'listen' }, { name: 'shopper', lines: ['Ooh, what lovely rhubarb.', 'How much for the lot?', 'I only came for eggs.', 'Is the fête open yet?'] });
    s.faceTowards(goods);
    return s;
  });

  // ------------------------------------------------------------ kids running round the fountain
  const loop = circlePath(FC.x, FC.z, 6.35, 18);
  J.fountainKids = [0, 1].map((i) => {
    const k = cast.person({ age: 'kid', seed: 2301 + i, accessory: null }, 0, 0, 0, 'run', {}, { name: 'kid', lines: ["Tag! You're it!", "Can't catch me!"] });
    new Walker(k, loop, { loop: true, speed: 2.35 + i * 0.1, action: 'run', start: i * 0.5, startFraction: true, reverse: false });
    return k;
  });

  // ------------------------------------------------------------ the jogger: laps just inside the square
  const jogLoop = [[-22, -22.5], [22, -22.5], [24.5, -17], [26.5, -6], [27, 13.2], [-27, 13.2], [-26.5, -6], [-24.5, -17]];
  const jogger = cast.person({ preset: 'jogger', seed: 2501 }, 0, 0, 0, 'run', {}, { name: 'jogger', lines: ['Lap nine!', 'Huff... huff...'] });
  new Walker(jogger, jogLoop, { loop: true, speed: 3.1, action: 'run', start: 0.15, startFraction: true });

  // ------------------------------------------------------------ a dog walking its owner (laps of the fountain, through the pigeons)
  const dogPath = circlePath(FC.x, FC.z, 10.4, 20, 0.3);
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
  every(ctx, () => rng.range(9, 15), () => ctx.sfx('woof', { position: worldPos(bigDog.root).setY(0.8) }));

  // ------------------------------------------------------------ the painter at his easel (painting the church)
  const PNT = [-19.8, -20.2];
  const churchDoor = L.anchors.churchDoor;
  const easelYaw = yawTo(new THREE.Vector3(PNT[0], 0, PNT[1]), churchDoor);
  const easel = K.easel({ seed: 3, painting: 'landscape' });
  put(root, easel, PNT[0] + Math.sin(easelYaw) * 1.05, PNT[1] + Math.cos(easelYaw) * 1.05, easelYaw + Math.PI);
  ctx.surface(easel, 'wood');
  ctx.onUpdate(easel.userData.update);
  ctx.prop(easel.userData.parts.canvas, { surface: 'soft', onHit: () => easel.userData.splat() });
  const painter = cast.person({ preset: 'painter', seed: 2701 }, PNT[0], PNT[1], easelYaw, 'paint', {}, { name: 'painter', lines: ['Hold still, church!', 'A little more ochre...', 'I call it "Tuesday".'] });
  painter.lookAt(churchDoor.clone().setY(8));

  // ------------------------------------------------------------ a man stuck head-first in a wheelie bin
  const BIN = [23.2, -3.4];
  const wbin = K.wheelieBin({ seed: 4, color: '#3f9a4e', lidColor: P.sunflower, open: true });
  put(root, wbin, BIN[0], BIN[1], facePerch(BIN[0], BIN[1]) - 0.5);
  ctx.surface(wbin, 'soft');
  ctx.onUpdate(wbin.userData.update);
  const binMan = new Person({ seed: 2901, autoIcons: false, top: { type: 'shirt', color: P.cobalt, sleeves: 'long' }, bottom: { type: 'trousers', color: '#8b5e3c' }, shoes: '#c8503a', socks: P.sunflower, hat: null, accessory: null, shadow: false, scale: 0.9 });
  binMan.root.userData.voice = 'man';
  const mouth = wbin.userData.parts.mouth;
  mouth.add(binMan.root);
  binMan.root.rotation.set(Math.PI, 0.3, 0);
  binMan.root.position.set(0, 0.68, 0.02);
  binMan.setAction('walk', {}, 0);
  binMan.speed = 0.9;
  ctx.actor(binMan, { name: 'man in bin' });
  cast.talkers.push({ p: binMan, lines: ['Help! I dropped my keys!', "It's quite cosy in here actually.", 'Is it Tuesday?'], i: 0 });
  ctx.onUpdate((dt, t) => { wbin.rotation.z = Math.sin(t * 9) * 0.035 + Math.sin(t * 3.1) * 0.02; });

  // ------------------------------------------------------------ a lady chasing her runaway hat (NE of the square)
  const hatLoop = [[3, -21.5], [15.5, -22], [23.5, -19.5], [23.8, -11.5], [16, -10.8], [3.6, -12.5]];
  const hatLady = cast.person({ seed: 3001, hair: { style: 'bob', color: P.hair[6] }, top: { type: 'dress', color: P.teal, sleeves: 'short' }, hat: null, accessory: 'handbag', age: 'adult' }, 0, 0, 0, 'chase', {}, { name: 'hat lady', lines: ['Come back, my hat!', 'It was a present!', 'Stop that hat!'] });
  const hatWalker = new Walker(hatLady, hatLoop, { loop: true, speed: 2.25, action: 'chase', variety: 0 });
  const hat = sunHat('#ffb8c2', P.violet);
  root.add(hat);
  let hatHop = 0;
  ctx.prop(hat, { surface: 'soft', onHit: () => { hatHop = 0.6; } });
  ctx.onUpdate((dt, t) => {
    hatHop = Math.max(0, hatHop - dt);
    const s = hatWalker.s + 2.3;
    hatWalker.sample(s, _a);
    hatWalker.sample(s + 0.5, _b);
    hat.position.set(_a.x, 0.44 + Math.abs(Math.sin(t * 5.5)) * 0.28 + hatHop * 1.4, _a.z);
    hat.rotation.set(Math.PI / 2 - 0.25, Math.atan2(_b.x - _a.x, _b.z - _a.z) + Math.PI / 2, t * 7);
  });

  // ------------------------------------------------------------ a one-man band on the bandstand + his audience
  const bs = D.bandstand;
  const busker = cast.person({ seed: 3201, hat: { type: 'tophat', color: P.tomato }, top: { type: 'stripes', color: P.tomato, color2: '#fff8ee', sleeves: 'long' }, bottom: { type: 'trousers', color: '#3d4a6b' }, accessory: null, facial: 'moustache' },
    bs.x, bs.z, bs.ry, 'jig', {}, { y: bs.deck, name: 'busker', lines: ['A one, a two...', 'Requests? Anyone?', 'Tuppence for a tune!'] });
  const fans = [[-1.6, 4.9, 'clap'], [1.7, 5.3, 'dance']].map(([lx, lz, act], i) => {
    const [x, z] = local(bs.x, bs.z, bs.ry, lx, lz);
    const f = cast.person({ seed: 3211 + i, age: i ? 'kid' : 'adult', accessory: i ? 'balloon' : null }, x, z, 0, act, {}, { name: 'listener', lines: ['Play the one about the goat!', 'Bravo!'] });
    f.faceTowards(new THREE.Vector3(bs.x, 0, bs.z));
    return f;
  });
  // a big lad having a go on the high striker and a kid hooking ducks
  const hs = D.striker;
  const strong = cast.person({ seed: 3231, top: { type: 'tee', color: P.tomato, sleeves: 'short' }, bottom: { type: 'shorts', color: '#3d4a6b' }, hat: null, accessory: null, build: { width: 1.3, belly: 0.6 } },
    hs.x + 1.3, hs.z + 1.4, 0, 'cheer', {}, { name: 'strongman', lines: ['Stand back, everyone!', "I'll ring it this time!", 'Must be rigged, that.'] });
  strong.faceTowards(new THREE.Vector3(hs.x, 0, hs.z));
  routineLife(strong, [['cheer', 2.4], ['shrug', 2], ['impatient', 2.6], ['point', 1.8, { at: new THREE.Vector3(hs.x, 4.2, hs.z) }]]);
  const dp = D.duckPool;
  const hooker = cast.person({ age: 'kid', seed: 3241, accessory: null, top: { type: 'dress', color: P.sunflower, sleeves: 'short' } }, dp.x - 1.5, dp.z + 0.6, 0, 'point', { at: new THREE.Vector3(dp.x, 0.3, dp.z) }, { name: 'kid', lines: ['I got a duck!', 'Number seven wins!'] });
  hooker.faceTowards(new THREE.Vector3(dp.x, 0, dp.z));

  // two old friends putting the world to rights on the bench by the memorial
  const gossipBench = [-23.4, -8.2, 1.3];
  [[-0.45, 0.27], [0.45, 0.27]].forEach(([lx, lz], i) => {
    const [x, z] = local(gossipBench[0], gossipBench[1], gossipBench[2], lx, lz);
    cast.person({ seed: 3221 + i, age: 'elder', accessory: i ? 'shopping' : null, hat: i ? undefined : { type: 'sunhat', color: '#c9b6e8', band: P.violet } }, x, z, gossipBench[2], 'sit', { height: 0.5 },
      { name: 'gossip', voice: 'old', lines: ['...and then SHE said...', 'Never! Not the vicar!', 'Mark my words, dear.'] });
  });
  every(ctx, () => rng.range(5, 8), () => ctx.sfx('whistle', { position: worldPos(busker.root).setY(1.5), volume: 0.35, pitch: rng.range(1.1, 1.4) }));

  // ------------------------------------------------------------ more square life (kept off the job sight lines)
  // a sweeper, a photographer snapping the church, a PCSO on her beat, two neighbours nattering,
  // an ice cream at the memorial, a late busker fan and a granny with her shopping trolley
  const sweeper = cast.person({ seed: 3261, top: { type: 'hivis', color: '#ffd23c' }, hat: { type: 'cap', color: '#3d4a6b' }, accessory: null }, -21.8, -13.8, 0.9, 'sweep', {}, { name: 'sweeper', lines: ['Confetti everywhere, every year.', 'Mind my pile!'] });
  const snapper = cast.person({ seed: 3262, accessory: null, hat: { type: 'beret', color: P.tomato } }, -14.5, -19.2, 0, 'photo', {}, { name: 'photographer', lines: ['Say "cheese", church!', 'Hold still, tower.'] });
  snapper.faceTowards(L.anchors.churchDoor);
  const pcso = cast.person({ preset: 'police', seed: 3263, hair: { style: 'bun', color: P.hair[2] } }, -21, -21.5, 0, 'walk', {}, { name: 'PCSO', lines: ['Move along, nothing to see.', 'Lovely morning for it.', "'Ello, 'ello."] });
  new Walker(pcso, [[-21, -21.5], [3.5, -21.8]], { pingPong: true, speed: 0.95, start: 0.4, startFraction: true, pauseAt: [{ index: 0, duration: 3, action: 'idle' }, { index: 1, duration: 3, action: 'checkWatch' }] });
  const natter = [[-11.8, -11.2, 'speak'], [-10.6, -12.4, 'listen']].map(([x, z, role], i) => {
    const n = cast.person({ seed: 3264 + i, age: i ? 'elder' : 'adult', accessory: i ? 'shopping' : 'handbag' }, x, z, 0, 'talk', { role }, { name: 'neighbour', lines: ['Did you hear about the vicar?', 'Never!', 'And the price of carrots!'] });
    return n;
  });
  natter[0].faceTowards(natter[1].root.position);
  natter[1].faceTowards(natter[0].root.position);
  cast.person({ seed: 3266, accessory: 'icecream', age: 'kid' }, -19.8, -1.4, 0.4, 'eat', { food: 'icecream' }, { name: 'kid', lines: ['Mmm, raspberry ripple.', 'Brain freeze!'] });
  {
    const [x, z] = local(bs.x, bs.z, bs.ry, 0.3, 6.1);
    const f = cast.person({ seed: 3267, age: 'elder', hat: { type: 'boater', color: '#f2d27a' }, accessory: null }, x, z, 0, 'clap', {}, { name: 'listener', lines: ['Play "Greensleeves"!', 'Marvellous.'] });
    f.faceTowards(new THREE.Vector3(bs.x, 0, bs.z));
  }
  const granny = cast.person({ preset: 'oldLady', seed: 3268, accessory: 'shopping' }, 21.5, 0.5, 0, 'walk', {}, { name: 'shopper', lines: ["I'll just pop to the baker's.", 'My hip, my hip...'] });
  new Walker(granny, [[21.5, 0.5], [25.2, 8.5]], { pingPong: true, speed: 0.5, pauseAt: [{ index: 1, duration: 4, action: 'talk' }] });

  // ------------------------------------------------------------ fête: bouncy castle kids, cake lady, strollers
  const cst = D.castle;
  J.castleKids = [[-0.9, 0.2], [0.8, -0.3]].map(([lx, lz], i) => {
    const [x, z] = local(cst.x, cst.z, cst.ry, lx, lz);
    const k = cast.person({ age: 'kid', seed: 3101 + i * 7, accessory: i ? 'balloon' : null }, x, z, cst.ry + (i ? 0.6 : -0.4), i ? 'dance' : 'cheer', {}, { y: cst.deck, name: 'kid', lines: ['Boing! Boing!', 'Higher! Higher!'] });
    const ph = i * 1.3;
    ctx.onUpdate((dt, t) => { if (!k.busy) k.root.position.y = cst.deck + Math.abs(Math.sin(t * 4.6 + ph)) * 0.62; });
    return k;
  });
  const cakeLady = cast.person({ seed: 3301, top: { type: 'apron', color: P.bubblegum, color2: '#fff8ee', sleeves: 'short' }, hair: { style: 'bun', color: P.hair[2] }, accessory: null }, 0, 0, 0, 'walk', {}, { name: 'cake lady', lines: ['Victoria sponge coming through!', 'Has anyone seen the judge?'] });
  const mq = D.marquee;
  new Walker(cakeLady, [[mq.x - 3.6, mq.z - 1.2], [mq.x - 5.4, mq.z - 4.2], [30.6, 24.2], [mq.x - 5.8, mq.z - 1.4]], { pingPong: true, speed: 0.9, pauseAt: [{ index: 0, duration: 3, action: 'talk' }, { index: 2, duration: 3, action: 'point', actionOptions: { at: new THREE.Vector3(25.1, 2.5, 24.8) } }] });
  const strollPath = [[-19.6, 24.6], [-10, 23.2], [0, 23.4], [10.4, 23], [19.4, 24.8]];
  const stroller = cast.person({ seed: 3401, accessory: 'icecream', hat: { type: 'sunhat', color: '#fff1d6', band: P.teal } }, 0, 0, 0, 'walk', {}, { name: 'fête-goer', lines: ['Lovely day for a fête.', 'Have you tried the tombola?'] });
  new Walker(stroller, strollPath, { pingPong: true, speed: 1.0, start: 0.3, startFraction: true, pauseAt: [{ index: 2, duration: 3, action: 'eat' }] });

  // ------------------------------------------------------------ the near lawn + the square's corners
  // dad asleep on the picnic blanket under the van, and a dog nobody has claimed by the lost property
  {
    const pc = D.picnic;
    const [x, z] = local(pc.x, pc.z, pc.ry, -0.2, 0.1);
    cast.person({ seed: 3281, accessory: null, top: { type: 'tee', color: P.cobalt, sleeves: 'short' }, bottom: { type: 'shorts', color: '#c8b27a' }, hat: { type: 'sunhat', color: '#f2d27a', band: P.tomato } },
      x, z, pc.ry + Math.PI / 2, 'lie', { pose: 'back', hatOverFace: true }, { name: 'picnicker', lines: ['Zzz... is it three o\'clock yet?', 'Mmm... tug of war... zzz'] });
    const lp = D.lostProperty;
    const stray = new Dog({ seed: 12, scale: 1.1, variant: { coat: '#c8894a', light: '#f3dcb5', patch: '#7a4a26', ear: '#7a4a26' } });
    cast.animal(stray, lp.x + 1.4, lp.z + 0.9, facePerch(lp.x, lp.z) - 0.8, { name: 'dog' });
    stray.setAction('sleep');
  }
  // a mum with a pram, a juggler (and his biggest fan) by the fête gate, a queue at the cake stall
  {
    const pr = D.pram;
    const [x, z] = local(pr.x, pr.z, pr.ry, 0, -1.05);
    const mum = cast.person({ seed: 3291, accessory: 'handbag', top: { type: 'dress', color: P.bubblegum, sleeves: 'short' }, hair: { style: 'bob', color: P.hair[1] } }, x, z, pr.ry, 'idle', {}, { name: 'mum', lines: ['Shh, he\'s just gone off.', 'Is that the Sarge in a tank?'] });
    routineLife(mum, [['idle', 4], ['checkWatch', 2.2], ['wave', 1.4], ['idle', 3]]);
  }
  {
    const JX = 6.4, JZ = 9.8, JR = facePerch(JX, JZ) - 0.25;
    const juggler = cast.person({ seed: 3301, hat: { type: 'party', color: P.sunflower, pom: P.tomato }, top: { type: 'stripes', color: P.violet, color2: P.sunflower, sleeves: 'long' }, bottom: { type: 'trousers', color: P.teal }, facial: null, accessory: null },
      JX, JZ, JR, 'pose', { channels: { aFL: 0.5, aFR: 0.5, eBL: 1.25, eBR: 1.25, aOL: 0.12, aOR: 0.12 } }, { name: 'juggler', lines: ['Three balls! No hands! ...Two hands.', 'Tah-daaa!', 'Coins in the hat, please!'] });
    const live = new K.LiveMesh(materials.toy);
    live.name = 'jugglingBalls';
    live.castShadow = false;
    const jg = new THREE.Group();
    jg.name = 'juggling';
    put(root, jg, JX, JZ, JR);
    jg.add(live);
    const balls = [P.tomato, P.sunflower, P.cobalt].map((c, i) => {
      const b = new THREE.Object3D();
      jg.add(b);
      live.addPiece(b, part(new THREE.IcosahedronGeometry(0.075, 1), c));
      return b;
    });
    live.build();
    ctx.onUpdate((dt, t) => {
      if (juggler.busy) return;
      balls.forEach((b, i) => { // a three-ball cascade in front of his chest
        const p = ((t * 0.9 + i / 3) % 1 + 1) % 1, a = p * Math.PI * 2;
        b.position.set(Math.cos(a) * 0.3, 1.25 + Math.max(0, Math.sin(a)) * 0.75 - Math.max(0, -Math.sin(a)) * 0.08, 0.32);
      });
      live.sync(t);
    });
    const fan = cast.person({ age: 'kid', seed: 3302, accessory: 'balloon' }, JX - 1.7, JZ + 1.4, 0, 'clap', {}, { name: 'kid', lines: ['Do the one with the fire!', 'Again! Again!'] });
    fan.faceTowards(v3(JX, 0, JZ));
  }
  {
    const cakes = D.stalls[3];
    [[0.45, 3.0, 'impatient'], [-0.25, 3.9, 'idle']].forEach(([lx, lz, act], i) => {
      const [x, z] = local(cakes.x, cakes.z, cakes.ry, lx, lz);
      const q = cast.person({ seed: 3311 + i, age: i ? 'elder' : 'adult', accessory: i ? 'shopping' : 'handbag' }, x, z, 0, act, {}, { name: 'shopper', lines: ['Is there any Victoria sponge left?', 'This queue is SLOW.'] });
      q.faceTowards(v3(cakes.x, 0, cakes.z));
    });
  }

  // ------------------------------------------------------------ pub regulars at the picnic tables
  const tables = L.anchors.pubTables;
  const PR = L.pubAt.ry;
  const sits = [[0, -0.45, 1], [0, 0.5, -1], [1, 0.1, 1]];
  sits.forEach(([ti, lx, sd], i) => {
    const tb = tables[ti];
    const [x, z] = local(tb.x, tb.z, PR, lx, sd * 0.72);
    cast.person({ seed: 3501 + i, age: i === 1 ? 'elder' : 'adult', accessory: null, hat: i === 0 ? { type: 'flatcap', color: '#6b7a5a' } : undefined }, x, z, PR + (sd > 0 ? Math.PI : 0), 'sit', { height: 0.49 }, { name: 'regular', lines: () => (jobDone('sign') ? ['Cheers!', "The sign! It's straight! I need a sit down.", 'Another round?'] : ['Cheers!', 'Another round?', "That sign's been wonky since 1974."]) });
  });

  // ------------------------------------------------------------ bus-stop waiter
  const bb = D.busBench;
  cast.person({ seed: 3601, age: 'elder', accessory: 'newspaper', hat: { type: 'flatcap', color: '#7d8595' } }, bb.x, bb.z, D.busStopRy, 'sit', { height: 0.52 }, { name: 'bus waiter', lines: ['The 42 is late again.', 'Twenty minutes, it said.'] });

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
  const [pdx, pdz] = local(pd.x, pd.z, PR, 1.8, 1.0);
  cast.animal(pubDog, pdx, pdz, PR + 0.8, { name: 'dog' });
  pubDog.setAction('sleep');
  // hens in Mr Grubb's garden
  const G = L.grubb;
  [[-1.5, 5.4], [0.6, 6.2]].forEach(([lx, lz], i) => {
    const [x, z] = local(G.x, G.z, G.ry, lx, lz);
    const hen = new Chicken({ seed: 40 + i });
    cast.animal(hen, x, z, rng.range(0, 6), { name: 'chicken' });
    hen.setAction('peck');
    new Walker(hen, [[x, z], [x + 1.2, z + 0.6], [x + 0.4, z - 1.1]], { loop: true, speed: 0.35, pauseAt: [{ index: 1, duration: 3, action: 'peck' }, { index: 2, duration: 2.5, action: 'idle' }] });
  });
  // sheep in the paddock over the west road
  const pk = D.paddock;
  for (let i = 0; i < 3; i++) {
    const sh = new Sheep({ seed: 70 + i });
    const x = rng.range(pk.x0 + 1.5, pk.x1 - 1.5), z = rng.range(pk.z0 + 2, pk.z1 - 2);
    cast.animal(sh, x, z, rng.range(0, 6), { name: 'sheep' });
    sh.setAction?.(i % 2 ? 'graze' : 'idle');
    new Walker(sh, [[x, z], [x + rng.range(-2, 2), z + rng.range(1.5, 3)], [x + rng.range(-2, 2), z - rng.range(1, 2)]], { loop: true, speed: 0.3, action: 'walk', pauseAt: [{ index: 1, duration: 6, action: 'graze' }, { index: 2, duration: 5, action: 'graze' }] });
  }
  every(ctx, () => rng.range(10, 18), () => ctx.sfx('baa', { position: new THREE.Vector3((pk.x0 + pk.x1) / 2, 1, (pk.z0 + pk.z1) / 2), volume: 0.7 }));
  // ducks on the pond
  const pond = D.pond;
  D.pondDucks = [0, 1, 2].map((i) => {
    const d = new Duck({ seed: 520 + i });
    cast.animal(d, pond.x, pond.z, 0, { y: pond.waterY, blob: false, name: 'duck' });
    d.setAction('swim');
    // ellipses inside the (0.8-squashed, rotated) pond
    const r = pond.r * (0.3 + i * 0.2), pts = circlePath(0, 0, r, 12, i).map(([x, z]) => {
      const zx = x, zz = z * 0.72, c = Math.cos(pond.ry), sn = Math.sin(pond.ry);
      return [pond.x + zx * c + zz * sn, pond.z - zx * sn + zz * c];
    });
    new Walker(d, pts, { loop: true, speed: 0.35 + i * 0.08, action: 'swim', variety: 0, reverse: i === 1, groundY: () => pond.waterY });
    return d;
  });
  // gulls wheeling over the square (the sea's not far)
  [[0, -6, 22, 19, false], [8, 2, 28, 23, true], [-12, -14, 18, 17, false]].forEach(([x, z, r, h, cwise], i) => {
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
    const A = new THREE.Vector3(), Bv = new THREE.Vector3(), P0 = new THREE.Vector3(), P1 = new THREE.Vector3(), sd = new THREE.Vector3(), dir = new THREE.Vector3();
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
        sd.crossVectors(dir, Y);
        if (sd.lengthSq() < 1e-6) sd.set(1, 0, 0);
        sd.normalize().multiplyScalar(0.045);
        const sag = r < dancers.length ? 0.25 : 0.05;
        for (let k = 0; k < SEG; k++) {
          pt(k / SEG, sag, P0);
          pt((k + 1) / SEG, sag, P1);
          const tw = Math.sin(t * 6 + r + k) * 0.02;
          const q = [P0.x - sd.x, P0.y - sd.y + tw, P0.z - sd.z, P0.x + sd.x, P0.y + sd.y - tw, P0.z + sd.z,
            P1.x + sd.x, P1.y + sd.y + tw, P1.z + sd.z, P1.x - sd.x, P1.y - sd.y - tw, P1.z - sd.z];
          pos.set([q[0], q[1], q[2], q[3], q[4], q[5], q[6], q[7], q[8], q[0], q[1], q[2], q[6], q[7], q[8], q[9], q[10], q[11]], o);
          o += 18;
        }
      }
      geo.attributes.position.needsUpdate = true;
      geo.computeVertexNormals();
    });
  }
  // a grandad snoozing in a deckchair
  D.deckchairs.slice(0, 1).forEach((dc, i) => {
    const [x, z] = local(dc.x, dc.z, dc.ry, 0, 0.22);
    cast.person({ seed: 4601 + i, age: 'elder', hat: { type: 'flatcap', color: '#8b6b4a' }, accessory: null, top: { type: 'cardigan', color: '#7d8595', sleeves: 'long' } },
      x, z, dc.ry, 'lie', { pose: 'deckchair', height: dc.seat }, { name: 'snoozer', lines: ['Zzz...', 'Wake me up for the cake judging.'] });
  });

  // ------------------------------------------------------------ vehicles on the ring road
  const bus = K.bus({ seed: 3, color: P.tomato });
  root.add(bus);
  ctx.surface(bus, 'metal');
  ctx.onUpdate(bus.userData.update);
  ctx.prop(bus, { surface: 'metal', onHit: () => { bus.userData.bump?.(0.8); ctx.sfx('honk', { position: worldPos(bus), pitch: 0.8 }); } });
  const busDrive = new Drive(bus, ROAD_PTS, { speed: 9, stops: [[D.busStopAt.x, D.busStopAt.z, 5]], wait: 14, start: 0.18, lane: 1.8, onStop: () => ctx.sfx('honk', { position: worldPos(bus), pitch: 0.75, volume: 0.6 }) });
  ctx.onUpdate((dt) => busDrive.update(dt));
  const car = K.car({ style: 'beetle', color: P.sunflower, seed: 5 });
  root.add(car);
  ctx.surface(car, 'metal');
  ctx.onUpdate(car.userData.update);
  ctx.prop(car, { surface: 'metal', onHit: () => { car.userData.bump?.(1); ctx.sfx('honk', { position: worldPos(car), pitch: 1.2 }); } });
  const carDrive = new Drive(car, ROAD_PTS.slice().reverse(), { speed: 11, wait: 9, start: 0.6, lane: 1.8 });
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
  const bikeDrive = new Drive(bike, ROAD_PTS, { speed: 4.2, wait: 11, start: 0.72, lane: 3.0 });
  ctx.onUpdate((dt) => { bikeDrive.update(dt); rider.speed = Math.max(0.2, bike.userData.speed * 0.25); });
  every(ctx, 14, () => { if (bike.visible) ctx.sfx('ding', { position: worldPos(bike), pitch: 1.35, volume: 0.5 }); });
  // parked on the flanks: a milk float by the east road, the tractor by the allotments
  const parked = [
    [K.car({ style: 'van', color: '#f4f7fb', seed: 12 }), 49.2, -6, Math.PI + 0.05],
    [K.car({ style: 'pickup', color: P.tomato, seed: 13 }), 49.4, -1.2, Math.PI - 0.08],
    [K.tractor({ seed: 14, color: '#4f9a3c' }), -50.2, 38.2, 0.5],
  ];
  for (const [o, x, z, ry] of parked) {
    put(root, o, x, z, ry);
    ctx.surface(o, 'metal');
    ctx.prop(o, { surface: 'metal', onHit: () => { o.userData.bump?.(1); ctx.sfx('honk', { position: worldPos(o), pitch: 0.9 + rng.range(0, 0.3) }); } });
    ctx.onUpdate(o.userData.update);
  }
  for (const o of D.parkedCars || []) ctx.prop(o, { surface: 'metal', onHit: () => { o.userData.bump?.(1); ctx.sfx('honk', { position: worldPos(o), pitch: 1.1 }); } });

  // (the village cricket match now lives in games.js with the 'catch the six' job)
  const cricket = J.games?.cricket;

  // ------------------------------------------------------------ a family picnic on the east lawn by the pond
  {
    const PX = 44.2, PZ = 37.2;
    const bl = picnicBlanket({ w: 2.2, d: 1.7, color: P.cobalt });
    put(root, bl, PX, PZ, 0.5);
    ctx.surface(bl, 'soft');
    S.batch.add(bl, 'soft');
    const dx = PX + 1.6, dz = PZ - 0.9;
    const dry = yawTo(v3(dx, 0, dz), v3(PX, 0, PZ + 1));
    const dc = deckchair({ colors: [P.tomato, '#fff8ee'], seed: 11 });
    put(root, dc, dx, dz, dry);
    ctx.surface(dc, 'soft');
    S.batch.add(dc, 'soft');
    const [mx, mz] = local(dx, dz, dry, 0, 0.22);
    cast.person({ seed: 3271, accessory: 'book', hat: { type: 'sunhat', color: '#fff1d6', band: P.bubblegum } }, mx, mz, dry, 'lie', { pose: 'deckchair', height: dc.userData.seat, awake: true }, { name: 'picnicker', lines: ['Pass the scotch eggs.', 'Was that a cricket ball?!'] });
    cast.person({ seed: 3272, accessory: null, top: { type: 'hawaiian', color: P.teal, color2: P.sunflower, sleeves: 'short' } }, PX - 0.2, PZ + 0.1, 0.5, 'lie', { pose: 'back', hatOverFace: true }, { name: 'picnicker', lines: ['Zzz... five more minutes...'] });
    const kid = cast.person({ age: 'kid', seed: 3273, accessory: null }, PX, PZ, 0, 'run', {}, { name: 'kid', lines: ['Wheee!', 'Dad! Dad! Watch this!'] });
    new Walker(kid, circlePath(PX - 0.4, PZ + 0.4, 3.3, 14), { loop: true, speed: 1.7, action: 'run', variety: 0 });
  }

  // ------------------------------------------------------------ chimney smoke (a few, lazily)
  const chimneys = [
    ...L.anchors.terraceChimneys.filter((_, i) => i % 2 === 0),
    ...(L.west[1]?.chimneys || []).slice(0, 1), ...(L.west[4]?.chimneys || []).slice(0, 1),
    ...L.anchors.pubChimneys.slice(0, 1), ...L.anchors.grubbChimneys.slice(0, 1), ...(L.extraChimneys || []).slice(0, 1),
  ];
  for (const c of chimneys) ctx.smoke(c.clone().add(v3(0, 0.25, 0)), { rate: rng.range(0.7, 1.1) });

  return { shoppers, jogger, owner, bigDog, painter, binMan, hatLady, cakeLady, busker, fans, stroller, bus, car, bike, cricket };
}

export { Drive, UP };
