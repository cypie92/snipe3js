// Puddleby Green: the skill jobs (new verbs), and the village cricket match the moving one lives in.
//   coconuts  combo: three coconuts off inside six seconds (a stopwatch sticker shows the window;
//             run out of time and Kev puts them all back)
//   rat       timing: Splat the Rat, the sock rat only pokes out of the drainpipe for a second
//   six       moving target: Puddleby's slogger keeps clobbering sixes into the pub pond; shoot the
//             ball out of the sky (a new six every ~12 s until one is caught)
// All three sit 25-90 m from the perch inside its yaw limits with a clear line of fire.
import * as THREE from 'three';
import { LiveMesh } from '../../world/kit/props/index.js';
import { materials } from '../../gfx/materials.js';
import { P } from '../../gfx/palette.js';
import { put, local, yawTo, facePerch, worldPos, v3, routine, every, PERCH } from './util.js';
import { CRICKET } from './layout.js';
import { cricketSet, scoreboard, cricketBat, deckchair, coconutShy, coconutGeo, splatRatStall, toyRat, ComboDial } from './custom.js';

const UP = new THREE.Vector3(0, 1, 0);
const CREAM = '#fff8ee';

/** An invisible marker the hint arrow / capture framing can point at. */
function marker(root, name, x, y, z) {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(x, y, z);
  root.add(o);
  return o;
}

/** Yaw part-way from facing `a` toward facing `b` (both world points), from position p. */
function yawBetween(p, a, b, t = 0.5) {
  const ya = yawTo(p, a), yb = yawTo(p, b);
  return ya + Math.atan2(Math.sin(yb - ya), Math.cos(yb - ya)) * t;
}

export function buildGames(ctx, S, L, D, J, kit) {
  return {
    shy: coconutJob(ctx, S, kit),
    rat: ratJob(ctx, S, kit),
    cricket: cricketJob(ctx, S, D, kit),
  };
}

