// Hand-held props (broom, fishing rod, newspaper, camera, ice cream, book, bouquet, brush, palette,
// chips + chip fork, binoculars, spade, fish, oar).
// Geometry is built once per type/variant and shared by everyone; a prop is a small Mesh parented to a
// hand bone, so it only costs a draw call while held. Prop origin = grip point, +Y = "up" the handle.
import * as THREE from 'three';
import { part, merge, cyl, sphere, cone, box } from '../geo.js';
import { materials } from '../../gfx/materials.js';
import { P } from '../../gfx/palette.js';

const cache = new Map();
const ICE = [['#ff9ec4', '#fff1d6'], ['#9be8c8', '#7a4a26'], ['#fff1d6', '#ff7eb6']];

function build(type, variant = 0) {
  switch (type) {
    case 'broom': return merge([
      part(cyl(0.019, 0.019, 1.2, 8), P.woodLight, { y: 0.15 }),
      part(cone(0.11, 0.36, 10), ['#e8b64a', P.sunflower], { y: -0.6, sx: 1.25 }),
      part(cyl(0.035, 0.045, 0.06, 10), P.tomato, { y: -0.43 }),
      part(sphere(0.028, 8, 6), P.woodDark, { y: 0.76 }),
    ]);
    case 'rod': return merge([
      part(cyl(0.024, 0.02, 0.3, 8), '#c9a27a', { y: 0.05 }),
      part(cyl(0.012, 0.005, 1.75, 6), '#3d5a3a', { y: 1.07 }),
      part(cyl(0.04, 0.04, 0.035, 10), P.metal, { y: 0.02, z: 0.05, rx: Math.PI / 2 }),
      part(cyl(0.006, 0.006, 0.06, 4), P.metalDark, { x: 0.03, y: 0.02, z: 0.05, rz: Math.PI / 2 }),
      part(sphere(0.01, 6, 4), P.tomato, { y: 1.95 }),
    ]);
    case 'newspaper': {
      const page = (x, y, z, c) => {
        const lines = Math.floor((y + 0.2) / 0.03) % 2 === 0 && Math.abs(x) < 0.11 && y < 0.1;
        c.set(y > 0.12 && y < 0.17 && Math.abs(x) < 0.11 ? '#4a5566' : lines ? '#c9c4b8' : '#f4efe4');
      };
      return merge([
        part(box(0.26, 0.38, 0.006), page, { x: 0.13, ry: 0.35, z: 0.02 }),
        part(box(0.26, 0.38, 0.006), page, { x: -0.13, ry: -0.35, z: 0.02 }),
      ]);
    }
    case 'camera': return merge([
      part(box(0.15, 0.095, 0.075), '#34384a', {}),
      part(cyl(0.036, 0.04, 0.06, 12), '#2b2b3a', { z: 0.065, rx: Math.PI / 2 }),
      part(cyl(0.028, 0.028, 0.01, 12), '#6fb7e8', { z: 0.096, rx: Math.PI / 2 }),
      part(box(0.04, 0.025, 0.03), P.metal, { x: -0.045, y: 0.058 }),
      part(box(0.03, 0.02, 0.02), P.tomato, { x: 0.05, y: 0.055 }),
    ]);
    case 'icecream': {
      const [a, b] = ICE[variant % ICE.length];
      return merge([
        part(cone(0.048, 0.15, 10), (x, y, z, c) => c.set((Math.floor((y + x * 1.2) * 45) + Math.floor((y - x * 1.2) * 45)) % 2 ? '#e0a45f' : '#c9864a'), { y: -0.02, rx: Math.PI }),
        part(sphere(0.055, 10, 8), a, { y: 0.075 }),
        part(sphere(0.045, 10, 8), b, { y: 0.14 }),
        part(sphere(0.016, 6, 4), P.tomato, { y: 0.19 }),
      ]);
    }
    case 'book': return merge([
      part(box(0.17, 0.23, 0.045), '#34384a', {}),
      part(box(0.16, 0.22, 0.04), '#f4efe4', { x: 0.008 }),
      part(box(0.012, 0.08, 0.003), P.tomato, { x: 0.02, y: -0.13, z: 0.018 }),
    ]);
    case 'bouquet': {
      const fl = [P.bubblegum, P.sunflower, '#fff8ee', P.tomato, P.violet];
      const parts = [part(cone(0.07, 0.2, 10), '#fff1d6', { y: -0.03, rx: Math.PI })];
      for (let i = 0; i < 7; i++) {
        const a = i * 2.4;
        const r = i === 0 ? 0 : 0.055;
        parts.push(part(sphere(0.04, 8, 6), fl[i % fl.length], { x: Math.cos(a) * r, y: 0.1 + (i === 0 ? 0.03 : 0), z: Math.sin(a) * r }));
      }
      parts.push(part(sphere(0.05, 6, 4), P.grassDark, { y: 0.06, sy: 0.5 }));
      return merge(parts);
    }
    case 'brush': return merge([
      part(cyl(0.01, 0.012, 0.3, 6), P.tomato, { y: 0.05 }),
      part(cyl(0.013, 0.013, 0.03, 6), P.metal, { y: 0.215 }),
      part(cone(0.014, 0.05, 6), P.cobalt, { y: 0.255 }),
    ]);
    case 'palette': return merge([
      part(cyl(0.16, 0.16, 0.012, 16), P.woodLight, { sx: 1.25 }),
      ...[[P.tomato, 0.08, 0.06], [P.sunflower, 0.12, -0.02], [P.cobalt, 0.02, 0.09], [P.lime, -0.05, 0.08], ['#fff8ee', 0.1, -0.09]]
        .map(([c, x, z]) => part(sphere(0.025, 6, 4), c, { x, y: 0.01, z, sy: 0.4 })),
    ]);
    case 'chips': { // chip-shop paper cone, chips poking out (+ a blob of ketchup)
      const parts = [
        part(cone(0.07, 0.19, 10), (x, y, z, c) => c.set(Math.floor((Math.atan2(x, z) + 3.2) / 0.63) % 2 ? '#f4efe4' : '#ff5a4e'), { y: 0.03, rx: Math.PI }),
        part(cyl(0.068, 0.062, 0.03, 10, true), '#f4efe4', { y: 0.12 }),
      ];
      for (let i = 0; i < 8; i++) {
        const a = i * 2.4, r = i === 0 ? 0 : 0.035;
        parts.push(part(box(0.022, 0.1, 0.022), i % 3 ? '#ffd166' : '#f2b84b', { x: Math.cos(a) * r, y: 0.15 + (i % 3) * 0.012, z: Math.sin(a) * r, rx: Math.sin(a) * 0.35, rz: Math.cos(a) * 0.35 }));
      }
      parts.push(part(sphere(0.022, 6, 4), P.tomato, { x: -0.02, y: 0.19, z: 0.02, sy: 0.6 }));
      return merge(parts);
    }
    case 'chipfork': return merge([ // little wooden chip fork with a chip speared on it
      part(box(0.012, 0.11, 0.004), '#e3c28a', { y: 0.05 }),
      part(box(0.024, 0.07, 0.024), '#ffd166', { y: 0.11, rz: 0.2 }),
    ]);
    case 'binoculars': return merge([
      part(cyl(0.03, 0.034, 0.11, 10), '#2b2b3a', { x: 0.042, rx: Math.PI / 2 }),
      part(cyl(0.03, 0.034, 0.11, 10), '#2b2b3a', { x: -0.042, rx: Math.PI / 2 }),
      part(cyl(0.024, 0.024, 0.006, 10), '#6fb7e8', { x: 0.042, z: 0.057, rx: Math.PI / 2 }),
      part(cyl(0.024, 0.024, 0.006, 10), '#6fb7e8', { x: -0.042, z: 0.057, rx: Math.PI / 2 }),
      part(box(0.05, 0.022, 0.05), '#4a5566', { z: -0.01 }),
    ]);
    case 'spade': return merge([ // beach spade
      part(cyl(0.012, 0.012, 0.3, 6), P.tomato, { y: -0.05 }),
      part(box(0.07, 0.02, 0.03), P.tomato, { y: 0.1 }),
      part(box(0.1, 0.12, 0.012), P.sunflower, { y: -0.25, rx: 0.2 }),
    ]);
    case 'fish': { // a big cartoon fish, held by the tail (hangs head-down, flat side to the front)
      const body = (x, y, z, c) => c.set(x > 0.45 ? '#3f6a96' : x < -0.45 ? '#eef4f8' : '#8fb5d6');
      return merge([
        part(sphere(1, 12, 8), body, { y: -0.24, sx: 0.085, sy: 0.2, sz: 0.042 }),
        part(cone(0.085, 0.1, 4), '#3f6a96', { y: -0.015, sz: 0.3, ry: Math.PI / 4 }),
        part(cone(0.035, 0.08, 4), '#ff9f1c', { x: 0.085, y: -0.22, rz: -Math.PI / 2, sz: 0.3 }),
        part(sphere(0.022, 6, 4), '#fbfaf4', { x: 0.02, y: -0.36, z: 0.035, sz: 0.5 }),
        part(sphere(0.022, 6, 4), '#fbfaf4', { x: 0.02, y: -0.36, z: -0.035, sz: 0.5 }),
        part(sphere(0.012, 6, 4), '#262634', { x: 0.02, y: -0.365, z: 0.045, sz: 0.5 }),
        part(sphere(0.012, 6, 4), '#262634', { x: 0.02, y: -0.365, z: -0.045, sz: 0.5 }),
        part(sphere(0.02, 6, 4), '#5b2333', { x: -0.01, y: -0.44, sz: 0.6 }),
      ]);
    }
    default: return null;
  }
}

