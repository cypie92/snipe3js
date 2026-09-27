// Demo catalogue of every kit asset (used by sandbox/props.html and smoke tests).
// Each entry: [name, category, () => Object3D]. Order = sandbox index (?focus=<index>).
import * as N from '../nature/index.js';
import * as K from './index.js';
import * as THREE from 'three';
import { P } from '../../../gfx/palette.js';
import { materials } from '../../../gfx/materials.js';

/** Demo only: a patch of sea under a floating prop (waterline 3 cm above the stage ground). */
function onWater(obj, pad = 1.6) {
  const g = new THREE.Group();
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const w = box.max.x - box.min.x + pad * 2, d = box.max.z - box.min.z + pad * 2;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), materials.solid('#3aa6dc', { roughness: 0.22 }));
  water.position.set((box.min.x + box.max.x) / 2, 0.03, (box.min.z + box.max.z) / 2);
  water.receiveShadow = true;
  water.userData.scaffold = true;
  obj.position.y += 0.03;
  g.add(water, obj);
  g.name = obj.name;
  g.userData = obj.userData;
  return g;
}

/** Demo only: raise a quayside prop onto a stone quay block whose edge drops to the sea at z = edge. */
function onQuay(obj, h = 1.4, edge = 0.9) {
  const g = new THREE.Group();
  const quay = new THREE.Mesh(new THREE.BoxGeometry(3.4, h, 2.6), materials.solid('#cfc6b8'));
  quay.position.set(0, h / 2, edge - 1.3);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.2).rotateX(-Math.PI / 2), materials.solid('#3aa6dc', { roughness: 0.22 }));
  water.position.set(0, 0.03, edge + 1.6);
  for (const m of [quay, water]) { m.castShadow = m === quay; m.receiveShadow = true; m.userData.scaffold = true; }
  obj.position.y += h;
  g.add(quay, water, obj);
  g.name = obj.name;
  g.userData = obj.userData;
  return g;
}

/** Demo only: a stub of garden wall behind a wall-mounted prop. */
function onWall(obj) {
  const g = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.3, 0.3), materials.solid('#d9785c'));
  wall.position.set(0, 0.65, -0.15);
  wall.castShadow = true;
  wall.userData.scaffold = true;
  g.add(wall, obj);
  g.name = obj.name;
  g.userData = obj.userData;
  return g;
}

/** Demo only: hang the kite's knot in a round tree's canopy edge. */
function inTree(obj) {
  const g = new THREE.Group();
  const t = N.tree({ type: 'round', seed: 9 });
  t.traverse((m) => { if (m.isMesh) m.userData.scaffold = true; });
  g.add(t);
  obj.position.set(2.6, 3.3, 1.9);
  g.add(obj);
  g.name = obj.name;
  g.userData = obj.userData;
  return g;
}

/** Demo only: plant two wooden poles under the ends of a line prop so it isn't floating. */
function onPosts(obj, a, b) {
  const g = new THREE.Group();
  for (const p of [a, b]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, p[1] + 0.25, 8), materials.solid('#9a6236'));
    pole.position.set(p[0], (p[1] + 0.25) / 2, p[2]);
    pole.castShadow = true;
    pole.userData.scaffold = true;
    g.add(pole);
  }
  g.add(obj);
  g.name = obj.name;
  g.userData = obj.userData;
  return g;
}

/** Demo only: a park bench under a prop that sits on its seat (seat top y 0.51, front edge z 0.245). */
function onBench(obj, z = 0.245 - 0.16) {
  const g = new THREE.Group();
  const b = K.bench({ seed: 3, length: 1.6 });
  b.traverse((m) => { if (m.isMesh) m.userData.scaffold = true; });
  obj.position.set(0.25, 0.51, z);
  g.add(b, obj);
  g.name = obj.name;
  g.userData = obj.userData;
  return g;
}

