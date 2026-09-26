// Puddleby Green: 10 contracts, 2 secret jobs and 3 Golden Spanners — each with a tell, a reaction
// and the villagers who care about it.
import * as THREE from 'three';
import * as K from '../../world/kit/props/index.js';
import { Duck, PigeonFlock, Walker } from '../../world/characters/index.js';
import { P } from '../../gfx/palette.js';
import { materials } from '../../gfx/materials.js';
import { put, local, yawTo, facePerch, worldPos, NoteFountain, PropIcon, wateringCan, Leash, v3, circlePath, TAU, routine, every } from './util.js';
import { buntingBundle } from './custom.js';
import { FOUNTAIN } from './layout.js';

const UP = new THREE.Vector3(0, 1, 0);
const FC = new THREE.Vector3(FOUNTAIN[0], 0, FOUNTAIN[1]);

export function buildJobs(ctx, S, L, D) {
  const root = ctx.root;
  const cast = S.cast;
  const rng = ctx.rng;
  const J = {};
  const open = (id) => ctx.jobs.get(id)?.state === 'open';
  /** Chatter that moves on once a job is done (or botched). */
  const until = (id, before, after, failed = before) => () => {
    const st = ctx.jobs.get(id)?.state;
    return st === 'done' ? after : st === 'failed' ? failed : before;
  };

  // ================================================================ 1. fountain
  const fountain = L.fountain;
  const valve = fountain.userData.parts.valve;
  const tapper = cast.person({ preset: 'kid', seed: 3101, accessory: null, hair: { style: 'short', color: P.hair[1] }, top: { type: 'stripes', color: P.teal, color2: '#fff8ee', sleeves: 'short' } },
    -2.3, -7.75, 0, 'point', {}, { name: 'kid-tapper', lines: until('fountain', ["It's broken!", 'Plip... plip... plip.', 'Mum, the fountain is sulking.'], ['Splashy splashy!', 'Look, DUCKS!', 'It works! It WORKS!']) });
  tapper.faceTowards(FC);
  const basinPt = new THREE.Vector3(-1.2, 0.8, -10.2);
  tapper.pointAt(basinPt);
  const tapperR = routine(ctx, tapper, [['point', 3.5, { at: basinPt }], ['scratch', 2.4], ['point', 2.8, { at: basinPt }], ['shrug', 2]]);
  // ducks + bathing pigeons appear once it flows
  const ducks = [0, 1, 2].map((i) => {
    const d = new Duck({ seed: 500 + i });
    cast.animal(d, 0, -12, 0, { y: 0.62, blob: false, name: 'duck' });
    d.root.visible = false;
    d.swim = { a: i * 2.1, r: 2.25 + (i % 2) * 0.35, sp: 0.22 + i * 0.05, arrive: -1 };
    return d;
  });
  const bathers = new PigeonFlock({ seed: 71, count: 4, area: { x: FOUNTAIN[0] - 2.15, z: FOUNTAIN[1] + 0.9, r: 0.75 }, groundY: 0.5 });
  bathers.root.visible = false;
  ctx.flock(bathers);
  for (const b of bathers.birds) { ctx.bystander(b.root, { actor: b, name: 'pigeon' }); b.mesh.castShadow = false; }
  ctx.onUpdate((dt, t) => {
    for (const d of ducks) {
      const u = d.swim;
      if (!d.root.visible) continue;
      u.a += dt * u.sp;
      const tx = FOUNTAIN[0] + Math.cos(u.a) * u.r, tz = FOUNTAIN[1] + Math.sin(u.a) * u.r;
      if (u.arrive >= 0 && u.arrive < 1) {
        u.arrive = Math.min(1, u.arrive + dt / 2.6);
        const k = u.arrive;
        d.root.position.set(tx + (1 - k) * 14, 0.62 + (1 - k) * (1 - k) * 16, tz - (1 - k) * 10);
        if (k >= 1) d.setAction('swim');
        else if (k > 0.8 && d.action !== 'land') d.setAction('land');
      } else d.root.position.set(tx, 0.62, tz);
      d.root.rotation.y = -u.a + (u.arrive >= 1 ? 0 : 0.5);
      if (u.arrive >= 1 && Math.sin(t * 0.7 + u.a * 3) > 0.97 && d.action === 'swim') { d.setAction('dabble'); ctx.delay(1.6, () => d.setAction('swim')); }
    }
  });
  ctx.job({
    id: 'fountain', title: "Fountain's gone dry", clue: "The fountain's sulking. Something's stuck tight.",
    hint: 'A little red wheel at the foot of the fountain.', reward: 40, targets: [valve], focus: valve,
    onComplete() {
      fountain.userData.setFlowing(true);
      const vp = worldPos(valve);
      ctx.sfx('creak', { position: vp, pitch: 1.3 });
      ctx.delay(0.5, () => { ctx.sfx('splash', { position: FC.clone().setY(4) }); ctx.fx.burst('water', FC.clone().setY(4.6), UP, { scale: 1.6 }); });
      ctx.delay(1.1, () => { ctx.sfx('splash', { position: FC.clone().setY(1), pitch: 0.8 }); ctx.fx.burst('water', FC.clone().add(v3(2.5, 1, 0)), UP, { scale: 1.2 }); });
      ctx.delay(1.4, () => { ctx.sfx('crowdCheer', { position: FC.clone().setY(1) }); cast.cheerNear(FC, 18, { except: [tapper], say: 'Hooray! Water!' }); });
      tapperR.on = false;
      tapper.pointAt(null);
      tapper.perform('cheer', 2.5);
      ctx.delay(2.6, () => tapper.setAction('dance'));
      J.fountainKids?.forEach((k) => k.celebrate());
      ctx.delay(2.2, () => {
        bathers.root.visible = true;
        bathers.birds.forEach((b, i) => { b.root.position.y = 8 + i; b.controller.takeOff(b.root.position.clone().add(v3(0.3, -1, 0.2))); });
        ctx.sfx('pigeonFlap', { position: FC.clone().setY(3) });
      });
      ducks.forEach((d, i) => ctx.delay(3 + i * 0.8, () => { d.root.visible = true; d.swim.arrive = 0; d.setAction('fly'); ctx.sfx('quack', { position: FC.clone().setY(2), pitch: 0.9 + i * 0.1 }); }));
    },
  });
  J.tapper = tapper;

  // ================================================================ 2. wedding bell (needs a DING and a DONG)
  const church = L.church;
  const bell = church.userData.parts.bell;
  const cw = (lx, lz) => { const [x, z] = local(L.churchAt.x, L.churchAt.z, L.churchAt.ry, lx, lz); return new THREE.Vector3(x, 0, z); };
  const CR = L.churchAt.ry;
  const bride = cast.person({ preset: 'bride', seed: 1201 }, 0, 0, CR, 'lookUp', {}, { name: 'bride', lines: until('bell', ['Why won\'t it ring?', 'Ding... dong... anyone?', 'Best day ever! Nearly.'], ['Best day EVER!', 'Ding dong! Ding dong!']) });
  const groom = cast.person({ preset: 'groom', seed: 1202 }, 0, 0, CR, 'lookUp', {}, { name: 'groom', lines: until('bell', ['The bell-ringer overslept.', 'Just one ding-dong, please!'], ['I do! I mean... I did!', 'Who wants cake?']) });
  // on the church path just outside the gate — the right-hand half of it, which the west row doesn't hide
  bride.root.position.copy(cw(3.4, 10.9));
  groom.root.position.copy(cw(4.4, 11.0));
  const vicar = cast.person({ preset: 'vicar', seed: 1203 }, 0, 0, 0, 'checkWatch', {}, { name: 'vicar', lines: until('bell', ['Any minute now...', 'Tick tock, tick tock.', 'Dearly beloved... er...'], ['Bless you, whoever you are.', 'Dearly beloved... we made it.']) });
  vicar.root.position.copy(cw(2.4, 12.2));
  vicar.faceTowards(cw(3.9, 11.0));
  // two staggered rows so nobody hides anybody from the perch (sight line ≈ local (-0.11, 0.99))
  const guestSpots = [[6.3, 10.9, 'impatient'], [7.3, 11.1, 'talk'], [5.35, 12.3, 'clap'], [8.2, 12.3, 'talk']];
  const guests = guestSpots.map(([lx, lz, act], i) => {
    const g = cast.person({ seed: 1210 + i, hat: i === 0 ? { type: 'sunhat', color: '#ffb8c2', band: P.violet } : i === 3 ? { type: 'tophat', color: '#3d4a6b' } : undefined, top: i === 1 ? { type: 'dress', color: P.violet } : i === 3 ? { type: 'suit', color: '#5b6b7a' } : undefined, accessory: null, age: 'adult' },
      0, 0, 0, act, {}, { name: 'guest', lines: until('bell', ['What a lovely couple.', 'Is it time for cake yet?', 'Ooh, I do love a wedding.'], ['Throw the bouquet!', 'Is it time for cake yet?', 'I always cry at weddings.']) });
    g.root.position.copy(cw(lx, lz));
    g.faceTowards(cw(3.9, 11.0));
    return g;
  });
  const vicarR = routine(ctx, vicar, [['checkWatch', 3.2], ['shrug', 1.8], ['lookUp', 2.6]], 1);
  const brideR = routine(ctx, bride, [['lookUp', 3.4], ['idle', 1.6], ['lookUp', 2.4], ['shrug', 1.6]], 0.5);
  const door = L.anchors.churchDoor;
  let dings = 0;
  const ringRound = (n, gap = 1.25, pitch = 1) => {
    for (let i = 0; i < n; i++) ctx.delay(i * gap, () => { church.userData.ringBell(0.8); ctx.sfx('bell', { position: worldPos(bell), pitch: i % 2 ? pitch * 0.84 : pitch }); });
  };
  ctx.job({
    id: 'bell', title: 'Wedding bells', clue: 'The happy couple are waiting for a ding-dong.', hint: 'Up in the church tower. Once for DING, once for DONG.',
    reward: 60, needed: 2, targets: [bell], focus: bell,
    onHit() {
      const bp = worldPos(bell);
      church.userData.ringBell(1.15);
      ctx.sfx('bell', { position: bp, pitch: dings === 0 ? 1 : 0.84 });
      ctx.popText(bp.clone().add(v3(0, 1.6, 0)), dings === 0 ? 'DING!' : 'DONG!', { cls: 'pop-big', duration: 1.6 });
      if (dings === 0) {
        bride.perform('cheer', 1.4);
        ctx.delay(0.9, () => { if (dings < 2) cast.say(groom, 'That\'s the ding! Now the dong!', 2.6); });
      }
      dings++;
      return 'progress';
    },
    onComplete() {
      vicarR.on = false;
      brideR.on = false;
      ringRound(6, 1.3, 1);
      const conf = cw(3.9, 11.4).setY(3.4); // over the couple (the church door itself is hidden from the perch)
      for (let i = 0; i < 4; i++) ctx.delay(0.3 + i * 0.45, () => ctx.fx.burst('confetti', conf.clone().add(v3(rng.range(-1.5, 1.5), rng.range(0, 1), rng.range(-1, 1))), UP, { scale: 1.1 }));
      ctx.delay(0.6, () => ctx.sfx('crowdCheer', { position: door }));
      bride.faceTowards(groom.root.position);
      groom.faceTowards(bride.root.position);
      bride.setAction('idle'); groom.setAction('idle');
      cast.hush(bride, groom, vicar, ...guests);
      bride.celebrate(); groom.celebrate();
      ctx.delay(3.0, () => { bride.celebrate(); groom.celebrate(); cast.say(bride, 'Mwah!', 1.6); ctx.fx.burst('pop', worldPos(bride.root).lerp(worldPos(groom.root), 0.5).add(v3(0, 2, 0)), UP, { scale: 0.9, color: ['#ff6b8a', '#ff9ec4', '#fff8ee'] }); });
      ctx.delay(4.6, () => { bride.setAction('dance'); groom.setAction('dance'); });
      vicar.setAction('cheer');
      guests.forEach((g, i) => ctx.delay(0.2 * i, () => { g.setAction(i % 2 ? 'clap' : 'cheer'); g.celebrate(); ctx.fx.burst('pop', worldPos(g.root).add(v3(0, 1.8, 0)), UP, { scale: 0.8 }); }));
      ctx.delay(0.6, () => cast.say(vicar, 'You may now kiss the bride!', 2.3));
    },
  });
  J.wedding = [bride, groom, vicar, ...guests];

  // ================================================================ 3. wonky pub sign
  const pub = L.pub;
  const bolt = pub.userData.parts.bolt;
  const pw = (lx, lz) => { const [x, z] = local(L.pubAt.x, L.pubAt.z, L.pubAt.ry, lx, lz); return new THREE.Vector3(x, 0, z); };
  const landlord = cast.person({ seed: 1301, top: { type: 'apron', color: '#fbf7f0', color2: '#fbf7f0', apronStripe: '#2f7d62', sleeves: 'short' }, bottom: { type: 'trousers', color: '#34384a' }, hair: { style: 'balding', color: '#5a3a22' }, facial: 'handlebar', hat: null, accessory: null, build: { belly: 1, width: 1.25 } },
    0, 0, 0, 'scratch', {}, { name: 'landlord', lines: until('sign', ['Wonky again! Every blooming week.', 'Can\'t have a wonky sign at the Wonky Pint.', 'Fancy a pint?'], ['Straight as a die!', 'Fancy a pint?', 'Best sign in the county, that.']) });
  landlord.root.position.copy(pw(-4.4, 6.5));
  const signPos = worldPos(pub.userData.parts.signPivot);
  landlord.faceTowards(signPos);
  landlord.lookAt(signPos);
  const landlordR = routine(ctx, landlord, [['scratch', 2.8], ['point', 2.4, { at: signPos }], ['shrug', 1.8], ['idle', 2.2]], 0.8);
  every(ctx, () => rng.range(6.5, 10.5), () => ctx.sfx('creak', { position: signPos, volume: 0.55 }), { cond: () => open('sign'), start: 3 });
  ctx.job({
    id: 'sign', title: 'Wonky pub sign', clue: "Landlord says his sign's gone all wonky. Again.", hint: 'Look where the chain is hanging loose.',
    reward: 50, targets: [bolt], focus: bolt,
    onComplete() {
      pub.userData.fixSign();
      ctx.sfx('spring', { position: signPos });
      ctx.delay(0.5, () => ctx.sfx('ding', { position: signPos, pitch: 1.2 }));
      ctx.delay(0.75, () => ctx.sfx('ding', { position: signPos, pitch: 1.6 }));
      ctx.delay(0.6, () => ctx.popText(signPos.clone().add(v3(0, 1.2, 0)), 'TA-DA!', { cls: 'pop-big' }));
      landlordR.on = false;
      landlord.lookAt(null);
      landlord.setAction('cheer');
      ctx.delay(2.2, () => landlord.setAction('wave'));
      cast.say(landlord, 'Lovely job! First pint\'s on me!', 3);
      ctx.delay(0.8, () => cast.cheerNear(signPos, 9, { except: [landlord] }));
    },
  });
  J.landlord = landlord;

  // ================================================================ 4. bunting for the fête
  const po = L.postOffice;
  const DIRW = [-Math.cos(L.rotW), Math.sin(L.rotW)], NW = [Math.sin(L.rotW), Math.cos(L.rotW)];
  const hook = new THREE.Vector3(po.front[0] + DIRW[0] * 3.1 + NW[0] * 0.32, 5.25, po.front[1] + DIRW[1] * 3.1 + NW[1] * 0.32);
  const lampTop = (k) => new THREE.Vector3(D.lamps[k].x, D.lamps[k].top, D.lamps[k].z);
  const lines = [
    [hook, lampTop('NW'), 1.3], [lampTop('NW'), lampTop('NE'), 0.9], [lampTop('NE'), lampTop('SE'), 0.9],
    [lampTop('SE'), lampTop('SW'), 0.9], [lampTop('SW'), lampTop('NW'), 0.9],
  ].map(([a, b, sag], i) => {
    const bn = K.bunting({ from: a, to: b, sag, furled: true, seed: 20 + i, spacing: 0.6, flagSize: 0.46 });
    root.add(bn);
    ctx.onUpdate(bn.userData.update);
    ctx.surface(bn, 'soft');
    if (i > 0) bn.visible = false;
    return bn;
  });
  const coil = lines[0].userData.parts.coil;
  // the big furled bundle on its bracket (reads at 85 m; the kit coil hides inside it)
  const bracket = buntingBundle({ out: 0.62 });
  put(root, bracket, po.front[0] + DIRW[0] * 3.1, po.front[1] + DIRW[1] * 3.1, L.rotW, hook.y - 0.07);
  const bundle = bracket.userData.parts.bundle;
  ctx.collider(bundle, new THREE.SphereGeometry(0.62, 8, 6), { y: -0.46 });
  ctx.surface(bracket, 'soft');
  const postie = cast.person({ seed: 1401, hair: { style: 'bun', color: P.hair[4] }, glasses: 'round', top: { type: 'cardigan', color: P.tomato, sleeves: 'long' }, bottom: { type: 'skirt', color: '#3d4a6b' }, accessory: null, age: 'elder' },
    0, 0, 0, 'lookUp', {}, { name: 'postmistress', lines: until('bunting', ['Who hung the bunting on MY hook?', 'The fête starts at two!', 'Too high for my old arms.'], ['Doesn\'t the square look grand?', 'The fête starts at two!', 'Flags! Proper flags!']) });
  postie.root.position.set(po.front[0] + DIRW[0] * 2.6 + NW[0] * 2.4, 0, po.front[1] + DIRW[1] * 2.6 + NW[1] * 2.4);
  postie.faceTowards(hook);
  postie.lookAt(hook);
  const postieR = routine(ctx, postie, [['lookUp', 3], ['point', 2.4, { at: hook }], ['shrug', 1.6]], 1.5);
  ctx.job({
    id: 'bunting', title: 'Bunting for the fête', clue: "Can't have a fête without bunting!", hint: 'A coil of flags hanging on a hook by the post office.',
    reward: 40, targets: [bundle, coil], focus: bundle,
    onComplete() {
      const b0 = bundle.scale.x;
      ctx.tweens.run(0.5, (k) => { bundle.scale.setScalar(Math.max(0.001, b0 * (1 - k))); bundle.rotation.x = k * 5; }, { onComplete: () => { bundle.visible = false; } });
      ctx.fx.burst('pop', worldPos(bundle).add(v3(0, -0.4, 0)), UP, { scale: 1.2 });
      lines[0].userData.setFurled(false);
      ctx.sfx('whoosh', { position: hook });
      lines.slice(1).forEach((bn, i) => ctx.delay(1.2 + i * 0.85, () => {
        bn.visible = true;
        bn.userData.setFurled(false);
        const a = bn.userData.parts.hooks?.[0];
        ctx.sfx('whoosh', { position: a ? worldPos(a) : FC, pitch: 1.1 + i * 0.08 });
      }));
      ctx.delay(3.6, () => { ctx.sfx('crowdCheer', { position: FC.clone().setY(2) }); cast.cheerNear(FC, 26, { say: 'Now THAT is a fête!' }); });
      postieR.on = false;
      postie.lookAt(null);
      postie.setAction('clap');
      ctx.delay(3, () => postie.setAction('wave'));
    },
  });
  J.bunting = lines;
  J.postie = postie;

  // ================================================================ 5. Mrs Crumb's pigeons (flour sack = wrong bag!)
  const cb = D.crumbBench;
  const bw = (lx, lz) => { const [x, z] = local(cb.x, cb.z, cb.ry, lx, lz); return new THREE.Vector3(x, 0, z); };
  const crumb = cast.person({ preset: 'oldLady', seed: 1501 }, 0, 0, cb.ry, 'sit', { height: 0.5 }, { name: 'Mrs Crumb', lines: until('pigeons', ['Come on, my little dears...', 'My arms are ever so tired.', 'That\'s the seed bag, dear. The brown one.'], ['Look at them tuck in!', 'Not so fast, Gerald!', 'Who\'s a hungry boy, then?'], ['My flour! My lovely flour!', 'No cakes this year, dears.']) });
  crumb.root.position.copy(bw(-0.5, 0.27));
  const bag = K.birdseedBag({ seed: 3 });
  put(root, bag, bw(0.35, -0.02).x, bw(0.35, -0.02).z, cb.ry, 0.51);
  bag.userData.parts.spill.position.set(0.1, -0.51, 0.95);
  ctx.onUpdate(bag.userData.update);
  const flour = K.sack({ seed: 88, color: '#fbf7f0', label: P.tomato });
  flour.scale.setScalar(0.72);
  put(root, flour, bw(1.35, 0.32).x, bw(1.35, 0.32).z, cb.ry - 0.3);
  ctx.collider(flour, new THREE.SphereGeometry(0.42, 8, 6), { y: 0.36 });
  const flock = new PigeonFlock({ seed: 42, count: 12, area: { x: -14, z: -15, w: 7, d: 6 } });
  ctx.flock(flock);
  for (const b of flock.birds) { ctx.bystander(b.root, { actor: b, name: 'pigeon' }); b.mesh.castShadow = false; }
  S.flock = flock;
  ctx.job({
    id: 'pigeons', title: 'Feed the pigeons', clue: "Mrs Crumb's arms are too tired to open her seed bag.", hint: 'On her bench — the bag with the bird on it.',
    reward: 40, targets: [bag.userData.parts.bag], failTargets: [flour], focus: bag,
    onComplete() {
      bag.userData.spill();
      const sp = worldPos(bag.userData.parts.spill);
      flock.area = { x: sp.x, z: sp.z + 0.6, r: 1.5 };
      ctx.delay(0.35, () => { flock.scare(sp, 400); ctx.sfx('pigeonFlap', { position: sp.clone().setY(1) }); });
      for (let i = 0; i < 4; i++) ctx.delay(3.5 + i * 0.7, () => ctx.sfx('coo', { position: sp, pitch: 0.9 + i * 0.07 }));
      crumb.celebrate();
      cast.say(crumb, 'Ooh, lovely! Tuck in, my dears!', 3);
      ctx.delay(2.5, () => crumb.celebrate());
    },
    onFail() {
      const fp = worldPos(flour).add(v3(0, 0.5, 0));
      for (let i = 0; i < 4; i++) ctx.delay(i * 0.12, () => ctx.fx.burst('smoke', fp.clone().add(v3(rng.range(-0.4, 0.4), i * 0.3, rng.range(-0.4, 0.4))), UP, { scale: 2.6, color: ['#ffffff', '#f7f2ea'] }));
      ctx.fx.burst('dust', fp, UP, { scale: 1.5 });
      ctx.sfx('hitSoft', { position: fp, pitch: 0.7 });
      flour.scale.set(0.8, 0.45, 0.8);
      flock.scare(fp, 30);
      crumb.icon.show('anger', 2);
      cast.say(crumb, 'Not the FLOUR! That was for the cakes!', 3.2);
    },
  });
  J.crumb = crumb;

  // ================================================================ 6. the ice-cream van jingle
  const van = K.iceCreamVan({ seed: 2 });
  const VAN = [54.3, 3.6];
  put(root, van, VAN[0], VAN[1], Math.PI);
  ctx.surface(van, 'metal');
  ctx.onUpdate(van.userData.update);
  van.userData.jingle(true);
  ctx.prop(van, { surface: 'metal', onHit: () => { van.userData.bump?.(1); ctx.sfx('honk', { position: worldPos(van) }); } });
  const speaker = van.userData.parts.speaker;
  const notes = new NoteFountain(root, speaker, { count: 4, size: 0.75, height: 2.8 });
  ctx.onUpdate((dt, t) => notes.update(dt, t));
  let jingleOn = true;
  const TUNE = [0, 4, 7, 12, 11, 7, 9, 5, 7, 4, 2, 0, 0, 0];
  const BEAT = [1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2];
  const playJingle = () => {
    const pos = worldPos(speaker);
    let t = 0;
    TUNE.forEach((n, i) => { ctx.sfx('ding', { position: pos, pitch: 0.52 * 2 ** (n / 12), volume: 0.7, delay: t, variance: 0 }); t += BEAT[i] * 0.17; });
  };
  every(ctx, 6.4, playJingle, { cond: () => jingleOn, start: 1.5 });
  const vw = (lx, lz) => { const [x, z] = local(VAN[0], VAN[1], Math.PI, lx, lz); return new THREE.Vector3(x, 0, z); };
  const vanMan = cast.person({ seed: 1601, hat: { type: 'cap', color: P.bubblegum, color2: '#fff8ee' }, top: { type: 'apron', color: '#fff8ee', color2: '#ff9ec4', apronStripe: P.bubblegum, sleeves: 'short' }, bottom: { type: 'trousers', color: '#3d5a8a' }, facial: 'moustache', accessory: null },
    0, 0, 0, 'talk', {}, { name: 'ice-cream man', lines: until('icecream', ['It won\'t switch off!', 'Same tune since breakfast...', 'Ninety-nines! Get your ninety-nines!'], ['Lovely and quiet now.', 'Ninety-nines! Get your ninety-nines!', 'Anyone seen a spanner?']) });
  vanMan.root.position.copy(vw(2.25, -0.4));
  vanMan.root.rotation.y = -Math.PI / 2;
  const queue = [[3.7, 0.1, 'impatient']].map(([lx, lz, act], i) => {
    const q = cast.person({ seed: 1610 + i, accessory: act === 'eat' ? 'icecream' : null }, 0, 0, Math.PI / 2, act, {}, { name: 'customer', lines: until('icecream', ['This tune is doing my head in.', 'Two scoops, please!'], ['Ahh. Peace at last.', 'Two scoops, please!']) });
    q.root.position.copy(vw(lx, lz));
    q.faceTowards(vanMan.root.position);
    return q;
  });
  const vanManR = routine(ctx, vanMan, [['talk', 3], ['shrug', 1.8], ['point', 2, { at: speaker }], ['scratch', 2]], 2);
  ctx.job({
    id: 'icecream', title: 'That blasted jingle', clue: "The ice-cream van jingle's stuck on repeat. Make it stop!", hint: 'Follow the music to the van roof.',
    reward: 50, targets: [speaker], focus: speaker,
    onComplete() {
      const sp = worldPos(speaker);
      van.userData.breakSpeaker?.();
      notes.on = false;
      jingleOn = false;
      ctx.fx.burst('metal', sp, UP, { scale: 1.6 });
      ctx.sfx('clang', { position: sp });
      ctx.delay(0.25, () => ctx.sfx('spring', { position: sp, pitch: 0.7 }));
      for (let i = 0; i < 5; i++) ctx.delay(0.2 + i * 0.35, () => ctx.fx.burst('smoke', sp.clone().add(v3(0, 0.3, 0)), UP, { scale: 0.7, color: ['#b9bcc6', '#8d92a0'] }));
      vanManR.on = false;
      vanMan.perform('cheer', 2.2);
      ctx.delay(2.3, () => vanMan.setAction('wave'));
      cast.say(vanMan, 'Peace and quiet at last!', 3);
      queue.forEach((q) => q.celebrate());
    },
  });
  J.vanMan = vanMan;

  // ================================================================ 7. wake the postman
  const pb = D.peteBench;
  const pbw = (lx, lz) => { const [x, z] = local(pb.x, pb.z, pb.ry, lx, lz); return new THREE.Vector3(x, 0, z); };
  const pete = cast.person({ preset: 'postman', seed: 1701 }, 0, 0, pb.ry, 'sleep', { height: 0.5 }, { name: 'Postie Pete', lines: until('postman', ['Zzz... first class... zzz', 'Mmm... five more minutes...'], ['Post! Morning! Post!', 'Letters! Parcels!', 'Nobody tell the boss.']) });
  pete.root.position.copy(pbw(-0.45, 0.27));
  const clock = K.alarmClock({ seed: 5, size: 0.75, color: P.tomato });
  put(root, clock, pbw(0.55, -0.02).x, pbw(0.55, -0.02).z, pb.ry - 0.35, 0.51);
  ctx.collider(clock, new THREE.SphereGeometry(0.42, 8, 6), { y: 0.3 });
  ctx.onUpdate(clock.userData.update);
  const doors = L.anchors.terraceDoors.slice().sort((a, b) => b.x - a.x);
  const round = [
    [pete.root.position.x, pete.root.position.z], [pb.x - 1.2, pb.z + 1.6], [26, -42.6],
    ...doors.map((d) => [d.x, d.z + 1.2]),
    [-19, -42.4], [-26.5, -40.2], [-29.8, -33],
  ];
  ctx.job({
    id: 'postman', title: 'Wake the postman', clue: "Postie Pete's nodded off. The letters won't deliver themselves.", hint: 'Something on the bench beside him could make a racket.',
    reward: 50, targets: [clock], focus: clock,
    onComplete() {
      clock.userData.ring(true);
      const cp = worldPos(clock);
      for (let i = 0; i < 18; i++) ctx.sfx('ding', { position: cp, pitch: 1.55 + (i % 2) * 0.12, volume: 0.7, delay: i * 0.075, variance: 0 });
      ctx.delay(0.5, () => {
        pete.setAction('panic');
        pete.icon.show('surprise', 1.4);
        cast.say(pete, "I'm up! I'm up! The post!", 2.6);
      });
      ctx.delay(1.6, () => clock.userData.ring(false));
      ctx.delay(2.4, () => {
        const pauses = doors.map((_, i) => ({ index: 3 + i, duration: 1.4, action: 'point', actionOptions: { at: doors[i].clone().setY(1.2) } }));
        new Walker(pete, round, { speed: 1.45, pingPong: true, pauseAt: pauses });
      });
    },
  });
  J.pete = pete;

  // ================================================================ 8. free the kite
  const oak = L.oakAt;
  const toPerch = new THREE.Vector2(-oak.x, 62 - oak.z).normalize();
  const knotPos = new THREE.Vector3(oak.x + toPerch.x * 5.9, 7.6, oak.z + toPerch.y * 5.9);
  const kite = K.kite({ seed: 6, colors: [P.tomato, P.sunflower] });
  kite.scale.setScalar(1.75);
  put(root, kite, knotPos.x, knotPos.z, facePerch(knotPos.x, knotPos.z), knotPos.y);
  ctx.surface(kite, 'soft');
  ctx.onUpdate(kite.userData.update);
  // the branch it is snagged on
  const bFrom = new THREE.Vector3(oak.x + toPerch.x * 3.2, 7.9, oak.z + toPerch.y * 3.2);
  const branchGeo = new THREE.CylinderGeometry(0.07, 0.13, bFrom.distanceTo(knotPos) + 0.3, 6);
  const branch = new THREE.Mesh(branchGeo, materials.solid(P.woodDark, { roughness: 0.8 }));
  branch.position.copy(bFrom).lerp(knotPos, 0.5);
  branch.quaternion.setFromUnitVectors(UP, knotPos.clone().sub(bFrom).normalize());
  branch.castShadow = true;
  root.add(branch);
  ctx.surface(branch, 'wood');
  const poppy = cast.person({ preset: 'kid', seed: 1801, accessory: null, hair: { style: 'pigtails', color: P.hair[6], tie: P.sunflower }, top: { type: 'dress', color: P.bubblegum, sleeves: 'short' } },
    0, 0, 0, 'point', { at: knotPos }, { name: 'Poppy', lines: until('kite', ['My kite! It\'s stuck!', 'Silly tree ate my kite.', 'Can you get it down, mister?'], ['Wheee!', 'Look how high it goes!', 'Thank you, mister!']) });
  poppy.root.position.set(oak.x - 6.4, 0, oak.z + 4.2);
  poppy.faceTowards(knotPos);
  const poppyR = routine(ctx, poppy, [['point', 3, { at: knotPos }], ['shrug', 1.6], ['lookUp', 2.4]], 2);
  let kiteFollow = false;
  const kitePivot = kite.userData.parts.kite;
  const string = new Leash(root, '#fff8ee', 0.012);
  string.mesh.visible = false;
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _k = new THREE.Vector3();
  // once freed the kite flies high and downwind of Poppy (above every roof, so it reads from the perch)
  ctx.onUpdate((dt, t) => {
    if (!kiteFollow) return;
    const pr = poppy.root;
    _k.copy(pr.position).add(_a.set(Math.sin(t * 0.45) * 1.8, 10.8 + Math.sin(t * 1.1) * 0.6, -5.5));
    kite.position.lerp(_k, 1 - Math.exp(-dt * 1.1));
    poppy.bones.handR.getWorldPosition(_a);
    kitePivot.getWorldPosition(_b);
    string.set(_a, _b);
  });
  ctx.job({
    id: 'kite', title: 'Free the kite', clue: "Little Poppy's kite is stuck up the big oak.", hint: 'Snip the tangled string on the branch.',
    reward: 60, targets: [kite.userData.parts.knot, kitePivot], focus: kite.userData.parts.knot,
    onComplete() {
      kite.userData.free();
      L.oak.userData.wobble(0.8);
      ctx.fx.burst('leaves', knotPos, UP, { scale: 1.4 });
      ctx.sfx('hitSoft', { position: knotPos });
      ctx.delay(0.2, () => ctx.sfx('whoosh', { position: knotPos, pitch: 1.2 }));
      poppyR.on = false;
      poppy.pointAt(null);
      poppy.perform('cheer', 2.4);
      cast.say(poppy, 'Yay! My kite!', 2.4);
      ctx.delay(2.6, () => {
        kiteFollow = true;
        string.mesh.visible = true;
        // laps of the lawn in the gap between the cottages (the stretch you can see from the perch)
        const o = L.oakAt, pp = poppy.root.position;
        new Walker(poppy, [[pp.x, pp.z], [o.x - 5.5, o.z - 0.8], [o.x - 3.4, o.z - 8], [o.x - 1.2, o.z - 5.2], [o.x - 2.4, o.z + 1.8]], { loop: true, speed: 2.4, action: 'run' });
      });
    },
  });
  J.poppy = poppy;

  // ================================================================ 9. tourist selfie (needs the fountain running)
  const u = new THREE.Vector2(0.94, -0.34).normalize();
  const pr = new THREE.Vector2(-u.y, u.x);
  const T0 = new THREE.Vector3(FC.x + u.x * 8.7, 0, FC.z + u.y * 8.7);
  const camPos = new THREE.Vector3(FC.x + u.x * 12.7, 0, FC.z + u.y * 12.7);
  const camT = K.cameraOnTripod({ seed: 7, color: P.tomato });
  put(root, camT, camPos.x, camPos.z, yawTo(camPos, T0));
  ctx.surface(camT, 'metal');
  ctx.onUpdate(camT.userData.update);
  const tourists = [0.6, -0.6].map((s, i) => {
    const t = cast.person({ preset: 'tourist', seed: 1901 + i, accessory: null, top: i ? { type: 'hawaiian', color: P.tomato, color2: P.sunflower, sleeves: 'short' } : undefined, hat: i ? { type: 'sunhat', color: '#f2d27a', band: P.teal } : undefined },
      T0.x + pr.x * s, T0.z + pr.y * s, 0, 'shrug', {}, { name: 'tourist', lines: () => (open('fountain') ? ['Shame the fountain\'s off.', 'Not very photogenic, is it?'] : open('selfie') ? ['Say cheese!', 'Can anyone reach the button?', 'Perfect with the fountain!'] : ['What a lovely village!', 'Wait till they see this back home!']) });
    t.faceTowards(FC);
    return t;
  });
  const tourR = tourists.map((t, i) => routine(ctx, t, [['shrug', 2.2], ['scratch', 2.4], ['idle', 2]], i * 1.3));
  ctx.job({
    id: 'selfie', title: 'Tourist selfie', clue: "The tourists can't reach their camera button.", hint: 'They want the fountain in the picture first.',
    reward: 40, requires: ['fountain'], targets: [camT.userData.parts.camera], focus: camT.userData.parts.camera,
    onComplete() {
      camT.userData.snap();
      const cp = worldPos(camT.userData.parts.camera);
      ctx.sfx('tick', { position: cp, pitch: 0.8 });
      ctx.delay(0.05, () => ctx.sfx('pop', { position: cp, pitch: 1.8, volume: 0.6 }));
      ctx.delay(0.3, () => ctx.fx.burst('stars', cp.clone().add(v3(0, 0.3, 0)), UP, { scale: 0.6 }));
      tourists.forEach((t, i) => { tourR[i].on = false; t.perform('cheer', 2.4); t.celebrate(); });
      ctx.delay(2.6, () => { tourists[0].setAction('dance'); tourists[1].setAction('clap'); });
      cast.say(tourists[1], 'Perfect! One for the fridge!', 2.8);
    },
  });
  // once the fountain flows the tourists turn and pose for the camera
  let posed = false;
  ctx.onUpdate(() => {
    if (posed || open('fountain')) return;
    posed = true;
    tourists.forEach((t, i) => {
      tourR[i].steps = [['wave', 2.6], ['point', 1.8, { at: camPos.clone().setY(1.3) }], ['wave', 2.2], ['shrug', 1.6]];
      tourR[i].t = 0.5 + i * 0.4;
      t.faceTowards(camPos);
    });
    cast.say(tourists[0], 'Ooh! Photo time!', 2.4);
  });
  J.tourists = tourists;

  // ================================================================ 10. Mr Grubb's leaky tap
  const G = L.grubb;
  const gw = (lx, lz) => { const [x, z] = local(G.x, G.z, G.ry, lx, lz); return new THREE.Vector3(x, 0, z); };
  const tap = K.gardenTap({ seed: 8, mount: 'wall', under: 'none', dripping: true });
  // between the front door and the right-hand window box (the box would swallow it)
  const tp = gw(1.22, G.d / 2 + 0.02);
  tap.scale.setScalar(1.5); // a chunky toy tap so it reads at 60 m
  put(root, tap, tp.x, tp.z, G.ry);
  ctx.surface(tap, 'metal');
  ctx.onUpdate(tap.userData.update);
  const handle = tap.userData.parts.handle;
  const grubb = cast.person({ seed: 2001, hat: { type: 'flatcap', color: '#6b7a5a' }, top: { type: 'overalls', color: '#4f9a3c', sleeves: 'long' }, bottom: { type: 'trousers', color: '#4f9a3c' }, facial: 'bigbeard', age: 'elder', glasses: null, accessory: null, boots: '#5a3a22' },
    0, 0, 0, 'shakeFist', {}, { name: 'Mr Grubb', lines: until('tap', ['Drip, drip, DRIP!', 'That tap\'s drowning my petunias.', 'Hmph.'], ['There we go, my beauties.', 'Hmph. Thank you, I suppose.', 'Prize marrow, this. Don\'t touch.']) });
  grubb.root.position.copy(gw(-0.5, G.d / 2 + 1.3));
  grubb.faceTowards(tp);
  const grubbR = routine(ctx, grubb, [['shakeFist', 3], ['angry', 2.4], ['scratch', 1.8]], 1);
  const can = wateringCan();
  can.visible = false;
  grubb.bones.handR.add(can);
  const bedPt = gw(-2.2, G.d / 2 + 2.3);
  let watering = false;
  every(ctx, 0.18, () => {
    can.updateWorldMatrix(true, false);
    const sp = new THREE.Vector3(0, -0.02, 0.4).applyMatrix4(can.matrixWorld);
    ctx.fx.emit('blob', sp, 3, { dir: v3(0, -1, 0), speed: 1.2, spread: 0.25, size: 0.05, gravity: 9, life: 0.5, color: ['#bfeeff', '#8fdcf7'] });
  }, { cond: () => watering });
  ctx.job({
    id: 'tap', title: 'Leaky tap', clue: "Mr Grubb's garden tap won't stop dribbling.", hint: 'Beside the front door of the cottage by the allotments.',
    reward: 30, targets: [handle], focus: handle,
    onComplete() {
      tap.userData.turnHandle(1.5);
      ctx.delay(0.6, () => tap.userData.setDripping(false));
      const hp = worldPos(handle);
      ctx.sfx('creak', { position: hp, pitch: 1.5 });
      ctx.delay(0.7, () => ctx.sfx('ding', { position: hp, pitch: 1.1 }));
      grubbR.on = false;
      grubb.perform('cheer', 1.8);
      cast.say(grubb, 'About time too! Right, my petunias...', 3);
      ctx.delay(2.2, () => {
        new Walker(grubb, [[grubb.root.position.x, grubb.root.position.z], [bedPt.x + 1.2, bedPt.z + 0.8]], { speed: 0.8, endAction: 'point', onArrive: () => {
          grubb.faceTowards(bedPt);
          grubb.setAction('point', { at: bedPt.clone().setY(0.2) });
          can.visible = true;
          watering = true;
        } });
      });
    },
  });
  J.grubb = grubb;

  // ================================================================ secret: the weathervane
  const vane = church.userData.parts.weathervane;
  ctx.collider(vane, new THREE.SphereGeometry(1.05, 8, 6), { y: 0.65 });
  // really is stuck pointing at the pub (overrides the kit's idle swing, which runs first) until shot
  const vp0 = worldPos(vane);
  const parentYaw = new THREE.Euler().setFromQuaternion(vane.parent.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
  const stuckYaw = Math.atan2(-(L.pubAt.z - vp0.z), L.pubAt.x - vp0.x) - parentYaw;
  let vaneSpin = 0, vaneVel = 0, vaneFree = 0;
  ctx.onUpdate((dt, t) => {
    vaneVel *= Math.exp(-dt * 0.3);
    vaneSpin += vaneVel * dt;
    if (vaneVel > 0) vaneFree = Math.min(1, vaneFree + dt * 0.15);
    vane.rotation.y = stuckYaw + vaneSpin + Math.sin(t * 7.3) * 0.015 * (1 - vaneFree) + Math.sin(t * 0.21) * 0.6 * vaneFree;
  });
  ctx.job({
    id: 'vane', bonus: true, title: "Which way's the wind?", clue: 'The weathervane is stuck pointing at the pub. Suspicious.',
    reward: 80, targets: [vane], focus: vane,
    onComplete() {
      vaneVel = 24;
      const vp = worldPos(vane);
      ctx.fx.burst('stars', vp, UP, { scale: 1.2 });
      ctx.sfx('clang', { position: vp, pitch: 1.4 });
      [0.55, 0.62, 0.7, 0.48].forEach((p, i) => ctx.delay(0.4 + i * 0.22, () => ctx.sfx('cluck', { position: vp, pitch: p, volume: 1.3 })));
      ctx.delay(0.4, () => ctx.popText(vp.clone().add(v3(0, 1.5, 0)), 'Cock-a-doodle-doo!', { cls: 'pop-big', duration: 2 }));
    },
  });

  // ================================================================ secret: melon mayhem
  const stack = K.melonStack({ seed: 2 });
  put(root, stack, -21.6, 4.1, 0.3);
  ctx.surface(stack, 'soft');
  ctx.onUpdate(stack.userData.update);
  J.melonStack = stack;
  ctx.job({
    id: 'melons', bonus: true, title: 'Melon mayhem', clue: 'That pyramid of melons is just asking for it.',
    reward: 60, targets: stack.userData.parts.melons, focus: stack,
    onComplete() {
      stack.userData.avalanche();
      const mp = worldPos(stack).add(v3(0, 0.8, 0));
      for (let i = 0; i < 6; i++) ctx.delay(0.3 + i * 0.18, () => ctx.sfx('hitSoft', { position: mp, pitch: 0.7 + i * 0.05 }));
      ctx.delay(0.3, () => ctx.sfx('gasp', { position: mp }));
      const tr = J.traders?.[0];
      if (tr) {
        tr.setAction('panic');
        cast.say(tr, 'My melons!', 2.4);
        ctx.delay(1.2, () => new Walker(tr, [[tr.root.position.x, tr.root.position.z], [-20, 5.8], [-23.2, 5.6], [-21.6, 6.8]], { speed: 2.4, action: 'chase', pingPong: true }));
      }
      cast.startle(mp, 4, [tr]);
    },
  });

  // ================================================================ Golden Spanners
  const spanners = [];
  const addSpanner = (parent, x, y, z, { size = 0.8, seed = 1, id } = {}) => {
    const s = K.goldenSpanner({ seed, size });
    s.position.set(x, y, z);
    parent.add(s);
    ctx.collectible(s, { id });
    ctx.onUpdate(s.userData.update);
    ctx.surface(s, 'metal');
    spanners.push(s);
    return s;
  };
  // 1: on the church tower ledge, between a merlon and a pinnacle
  addSpanner(church, 1.5, 15.32, 8.5, { size: 0.85, seed: 1, id: 'spanner-church' });
  // 2: inside the red phone box (door ajar)
  const kioskShelf = D.kiosk.userData.parts.shelf;
  const s2 = addSpanner(kioskShelf, 0, 0.02, 0.02, { size: 0.62, seed: 2, id: 'spanner-phonebox' });
  s2.rotation.y = 0.4;
  // 3: tucked behind a chimney pot on the terrace
  const chims = L.anchors.terraceChimneys.slice().sort((a, b) => a.x - b.x);
  const ch = chims[Math.min(1, chims.length - 1)];
  addSpanner(root, ch.x + 0.62, ch.y - 1.05, ch.z - 0.55, { size: 0.8, seed: 3, id: 'spanner-chimney' });
  J.spanners = spanners;
  return J;
}

export { circlePath, TAU, PropIcon };