// Grip transform relative to the hand bone (rest pose: arm hanging, hand bone at the wrist).
const GRIPS = {
  broom: { hand: 'R', p: [0, -0.045, 0.02], r: [0.35, 0, 0] },
  rod: { hand: 'R', p: [0, -0.045, 0.01], r: [0.9, 0, 0] },
  newspaper: { hand: 'R', p: [0.19, -0.02, 0.08], r: [-0.6, 0.05, 0] },
  camera: { hand: 'R', p: [0.07, -0.03, 0.06], r: [-1.2, 0, 0] },
  icecream: { hand: 'R', p: [0, -0.02, 0.035], r: [0, 0, 0] },
  book: { hand: 'R', p: [0.08, -0.06, 0.07], r: [-1.3, 0, 0] },
  bouquet: { hand: 'R', p: [0.05, -0.05, 0.08], r: [-0.2, 0, 0] },
  brush: { hand: 'R', p: [0, -0.04, 0.03], r: [1.2, 0, 0] },
  palette: { hand: 'L', p: [0.02, -0.06, 0.08], r: [0, 0, 0] },
  chips: { hand: 'L', p: [0, -0.07, 0.05], r: [0, 0, 0], upright: true },
  chipfork: { hand: 'R', p: [0, -0.05, 0.04], r: [Math.PI - 0.5, 0, 0] },
  binoculars: { hand: 'R', p: [0, -0.05, 0.05], r: [0, 0, 0] },
  spade: { hand: 'R', p: [0, -0.045, 0.02], r: [0.3, 0, 0] },
  fish: { hand: 'R', p: [0, -0.06, 0.03], r: [0, 0, 0], upright: true },
};

