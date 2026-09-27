// Puddleby Green — location 1 (village square). Spec: docs/levels/puddleby-green.md
//   layout.js   terrain, roads, the 55 x 40 m square, buildings, trees, backdrop
//   dressing.js market rows, street furniture, the fête green under the van, allotments, flanks
//   jobs.js     12 contracts (incl. the first-laugh dunk tank) + 2 secret jobs + 3 Golden Spanners (tells, reactions, nags, decoys)
//   games.js    3 skill jobs: coconut-shy combo, Splat the Rat (timing), catch the cricket six (moving target)
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
  parTime: 300, // 15 main jobs (three of them need timing or a combo)
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
    // vehicle wheels sit inside their body's own shadow: keep them out of the shadow pass
    ctx.root.traverse((o) => { if (o.isInstancedMesh && o.name === 'wheels') o.castShadow = false; });
    S.cast.finish();
    ctx.root.userData.village = { S, L, D, J, life };
    return {
      // raised + pulled in: a 16 m eye 20-60 m from the fête and the square, looking down ~23 degrees
      perch: { position: PERCH.clone(), yaw: 0, pitch: -0.4, yawLimit: [-1.08, 1.08], pitchLimit: [-1.05, 0.26] },
      shadowCenter: new THREE.Vector3(0, 0, 2),
      shadowRadius: 64,
      // suggested intro swoop framing for the tighter diorama (start radius / height / arc in radians)
      intro: { radius: 92, height: 56, arc: 1.4 },
    };
  },
};
