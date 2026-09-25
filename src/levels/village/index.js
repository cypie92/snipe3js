// Puddleby Green — location 1 (village square). Spec: docs/levels/puddleby-green.md
//   layout.js   terrain, roads, square, buildings, trees, backdrop
//   dressing.js market, street furniture, allotments, fête field, flowers, hedges
//   jobs.js     10 contracts + 2 secret jobs + 3 Golden Spanners (tells, reactions, their villagers)
//   life.js     ambient villagers, animals, vehicles, chimney smoke
//   custom.js   bespoke set pieces (kiosk, marquee, bouncy castle, allotment beds...)
import * as THREE from 'three';
import { buildLayout } from './layout.js';
import { buildDressing } from './dressing.js';
import { buildJobs } from './jobs.js';
import { buildLife } from './life.js';
import { Cast } from './cast.js';
import { StaticBatcher, PERCH } from './util.js';

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
    const S = { batch: new StaticBatcher({ cell: 48 }), cast: new Cast(ctx) };
    const L = buildLayout(ctx, S);
    const D = buildDressing(ctx, S, L);
    const J = buildJobs(ctx, S, L, D);
    const life = buildLife(ctx, S, L, D, J);
    S.batch.build(ctx.root);
    S.cast.finish();
    ctx.root.userData.village = { S, L, D, J, life };
    return {
      perch: { position: PERCH.clone(), yaw: 0, pitch: -0.125, yawLimit: [-1.309, 1.309], pitchLimit: [-0.698, 0.262] },
      shadowCenter: new THREE.Vector3(0, 0, -8),
      shadowRadius: 82,
    };
  },
};