// ==================================================================== coconut shy: 3 inside 6 s
function coconutJob(ctx, S, { nag, quiet, until, open }) {
  const root = ctx.root, cast = S.cast, rng = ctx.rng;
  const SX = 15.8, SZ = 29.4, SR = facePerch(SX, SZ);
  const WINDOW = 6;
  const shy = coconutShy({ loose: true });
  put(root, shy, SX, SZ, SR);
  ctx.surface(shy, 'wood');
  S.batch.add(shy, 'wood');
  const sw = (lx, lz, y = 0) => { const [x, z] = local(SX, SZ, SR, lx, lz); return v3(x, y, z); };
  // the coconuts: knock-off-able pivots, all drawn by one LiveMesh
  const rack = new THREE.Group();
  rack.name = 'coconutRack';
  put(root, rack, SX, SZ, SR);
  ctx.surface(rack, 'wood');
  const live = new LiveMesh(materials.toy);
  live.name = 'coconuts';
  rack.add(live);
  const nuts = shy.userData.cups.map(([x, y, z], i) => {
    const n = new THREE.Group();
    n.name = 'coconut';
    n.position.set(x, y, z);
    n.rotation.y = i * 1.3;
    n.userData.seat = new THREE.Vector3(x, y, z);
    rack.add(n);
    live.addPiece(n, coconutGeo(i + 2));
    ctx.collider(n, new THREE.SphereGeometry(0.3, 8, 6));
    return n;
  });
  live.build();
  const dial = new ComboDial(rack, { y: 4.3, z: 0.3, size: 1.35 });
  ctx.onUpdate((dt, t) => { live.sync(t); dial.update(dt, t); });
  const focus = marker(rack, 'coconutFocus', 0, 1.43, -0.45);

  const kev = cast.person({ seed: 5101, hat: { type: 'boater', color: '#f2d27a', band: P.tomato }, top: { type: 'stripes', color: P.cobalt, color2: CREAM, sleeves: 'long' }, bottom: { type: 'trousers', color: '#34384a' }, facial: 'handlebar', accessory: null, build: { belly: 0.7 } },
    0, 0, 0, 'hawk', {}, {
      name: 'Coconut Kev', voice: 'man',
      lines: until('coconuts', ['Three in a row wins a coconut!', 'Roll up! Knock three off, quick as you like!', "Nobody's won since 1987."], ['Cleaned me out, that did.', 'Roll up! Roll up!', 'Mind the coconut milk.']),
    });
  kev.root.position.copy(sw(2.5, 0.6));
  kev.root.rotation.y = yawBetween(kev.root.position, PERCH, sw(0, 1.4), 0.35);
  const kevR = routine(ctx, kev, [['hawk', 3.2], ['point', 2.2, { at: sw(0, 0, 1.4) }], ['talk', 2.6], ['checkWatch', 2]], 1.2);
  const dot = cast.person({ age: 'kid', seed: 5111, accessory: null, hair: { style: 'pigtails', color: P.hair[2], tie: P.bubblegum }, top: { type: 'dress', color: P.sunflower, sleeves: 'short' } },
    0, 0, 0, 'impatient', {}, {
      name: 'Little Dot', voice: 'kid',
      lines: until('coconuts', ['I never win anything!', 'Three in a row? That is IMPOSSIBLE.', "I've spent all my pocket money!"], ['A COCONUT! A real one!', 'Best. Fête. Ever.', "I'm going to call it Colin."]),
    });
  dot.root.position.copy(sw(-2.35, 1.35));
  dot.root.rotation.y = yawBetween(dot.root.position, PERCH, sw(-0.6, -0.45), 0.55);
  const dotR = routine(ctx, dot, [['impatient', 2.6], ['shrug', 1.8], ['point', 2.2, { at: sw(0, -0.45, 1.4) }], ['scratch', 1.6]], 0.4);
  // Dot keeps having a go (and missing): the tell reads from the perch
  const throwBall = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), materials.solid(CREAM));
  throwBall.raycast = () => {};
  throwBall.visible = false;
  root.add(throwBall);
  const combo = { on: false, t: 0 };
  every(ctx, () => rng.range(4, 5.5), () => {
    if (dot.busy) return;
    dot.perform('wave', 0.7);
    if (dotR) dotR.t = Math.max(dotR.t, 1);
    const from = worldPos(dot.bones.handR);
    const aim = nuts[rng.int(0, nuts.length - 1)];
    const miss = worldPos(aim).add(v3(rng.range(-0.25, 0.25), rng.range(0.25, 0.5), 0));
    const land = sw(rng.range(-1.2, 1.2), -0.95, 0.08);
    throwBall.visible = true;
    ctx.tweens.run(0.55, (k) => { throwBall.position.lerpVectors(from, miss, k); throwBall.position.y += Math.sin(k * Math.PI) * 0.6; }, {
      onComplete: () => ctx.tweens.run(0.35, (k) => { throwBall.position.lerpVectors(miss, land, k); }, { onComplete: () => { throwBall.visible = false; } }),
    });
    ctx.delay(0.6, () => {
      ctx.sfx('hitSoft', { position: miss, pitch: 1.3, volume: 0.5 });
      if (open('coconuts') && !combo.on && rng.chance(0.45)) cast.say(dot, rng.pick(['Missed AGAIN!', 'Aww!', 'So close!']), 1.5);
    });
  }, { cond: () => open('coconuts') && !combo.on, start: 2.5 });

  const knock = (n) => {
    n.userData.down = true;
    const p0 = n.position.clone();
    const p1 = new THREE.Vector3(p0.x + (rng.chance(0.5) ? -1 : 1) * rng.range(0.1, 0.45), 0.17, -1.3 - rng.range(0, 0.5));
    const spin = rng.range(5, 8);
    const wp = worldPos(n);
    ctx.fx.burst('wood', wp, UP, { scale: 0.7 });
    ctx.sfx('hitWood', { position: wp, pitch: 0.62 });
    ctx.tweens.run(0.6, (k) => {
      n.position.lerpVectors(p0, p1, k);
      n.position.y = p0.y + (p1.y - p0.y) * k * k + Math.sin(k * Math.PI) * 0.5;
      n.rotation.x = -k * spin;
    }, { onComplete: () => { if (n.userData.down) n.visible = false; } });
  };
  const putBack = () => {
    let i = 0;
    for (const n of nuts) {
      if (!n.userData.down) continue;
      ctx.delay(0.55 + 0.2 * i++, () => {
        n.visible = true;
        n.userData.down = false;
        n.rotation.x = 0;
        const seat = n.userData.seat;
        ctx.sfx('pop', { position: worldPos(n), pitch: 1.5, volume: 0.45 });
        ctx.tweens.run(0.3, (k) => { n.position.set(seat.x, seat.y + Math.sin(k * Math.PI) * 0.4, seat.z); n.scale.setScalar(0.3 + 0.7 * k); }, { onComplete: () => n.scale.setScalar(1) });
      });
    }
  };
  const job = ctx.job({
    id: 'coconuts', title: 'Coconut shy', clue: "Little Dot has spent all her pocket money at the coconut shy and still hasn't won a thing.",
    hint: 'Kev only pays out for three coconuts in a row, quick-sharp, before he puts them back.',
    reward: 50, needed: 3, targets: nuts, focus,
    onHit(hit, target, j) {
      if (target.userData.down || !open('coconuts')) return 'ignore';
      knock(target);
      const count = j.progress + 1;
      if (!combo.on) { combo.on = true; combo.t = WINDOW; dial.show(); }
      dial.set(combo.t / WINDOW, count, j.needed);
      if (count < j.needed) {
        ctx.popText(worldPos(target).add(v3(0, 0.7, 0)), count === 1 ? 'ONE!' : 'TWO!', { cls: 'pop-big', duration: 0.9 });
        if (count === 1) cast.say(kev, "One! Clock's ticking...", 1.8);
      }
      return 'progress';
    },
    onComplete() {
      quiet('coconuts');
      combo.on = false;
      dial.set(1, 3, 3);
      dial.hide('good');
      kevR.on = false;
      dotR.on = false;
      const top = sw(0, 0.3, 3.9);
      ctx.popText(top, 'THREE IN A ROW!', { cls: 'pop-big', duration: 1.8 });
      ctx.sfx('bell', { position: top, pitch: 1.7 });
      ctx.delay(0.25, () => ctx.sfx('fanfare', { position: top, volume: 0.7 }));
      ctx.delay(0.2, () => ctx.fx.burst('confetti', top, UP, { scale: 0.9 }));
      kev.setAction('cheer');
      cast.say(kev, 'Well I never! A coconut for the young lady!', 3);
      // Dot gets her prize: a coconut held up high
      const prize = new THREE.Mesh(coconutGeo(9), materials.toy);
      prize.scale.setScalar(0.9);
      prize.position.set(0, -0.12, 0.08);
      ctx.delay(1.2, () => { dot.bones.handR.add(prize); ctx.sfx('pop', { position: worldPos(dot.root).setY(1), pitch: 1.2 }); });
      dot.faceTowards(PERCH);
      dot.perform('cheer', 2.4);
      dot.celebrate();
      ctx.sfx('yay', { position: worldPos(dot.root).setY(1.2), voice: 'kid' });
      ctx.delay(2.6, () => dot.setAction('dance'));
      ctx.delay(3.2, () => kev.setAction('clap'));
      ctx.delay(0.8, () => cast.cheerNear(worldPos(shy), 9, { except: [kev, dot] }));
    },
  });
  // the combo clock: run out of time and it all resets (progress back to 0 on the clipboard too)
  ctx.onUpdate((dt) => {
    if (!combo.on || job.state !== 'open') return;
    combo.t -= dt;
    dial.set(combo.t / WINDOW, job.progress, job.needed);
    if (combo.t > 0) return;
    combo.on = false;
    job.progress = 0;
    ctx.jobs.emit('progress', job);
    dial.hide('bad');
    ctx.popText(sw(0, 0.3, 3.2), 'TOO SLOW!', { cls: 'pop-bad', duration: 1.4 });
    ctx.sfx('aww', { position: worldPos(dot.root).setY(1.2), voice: 'kid' });
    cast.say(kev, rng.pick(["Too slow! Back up they go.", "Time's up! Three in a row, mind."]), 2.4);
    kev.perform('shrug', 1.4);
    putBack();
  });
  nag('coconuts', { owner: dot, r: dotR, idle: ['?', 9], lines: ['Can YOU win me a coconut?', 'Three in a row, Kev says!'], ready: () => !combo.on });
  return { shy, nuts, kev, dot, dial, combo };
}