export const PROP_TYPES = Object.keys(GRIPS);

/** Create a held prop mesh (shared geometry). Returns { mesh, hand: 'L'|'R' } or null. */
export function makeProp(type, variant = 0) {
  const grip = GRIPS[type];
  if (!grip) return null;
  const key = `${type}:${type === 'icecream' ? variant % ICE.length : 0}`;
  if (!cache.has(key)) cache.set(key, build(type, variant));
  const mesh = new THREE.Mesh(cache.get(key), materials.toy);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = `prop:${type}`;
  mesh.position.fromArray(grip.p);
  mesh.rotation.set(...grip.r);
  return { mesh, hand: grip.hand, type, upright: !!grip.upright };
}

let oarGeo;
/** A rowing oar along +Y: handle at y = 0, blade at the far end (length 2.1 m). */
export function makeOar() {
  oarGeo ||= merge([
    part(cyl(0.026, 0.026, 0.16, 8), '#7a4a26', { y: 0.08 }),
    part(cyl(0.02, 0.024, 1.6, 6), '#dca66b', { y: 0.95 }),
    part(sphere(1, 8, 5), (x, y, z, c) => c.set(y > 0.55 ? P.tomato : '#dca66b'), { y: 1.9, sx: 0.085, sy: 0.24, sz: 0.018 }),
  ]);
  const m = new THREE.Mesh(oarGeo, materials.toy);
  m.castShadow = true;
  m.name = 'prop:oar';
  return m;
}
export const OAR_LENGTH = 2.12;

/** Local-space (prop space) tip of the fishing rod. */
export const ROD_TIP = new THREE.Vector3(0, 1.95, 0);

let lineGeo, bobGeo;
/** Fishing line + float. Positions are set by the owner each frame (in its parent's space). */
export class FishLine {
  constructor(parent) {
    lineGeo ||= new THREE.CylinderGeometry(0.006, 0.006, 1, 4, 1, true).translate(0, 0.5, 0);
    bobGeo ||= merge([
      part(sphere(0.05, 10, 8), (x, y, z, c) => c.set(y > 0 ? P.tomato : '#fbf7f0'), {}),
      part(cyl(0.008, 0.008, 0.08, 4), '#fbf7f0', { y: 0.07 }),
    ]);
    this.line = new THREE.Mesh(lineGeo, materials.solid('#f4efe4'));
    this.line.raycast = () => {};
    this.bob = new THREE.Mesh(bobGeo, materials.toy);
    this.bob.castShadow = true;
    this.bob.raycast = () => {};
    parent.add(this.line, this.bob);
    this.parent = parent;
    this._d = new THREE.Vector3();
  }

  set(tip, float) {
    this.bob.position.copy(float);
    const d = this._d.subVectors(float, tip);
    const len = d.length();
    this.line.position.copy(tip);
    this.line.scale.set(1, len, 1);
    this.line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  }

  set visible(v) { this.line.visible = v; this.bob.visible = v; }

  dispose() { this.parent.remove(this.line, this.bob); }
}
