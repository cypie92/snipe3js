// Dev test range: exercises every gameplay path with primitive stand-ins.
import * as THREE from 'three';
import { part, merge, rbox, cyl, sphere, capsule, cone, meshOf } from '../../world/geo.js';
import { materials } from '../../gfx/materials.js';
import { P, ACCENTS } from '../../gfx/palette.js';

function dummyPerson(color, ctx) {
  const root = new THREE.Group();
  root.add(meshOf([
    part(capsule(0.32, 0.6, 6, 12), color, { y: 0.62 }),
    part(sphere(0.3, 16, 12), P.skin[1], { y: 1.35 }),
    part(sphere(0.07, 8, 6), '#ffffff', { x: 0.1, y: 1.4, z: 0.26 }),
    part(sphere(0.07, 8, 6), '#ffffff', { x: -0.1, y: 1.4, z: 0.26 }),
  ], materials.toy));
  const hat = meshOf([part(cyl(0.22, 0.25, 0.25, 12), P.ink, { y: 0.12 }), part(cyl(0.34, 0.34, 0.04, 16), P.ink)], materials.toy);
  hat.position.y = 1.6;
  root.add(hat);
  const a = { root, t: Math.random() * 5, hop: 0 };
  a.update = (dt) => {
    a.t += dt;
    a.hop = Math.max(0, a.hop - dt);
    root.position.y = Math.abs(Math.sin(a.hop * 12)) * 0.5 * (a.hop > 0 ? 1 : 0);
    root.rotation.y += a.hop > 0 ? dt * 14 : 0;
  };
  a.react = () => {
    a.hop = 0.8;
    ctx.say(root, 'Oi!');
  };
  return a;
}