// ==================================================================== Splat the Rat: timing
function ratJob(ctx, S, { nag, quiet, until, open }) {
  const root = ctx.root, cast = S.cast, rng = ctx.rng;
  const RX = -16.8, RZ = 27.2, RR = facePerch(RX, RZ); // clear of the dunk-tank kids
  const OUT = 1.1; // seconds the rat sits on the felt (plus a slide in and a tug back)
  const stall = splatRatStall();
  put(root, stall, RX, RZ, RR);
  ctx.surface(stall, 'wood');
  S.batch.addMeshes(stall, 'wood');
  const { mouth, matEnd, top, bell } = stall.userData.parts;
  const rw = (lx, lz, y = 0) => { const [x, z] = local(RX, RZ, RR, lx, lz); return v3(x, y, z); };
  const mouthW = worldPos(mouth), endW = worldPos(matEnd), topW = worldPos(top), bellW = worldPos(bell);
  // shooting the pipe or the felt too early (or late) gets a nudge instead of a plain puff of dust
  ctx.collider(stall, new THREE.BoxGeometry(1.45, 3.3, 0.5), { y: 1.75, z: -0.3 });
  ctx.collider(stall, new THREE.BoxGeometry(1.3, 0.12, 1.5), { y: 0.36, z: 0.4 });
  let splatted = false, lastNudge = -9;
  ctx.prop(stall, {
    surface: 'wood', onHit: () => {
      if (splatted || !open('rat') || ctx.game.time - lastNudge < 0.8) return;
      lastNudge = ctx.game.time;
      ctx.popText(mouthW.clone().add(v3(0, 1.1, 0)), rat.visible ? 'Missed!' : 'Too early!', { cls: 'pop-info', duration: 1 });
      if (!rat.visible && rng.chance(0.5)) cast.say(barry, rng.pick(['Oi! Wait for the rat!', 'Patience, sunshine!']), 1.6);
    },
  });
  // the sock rat: only visible (so only hittable) while it's out of the pipe
  const rat = toyRat();
  rat.scale.setScalar(1.3);
  rat.visible = false;
  rat.rotation.y = RR;
  rat.position.copy(mouthW);
  root.add(rat);
  ctx.surface(rat, 'soft');
  ctx.collider(rat, new THREE.SphereGeometry(0.34, 8, 6), { y: 0.14, z: 0.04 });
  const focus = marker(root, 'ratFocus', endW.x, endW.y + 0.15, endW.z);

  const barry = cast.person({ seed: 5201, hat: { type: 'flatcap', color: '#8b5e3c' }, top: { type: 'apron', color: '#fbf7f0', color2: '#fbf7f0', apronStripe: P.teal, sleeves: 'short' }, bottom: { type: 'trousers', color: '#3d4a6b' }, facial: 'bigbeard', accessory: null, build: { belly: 1, width: 1.2 } },
    0, 0, 0, 'hawk', {}, {
      name: 'Big Barry', voice: 'man',
      lines: until('rat', ["Splat the rat! Nobody's done it all day!", 'Too slow, the lot of you!', 'Roll up! Three goes, twenty pee!'], ['Well I never. A winner.', 'That was my lucky rat, that.', 'Roll up! ...Anybody?']),
    });
  barry.root.position.copy(rw(-1.05, 0.05));
  barry.root.rotation.y = yawBetween(barry.root.position, PERCH, topW, 0.3);
  const barryR = routine(ctx, barry, [['hawk', 3.4], ['talk', 2.4], ['impatient', 2.2]], 0.6);
  const timmy = cast.person({ age: 'kid', seed: 5211, accessory: null, hat: { type: 'cap', color: P.tomato, color2: CREAM }, top: { type: 'stripes', color: P.teal, color2: CREAM, sleeves: 'short' }, bottom: { type: 'shorts', color: '#3d4a6b' } },
    0, 0, 0, 'idle', {}, {
      name: 'Timmy', voice: 'kid',
      lines: until('rat', ['It is TOO QUICK!', 'I nearly had it!', 'Can YOU splat it, mister?'], ['We SPLATTED it!', 'Splat! Splat! Splat!', 'Poor ratty.']),
    });
  timmy.root.position.copy(rw(1.05, 1.0));
  timmy.root.rotation.y = yawBetween(timmy.root.position, PERCH, endW, 0.6);
  const bat = cricketBat();
  bat.scale.setScalar(0.8);
  timmy.bones.handR.add(bat);
  const timmyR = routine(ctx, timmy, [['idle', 2.2], ['impatient', 2.4], ['shrug', 1.6]], 1.2);

  const cyc = { phase: 'wait', t: 2.2, swung: false };
  const rattle = () => { for (let i = 0; i < 4; i++) ctx.delay(i * 0.1, () => ctx.sfx('tick', { position: topW.clone().lerp(mouthW, i / 4), pitch: 1.2 + i * 0.15, volume: 0.7 })); };
  ctx.onUpdate((dt, t) => {
    if (splatted || !ctx.jobs.get('rat')) return;
    cyc.t -= dt;
    if (cyc.phase === 'wait') {
      if (cyc.t > 0) return;
      cyc.phase = 'load'; cyc.t = 0.7;
      if (!barry.busy) barry.perform('point', 0.9, { at: topW });
      barryR.t = Math.max(barryR.t, 1);
    } else if (cyc.phase === 'load') {
      if (cyc.t > 0) return;
      cyc.phase = 'drop'; cyc.t = 0.45;
      rattle();
    } else if (cyc.phase === 'drop') {
      if (cyc.t > 0) return;
      cyc.phase = 'out'; cyc.t = OUT + 0.2; cyc.swung = false;
      rat.visible = true;
      ctx.sfx('whoosh', { position: mouthW, pitch: 1.9, volume: 0.5 });
    } else if (cyc.phase === 'out') {
      const k = Math.min(1, (OUT + 0.2 - cyc.t) / 0.2);
      rat.position.lerpVectors(mouthW, endW, 1 - (1 - k) ** 3);
      rat.rotation.y = RR + (k >= 1 ? Math.sin(t * 18) * 0.18 : 0);
      rat.rotation.z = k >= 1 ? Math.sin(t * 23) * 0.06 : 0;
      if (!cyc.swung && cyc.t < OUT * 0.45) { // Timmy swings... and misses
        cyc.swung = true;
        timmy.perform('wave', 0.45);
        timmyR.t = Math.max(timmyR.t, 1);
        ctx.sfx('whoosh', { position: endW, pitch: 1.4, volume: 0.45 });
        if (rng.chance(0.4)) ctx.delay(0.3, () => cast.say(timmy, rng.pick(['Missed!', 'Too quick!', 'Argh!']), 1.3));
      }
      if (cyc.t <= 0) { cyc.phase = 'back'; cyc.t = 0.22; }
    } else if (cyc.phase === 'back') {
      rat.position.lerpVectors(endW, mouthW, Math.min(1, 1 - cyc.t / 0.22));
      if (cyc.t <= 0) { rat.visible = false; cyc.phase = 'wait'; cyc.t = rng.range(2.3, 3.4); }
    }
  });
  ctx.job({
    id: 'rat', title: 'Splat the rat', clue: "Nobody's splatted Big Barry's rat all morning, and he won't stop crowing about it.",
    hint: "Keep your eye on the end of the drainpipe. It only pops out for a second.",
    reward: 50, targets: [rat], focus,
    onComplete() {
      splatted = true;
      quiet('rat');
      if (!rat.visible) { rat.visible = true; rat.position.copy(endW); } // (a debug complete while it's in the pipe)
      const p = worldPos(rat);
      rat.position.y = endW.y;
      rat.rotation.z = 0;
      const s0 = rat.scale.x;
      ctx.tweens.run(0.16, (k) => rat.scale.set(s0 * (1 + 0.55 * k), s0 * (1 - 0.74 * k), s0 * (1 + 0.3 * k)));
      ctx.popText(p.clone().add(v3(0, 1.2, 0)), 'SPLAT!', { cls: 'pop-big', duration: 1.6 });
      ctx.sfx('hitSoft', { position: p, pitch: 0.55 });
      ctx.sfx('spring', { position: p, pitch: 0.6 });
      ctx.fx.burst('stars', p.clone().add(v3(0, 0.4, 0)), UP, { scale: 0.8 });
      for (let i = 0; i < 3; i++) ctx.delay(0.35 + i * 0.3, () => ctx.sfx('bell', { position: bellW, pitch: 2.3, volume: 0.8 }));
      ctx.delay(0.5, () => ctx.fx.burst('confetti', topW.clone().add(v3(0, 0.3, 0)), UP, { scale: 0.8 }));
      barryR.on = false;
      timmyR.on = false;
      barry.perform('alarm', 1.6);
      barry.tell('!?', { duration: 1.6 });
      ctx.delay(0.5, () => cast.say(barry, "Well I NEVER! Nobody's ever splatted it!", 3));
      ctx.delay(2.2, () => barry.setAction('clap'));
      timmy.faceTowards(PERCH);
      timmy.perform('cheer', 2.4);
      timmy.celebrate();
      ctx.sfx('yay', { position: worldPos(timmy.root).setY(1.1), voice: 'kid' });
      ctx.delay(2.6, () => timmy.setAction('dance'));
      ctx.delay(0.8, () => cast.cheerNear(p, 9, { except: [barry, timmy] }));
    },
  });
  nag('rat', { owner: timmy, r: timmyR, idle: ['?', 10], lines: ["It's too quick for me!", 'Somebody splat it! Please!'] });
  return { stall, rat, barry, timmy, cyc };
}