function forestDemo() {
  const pts = [];
  for (let i = 0; i < 26; i++) {
    const a = i * 2.39996;
    const r = Math.sqrt(i + 0.5) * 2.3;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return N.forest(pts, { types: ['round', 'conifer', 'tall', 'blossom'], seed: 3 });
}

const has = (fn) => typeof fn === 'function';

export function catalog() {
  const list = [
    ...N.TREE_TYPES.map((t, i) => [`tree ${t}`, 'nature', () => N.tree({ type: t, seed: 1 + i })]),
    ['forest (26, instanced)', 'nature', forestDemo],
    ['bush', 'nature', () => N.bush({ seed: 2 })],
    ['bush flowering', 'nature', () => N.bush({ seed: 5, flowers: '#ff7eb6' })],
    ['hedgeBlock', 'nature', () => N.hedgeBlock({ w: 3, seed: 2 })],
    ['flowerPatch', 'nature', () => N.flowerPatch({ seed: 4, radius: 1.1 })],
    ['grassTufts', 'nature', () => N.grassTufts({ seed: 1, radius: 1.6, count: 24 })],
    ['scatterFlowers', 'nature', () => N.scatterFlowers({ x: 0, z: 0, w: 5, d: 4 }, 80, { seed: 2 })],
    ['rock', 'nature', () => N.rock({ seed: 3 })],
    ['rock flat', 'nature', () => N.rock({ seed: 4, kind: 'flat', size: 1.3 })],
    ['rock cluster', 'nature', () => N.rock({ seed: 5, kind: 'cluster' })],
  ];
  const add = (name, cat, fn) => { if (fn) list.push([name, cat, fn]); };
  // street furniture
  if (has(K.lampPost)) {
    add('lampPost', 'street', () => K.lampPost({ seed: 1 }));
    add('lampPost double', 'street', () => K.lampPost({ seed: 2, arms: 2 }));
  }
  if (has(K.bench)) add('bench', 'street', () => K.bench({ seed: 1 }));
  if (has(K.bin)) {
    add('bin', 'street', () => K.bin({ seed: 1 }));
    add('bin overflowing', 'street', () => K.bin({ seed: 2, overflow: true }));
  }
  if (has(K.wheelieBin)) add('wheelieBin', 'street', () => K.wheelieBin({ seed: 1 }));
  if (has(K.bollard)) add('bollard', 'street', () => K.bollard({ seed: 1 }));
  if (has(K.planter)) add('planter', 'street', () => K.planter({ seed: 1 }));
  if (has(K.signpost)) add('signpost', 'street', () => K.signpost({ seed: 1 }));
  if (has(K.noticeBoard)) add('noticeBoard', 'street', () => K.noticeBoard({ seed: 1 }));
  if (has(K.bikeRack)) add('bikeRack', 'street', () => K.bikeRack({ seed: 1 }));
  if (has(K.bicycle)) add('bicycle', 'street', () => K.bicycle({ seed: 1 }));
  if (has(K.picnicTable)) add('picnicTable', 'street', () => K.picnicTable({ seed: 1 }));
  if (has(K.parasolTable)) add('parasolTable', 'street', () => K.parasolTable({ seed: 1 }));
  if (has(K.hydrant)) add('hydrant', 'street', () => K.hydrant({ seed: 1 }));
  if (has(K.gardenTap)) {
    add('gardenTap', 'street', () => K.gardenTap({ seed: 1, dripping: true }));
    add('gardenTap wall', 'street', () => onWall(K.gardenTap({ seed: 2, mount: 'wall', under: 'none', dripping: true })));
  }
  if (has(K.trafficCone)) add('trafficCone', 'street', () => K.trafficCone({ seed: 1 }));
  // yard
  if (has(K.crate)) {
    add('crate', 'yard', () => K.crate({ seed: 1 }));
    add('crate ammo', 'yard', () => K.crate({ seed: 2, kind: 'ammo' }));
  }
  if (has(K.barrel)) add('barrel', 'yard', () => K.barrel({ seed: 1 }));
  if (has(K.sack)) add('sack', 'yard', () => K.sack({ seed: 1 }));
  if (has(K.wheelbarrow)) add('wheelbarrow', 'yard', () => K.wheelbarrow({ seed: 1 }));
  if (has(K.ladder)) add('ladder', 'yard', () => K.ladder({ seed: 1, lean: 0.25 }));
  // market
  if (has(K.marketStall)) {
    for (const [goods, aw] of [['fruit', [P.tomato, P.white]], ['veg', [P.teal, P.white]], ['fish', [P.cobalt, P.white]], ['flowers', [P.bubblegum, P.white]], ['cakes', [P.sunflower, P.bubblegum]]]) {
      add(`marketStall ${goods}`, 'market', () => K.marketStall({ goods, awning: aw, seed: 1 }));
    }
    add('marketStall own sign', 'market', () => K.marketStall({ goods: 'flowers', awning: [P.violet, P.white], sign: 'Fresh Flowers', seed: 2 }));
  }
  if (has(K.melonStack)) add('melonStack', 'market', () => K.melonStack({ seed: 1 }));
  // festive
  if (has(K.bunting)) {
    add('bunting', 'festive', () => onPosts(K.bunting({ from: [-3, 3, 0], to: [3, 3.2, 0], sag: 0.6 }), [-3, 3, 0], [3, 3.2, 0]));
    add('bunting furled', 'festive', () => onPosts(K.bunting({ from: [-3, 3, 0], to: [3, 3.2, 0], sag: 0.6, furled: true, seed: 2 }), [-3, 3, 0], [3, 3.2, 0]));
    add('bunting coil x1.4', 'festive', () => {
      const b = K.bunting({ from: [-3, 3.4, 0], to: [3, 3.6, 0], sag: 0.6, furled: true, seed: 3 });
      b.userData.parts.coil.scale.setScalar(1.4); // levels may resize the coil (it used to be reset every frame)
      return onPosts(b, [-3, 3.4, 0], [3, 3.6, 0]);
    });
  }
  if (has(K.balloonBunch)) add('balloonBunch', 'festive', () => K.balloonBunch({ seed: 1 }));
  if (has(K.washingLine)) add('washingLine', 'festive', () => K.washingLine({ from: [-3, 2, 0], to: [3, 2, 0], seed: 1 }));
  if (has(K.flagPole)) add('flagPole', 'festive', () => K.flagPole({ color: P.cobalt }));
  if (has(K.weathervane)) add('weathervane', 'festive', () => K.weathervane({ seed: 1 }));
  if (has(K.kite)) add('kite (stuck)', 'festive', () => inTree(K.kite({ seed: 1 })));
  // vehicles
  if (has(K.car)) {
    add('car hatch', 'vehicles', () => K.car({ style: 'hatch', color: P.tomato, seed: 1 }));
    add('car beetle', 'vehicles', () => K.car({ style: 'beetle', color: P.teal, seed: 2 }));
    add('car van', 'vehicles', () => K.car({ style: 'van', color: P.sunflower, seed: 3 }));
    add('car pickup', 'vehicles', () => K.car({ style: 'pickup', color: P.cobalt, seed: 4 }));
  }
  if (has(K.iceCreamVan)) add('iceCreamVan', 'vehicles', () => K.iceCreamVan({ seed: 1 }));
  if (has(K.bus)) add('bus', 'vehicles', () => K.bus({ seed: 1 }));
  if (has(K.tractor)) add('tractor', 'vehicles', () => K.tractor({ seed: 1 }));
  // gags & jobs
  if (has(K.gnome)) {
    add('gnome', 'gags', () => K.gnome({ seed: 1 }));
    add('gnome fishing', 'gags', () => K.gnome({ seed: 2, pose: 'fishing' }));
    add('gnome toadstool', 'gags', () => K.gnome({ seed: 3, pose: 'toadstool' }));
  }
  if (has(K.giantMarrow)) add('giantMarrow', 'gags', () => K.giantMarrow({ seed: 1 }));
  if (has(K.alarmClock)) add('alarmClock', 'gags', () => K.alarmClock({ seed: 1 }));
  if (has(K.cameraOnTripod)) add('cameraOnTripod', 'gags', () => K.cameraOnTripod({ seed: 1 }));
  if (has(K.birdseedBag)) {
    add('birdseedBag', 'gags', () => K.birdseedBag({ seed: 1 }));
    add('birdseedBag on bench', 'gags', () => onBench(K.birdseedBag({ seed: 3, drop: 0.51 })));
  }
  if (has(K.teapot)) add('teapot', 'gags', () => K.teapot({ seed: 1 }));
  if (has(K.fireworkRocket)) add('fireworkRocket', 'gags', () => K.fireworkRocket({ seed: 1 }));
  if (has(K.trophy)) add('trophy', 'gags', () => K.trophy({ seed: 1 }));
  if (has(K.goldenSpanner)) add('goldenSpanner', 'gags', () => K.goldenSpanner({ seed: 1 }));
  if (has(K.easel)) add('easel', 'gags', () => K.easel({ seed: 1, painting: 'landscape' }));
  // Barnacle Bay: boats (float on demo water), dockside, beach
  if (has(K.fishingBoat)) {
    add('fishingBoat', 'boats', () => onWater(K.fishingBoat({ seed: 1 })));
    add('rowboat', 'boats', () => onWater(K.rowboat({ seed: 1 })));
    add('dinghy', 'boats', () => onWater(K.dinghy({ seed: 1 })));
    add('ferry', 'boats', () => onWater(K.ferry({ seed: 1 })));
    add('cargoBoat', 'boats', () => onWater(K.cargoBoat({ seed: 1 })));
    add('wreckedGalleon', 'boats', () => onWater(K.wreckedGalleon({ seed: 1 }), 0.6));
  }
  if (has(K.dockCrane)) {
    add('dockCrane', 'dockside', () => K.dockCrane({ seed: 1 }));
    add('foghorn', 'dockside', () => K.foghorn({ seed: 1 }));
    add('bellBuoy', 'dockside', () => onWater(K.bellBuoy({ seed: 1 })));
    if (has(K.buoy)) {
      for (const kind of ['mooring', 'can', 'cone', 'pot']) add(`buoy ${kind}`, 'dockside', () => onWater(K.buoy({ seed: 2, kind }), 0.8));
    }
    add('lobsterPot', 'dockside', () => K.lobsterPot({ seed: 1 }));
    add('fishBox', 'dockside', () => K.fishBox({ seed: 1 }));
    add('netPile', 'dockside', () => K.netPile({ seed: 1 }));
    add('snaggedNet', 'dockside', () => onQuay(K.snaggedNet({ seed: 1 })));
    add('mooringBollard', 'dockside', () => K.mooringBollard({ seed: 1, rope: true }));
    add('ropeCoil', 'dockside', () => K.ropeCoil({ seed: 1 }));
    add('lifebuoy', 'dockside', () => K.lifebuoy({ seed: 1 }));
    add('lifebuoy wall', 'dockside', () => onWall(K.lifebuoy({ seed: 2, mount: 'wall' })));
    add('anchorProp', 'dockside', () => K.anchorProp({ seed: 1 }));
  }
  if (has(K.deckchair)) {
    add('deckchair', 'beach', () => K.deckchair({ seed: 1 }));
    add('deckchair b', 'beach', () => K.deckchair({ seed: 4 }));
    add('windbreak', 'beach', () => K.windbreak({ seed: 1 }));
    add('sandcastle', 'beach', () => K.sandcastle({ seed: 1 }));
    add('beachBall', 'beach', () => K.beachBall({ seed: 1 }));
    add('lifeguardChair', 'beach', () => K.lifeguardChair({ seed: 1 }));
    add('bucketSpade', 'beach', () => K.bucketSpade({ seed: 1 }));
    add('surfboard', 'beach', () => K.surfboard({ seed: 1 }));
    add('crab', 'beach', () => K.crab({ seed: 1 }));
    if (has(K.beachTowel)) add('beachTowel', 'beach', () => K.beachTowel({ seed: 1 }));
    if (has(K.beachParasol)) add('beachParasol', 'beach', () => K.beachParasol({ seed: 2 }));
    add('surfboard paddle (floating)', 'beach', () => onWater(K.surfboard({ seed: 3, stand: false, bob: 1 }), 0.8));
  }
  return list;
}
