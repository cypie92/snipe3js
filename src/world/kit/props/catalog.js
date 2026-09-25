// Demo catalogue of every kit asset (used by sandbox/props.html and smoke tests).
// Each entry: [name, category, () => Object3D]. Order = sandbox index (?focus=<index>).
import * as N from '../nature/index.js';
import * as K from './index.js';
import { P } from '../../../gfx/palette.js';

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
  if (has(K.bollard)) add('bollard', 'street', () => K.bollard({ seed: 1 }));
  if (has(K.planter)) add('planter', 'street', () => K.planter({ seed: 1 }));
  if (has(K.signpost)) add('signpost', 'street', () => K.signpost({ seed: 1 }));
  if (has(K.noticeBoard)) add('noticeBoard', 'street', () => K.noticeBoard({ seed: 1 }));
  if (has(K.bikeRack)) add('bikeRack', 'street', () => K.bikeRack({ seed: 1 }));
  if (has(K.bicycle)) add('bicycle', 'street', () => K.bicycle({ seed: 1 }));
  if (has(K.picnicTable)) add('picnicTable', 'street', () => K.picnicTable({ seed: 1 }));
  if (has(K.parasolTable)) add('parasolTable', 'street', () => K.parasolTable({ seed: 1 }));
  if (has(K.hydrant)) add('hydrant', 'street', () => K.hydrant({ seed: 1 }));
  if (has(K.gardenTap)) add('gardenTap', 'street', () => K.gardenTap({ seed: 1, dripping: true }));
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
  }
  if (has(K.melonStack)) add('melonStack', 'market', () => K.melonStack({ seed: 1 }));
  // festive
  if (has(K.bunting)) {
    add('bunting', 'festive', () => K.bunting({ from: [-3, 3, 0], to: [3, 3.2, 0], sag: 0.6 }));
    add('bunting furled', 'festive', () => K.bunting({ from: [-3, 3, 0], to: [3, 3.2, 0], sag: 0.6, furled: true, seed: 2 }));
  }
  if (has(K.balloonBunch)) add('balloonBunch', 'festive', () => K.balloonBunch({ seed: 1 }));
  if (has(K.washingLine)) add('washingLine', 'festive', () => K.washingLine({ from: [-3, 2, 0], to: [3, 2, 0], seed: 1 }));
  if (has(K.flagPole)) add('flagPole', 'festive', () => K.flagPole({ color: P.cobalt }));
  if (has(K.weathervane)) add('weathervane', 'festive', () => K.weathervane({ seed: 1 }));
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
  if (has(K.birdseedBag)) add('birdseedBag', 'gags', () => K.birdseedBag({ seed: 1 }));
  if (has(K.teapot)) add('teapot', 'gags', () => K.teapot({ seed: 1 }));
  if (has(K.fireworkRocket)) add('fireworkRocket', 'gags', () => K.fireworkRocket({ seed: 1 }));
  if (has(K.trophy)) add('trophy', 'gags', () => K.trophy({ seed: 1 }));
  if (has(K.goldenSpanner)) add('goldenSpanner', 'gags', () => K.goldenSpanner({ seed: 1 }));
  return list;
}