export default {
  id: 'testrange',
  name: 'Test Range',
  location: 'Dev playground',
  day: 'Any day',
  dev: true,
  parTime: 90,
  preset: 'morning',
  icon: '🎯',
  async build(ctx) {
    const root = ctx.root;
    const ground = meshOf([part(rbox(160, 1, 140, 0.4), P.grass, { y: -0.5, z: -5 })], materials.toy);
    ctx.surface(ground, 'grass');
    root.add(ground);
    const plaza = meshOf([part(cyl(22, 22, 0.2, 48), P.cobble, { y: 0.1, z: -10 })], materials.toy);
    ctx.surface(plaza, 'stone');
    root.add(plaza);

    // A bell on a post
    const post = meshOf([part(rbox(0.5, 8, 0.5, 0.1), P.wood, { y: 4 }), part(rbox(3, 0.4, 0.5, 0.1), P.wood, { y: 8 })], materials.toy);
    post.position.set(-18, 0, -25);
    ctx.surface(post, 'wood');
    root.add(post);
    const bell = meshOf([part(cone(0.8, 1.2, 16), P.gold, { y: -0.6 }), part(sphere(0.2), P.goldDeep, { y: -1.2 })], materials.metal);
    bell.position.set(-18, 7.8, -25);
    bell.name = 'bell';
    root.add(bell);
    ctx.job({
      id: 'bell', title: 'Ring the bell', clue: 'The fête can\'t start without a ding-dong!', reward: 50, targets: [bell],
      onComplete: () => {
        ctx.sfx('bell', { position: bell.position });
        ctx.tweens.run(2.5, (k) => { bell.rotation.z = Math.sin(k * 20) * 0.5 * (1 - k); });
      },
    });

    // Balloons: pop the green one only
    const balloons = [];
    ['#ff5a4e', '#8bd346', '#3a6ee8'].forEach((c, i) => {
      const b = meshOf([part(sphere(0.55, 20, 14), c, { sy: 1.15 })], materials.glossy);
      b.position.set(10 + i * 1.3, 4 + i * 0.3, -18);
      b.name = `balloon-${i}`;
      root.add(b);
      balloons.push(b);
      ctx.onUpdate((dt, t) => { b.position.y = 4 + i * 0.3 + Math.sin(t * 1.5 + i) * 0.15; });
    });
    const popBalloon = (b) => { ctx.fx.burst('pop', b.position, null, { color: [b.geometry.attributes.color.getX(0) > 0.5 ? '#ff5a4e' : '#8bd346'] }); b.visible = false; ctx.sfx('pop', { position: b.position }); };
    ctx.job({
      id: 'balloon', title: 'Pop the green balloon', clue: 'Little Timmy hates green. Only green!', reward: 40,
      targets: [balloons[1]], failTargets: [balloons[0], balloons[2]],
      onComplete: () => popBalloon(balloons[1]),
      onFail: () => { balloons.forEach((b) => b.visible && popBalloon(b)); },
    });

    // Three cans: multi-hit job
    const cans = [];
    for (let i = 0; i < 3; i++) {
      const can = meshOf([part(cyl(0.3, 0.3, 0.7, 16), ACCENTS[i], { y: 0.35 })], materials.glossy);
      can.position.set(-4 + i * 1.2, 1.2, -32);
      can.name = `can-${i}`;
      root.add(can);
      cans.push(can);
    }
    const table = meshOf([part(rbox(5, 1.2, 1.5, 0.1), P.woodLight, { y: 0.6 })], materials.toy);
    table.position.set(-2.8, 0, -32);
    root.add(table);
    ctx.job({
      id: 'cans', title: 'Knock over the cans', clue: 'Three tin cans, three clean shots.', needed: 3, reward: 60, targets: cans,
      onHit: (hit, target) => {
        ctx.tweens.run(0.5, (k) => { target.position.y = 1.2 + Math.sin(k * Math.PI) * 1.2; target.rotation.x = k * 4; target.position.z -= 0.08; });
        ctx.tweens.delay(0.5, () => (target.visible = false));
        return 'progress';
      },
    });

    // Locked job: requires bell
    const flag = meshOf([part(rbox(1.6, 1, 0.08, 0.03), P.tomato, { x: 0.8 })], materials.toy);
    flag.position.set(20, 3, -40);
    const pole = meshOf([part(cyl(0.08, 0.08, 7, 8), P.metal, { y: 3.5 })], materials.metal);
    pole.position.set(20, 0, -40);
    root.add(flag, pole);
    ctx.job({
      id: 'flag', title: 'Raise the flag', clue: 'After the bell rings, up goes the flag.', requires: ['bell'], reward: 40, targets: [flag],
      onComplete: () => ctx.tweens.to(flag.position, { y: 6.6 }, { duration: 1.2, ease: 'backOut' }),
    });

    // Bystanders
    for (let i = 0; i < 6; i++) {
      const p = dummyPerson(ACCENTS[i % ACCENTS.length], ctx);
      p.root.position.set(-10 + i * 4, 0.2, -12 + (i % 2) * 3);
      ctx.actor(p);
    }

    // Props & collectible
    for (let i = 0; i < 4; i++) {
      const crate = meshOf([part(rbox(1, 1, 1, 0.08), P.wood, { y: 0.5 })], materials.toy);
      crate.position.set(4 + i * 1.1, 0.2, -6);
      ctx.prop(crate, { surface: 'wood', onHit: () => ctx.tweens.to(crate.position, { y: crate.position.y + 0.4 }, { duration: 0.15, ease: 'quadOut' }) });
      root.add(crate);
    }
    const spanner = meshOf([part(rbox(0.12, 0.7, 0.05, 0.02), P.gold), part(cyl(0.16, 0.16, 0.06, 12), P.gold, { rx: Math.PI / 2, y: 0.4 })], materials.metal);
    spanner.position.set(-26, 1.2, -8);
    spanner.name = 'spanner';
    ctx.onUpdate((dt, t) => { spanner.rotation.y += dt * 1.5; spanner.position.y = 1.2 + Math.sin(t * 2) * 0.1; });
    ctx.collectible(spanner);
    root.add(spanner);
    ctx.smoke(new THREE.Vector3(-18, 9, -25), { rate: 0.8 });

    return {
      perch: { position: new THREE.Vector3(0, 11, 45), yaw: 0, pitch: -0.14, yawLimit: [-1.3, 1.3], pitchLimit: [-0.7, 0.3] },
      shadowCenter: new THREE.Vector3(0, 0, -15),
      shadowRadius: 70,
    };
  },
};