// ==================================================================== cricket + catch the six
// Puddleby v Brambley on the east meadow over the ring road, the striker at the NORTH end facing the
// perch. The bowler runs in every ~12 s; while the six job is open every ball goes for six, arcing
// over the road into the pub pond (ducks bonked, Alfie furious). Afterwards: blocks, fours, HOWZAT!
function cricketJob(ctx, S, D, { nag, quiet, until, open }) {
  const root = ctx.root, cast = S.cast, rng = ctx.rng;
  const [CX, CZ] = CRICKET;
  const HALF = 8;
  const SZ = CZ - HALF, BZ = CZ + HALF; // striker's end (north), bowler's end (south)
  const set = cricketSet({ half: HALF });
  put(root, set, CX, CZ, Math.PI); // the kit's bowler's-end stumps + sight screen go to the south end
  ctx.surface(set, 'dust');
  S.batch.add(set, 'dust');
  const sb = scoreboard();
  put(root, sb, 60.2, -8.6, facePerch(60.2, -8.6) - 0.35);
  ctx.surface(sb, 'wood');
  S.batch.add(sb, 'wood');
  // the striker's stumps (dynamic: the bails fly on a HOWZAT)
  const stumpMat = materials.solid('#e8d7b0', { roughness: 0.7 });
  const stumps = new THREE.Group();
  stumps.name = 'stumps';
  for (const x of [-0.12, 0, 0.12]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.8, 6), stumpMat); m.position.set(x, 0.4, 0); m.castShadow = true; stumps.add(m); }
  const bails = [-0.06, 0.06].map((x) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.03), stumpMat); m.position.set(x, 0.815, 0); stumps.add(m); return m; });
  put(root, stumps, CX, SZ, 0);
  ctx.surface(stumps, 'wood');
  const toBowler = v3(CX, 0, BZ), toStriker = v3(CX, 0, SZ);
  const whites = (seed, extra = {}) => ({ seed, top: { type: 'shirt', color: '#fbf7f0', sleeves: 'long' }, bottom: { type: 'trousers', color: '#fbf7f0' }, hat: { type: 'cap', color: '#2f7d62', color2: '#fbf7f0' }, accessory: null, ...extra });
  const lines = ['Owzat!', 'Well bowled!', 'Tea in ten minutes, chaps.', 'Catch it! CATCH IT!', 'Leg before, surely?'];
  const striker = cast.person(whites(4801, { hat: { type: 'cap', color: '#3d4a6b' }, build: { width: 1.2, belly: 0.6 } }), CX + 0.35, SZ + 1.1, 0, 'idle', {}, {
    name: 'batsman', lines: until('six', ['SIX! And another!', "Can't stop, won't stop!", 'Duck pond, here it comes!'], ['Caught?! Off WHAT?', 'Just a quick single now.', 'Middle stump, please, umpire.']),
  });
  striker.faceTowards(toBowler);
  striker.bones.handR.add(cricketBat());
  const other = cast.person(whites(4802, { hat: { type: 'cap', color: '#3d4a6b' } }), CX - 1.2, BZ - 1.0, 0, 'idle', {}, { name: 'batsman', lines: ['Yes! No! Wait! Sorry!'] });
  other.faceTowards(toStriker);
  other.bones.handR.add(cricketBat());
  const keeper = cast.person(whites(4803), CX, SZ - 2.3, 0, 'idle', {}, { name: 'wicketkeeper', lines });
  keeper.faceTowards(toBowler);
  const umpire = cast.person({ seed: 4804, top: { type: 'smock', color: '#fbf7f0', sleeves: 'long' }, bottom: { type: 'trousers', color: '#3d4a6b' }, hat: { type: 'bucket', color: '#fbf7f0' }, accessory: null, age: 'elder' },
    CX + 0.95, BZ + 1.3, 0, 'idle', {}, { name: 'umpire', lines: ['Not out.', 'Over!', 'Play!'] });
  umpire.faceTowards(toStriker);
  const fielders = [[-1.9, -10.6], [-5.6, -4.6], [4.4, 1.5], [-5.2, 3.6], [1.2, -13]].map(([dx, dz], i) => {
    const f = cast.person(whites(4811 + i), CX + dx, CZ + dz, 0, 'idle', {}, { name: 'fielder', lines });
    f.faceTowards(toStriker);
    return f;
  });
  const fans = [[58.7, 20.4], [59.5, 23.3]].map(([x, z], i) => {
    const dc = deckchair({ colors: [[P.teal, '#fff8ee'], [P.sunflower, '#fff8ee']][i], seed: 7 + i });
    const ry = yawTo(v3(x, 0, z), v3(CX, 0, CZ - 2));
    put(root, dc, x, z, ry);
    ctx.surface(dc, 'soft');
    S.batch.add(dc, 'soft');
    const [px, pz] = local(x, z, ry, 0, 0.22);
    return cast.person({ seed: 4821 + i, age: i ? 'elder' : 'adult', hat: i ? { type: 'boater', color: '#f2d27a' } : { type: 'sunhat', color: '#fff1d6', band: P.teal }, accessory: null }, px, pz, ry, 'lie', { pose: 'deckchair', height: dc.userData.seat, awake: true },
      { name: 'spectator', lines: ['Good shot, sir!', 'Jolly good.', 'Is it tea yet?'] });
  });
  // the bowler: mark -> run in -> bowl -> walk back
  const mark = v3(CX - 0.4, 0, BZ + 7), crease = v3(CX - 0.25, 0, BZ + 0.3);
  const bowler = cast.person(whites(4805), mark.x, mark.z, 0, 'idle', {}, { name: 'bowler', lines: ['Here comes the googly!', 'Not ANOTHER six...'] });
  bowler.faceTowards(toStriker);
  // the ball: a plain red ball for deliveries; during a six it swells a little, trails puffs and
  // carries a big invisible collider so it can be shot out of the sky
  const ball = new THREE.Group();
  ball.name = 'cricketBall';
  const ballMat = new THREE.MeshStandardMaterial({ color: '#e0182f', roughness: 0.3, emissive: '#ff3030', emissiveIntensity: 0.35 });
  ballMat.name = 'cricketBall';
  const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 9), ballMat);
  ballMesh.scale.setScalar(1.4);
  ballMesh.castShadow = false;
  ballMesh.raycast = () => {};
  ball.add(ballMesh);
  const hitBox = ctx.collider(ball, new THREE.SphereGeometry(1.1, 10, 8));
  hitBox.userData.noHit = true;
  ball.visible = false;
  root.add(ball);
  ctx.surface(ball, 'soft');

  // ---- Alfie feeds the pub-pond ducks (the job owner) on the far bank, facing the perch
  const pond = D.pond;
  const PC = v3(pond.x, 0.2, pond.z);
  const alfie = cast.person({ age: 'kid', seed: 5301, accessory: null, hat: { type: 'bucket', color: P.sunflower }, top: { type: 'raincoat', color: P.sunflower, sleeves: 'long' }, bottom: { type: 'shorts', color: '#3d4a6b' }, boots: '#3f8a4e' },
    pond.x + pond.r * 0.8, pond.z - pond.r * 0.8, 0, 'point', { at: PC }, {
      name: 'Alfie', voice: 'kid',
      lines: until('six', ['Not again! Poor Dilys!', "It's raining cricket balls!", 'Mind your heads, duckies!'], ['The ducks say thank you!', 'Quack quack! That means thanks.', 'Dilys is doing a happy waddle.']),
    });
  alfie.root.rotation.y = yawBetween(alfie.root.position, PERCH, PC, 0.45);
  const alfieR = routine(ctx, alfie, [['point', 2.6, { at: PC }], ['clap', 1.6], ['idle', 2.2], ['point', 2, { at: PC }]], 0.8);

  // ---- the six: a readable high arc from the bat over the road into the pond
  const six = { on: false, t: 0, T: 2.9, h: 19, from: new THREE.Vector3(), to: new THREE.Vector3(), trail: 0, landT: -9 };
  const startSix = (hitAt) => {
    six.on = true;
    six.t = 0;
    six.trail = 0;
    six.from.copy(hitAt);
    six.to.set(pond.x + rng.range(-1.1, 1.1), pond.waterY + 0.05, pond.z + rng.range(-0.8, 0.8));
    ball.visible = true;
    ballMesh.scale.setScalar(3); // a big toy ball for the six: ~0.6 m, reads at 2x from 70 m
    hitBox.userData.noHit = !open('six');
  };
  const splashDown = () => {
    six.on = false;
    six.landT = ctx.game.time;
    ball.visible = false;
    hitBox.userData.noHit = true;
    const to = six.to.clone();
    ctx.fx.burst('water', to, UP, { scale: 1.2 });
    ctx.sfx('splash', { position: to, pitch: 1.3 });
    ctx.delay(0.25, () => ctx.sfx('quack', { position: to, pitch: 1.25 }));
    for (const d of D.pondDucks || []) if (!d.busy) d.perform?.('flutter', 1.1);
    if (!open('six')) return;
    ctx.popText(to.clone().setY(1.7), rng.pick(['BONK!', 'SPLOSH!', 'QUACK!']), { cls: 'pop-info', duration: 1.2 });
    ctx.delay(0.4, () => {
      if (alfie.busy) return;
      alfie.perform('shakeFist', 1.8);
      alfieR.t = Math.max(alfieR.t, 2);
      if (rng.chance(0.6)) cast.say(alfie, rng.pick(['Not AGAIN!', 'Poor Dilys!', 'Oi! Cricket people!']), 1.8);
    });
  };
  ctx.onUpdate((dt) => {
    // hold the ball still while a bullet-cam flies at it (the world only creeps in slow-mo anyway)
    if (!six.on || ctx.game.bulletCam?.active) return;
    six.t += dt;
    const k = Math.min(1, six.t / six.T);
    ball.position.lerpVectors(six.from, six.to, k);
    ball.position.y += 4 * six.h * k * (1 - k);
    six.trail -= dt;
    if (six.trail <= 0) { // a comet tail of chunky white puffs so the arc reads against the hills
      six.trail = 0.035;
      ctx.fx.emit('blob', ball.position, 1, { speed: 0, spread: 0, size: 0.32, gravity: 0, drag: 0, life: 0.7, jitter: 0.08, color: ['#ffffff', '#fff6e0', '#ffe9c2'] });
    }
    if (k >= 1) splashDown();
  });
  const sixFocus = marker(root, 'sixFocus', CX - 7, 5, SZ + 3.5); // between the bat and the pond, low on the arc

  // ---- deliveries and outcomes
  const arc = (from, to, h, secs, onDone) => ctx.tweens.run(secs, (k) => {
    ball.position.lerpVectors(from, to, k);
    ball.position.y += Math.sin(Math.PI * k) * h;
  }, { onComplete: onDone });
  const hide = (s) => ctx.delay(s, () => { if (!six.on) ball.visible = false; });
  const clap = (who) => who.forEach((p, i) => ctx.delay(0.2 * i, () => p.perform('clap', 2)));
  const outcome = () => {
    const hitAt = ball.position.clone();
    if (open('six')) { // SIX... straight into the pub pond
      striker.perform('wave', 0.8);
      ctx.sfx('hitWood', { position: hitAt, volume: 1, pitch: 0.85 });
      ctx.popText(hitAt.clone().setY(3), 'SIX!', { cls: 'pop-big', duration: 1.6 });
      ctx.delay(0.5, () => umpire.perform('cheer', 1.6)); // both arms up: that's six
      fielders.forEach((f, i) => ctx.delay(0.3 + i * 0.1, () => f.perform('lookUp', 2.4)));
      startSix(hitAt);
      return;
    }
    const r = rng.random();
    if (r < 0.45) { // a dead bat
      striker.perform('wave', 0.5);
      ctx.sfx('hitWood', { position: hitAt, volume: 0.5, pitch: 1.3 });
      arc(hitAt, hitAt.clone().add(v3(rng.range(-0.8, 0.8), -hitAt.y + 0.1, 1.6)), 0.2, 0.5, () => hide(0.8));
    } else if (r < 0.85) { // FOUR along the ground
      striker.perform('wave', 0.6);
      ctx.sfx('hitWood', { position: hitAt, volume: 0.8 });
      const side = rng.chance(0.5) ? -1 : 1;
      const to = v3(CX + side * rng.range(6.5, 8), 0.12, CZ + rng.range(-12, 8));
      arc(hitAt, to, 0.3, 1.5, () => {
        hide(1.2);
        ctx.popText(to.clone().setY(2.2), 'FOUR!', { cls: 'pop-info', duration: 1.4 });
        clap([...fans, other]);
        fielders.find((f) => f.root.position.distanceTo(to) < 9)?.perform('shrug', 1.6);
      });
    } else { // bowled him! bails fly
      ctx.sfx('hitWood', { position: hitAt, volume: 0.7, pitch: 1.5 });
      bails.forEach((b, i) => {
        const x0 = b.position.x, v = (i ? 1 : -1) * rng.range(0.4, 0.9);
        ctx.tweens.run(0.8, (k) => { b.position.set(x0 + v * k, 0.815 + Math.sin(Math.PI * k) * 0.9 - k * 0.8, -k * 0.6); b.rotation.z = k * 9; });
      });
      hide(0.3);
      ctx.delay(0.3, () => { ctx.popText(worldPos(stumps).setY(2.4), 'HOWZAT!', { cls: 'pop-big', duration: 1.5 }); bowler.perform('alarm', 1.6); keeper.perform('cheer', 1.6); ctx.sfx('gasp', { position: worldPos(stumps), volume: 0.6 }); });
      ctx.delay(1.2, () => { umpire.perform('point', 2.4); umpire.pointAt(worldPos(umpire.root).add(v3(0, 9, -1))); cast.say(umpire, 'OUT!', 1.8); });
      ctx.delay(1.6, () => striker.perform('shrug', 2.2));
      ctx.delay(4.5, () => { umpire.pointAt(null); bails.forEach((b, i) => { b.position.set(i ? 0.06 : -0.06, 0.815, 0); b.rotation.set(0, 0, 0); }); });
    }
  };
  const deliver = () => {
    const from = worldPos(bowler.bones.handR);
    const to = worldPos(striker.root).add(v3(-0.25, 0.55, 0.55));
    const pitchAt = from.clone().lerp(to, 0.74).setY(0.05);
    ballMesh.scale.setScalar(1.4);
    ball.visible = true;
    ball.position.copy(from);
    ctx.tweens.run(0.52, (k) => {
      if (k < 0.74) ball.position.lerpVectors(from, pitchAt, k / 0.74);
      else ball.position.lerpVectors(pitchAt, to, (k - 0.74) / 0.26);
    }, { onComplete: outcome });
  };
  let phase = 'wait', pt = rng.range(2, 4);
  ctx.onUpdate((dt) => {
    pt -= dt;
    if (phase === 'wait' && pt <= 0) { phase = 'run'; pt = 2.2; bowler.speed = mark.distanceTo(crease) / 2.2; bowler.setAction('run'); }
    else if (phase === 'run') {
      bowler.root.position.lerpVectors(mark, crease, 1 - Math.max(0, pt) / 2.2);
      if (pt <= 0) { phase = 'bowl'; pt = 0.3; bowler.speed = 0; bowler.setAction('idle', {}, 0.1); bowler.perform('wave', 0.9); }
    } else if (phase === 'bowl' && pt <= 0) { deliver(); phase = 'follow'; pt = 1.8; }
    else if (phase === 'follow' && pt <= 0) { phase = 'back'; pt = 5.2; bowler.faceTowards(mark); bowler.speed = mark.distanceTo(crease) / 5.2; bowler.setAction('walk'); }
    else if (phase === 'back') {
      bowler.root.position.lerpVectors(crease, mark, 1 - Math.max(0, pt) / 5.2);
      if (pt <= 0) { phase = 'wait'; pt = rng.range(2.5, 4.5); bowler.speed = 0; bowler.setAction('idle'); bowler.faceTowards(toStriker); }
    }
  });

  // ---- the job: knock the ball out of the air, it drops into a fielder's hands. CAUGHT!
  let caughtAt = null;
  ctx.job({
    id: 'six', title: 'Catch the six!', clue: "The pub-pond ducks keep getting bonked on the head. Puddleby's big hitter can't stop clobbering sixes.",
    hint: 'Watch the cricket. When the ball goes up, knock it out of the sky before the splash.',
    reward: 70, targets: [ball], focus: sixFocus,
    onHit(hit) {
      // the bullet takes ~0.1 s to arrive: a ball hit just before it splashed still counts
      if (!six.on && ctx.game.time - six.landT > 0.3) return 'ignore';
      caughtAt = hit.point.clone();
      return 'complete';
    },
    onComplete() {
      quiet('six');
      six.on = false;
      hitBox.userData.noHit = true;
      const p = caughtAt || (six.on ? ball.position.clone() : v3(CX - 4, 11, CZ - 2)); // (debug completes start mid-air)
      ball.position.copy(p);
      ballMesh.scale.setScalar(3);
      ball.visible = true;
      ctx.fx.burst('stars', p, UP, { scale: 1 });
      ctx.sfx('hitWood', { position: p, pitch: 1.7 });
      ctx.popText(p.clone().add(v3(0, 1.2, 0)), 'TOK!', { cls: 'pop-big', duration: 1 });
      // it drops into the nearest fielder's hands
      const catcher = [...fielders, keeper].reduce((a, b) => (Math.hypot(a.root.position.x - p.x, a.root.position.z - p.z) <= Math.hypot(b.root.position.x - p.x, b.root.position.z - p.z) ? a : b));
      catcher.faceTowards(p);
      catcher.setAction('lookUp');
      const from = p.clone(), hand = new THREE.Vector3();
      ctx.tweens.run(1.2, (k) => {
        catcher.bones.handR.getWorldPosition(hand);
        ball.position.lerpVectors(from, hand, k);
        ball.position.y += Math.sin(k * Math.PI) * 2.2;
        ballMesh.scale.setScalar(3 - 1.6 * k); // back to cricket-ball size as it drops into the gloves
      }, {
        onComplete: () => {
          ball.visible = false;
          catcher.faceTowards(PERCH);
          catcher.setAction('idle');
          catcher.perform('cheer', 2.4);
          catcher.celebrate();
          ctx.popText(worldPos(catcher.root).setY(2.6), 'CAUGHT!', { cls: 'pop-big', duration: 1.6 });
          ctx.sfx('crowdCheer', { position: worldPos(catcher.root), volume: 0.7 });
          clap(fans);
          ctx.delay(0.6, () => { umpire.perform('point', 2.4); umpire.pointAt(worldPos(umpire.root).add(v3(0, 9, -1))); cast.say(umpire, 'OUT!', 1.8); });
          ctx.delay(3.2, () => umpire.pointAt(null));
          ctx.delay(1.3, () => { striker.perform('shrug', 2.4); cast.say(striker, 'Caught?! Off a flying... what?!', 2.6); });
          ctx.delay(1.8, () => {
            alfieR.on = false;
            alfie.perform('cheer', 2.2);
            alfie.celebrate();
            cast.say(alfie, 'The ducks are saved! Quack quack!', 2.8);
            ctx.sfx('yay', { position: worldPos(alfie.root).setY(1.1), voice: 'kid' });
            for (let i = 0; i < 3; i++) ctx.delay(0.4 + i * 0.35, () => ctx.sfx('quack', { position: PC, pitch: 1 + i * 0.12 }));
            ctx.delay(2.4, () => alfie.setAction('dance'));
          });
        },
      });
    },
  });
  nag('six', { owner: alfie, r: alfieR, idle: ['anger', 10], lines: ['Stop the cricket balls, somebody!', 'Catch it before it lands!'] });
  return { striker, bowler, keeper, umpire, fielders, fans, other, alfie, ball, six };
}
