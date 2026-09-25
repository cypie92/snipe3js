// Puddleby Green — STUB. The level designer replaces this (see docs/levels/puddleby-green.md).
import * as THREE from 'three';
import { part, rbox, meshOf } from '../../world/geo.js';
import { materials } from '../../gfx/materials.js';
import { P } from '../../gfx/palette.js';

export default {
  id: 'village',
  name: 'Puddleby Green',
  location: 'Village Square',
  day: 'Tuesday morning',
  order: 1,
  parTime: 240,
  preset: 'morning',
  ambience: 'village',
  icon: '🏘️',
  thumb: 'linear-gradient(#8fd0ff, #d9f0ff 55%, #7cc653 56%)',
  async build(ctx) {
    const ground = meshOf([part(rbox(200, 1, 200, 0.4), P.grass, { y: -0.5 })], materials.toy);
    ctx.surface(ground, 'grass');
    ctx.root.add(ground);
    return {
      perch: { position: new THREE.Vector3(0, 12, 62), yaw: 0, pitch: -0.12, yawLimit: [-1.3, 1.3], pitchLimit: [-0.7, 0.26] },
      shadowCenter: new THREE.Vector3(0, 0, -10),
      shadowRadius: 100,
    };
  },
};
