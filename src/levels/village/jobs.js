// Puddleby Green: 11 contracts, 2 secret jobs and 3 Golden Spanners — each with a tell, a reaction
// and the villagers who care about it. Clues describe the resident's problem (not the target);
// hints are a spoken nudge. Anyone still waiting after ~45 s starts waving for help ("nag"; staggered).
import * as THREE from 'three';
import * as K from '../../world/kit/props/index.js';
import { Duck, PigeonFlock, Walker } from '../../world/characters/index.js';
import { P } from '../../gfx/palette.js';
import { materials } from '../../gfx/materials.js';
import { put, local, yawTo, facePerch, worldPos, NoteFountain, PropIcon, wateringCan, Leash, v3, circlePath, TAU, routine, every } from './util.js';
import { buntingBundle, dunkTank, openingRibbon, waterButt } from './custom.js';
import { FOUNTAIN, ROT_W, DIR_W, N_W } from './layout.js';

const UP = new THREE.Vector3(0, 1, 0);
const FC = new THREE.Vector3(FOUNTAIN[0], 0, FOUNTAIN[1]);

export function buildJobs(ctx, S, L, D) {
  const root = ctx.root;
  const cast = S.cast;
  const rng = ctx.rng;
  const J = {};
  const stateOf = (id) => ctx.jobs.get(id)?.state;
  const open = (id) => stateOf(id) === 'open';
  const done = (id) => stateOf(id) === 'done';
  /** Chatter that moves on once a job is done (or botched). */
  const until = (id, before, after, failed = before) => () => {
    const st = stateOf(id);
    return st === 'done' ? after : st === 'failed' ? failed : before;
  };

  /**
   * A looping audio tell (jingle, snore, drip, creak) that plays while cond() holds and the shift is
   * on. Started lazily (audio may load after the level is built; loops are stopped when leaving).
   */
  const tellLoop = (name, opts, cond) => {
    const L2 = { h: null, set: (o) => { Object.assign(opts, o); L2.h?.set?.(o); } };
    ctx.onUpdate(() => {
      const want = cond() && ctx.game?.state === 'play';
      if (want && !(L2.h && L2.h.playing !== false && !L2.h.stopped)) L2.h = ctx.audio?.loop?.(name, { ...opts }) || null;
      else if (!want && L2.h) { L2.h.stop?.(0.3); L2.h = null; }
    });
    return L2;
  };

  // ---------------------------------------------------------------- escalating tells ("nag")
  // After `after` seconds of play with the job still open (and unlocked), its owner waves for help
  // with a '!' every few seconds and the target does something louder (fn).
  // Staggered so a stuck player hears one new voice every 6 s (nearest problems first), not a chorus.
  const NAG_ORDER = ['fountain', 'pigeons', 'icecream', 'sign', 'bunting', 'tap', 'kite', 'postman', 'bell'];
  const nags = new Map();
  const nag = (id, o) => nags.set(id, { t: 0, n: 0, next: 0, started: false, after: 45 + 6 * Math.max(0, NAG_ORDER.indexOf(id)), ...o });
  const quiet = (id) => {
    const g = nags.get(id);
    if (!g) return;
    g.off = true;
    g.owner?.setTell?.(null);
  };
  ctx.onUpdate((dt) => {
    if (ctx.game?.state !== 'play') return;
    for (const [id, g] of nags) {
      if (g.off) continue;
      const st = stateOf(id);
      if (st !== 'open') { if (st) quiet(id); continue; }
      if (g.ready && !g.ready()) continue;
      g.t += dt;
      if (g.t < (g.after ?? 45)) continue;
      if (!g.started) {
        g.started = true;
        if (g.owner && g.tell !== false) g.owner.setTell(g.tell || '!', { every: g.every ?? 8, duration: 1.8 });
      }
      g.next -= dt;
      if (g.next > 0) continue;
      g.next = g.every ?? 8;
      g.n++;
      const who = g.owner;
      if (who && !who.busy && g.big !== false) {
        if (g.r) g.r.t = Math.max(g.r.t, 2.6); // let the gesture play out before the routine resumes
        who.perform(g.big || 'alarm', 2.3);
      }
      g.fn?.(g.n);
      if (who && g.n === 1 && g.hey !== false) ctx.sfx('hey', { position: worldPos(who.root).setY(1.6), voice: who.root.userData.voice });
      if (who && g.lines && g.n % 3 === 1) cast.say(who, g.lines[((g.n - 1) / 3 | 0) % g.lines.length], 2.4);
    }
  });
  J.nags = nags;

  // ================================================================ 0. first laugh: dunk the Sarge
  // Right under the van (≈24 m): a new player can hit it unscoped within seconds.
  const DK = [-10.8, 25.2]; // left of the crow's-nest pennant, clear above the rail
  const DKR = facePerch(DK[0], DK[1]);
  const tank = dunkTank();
  put(root, tank, DK[0], DK[1], DKR);
  ctx.surface(tank, 'wood');
  tank.userData.parts.water.userData.surface = 'water';
  const dk = (lx, lz) => { const [x, z] = local(DK[0], DK[1], DKR, lx, lz); return new THREE.Vector3(x, 0, z); };
  const target = tank.userData.parts.target;
  ctx.collider(target, new THREE.SphereGeometry(0.78, 10, 8), { y: 0 });
  const sarge = cast.person({ preset: 'police', seed: 4001 }, 0, 0, DKR, 'sit', { height: 0.5 }, {
    name: 'Sergeant Bumble', voice: 'man',
    lines: until('dunk', ["Can't hit a barn door, you lot!", 'Missed me! Missed me!', "Is that the best Puddleby's got?"], ['Oi! That was my good helmet.', "I'll have you for this! ...Lovely day for it, mind."]),
  });
  const seatP = dk(0, -0.62);
  sarge.root.position.set(seatP.x, tank.userData.seatY - 0.5, seatP.z);
  sarge.lookAt(new THREE.Vector3(0, 16, 44));
  const throwers = [[-2.6, 2.9, 'point'], [-3.6, 1.6, 'impatient']].map(([lx, lz, act], i) => {
    const p = dk(lx, lz);
    const k = cast.person({ age: 'kid', seed: 4011 + i, accessory: null }, p.x, p.z, 0, act, act === 'point' ? { at: worldPos(target) } : {}, { name: 'kid', lines: ['Throw it harder!', "He's too far!", 'My turn next!'] });
    k.faceTowards(worldPos(target));
    return k;
  });
  // the kids keep chucking balls and missing: the tell reads from the van
  const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), materials.solid(P.sunflower));
  ballMesh.castShadow = true;
  ballMesh.visible = false;
  ballMesh.raycast = () => {};
  root.add(ballMesh);
  let dunked = false;
  const throwBall = () => {
    if (dunked) return;
    const kid = throwers[rng.int(0, 1)];
    kid.perform('wave', 0.8);
    const from = worldPos(kid.root).add(v3(0, 1.4, 0));
    const tp = worldPos(target);
    const miss = tp.clone().add(v3(rng.range(-1.2, 1.2), rng.range(0.4, 1.0), rng.range(-0.4, 0.4)));
    const land = miss.clone().add(v3(rng.range(-1, 1), 0, -1.6)).setY(0.12);
    ballMesh.visible = true;
    ctx.tweens.run(0.7, (k) => {
      ballMesh.position.lerpVectors(from, miss, k);
      ballMesh.position.y += Math.sin(k * Math.PI) * 1.2;
    }, { onComplete: () => ctx.tweens.run(0.5, (k) => { ballMesh.position.lerpVectors(miss, land, k); ballMesh.position.y = miss.y * (1 - k) * (1 - k) + 0.12; }, { onComplete: () => { ballMesh.visible = false; } }) });
    ctx.delay(0.75, () => {
      if (dunked) return;
      ctx.popText(tp.clone().add(v3(0, 1.1, 0)), 'MISSED!', { cls: 'pop-info', duration: 1 });
      if (rng.chance(0.5)) cast.say(sarge, rng.pick(['Ha! Missed!', 'Too slow!', 'Whoosh! Nope!']), 1.6);
      ctx.sfx('aww', { position: worldPos(kid.root).setY(1.2), voice: 'kid', volume: 0.45 });
    });
  };
  every(ctx, () => rng.range(3.2, 4.6), throwBall, { cond: () => open('dunk'), start: 1.5 });
  ctx.job({
    id: 'dunk', title: 'Dunk the Sarge', clue: 'Sergeant Bumble reckons nobody at the fête could hit a barn door.',
    hint: "Prove him wrong. There's a great big bullseye right next to his seat.",
    reward: 30, targets: [target], focus: target,
    onComplete() {
      dunked = true;
      quiet('dunk');
      const seat = tank.userData.parts.seat;
      const wp = worldPos(tank).setY(tank.userData.waterY);
      // the target clonks back, the plank flips and in he goes
      ctx.tweens.run(0.25, (k) => { target.rotation.x = -Math.sin(k * Math.PI) * 0.6; });
      ctx.sfx('clang', { position: worldPos(target), pitch: 1.3 });
      ctx.tweens.run(0.18, (k) => { seat.rotation.x = -1.45 * k; });
      sarge.setAction('panic', {}, 0.05);
      const y0 = sarge.root.position.y;
      ctx.tweens.run(0.42, (k) => { sarge.root.position.y = y0 + (wp.y - 0.05 - y0) * k * k; }, {
        onComplete: () => {
          sarge.setAction('tread', {}, 0.1);
          sarge.root.position.y = wp.y - 0.02;
          for (let i = 0; i < 3; i++) ctx.delay(i * 0.1, () => ctx.fx.burst('water', wp.clone().add(v3(rng.range(-0.5, 0.5), 0.1, rng.range(-0.4, 0.4))), UP, { scale: 2.1 - i * 0.4 }));
          ctx.sfx('splash', { position: wp, pitch: 0.85 });
          ctx.sfx('hitWater', { position: wp });
          ctx.popText(wp.clone().add(v3(0, 2.4, 0)), 'SPLOSH!', { cls: 'pop-big', duration: 1.6 });
          ctx.sfx('hey', { position: wp.clone().setY(wp.y + 1), voice: 'man' });
          sarge.tell('!?', { duration: 1.8, size: 1.3 });
        },
      });
      ctx.delay(0.6, () => { ctx.sfx('yay', { position: worldPos(throwers[0].root).setY(1.2), voice: 'kid' }); ctx.sfx('crowdCheer', { position: wp, volume: 0.8 }); });
      throwers.forEach((k, i) => ctx.delay(0.5 + i * 0.2, () => { k.setAction('cheer'); k.celebrate(); }));
      ctx.delay(0.9, () => cast.cheerNear(wp, 14, { except: [sarge, ...throwers], say: 'Ha! Got him!' }));
      ctx.delay(1.2, () => ctx.fx.burst('confetti', wp.clone().add(v3(0, 2.2, 0)), UP, { scale: 1.2 }));
      ctx.delay(2.6, () => cast.say(sarge, "Oi! ...Actually, it's quite refreshing.", 2.8));
      ctx.delay(4.5, () => throwers.forEach((k, i) => k.setAction(i ? 'clap' : 'dance')));
    },
  });
  nag('dunk', { owner: throwers[0], after: 20, every: 9, lines: ['Somebody hit the target!', 'Go on, mister, have a go!'] });
  J.sarge = sarge;
  J.dunkKids = throwers;

  // ================================================================ 1. fountain
  const fountain = L.fountain;
  const valve = fountain.userData.parts.valve;
  const tapper = cast.person({ preset: 'kid', seed: 3101, accessory: null, hair: { style: 'short', color: P.hair[1] }, top: { type: 'stripes', color: P.teal, color2: '#fff8ee', sleeves: 'short' } },
    FC.x - 2.3, FC.z + 4.3, 0, 'point', {}, { name: 'kid-tapper', lines: until('fountain', ["It's broken!", 'Plip... plip... plip.', 'Mum, the fountain is sulking.'], ['Splashy splashy!', 'Look, DUCKS!', 'It works! It WORKS!']) });
  tapper.faceTowards(FC);
  const basinPt = FC.clone().add(v3(-1.2, 0.8, 1.8));
  tapper.pointAt(basinPt);
  const tapperR = routine(ctx, tapper, [['point', 3.5, { at: basinPt }], ['scratch', 2.4], ['point', 2.8, { at: basinPt }], ['shrug', 2]]);
  // ducks + bathing pigeons appear once it flows
  const ducks = [0, 1, 2].map((i) => {
    const d = new Duck({ seed: 500 + i });
    cast.animal(d, FC.x, FC.z, 0, { y: 0.62, blob: false, name: 'duck' });
    d.root.visible = false;
    d.swim = { a: i * 2.1, r: 2.25 + (i % 2) * 0.35, sp: 0.22 + i * 0.05, arrive: -1 };
    return d;
  });
  const bathers = new PigeonFlock({ seed: 71, count: 4, area: { x: FC.x - 2.15, z: FC.z + 0.9, r: 0.75 }, groundY: 0.5 });
  bathers.root.visible = false;
  ctx.flock(bathers);
  for (const b of bathers.birds) { ctx.bystander(b.root, { actor: b, name: 'pigeon' }); b.mesh.castShadow = false; }
  ctx.onUpdate((dt, t) => {
    for (const d of ducks) {
      const u = d.swim;
      if (!d.root.visible) continue;
      u.a += dt * u.sp;
      const tx = FC.x + Math.cos(u.a) * u.r, tz = FC.z + Math.sin(u.a) * u.r;
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
    id: 'fountain', title: "Fountain's gone dry", clue: "The square's gone very quiet. No splashing, just the odd sulky plip.",
    hint: 'Something low down on the fountain is stuck tight. Give it a turn.', reward: 40, targets: [valve], focus: valve,
    onComplete() {
      quiet('fountain');
      fountain.userData.setFlowing(true);
      const vp = worldPos(valve);
      ctx.sfx('creak', { position: vp, pitch: 1.3 });
      ctx.delay(0.5, () => { ctx.sfx('splash', { position: FC.clone().setY(4) }); ctx.fx.burst('water', FC.clone().setY(4.6), UP, { scale: 1.6 }); });
      ctx.delay(1.1, () => { ctx.sfx('splash', { position: FC.clone().setY(1), pitch: 0.8 }); ctx.fx.burst('water', FC.clone().add(v3(2.5, 1, 0)), UP, { scale: 1.2 }); });
      ctx.delay(1.4, () => { ctx.sfx('crowdCheer', { position: FC.clone().setY(1) }); cast.cheerNear(FC, 16, { except: [tapper], say: 'Hooray! Water!' }); });
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
  nag('fountain', {
    owner: tapper, r: tapperR, lines: ["Somebody fix the fountain!", 'It just goes plip!'],
    fn: () => { // the fountain coughs a sad little puff of spray
      const sp = worldPos(fountain.userData.parts.spout);
      ctx.fx.burst('water', sp, UP, { scale: 0.7 });
      ctx.sfx('drip', { position: sp, volume: 1.2 });
    },
  });
  J.tapper = tapper;

  // ================================================================ 2. wedding bell (needs a DING and a DONG)
  const church = L.church;
  const bell = church.userData.parts.bell;
  const gate = L.churchGate;
  const at = (x, z) => new THREE.Vector3(x, 0, z);
  const bride = cast.person({ preset: 'bride', seed: 1201 }, 0, 0, 0, 'lookUp', {}, { name: 'bride', voice: 'woman', lines: until('bell', ["Why won't it ring?", 'Ding... dong... anyone?', 'Best day ever! Nearly.'], ['Best day EVER!', 'Ding dong! Ding dong!']) });
  const groom = cast.person({ preset: 'groom', seed: 1202 }, 0, 0, 0, 'lookUp', {}, { name: 'groom', lines: until('bell', ['The bell-ringer overslept.', 'Just one ding-dong, please!'], ['I do! I mean... I did!', 'Who wants cake?']) });
  const vicar = cast.person({ preset: 'vicar', seed: 1203 }, 0, 0, 0, 'checkWatch', {}, { name: 'vicar', voice: 'posh', lines: until('bell', ['Any minute now...', 'Tick tock, tick tock.', 'Dearly beloved... er...'], ['Bless you, whoever you are.', 'Dearly beloved... we made it.']) });
  // on the church path just outside the lych gate, in two staggered rows so nobody hides anybody
  const pathDir = new THREE.Vector3(-24.2 - gate[0], 0, -23.2 - gate[1]).normalize();
  const side = new THREE.Vector3(-pathDir.z, 0, pathDir.x);
  const gp = (along, across) => at(gate[0] + pathDir.x * along + side.x * across, gate[1] + pathDir.z * along + side.z * across);
  bride.root.position.copy(gp(3.2, -0.55));
  groom.root.position.copy(gp(3.2, 0.55));
  vicar.root.position.copy(gp(1.4, 1.5));
  const towerLook = worldPos(bell);
  for (const p of [bride, groom]) { p.faceTowards(towerLook); p.lookAt(towerLook); }
  vicar.faceTowards(gp(3.2, 0));
  const guestSpots = [[5.4, -1.9, 'talk'], [5.6, 1.9, 'clap'], [6.9, -0.6, 'impatient'], [7.1, 1.1, 'talk']];
  const guests = guestSpots.map(([along, across, act], i) => {
    const g = cast.person({ seed: 1210 + i, hat: i === 0 ? { type: 'sunhat', color: '#ffb8c2', band: P.violet } : i === 3 ? { type: 'tophat', color: '#3d4a6b' } : undefined, top: i === 1 ? { type: 'dress', color: P.violet } : i === 3 ? { type: 'suit', color: '#5b6b7a' } : undefined, accessory: null, age: 'adult' },
      0, 0, 0, act, {}, { name: 'guest', lines: until('bell', ['What a lovely couple.', 'Is it time for cake yet?', 'Ooh, I do love a wedding.'], ['Throw the bouquet!', 'Is it time for cake yet?', 'I always cry at weddings.']) });
    g.root.position.copy(gp(along, across));
    g.faceTowards(gp(3.2, 0));
    return g;
  });
  const vicarR = routine(ctx, vicar, [['checkWatch', 3.2], ['shrug', 1.8], ['lookUp', 2.6]], 1);
  const brideR = routine(ctx, bride, [['lookUp', 3.4], ['idle', 1.6], ['lookUp', 2.4], ['shrug', 1.6]], 0.5);
  let dings = 0;
  const ringRound = (n, gap = 1.25, pitch = 1) => {
    for (let i = 0; i < n; i++) ctx.delay(i * gap, () => { church.userData.ringBell(0.8); ctx.sfx('bell', { position: worldPos(bell), pitch: i % 2 ? pitch * 0.84 : pitch }); });
  };
  ctx.job({
    id: 'bell', title: 'Wedding bells', clue: "There's a bride at the church gate and not a peep from the tower.",
    hint: 'Up in the belfry. It takes a DING and then a DONG.',
    reward: 60, needed: 2, targets: [bell], focus: bell,
    onHit() {
      const bp = worldPos(bell);
      church.userData.ringBell(1.15);
      ctx.sfx('bell', { position: bp, pitch: dings === 0 ? 1 : 0.84 });
      ctx.popText(bp.clone().add(v3(0, 1.6, 0)), dings === 0 ? 'DING!' : 'DONG!', { cls: 'pop-big', duration: 1.6 });
      if (dings === 0) {
        bride.perform('cheer', 1.4);
        ctx.delay(0.9, () => { if (dings < 2) cast.say(groom, "That's the ding! Now the dong!", 2.6); });
      }
      dings++;
      return 'progress';
    },
    onComplete() {
      quiet('bell');
      vicarR.on = false;
      brideR.on = false;
      ringRound(6, 1.3, 1);
      const conf = gp(3.2, 0).setY(3.4);
      for (let i = 0; i < 4; i++) ctx.delay(0.3 + i * 0.45, () => ctx.fx.burst('confetti', conf.clone().add(v3(rng.range(-1.5, 1.5), rng.range(0, 1), rng.range(-1, 1))), UP, { scale: 1.1 }));
      ctx.delay(0.6, () => ctx.sfx('crowdCheer', { position: conf }));
      cast.hush(bride, groom, vicar, ...guests);
      bride.lookAt(null); groom.lookAt(null);
      bride.faceTowards(groom.root.position);
      groom.faceTowards(bride.root.position);
      bride.setAction('idle'); groom.setAction('idle');
      bride.celebrate(); groom.celebrate();
      ctx.delay(3.0, () => { bride.celebrate(); groom.celebrate(); cast.say(bride, 'Mwah!', 1.6); ctx.fx.burst('pop', worldPos(bride.root).lerp(worldPos(groom.root), 0.5).add(v3(0, 2, 0)), UP, { scale: 0.9, color: ['#ff6b8a', '#ff9ec4', '#fff8ee'] }); });
      ctx.delay(4.6, () => { bride.setAction('dance'); groom.setAction('dance'); });
      vicar.setAction('cheer');
      guests.forEach((g, i) => ctx.delay(0.2 * i, () => { g.setAction(i % 2 ? 'clap' : 'cheer'); g.celebrate(); ctx.fx.burst('pop', worldPos(g.root).add(v3(0, 1.8, 0)), UP, { scale: 0.8 }); }));
      ctx.delay(0.6, () => cast.say(vicar, 'You may now kiss the bride!', 2.3));
    },
  });
  nag('bell', { owner: bride, r: brideR, lines: ['Ding-dong! Anybody?', "It's my WEDDING!"], fn: () => church.userData.ringBell(0.12) });
  J.wedding = [bride, groom, vicar, ...guests];

  // ================================================================ 3. wonky pub sign
  const pub = L.pub;
  const bolt = pub.userData.parts.bolt;
  const signPivot = pub.userData.parts.signPivot;
  const pw = (lx, lz) => { const [x, z] = local(L.pubAt.x, L.pubAt.z, L.pubAt.ry, lx, lz); return new THREE.Vector3(x, 0, z); };
  const signPos = worldPos(signPivot);
  const landlord = cast.person({ seed: 1301, top: { type: 'apron', color: '#fbf7f0', color2: '#fbf7f0', apronStripe: '#2f7d62', sleeves: 'short' }, bottom: { type: 'trousers', color: '#34384a' }, hair: { style: 'balding', color: '#5a3a22' }, facial: 'handlebar', hat: null, accessory: null, build: { belly: 1, width: 1.25 } },
    0, 0, 0, 'scratch', {}, { name: 'landlord', lines: until('sign', ['Wonky again! Every blooming week.', "Can't have a wonky sign at the Wonky Pint.", 'Fancy a pint?'], ['Straight as a die!', 'Fancy a pint?', 'Best sign in the county, that.']) });
  landlord.root.position.copy(pw(2.4, 8.4));
  landlord.faceTowards(signPos);
  landlord.lookAt(signPos);
  const landlordR = routine(ctx, landlord, [['scratch', 2.8], ['point', 2.4, { at: signPos }], ['shrug', 1.8], ['idle', 2.2]], 0.8);
  const creak = tellLoop('signCreak', { position: signPivot, swing: 1.5, volume: 0.75 }, () => open('sign'));
  let signKick = 0;
  ctx.onUpdate((dt, t) => { // added after the kit's own swing: a hard wobble while the landlord nags
    if (signKick <= 0) return;
    signKick = Math.max(0, signKick - dt);
    signPivot.rotation.z += Math.sin(t * 7) * 0.16 * Math.min(1, signKick);
  });
  ctx.job({
    id: 'sign', title: 'Wonky pub sign', clue: 'The Wonky Pint is living up to its name. The landlord is tearing his hair out.',
    hint: "One chain's doing all the work. Look where the other one's come loose.",
    reward: 50, targets: [bolt], focus: bolt,
    onComplete() {
      quiet('sign');
      signKick = 0;
      pub.userData.fixSign();
      ctx.sfx('spring', { position: signPos });
      ctx.delay(0.5, () => ctx.sfx('ding', { position: signPos, pitch: 1.2 }));
      ctx.delay(0.75, () => ctx.sfx('ding', { position: signPos, pitch: 1.6 }));
      ctx.delay(0.6, () => ctx.popText(signPos.clone().add(v3(0, 1.2, 0)), 'TA-DA!', { cls: 'pop-big' }));
      landlordR.on = false;
      landlord.lookAt(null);
      landlord.setAction('cheer');
      ctx.delay(2.2, () => landlord.setAction('wave'));
      cast.say(landlord, "Lovely job! First pint's on me!", 3);
      ctx.delay(0.8, () => cast.cheerNear(signPos, 9, { except: [landlord] }));
    },
  });
  nag('sign', { owner: landlord, r: landlordR, lines: ["Somebody sort that sign out!", "It'll have somebody's eye out!"], fn: () => { signKick = 2.2; creak.set({ swing: 0.6, volume: 1.2 }); ctx.delay(2.4, () => creak.set({ swing: 1.5, volume: 0.75 })); } });
  J.landlord = landlord;

  // ================================================================ 4. bunting for the fête
  const po = L.postOffice;
  const DIRW = DIR_W, NW = N_W;
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
  // the big furled rainbow roll on its bracket (reads from the van; the kit coil hides inside it)
  const bracket = buntingBundle({ out: 0.7 });
  put(root, bracket, po.front[0] + DIRW[0] * 3.1, po.front[1] + DIRW[1] * 3.1, ROT_W, hook.y - 0.07);
  const bundle = bracket.userData.parts.bundle;
  ctx.collider(bundle, new THREE.SphereGeometry(0.72, 8, 6), { y: -0.52 });
  ctx.surface(bracket, 'soft');
  const postie = cast.person({ seed: 1401, hair: { style: 'bun', color: P.hair[4] }, glasses: 'round', top: { type: 'cardigan', color: P.tomato, sleeves: 'long' }, bottom: { type: 'skirt', color: '#3d4a6b' }, accessory: null, age: 'elder' },
    0, 0, 0, 'lookUp', {}, { name: 'postmistress', lines: until('bunting', ['Who hung the bunting on MY hook?', 'The fête starts at two!', 'Too high for my old arms.'], ["Doesn't the square look grand?", 'The fête starts at two!', 'Flags! Proper flags!']) });
  postie.root.position.set(po.front[0] + DIRW[0] * 2.4 + NW[0] * 2.6, 0, po.front[1] + DIRW[1] * 2.4 + NW[1] * 2.6);
  postie.faceTowards(hook);
  postie.lookAt(hook);
  const postieR = routine(ctx, postie, [['lookUp', 3], ['point', 2.4, { at: hook }], ['shrug', 1.6]], 1.5);
  let bundleKick = 0;
  ctx.onUpdate((dt, t) => {
    if (bundleKick <= 0 || !bundle.visible) return;
    bundleKick = Math.max(0, bundleKick - dt);
    bundle.rotation.x = Math.sin(t * 9) * 0.25 * Math.min(1, bundleKick);
  });
  ctx.job({
    id: 'bunting', title: 'Bunting for the fête', clue: "The fête can't open till the flags are out.",
    hint: "Somebody's left them all rolled up by the post office.",
    reward: 40, targets: [bundle, coil], focus: bundle,
    onComplete() {
      quiet('bunting');
      const b0 = bundle.scale.x;
      ctx.tweens.run(0.5, (k) => { bundle.scale.setScalar(Math.max(0.001, b0 * (1 - k))); bundle.rotation.x = k * 5; }, { onComplete: () => { bundle.visible = false; } });
      ctx.fx.burst('pop', worldPos(bundle).add(v3(0, -0.5, 0)), UP, { scale: 1.2 });
      lines[0].userData.setFurled(false);
      ctx.sfx('whoosh', { position: hook });
      lines.slice(1).forEach((bn, i) => ctx.delay(1.2 + i * 0.85, () => {
        bn.visible = true;
        bn.userData.setFurled(false);
        const a = bn.userData.parts.hooks?.[0];
        ctx.sfx('whoosh', { position: a ? worldPos(a) : FC, pitch: 1.1 + i * 0.08 });
      }));
      ctx.delay(3.6, () => { ctx.sfx('crowdCheer', { position: FC.clone().setY(2) }); cast.cheerNear(FC, 22, { say: 'Now THAT is a fête!' }); });
      postieR.on = false;
      postie.lookAt(null);
      postie.setAction('clap');
      ctx.delay(3, () => postie.setAction('wave'));
    },
  });
  nag('bunting', { owner: postie, r: postieR, lines: ['Can somebody get those flags down?', 'Up there! By my hook!'], fn: () => { bundleKick = 2; } });
  J.bunting = lines;
  J.postie = postie;

  // ================================================================ 5. grand opening (needs the bunting up)
  const BN = D.banner;
  const ribbon = openingRibbon({ span: BN.w, y: 1.15 });
  put(root, ribbon, BN.x, BN.z + 0.3, 0);
  const bow = ribbon.userData.parts.bow;
  ctx.collider(bow, new THREE.SphereGeometry(0.62, 8, 6));
  ctx.surface(ribbon, 'soft');
  const mayor = cast.person({ seed: 1551, hat: { type: 'tophat', color: '#2b2b3a' }, top: { type: 'suit', color: '#3d4a6b', sleeves: 'long' }, bottom: { type: 'trousers', color: '#2b2b3a' }, facial: 'handlebar', accessory: null, age: 'elder', build: { belly: 1, width: 1.2 } },
    BN.x + 2.6, BN.z + 1.6, 0, 'checkWatch', {}, {
      name: 'the Mayor', voice: 'posh',
      lines: () => (done('ribbon') ? ['A triumph! A triumph!', 'Do try the Victoria sponge.'] : done('bunting') ? ['Well? Somebody snip it!', 'These scissors are hopeless.', 'Ahem. Any day now...'] : ["I can't open a fête without bunting!", 'Flags first, then the ribbon.', 'Where IS that bunting?']),
    });
  mayor.faceTowards(new THREE.Vector3(0, 0, 44));
  const mayorR = routine(ctx, mayor, [['checkWatch', 3], ['impatient', 3], ['point', 2, { at: new THREE.Vector3(BN.x, 1.15, BN.z + 0.3) }], ['shrug', 1.6]], 2);
  ctx.job({
    id: 'ribbon', title: 'Grand opening', clue: "The Mayor won't open the fête until the square looks the part.",
    hint: 'Flags up first. Then help him with that big red ribbon.',
    reward: 50, requires: ['bunting'], targets: [bow], focus: bow,
    onComplete() {
      quiet('ribbon');
      const bp = worldPos(bow);
      const { left, right } = ribbon.userData.parts;
      ctx.tweens.run(0.6, (k) => { const e = 1 - (1 - k) * (1 - k); left.rotation.z = -1.5 * e; right.rotation.z = 1.5 * e; });
      ctx.tweens.run(0.5, (k) => { bow.position.y = 1.15 - 1.05 * k * k; bow.rotation.z = k * 2.4; });
      ctx.sfx('pop', { position: bp, pitch: 0.8 });
      ctx.delay(0.2, () => ctx.sfx('fanfare', { position: bp }));
      ctx.delay(0.4, () => { ctx.sfx('crowdCheer', { position: bp }); ctx.sfx('yay', { position: bp }); });
      for (let i = 0; i < 5; i++) ctx.delay(0.2 + i * 0.35, () => ctx.fx.burst('confetti', bp.clone().add(v3(rng.range(-3, 3), rng.range(1.5, 3), rng.range(-1, 1))), UP, { scale: 1.2 }));
      for (let i = 0; i < 3; i++) ctx.delay(1.2 + i * 0.6, () => { const fp = bp.clone().add(v3(rng.range(-8, 8), rng.range(14, 20), rng.range(-6, 2))); ctx.sfx('firework', { position: fp }); ctx.fx.burst('stars', fp, UP, { scale: 2.2 }); ctx.fx.burst('confetti', fp, UP, { scale: 1.4 }); });
      // the balloons are let go
      D.balloons.forEach((b, i) => ctx.delay(0.8 + i * 0.4, () => { const y0 = b.position.y; ctx.tweens.run(9, (k) => { b.position.y = y0 + k * k * 60; b.position.x += 0.01 * (i ? 1 : -1); }, { onComplete: () => { b.visible = false; } }); }));
      mayorR.on = false;
      mayor.setAction('cheer');
      cast.say(mayor, 'I declare this fête... OPEN!', 3);
      ctx.delay(1.0, () => cast.cheerNear(bp, 16, { except: [mayor] }));
      ctx.delay(3.2, () => mayor.setAction('wave'));
    },
  });
  nag('ribbon', { owner: mayor, r: mayorR, ready: () => done('bunting'), after: 25, lines: ['Snip snip! Somebody!', 'The ribbon, man, the ribbon!'] });
  J.mayor = mayor;
  J.ribbon = ribbon;

  // ================================================================ 6. Mrs Crumb's pigeons (flour sack = wrong bag!)
  const cb = D.crumbBench;
  const bw = (lx, lz) => { const [x, z] = local(cb.x, cb.z, cb.ry, lx, lz); return new THREE.Vector3(x, 0, z); };
  const crumb = cast.person({ preset: 'oldLady', seed: 1501 }, 0, 0, cb.ry, 'sit', { height: 0.5 }, { name: 'Mrs Crumb', voice: 'old', lines: until('pigeons', ['Come on, my little dears...', 'My arms are ever so tired.', "That's the seed bag, dear. The brown one."], ['Look at them tuck in!', 'Not so fast, Gerald!', "Who's a hungry boy, then?"], ['My flour! My lovely flour!', 'No cakes this year, dears.']) });
  crumb.root.position.copy(bw(-0.5, 0.27));
  const bag = K.birdseedBag({ seed: 3 });
  put(root, bag, bw(0.35, -0.02).x, bw(0.35, -0.02).z, cb.ry, 0.51);
  bag.userData.parts.spill.position.set(0.1, -0.51, 0.95);
  ctx.onUpdate(bag.userData.update);
  const flour = K.sack({ seed: 88, color: '#fbf7f0', label: P.tomato });
  flour.scale.setScalar(0.72);
  put(root, flour, bw(1.35, 0.32).x, bw(1.35, 0.32).z, cb.ry - 0.3);
  ctx.collider(flour, new THREE.SphereGeometry(0.42, 8, 6), { y: 0.36 });
  const flock = new PigeonFlock({ seed: 42, count: 12, area: { x: cb.x - 1.5, z: cb.z - 4.8, w: 6, d: 3.6 } });
  ctx.flock(flock);
  for (const b of flock.birds) { ctx.bystander(b.root, { actor: b, name: 'pigeon' }); b.mesh.castShadow = false; }
  S.flock = flock;
  const floured = (p, amount = 0.55) => { // she ends up dusted white, then slowly brushes it off
    const m = p.mesh.material.clone();
    m.emissive = new THREE.Color('#ffffff');
    m.emissiveIntensity = amount;
    p.mesh.material = m;
    ctx.tweens.run(18, (k) => { m.emissiveIntensity = amount * (1 - k) * (1 - k); });
  };
  ctx.job({
    id: 'pigeons', title: 'Feed the pigeons', clue: "Mrs Crumb's feathered friends are going hungry.",
    hint: "Her birdseed's still tied up in its bag. Mind the flour, dear.",
    reward: 40, targets: [bag.userData.parts.bag], failTargets: [flour], focus: bag,
    onComplete() {
      quiet('pigeons');
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
      quiet('pigeons');
      const fp = worldPos(flour).add(v3(0, 0.45, 0));
      // a small, puffy cloud that drifts and fades (not a white boulder)
      for (let i = 0; i < 12; i++) ctx.delay(i * 0.05, () => ctx.fx.burst('smoke', fp.clone().add(v3(rng.range(-0.7, 0.7), rng.range(0, 0.9), rng.range(-0.7, 0.7))), UP, { scale: rng.range(0.45, 0.75), color: ['#ffffff', '#f7f2ea', '#efe8dc'] }));
      ctx.fx.burst('dust', fp.clone().setY(0.15), UP, { scale: 0.9, color: ['#ffffff', '#f3ede2'] });
      ctx.sfx('hitSoft', { position: fp, pitch: 0.7 });
      ctx.delay(0.3, () => ctx.sfx('aww', { position: fp, voice: 'old' }));
      flour.scale.set(0.8, 0.45, 0.8);
      flock.scare(fp, 30);
      floured(crumb);
      crumb.tell('anger', { duration: 2.2 });
      ctx.delay(0.4, () => cast.say(crumb, 'Not the FLOUR! That was for the cakes!', 3.2));
    },
  });
  nag('pigeons', {
    owner: crumb, big: false, tell: '?', lines: ['Come on, somebody open it for me...', 'My poor little dears are starving.'],
    fn: () => flock.scare(bw(0, -3), 5),
  });
  J.crumb = crumb;

  // ================================================================ 7. the ice-cream van jingle (giant cone = decoy)
  const van = K.iceCreamVan({ seed: 2 });
  const VAN = [25.1, 24.8];
  put(root, van, VAN[0], VAN[1], Math.PI);
  ctx.surface(van, 'metal');
  ctx.onUpdate(van.userData.update);
  van.userData.jingle(true);
  ctx.prop(van, { surface: 'metal', onHit: () => { van.userData.bump?.(1); ctx.sfx('honk', { position: worldPos(van) }); } });
  const speaker = van.userData.parts.speaker;
  const notes = new NoteFountain(root, speaker, { count: 4, size: 0.75, height: 2.8 });
  ctx.onUpdate((dt, t) => notes.update(dt, t));
  // the giant cone on the roof: find it from the body geometry (the highest cluster of vertices)
  const cone = new THREE.Object3D();
  cone.name = 'giantCone';
  {
    const body = van.userData.parts.bodyMesh || van.userData.parts.body;
    const pts = [];
    let top = -Infinity;
    body.updateWorldMatrix(true, true);
    van.updateWorldMatrix(true, false);
    const inv = van.matrixWorld.clone().invert();
    const tmp = new THREE.Vector3();
    body.traverse((o) => {
      if (!o.isMesh) return;
      const p = o.geometry.attributes.position;
      for (let i = 0; i < p.count; i += 3) {
        tmp.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld).applyMatrix4(inv);
        top = Math.max(top, tmp.y);
        pts.push(tmp.clone());
      }
    });
    const hi = pts.filter((q) => q.y > top - 1.1);
    const c = hi.reduce((a, q) => a.add(q), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, hi.length));
    cone.position.copy(c);
  }
  van.add(cone);
  ctx.collider(cone, new THREE.SphereGeometry(0.62, 8, 6));
  let jingleOn = true;
  const TUNE = [0, 4, 7, 12, 11, 7, 9, 5, 7, 4, 2, 0, 0, 0];
  const BEATS = [1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2];
  const jingle = tellLoop('iceCream', { position: speaker, tune: TUNE, beats: BEATS, step: 0.17, gap: 3.5, volume: 0.9 }, () => jingleOn);
  const vw = (lx, lz) => { const [x, z] = local(VAN[0], VAN[1], Math.PI, lx, lz); return new THREE.Vector3(x, 0, z); };
  const vanMan = cast.person({ seed: 1601, hat: { type: 'cap', color: P.bubblegum, color2: '#fff8ee' }, top: { type: 'apron', color: '#fff8ee', color2: '#ff9ec4', apronStripe: P.bubblegum, sleeves: 'short' }, bottom: { type: 'trousers', color: '#3d5a8a' }, facial: 'moustache', accessory: null },
    0, 0, 0, 'talk', {}, { name: 'ice-cream man', lines: until('icecream', ["It won't switch off!", 'Same tune since breakfast...', 'Ninety-nines! Get your ninety-nines!'], ['Lovely and quiet now.', 'Ninety-nines! Get your ninety-nines!', 'Anyone seen a spanner?'], ["It's stuck on FAST now!", "Well. That's that, then."]) });
  vanMan.root.position.copy(vw(2.25, -0.4));
  vanMan.root.rotation.y = -Math.PI / 2;
  const queue = [[3.7, 0.1, 'impatient'], [4.7, -0.8, 'idle']].map(([lx, lz, act], i) => {
    const q = cast.person({ age: 'kid', seed: 1610 + i, accessory: i ? 'balloon' : null }, 0, 0, 0, act, {}, { name: 'customer', lines: until('icecream', ['This tune is doing my head in.', 'Two scoops, please!'], ['Ahh. Peace at last.', 'Two scoops, please!']) });
    q.root.position.copy(vw(lx, lz));
    q.faceTowards(vanMan.root.position);
    return q;
  });
  const vanManR = routine(ctx, vanMan, [['talk', 3], ['shrug', 1.8], ['point', 2, { at: speaker }], ['scratch', 2]], 2);
  ctx.job({
    id: 'icecream', title: 'That blasted jingle', clue: 'Somebody has got the whole green humming the same tune. Again.',
    hint: "Follow the music to where it's coming from. It isn't the giant cone.",
    reward: 50, targets: [speaker], failTargets: [cone], focus: speaker,
    onComplete() {
      quiet('icecream');
      const sp = worldPos(speaker);
      van.userData.breakSpeaker?.();
      notes.on = false;
      jingleOn = false;
      ctx.fx.burst('metal', sp, UP, { scale: 1.6 });
      ctx.sfx('clang', { position: sp });
      ctx.delay(0.25, () => ctx.sfx('spring', { position: sp, pitch: 0.7 }));
      for (let i = 0; i < 5; i++) ctx.delay(0.2 + i * 0.35, () => ctx.fx.burst('smoke', sp.clone().add(v3(0, 0.3, 0)), UP, { scale: 0.6, color: ['#b9bcc6', '#8d92a0'] }));
      vanManR.on = false;
      vanMan.perform('cheer', 2.2);
      ctx.delay(2.3, () => vanMan.setAction('wave'));
      cast.say(vanMan, 'Peace and quiet at last!', 3);
      queue.forEach((q) => q.celebrate());
    },
    onFail() {
      quiet('icecream');
      const cp = worldPos(cone);
      ctx.fx.burst('soft', cp, UP, { scale: 1 });
      ctx.sfx('hitSoft', { position: cp });
      // the jingle goes into overdrive for a bit, then the battery gives up
      jingle.set({ step: 0.1, gap: 0.6 });
      ctx.delay(9.6, () => {
        jingleOn = false;
        notes.on = false;
        ctx.fx.burst('smoke', worldPos(speaker), UP, { scale: 0.8, color: ['#8d92a0', '#6b7280'] });
        ctx.sfx('spring', { position: worldPos(speaker), pitch: 0.5 });
      });
      vanManR.on = false;
      vanMan.setAction('angry');
      vanMan.tell('anger', { duration: 2 });
      ctx.sfx('hey', { position: worldPos(vanMan.root).setY(1.6), voice: 'man' });
      ctx.delay(0.4, () => cast.say(vanMan, "Not the cone! Now it's stuck on FAST!", 3));
      queue.forEach((q, i) => ctx.delay(1 + i * 0.5, () => q.setAction('shrug')));
    },
  });
  nag('icecream', { owner: vanMan, r: vanManR, big: 'point', lines: ["Somebody, anybody, make it stop!", "It's coming out of the speaker!"], fn: () => { notes.size = 1.1; ctx.delay(2, () => { notes.size = 0.75; }); } });
  J.vanMan = vanMan;

  // ================================================================ 8. wake the postman
  const pb = D.peteBench;
  const pbw = (lx, lz) => { const [x, z] = local(pb.x, pb.z, pb.ry, lx, lz); return new THREE.Vector3(x, 0, z); };
  const pete = cast.person({ preset: 'postman', seed: 1701 }, 0, 0, pb.ry, 'sleep', { height: 0.5 }, { name: 'Postie Pete', lines: until('postman', ['Zzz... first class... zzz', 'Mmm... five more minutes...'], ['Post! Morning! Post!', 'Letters! Parcels!', 'Nobody tell the boss.']) });
  pete.root.position.copy(pbw(-0.45, 0.27));
  const clock = K.alarmClock({ seed: 5, size: 0.75, color: P.tomato });
  put(root, clock, pbw(0.55, -0.02).x, pbw(0.55, -0.02).z, pb.ry - 0.35, 0.51);
  ctx.collider(clock, new THREE.SphereGeometry(0.44, 8, 6), { y: 0.3 });
  ctx.onUpdate(clock.userData.update);
  const snore = tellLoop('snore', { position: pete.root, volume: 0.9 }, () => open('postman'));
  const doors = L.anchors.terraceDoors.slice().sort((a, b) => b.x - a.x);
  const round = [
    [pete.root.position.x, pete.root.position.z], [pb.x - 1.6, pb.z + 1.9], [15.5, -25.2],
    ...doors.map((d) => [d.x, d.z + 1.2]),
    [-15.5, -25.2], [-20.5, -24.2],
  ];
  ctx.job({
    id: 'postman', title: 'Wake the postman', clue: "The morning post is late and Pete's having a lie-in on the job.",
    hint: 'Something beside him on the bench could make a right racket.',
    reward: 50, targets: [clock], focus: clock,
    onComplete() {
      quiet('postman');
      clock.userData.ring(true);
      const cp = worldPos(clock);
      ctx.sfx('alarm', { position: cp });
      ctx.delay(0.5, () => {
        pete.setAction('panic');
        pete.tell('!?', { duration: 1.4 });
        cast.say(pete, "I'm up! I'm up! The post!", 2.6);
      });
      ctx.delay(1.6, () => clock.userData.ring(false));
      ctx.delay(2.4, () => {
        const pauses = doors.map((_, i) => ({ index: 3 + i, duration: 1.4, action: 'point', actionOptions: { at: doors[i].clone().setY(1.2) } }));
        new Walker(pete, round, { speed: 1.45, pingPong: true, pauseAt: pauses });
      });
    },
  });
  nag('postman', {
    owner: pete, big: false, tell: 'z', every: 7, hey: false,
    fn: () => { snore.set({ volume: 1.35, rate: 1.2 }); ctx.sfx('tick', { position: worldPos(clock) }); },
  });
  J.pete = pete;

  // ================================================================ 9. free the kite
  const oak = L.oakAt;
  const toPerch = new THREE.Vector2(-oak.x, 44 - oak.z).normalize();
  const knotPos = new THREE.Vector3(oak.x + toPerch.x * 5.6, 7.6, oak.z + toPerch.y * 5.6);
  const kite = K.kite({ seed: 6, colors: [P.tomato, P.sunflower] });
  kite.scale.setScalar(1.75);
  put(root, kite, knotPos.x, knotPos.z, facePerch(knotPos.x, knotPos.z), knotPos.y);
  ctx.surface(kite, 'soft');
  ctx.onUpdate(kite.userData.update);
  // the branch it is snagged on
  const bFrom = new THREE.Vector3(oak.x + toPerch.x * 3.0, 7.9, oak.z + toPerch.y * 3.0);
  const branchGeo = new THREE.CylinderGeometry(0.07, 0.13, bFrom.distanceTo(knotPos) + 0.3, 6);
  const branch = new THREE.Mesh(branchGeo, materials.solid(P.woodDark, { roughness: 0.8 }));
  branch.position.copy(bFrom).lerp(knotPos, 0.5);
  branch.quaternion.setFromUnitVectors(UP, knotPos.clone().sub(bFrom).normalize());
  branch.castShadow = true;
  root.add(branch);
  ctx.surface(branch, 'wood');
  const PP = [oak.x - 6.2, oak.z + 4.4];
  const poppy = cast.person({ preset: 'kid', seed: 1801, accessory: null, hair: { style: 'pigtails', color: P.hair[6], tie: P.sunflower }, top: { type: 'dress', color: P.bubblegum, sleeves: 'short' } },
    PP[0], PP[1], 0, 'point', { at: knotPos }, { name: 'Poppy', voice: 'kid', lines: until('kite', ["My kite! It's stuck!", 'Silly tree ate my kite.', 'Can you get it down, mister?'], ['Wheee!', 'Look how high it goes!', 'Thank you, mister!']) });
  poppy.faceTowards(knotPos);
  const poppyR = routine(ctx, poppy, [['point', 3, { at: knotPos }], ['shrug', 1.6], ['lookUp', 2.4]], 2);
  let kiteFollow = false, kiteKick = 0;
  const kitePivot = kite.userData.parts.kite;
  const string = new Leash(root, '#fff8ee', 0.012);
  string.mesh.visible = false;
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _k = new THREE.Vector3();
  // once freed the kite flies high and downwind of Poppy (above every roof, so it reads from the perch)
  ctx.onUpdate((dt, t) => {
    if (kiteKick > 0 && !kiteFollow) {
      kiteKick = Math.max(0, kiteKick - dt);
      kitePivot.rotation.z += Math.sin(t * 13) * 0.35 * Math.min(1, kiteKick);
      kitePivot.rotation.x += Math.sin(t * 9) * 0.25 * Math.min(1, kiteKick);
    }
    if (!kiteFollow) return;
    const pr = poppy.root;
    _k.copy(pr.position).add(_a.set(Math.sin(t * 0.45) * 1.8, 10.8 + Math.sin(t * 1.1) * 0.6, -5.5));
    kite.position.lerp(_k, 1 - Math.exp(-dt * 1.1));
    poppy.bones.handR.getWorldPosition(_a);
    kitePivot.getWorldPosition(_b);
    string.set(_a, _b);
  });
  ctx.job({
    id: 'kite', title: 'Free the kite', clue: "Poppy's lost something up a tree and she's inconsolable.",
    hint: "Snip it free where the string's tangled round the branch.",
    reward: 60, targets: [kite.userData.parts.knot, kitePivot], focus: kite.userData.parts.knot,
    onComplete() {
      quiet('kite');
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
        // laps of the little green by the oak (the stretch you can see from the van)
        const pp = poppy.root.position;
        new Walker(poppy, [[pp.x, pp.z], [16.4, -30.4], [17.2, -27.4], [21.8, -26.6], [22.6, -30.8]], { loop: true, speed: 2.3, action: 'run' });
      });
    },
  });
  nag('kite', { owner: poppy, r: poppyR, lines: ['Pleeeease get my kite!', "It's up THERE!"], fn: () => { kiteKick = 2.2; ctx.sfx('whoosh', { position: knotPos, pitch: 1.6, volume: 0.5 }); } });
  J.poppy = poppy;

  // ================================================================ 10. tourist selfie (needs the fountain running)
  const T0 = new THREE.Vector3(FC.x + 6.0, 0, FC.z + 3.9);
  const camPos = new THREE.Vector3(FC.x + 9.4, 0, FC.z + 7.1);
  const pr = new THREE.Vector2(-(T0.z - camPos.z), T0.x - camPos.x).normalize();
  const camT = K.cameraOnTripod({ seed: 7, color: P.tomato });
  put(root, camT, camPos.x, camPos.z, yawTo(camPos, T0));
  ctx.surface(camT, 'metal');
  ctx.onUpdate(camT.userData.update);
  const tourists = [0.6, -0.6].map((s, i) => {
    const t = cast.person({ preset: 'tourist', seed: 1901 + i, accessory: null, top: i ? { type: 'hawaiian', color: P.tomato, color2: P.sunflower, sleeves: 'short' } : undefined, hat: i ? { type: 'sunhat', color: '#f2d27a', band: P.teal } : undefined },
      T0.x + pr.x * s, T0.z + pr.y * s, 0, 'shrug', {}, { name: 'tourist', voice: 'posh', lines: () => (open('fountain') ? ["Shame the fountain's off.", 'Not very photogenic, is it?'] : open('selfie') ? ['Say cheese!', 'Can anyone reach the button?', 'Perfect with the fountain!'] : ['What a lovely village!', 'Wait till they see this back home!']) });
    t.faceTowards(FC);
    return t;
  });
  const tourR = tourists.map((t, i) => routine(ctx, t, [['shrug', 2.2], ['scratch', 2.4], ['idle', 2]], i * 1.3));
  ctx.job({
    id: 'selfie', title: 'Tourist selfie', clue: 'Two tourists want a holiday snap with the fountain in it.',
    hint: "Their camera's on a tripod and neither of them can reach the button.",
    reward: 40, requires: ['fountain'], targets: [camT.userData.parts.camera], focus: camT.userData.parts.camera,
    onComplete() {
      quiet('selfie');
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
    ctx.delay(1.2, () => cast.say(tourists[0], 'Ooh! Photo time!', 2.4));
  });
  nag('selfie', { owner: tourists[0], r: tourR[0], ready: () => done('fountain'), after: 25, lines: ['Could someone press the button?', "We're not getting any younger!"] });
  J.tourists = tourists;

  // ================================================================ 11. Mr Grubb's leaky tap (water butt = decoy)
  const G = L.grubb;
  const gw = (lx, lz) => { const [x, z] = local(G.x, G.z, G.ry, lx, lz); return new THREE.Vector3(x, 0, z); };
  const tap = K.gardenTap({ seed: 8, mount: 'wall', under: 'none', dripping: true });
  // between the front door and the right-hand window box (the box would swallow it)
  const tp = gw(1.22, G.d / 2 + 0.02);
  tap.scale.setScalar(1.5); // a chunky toy tap so it reads from the van
  put(root, tap, tp.x, tp.z, G.ry);
  ctx.surface(tap, 'metal');
  ctx.onUpdate(tap.userData.update);
  const handle = tap.userData.parts.handle;
  const butt = waterButt();
  const bp0 = gw(2.95, G.d / 2 + 0.6); // on the far side of the tap from the door
  put(root, butt, bp0.x, bp0.z, G.ry);
  ctx.collider(butt, new THREE.SphereGeometry(0.6, 8, 6), { y: 0.55 });
  ctx.surface(butt, 'soft');
  const grubb = cast.person({ seed: 2001, hat: { type: 'flatcap', color: '#6b7a5a' }, top: { type: 'overalls', color: '#4f9a3c', sleeves: 'long' }, bottom: { type: 'trousers', color: '#4f9a3c' }, facial: 'bigbeard', age: 'elder', glasses: null, accessory: null, boots: '#5a3a22' },
    0, 0, 0, 'shakeFist', {}, { name: 'Mr Grubb', voice: 'old', lines: until('tap', ['Drip, drip, DRIP!', "That tap's drowning my petunias.", 'Hmph.'], ['There we go, my beauties.', 'Hmph. Thank you, I suppose.', "Prize marrow, this. Don't touch."], ['A swamp! My garden is a SWAMP!', 'Hmph. HMPH!']) });
  grubb.root.position.copy(gw(0.2, G.d / 2 + 2.3));
  grubb.faceTowards(tp);
  const grubbR = routine(ctx, grubb, [['shakeFist', 3], ['angry', 2.4], ['scratch', 1.8]], 1);
  tellLoop('drip', { position: handle, volume: 0.9 }, () => stateOf('tap') !== 'done');
  const can = wateringCan();
  can.visible = false;
  grubb.bones.handR.add(can);
  const bedPt = gw(-2.4, G.d / 2 + 4.2);
  let watering = false, spurt = 0;
  every(ctx, 0.18, () => {
    can.updateWorldMatrix(true, false);
    const sp = new THREE.Vector3(0, -0.02, 0.4).applyMatrix4(can.matrixWorld);
    ctx.fx.emit('blob', sp, 3, { dir: v3(0, -1, 0), speed: 1.2, spread: 0.25, size: 0.05, gravity: 9, life: 0.5, color: ['#bfeeff', '#8fdcf7'] });
  }, { cond: () => watering });
  every(ctx, 0.12, () => { // the water butt gushing after the wrong shot
    spurt -= 0.12;
    const sp = worldPos(butt).add(v3(0, 0.25, 0));
    const dir = new THREE.Vector3(Math.sin(G.ry), 0.35, Math.cos(G.ry)).normalize();
    ctx.fx.emit('blob', sp.add(dir.clone().multiplyScalar(0.5)), 6, { dir, speed: 4, spread: 0.2, size: 0.07, gravity: 9, life: 0.7, color: ['#bfeeff', '#8fdcf7'] });
  }, { cond: () => spurt > 0 });
  ctx.job({
    id: 'tap', title: 'Leaky tap', clue: "Mr Grubb's petunias are drowning and he's fuming about it.",
    hint: "It's dribbling by his front door. Don't go near the water butt!",
    reward: 30, targets: [handle], failTargets: [butt], focus: handle,
    onComplete() {
      quiet('tap');
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
    onFail() {
      quiet('tap');
      spurt = 6;
      const p = worldPos(butt).add(v3(0, 0.6, 0));
      ctx.sfx('splash', { position: p, pitch: 1.3 });
      ctx.fx.burst('water', p, UP, { scale: 1 });
      grubbR.on = false;
      grubb.setAction('angry');
      grubb.tell('anger', { duration: 2.4 });
      ctx.sfx('hey', { position: worldPos(grubb.root).setY(1.6), voice: 'old' });
      ctx.delay(0.5, () => cast.say(grubb, 'Not the BUTT! Now it\'s a swamp!', 3));
      ctx.delay(3.2, () => grubb.setAction('shakeFist'));
    },
  });
  nag('tap', { owner: grubb, r: grubbR, big: 'angry', tell: '!', lines: ['Is nobody going to turn that off?', 'By the door! THE DOOR!'], fn: () => { ctx.fx.emit('blob', tp.clone().setY(0.9), 10, { dir: v3(0, -1, 0), speed: 1.5, spread: 0.4, size: 0.06, gravity: 9, life: 0.6, color: ['#bfeeff', '#8fdcf7'] }); } });
  J.grubb = grubb;

  // ================================================================ secret: the weathervane
  const vane = church.userData.parts.weathervane;
  ctx.collider(vane, new THREE.SphereGeometry(1.05, 8, 6), { y: 0.65 });
  // really is stuck pointing at the pub until it's shot
  const vp0 = worldPos(vane);
  const parentYaw = new THREE.Euler().setFromQuaternion(vane.parent.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
  const stuckYaw = Math.atan2(-(L.pubAt.z - vp0.z), L.pubAt.x - vp0.x) - parentYaw;
  let vaneSpin = 0, vaneVel = 0, vaneFree = 0;
  const vaneDrive = (dt, t) => {
    vaneVel *= Math.exp(-dt * 0.3);
    vaneSpin += vaneVel * dt;
    if (vaneVel > 0) vaneFree = Math.min(1, vaneFree + dt * 0.15);
    vane.rotation.y = stuckYaw + vaneSpin + Math.sin(t * 7.3) * 0.015 * (1 - vaneFree) + Math.sin(t * 0.21) * 0.6 * vaneFree;
  };
  if (church.userData.setVaneOverride) church.userData.setVaneOverride((dt, t) => vaneDrive(dt, t));
  else ctx.onUpdate(vaneDrive);
  ctx.job({
    id: 'vane', bonus: true, title: "Which way's the wind?", clue: 'The weathercock only ever points at the pub. Suspicious.',
    hint: 'Right at the top of the church spire.',
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
  const fruit = D.stalls[0];
  const [mx, mz] = local(fruit.x, fruit.z, fruit.ry, -2.4, 1.9);
  const stack = K.melonStack({ seed: 2 });
  put(root, stack, mx, mz, fruit.ry + 0.2);
  ctx.surface(stack, 'soft');
  ctx.onUpdate(stack.userData.update);
  J.melonStack = stack;
  ctx.job({
    id: 'melons', bonus: true, title: 'Melon mayhem', clue: 'That pyramid of melons is just asking for it.',
    hint: 'By the fruit stall nearest the fête.',
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
        const p0 = worldPos(tr.root);
        ctx.delay(1.2, () => new Walker(tr, [[p0.x, p0.z], [mx - 1.2, mz + 1.6], [mx + 1.6, mz + 2.1], [mx + 0.4, mz + 0.9]], { speed: 2.4, action: 'chase', pingPong: true }));
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
