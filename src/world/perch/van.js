// Jack's van: a chunky cab-over toy van, front = -Z (it parks facing the diorama). Sunflower body,
// cobalt skirt, tomato pinstripe + fender flares, painted livery decals, big wheels, a cluttered
// roof rack with a sign board and amber beacons, and four hazard-striped stabiliser legs.
import * as THREE from 'three';
import { part, merge, rbox, xform } from '../geo.js';
import { materials } from '../../gfx/materials.js';
import { P } from '../../gfx/palette.js';
import { bev, lathe, puck, ball, rod, arc, latheBands, paintFaces } from '../kit/props/lib.js';
import { wheelGeo, InstancedPieces, LiveMesh } from '../kit/props/index.js';
import { liveryAtlas } from './livery.js';
import { decalQuad } from './paint.js';

export const VAN = {
  width: 2.3, bodyY0: 0.58, bodyY1: 2.62, front: -4.45, rear: 1.05, wheelR: 0.54,
  axles: [-3.3, 0.1], track: 1.0, roofY: 2.62,
};

const CREAM = '#fff4e0';
const GLASS = '#5d9fcf';
const GLASS_HI = '#9fd4f2';
const CHROME = '#e4e8ee';
const DARK = '#3b3f4f';
const TYRE = '#34384a';
const LAMP = '#fff3c4';
const TAIL = '#ff4a3d';
const HOSE = '#46b85a';

/** Rounded-rectangle plan (XZ) extruded vertically: a crisp paint band that hugs the body. */
function band(w, d, r, y0, y1, color, z = 0) {
  const s = new THREE.Shape();
  const x = w / 2, y = d / 2;
  s.moveTo(-x + r, -y);
  s.lineTo(x - r, -y);
  s.quadraticCurveTo(x, -y, x, -y + r);
  s.lineTo(x, y - r);
  s.quadraticCurveTo(x, y, x - r, y);
  s.lineTo(-x + r, y);
  s.quadraticCurveTo(-x, y, -x, y - r);
  s.lineTo(-x, -y + r);
  s.quadraticCurveTo(-x, -y, -x + r, -y);
  const g = new THREE.ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: false, curveSegments: 6 });
  g.deleteAttribute('uv');
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, z);
  return part(g, color);
}

/** Glass pane with a soft diagonal highlight streak (reads as glass without a separate material). */
function glass(w, h, d, t) {
  const g = part(bev(w, h, d, Math.min(0.04, d * 0.45)), GLASS);
  paintFaces(g, (x, y, z, nx, ny, nz, c) => {
    const k = (x + y * 0.8) / Math.max(w, h);
    if (Math.abs(k - 0.12) < 0.09 || Math.abs(k + 0.2) < 0.035) c.set(GLASS_HI);
  });
  return g.applyMatrix4(xform(t));
}

function trafficCone(t) {
  const g = latheBands([[0.2, 0], [0.2, 0.05], [0.14, 0.06], [0.11, 0.18], [0.095, 0.24], [0.07, 0.34], [0.05, 0.42], [0.02, 0.5], [0, 0.5]], 12,
    (y) => (y > 0.18 && y < 0.34 ? P.white : P.tangerine));
  return [g.applyMatrix4(xform(t)), part(bev(0.44, 0.05, 0.44, 0.02), P.tangerine, { ...t, y: (t.y || 0) + 0.025 })];
}

function bucket(t) {
  return latheBands([[0, 0.01], [0.15, 0.01], [0.15, 0.03], [0.19, 0.3], [0.2, 0.31], [0.18, 0.31], [0.17, 0.29], [0, 0.29]], 14,
    (y, i) => (i === 3 || i === 4 ? '#6d95f0' : P.cobalt)).applyMatrix4(xform(t));
}

/**
 * Build the van. Returns { group, body, wheels, legs, beacons, setLegs(k), tick(dt, t) }.
 * group origin = ground under the mast; legs deploy with setLegs(0..1).
 */
export function buildVan({ rng } = {}) {
  const A = liveryAtlas();
  const V = VAN;
  const zc = (V.front + V.rear) / 2;
  const len = V.rear - V.front;
  const G = []; // glossy paint
  const M = []; // matte (toy) parts
  const D = []; // decals

  // ---------------------------------------------------------------- body shell
  const shell = part(rbox(V.width, V.bodyY1 - V.bodyY0, len, 0.32, 3), P.sunflower, { y: (V.bodyY0 + V.bodyY1) / 2, z: zc });
  paintFaces(shell, (x, y, z, nx, ny, nz, c) => { if (y > 2.3) c.set(CREAM); });
  G.push(shell);
  G.push(band(V.width + 0.02, len + 0.02, 0.33, 0.66, 1.12, P.cobalt, zc));
  G.push(band(V.width + 0.034, len + 0.034, 0.34, 1.12, 1.2, P.tomato, zc));
  // chassis tub + exhaust + side steps
  M.push(part(bev(1.9, 0.34, len - 0.5, 0.08), DARK, { y: 0.55, z: zc }));
  M.push(part(rod([-0.7, 0.42, 0.7], [-0.7, 0.42, 1.28], 0.055, 10), CHROME));
  for (const s of [-1, 1]) M.push(part(bev(0.2, 0.08, 0.8, 0.03), DARK, { x: s * 1.1, y: 0.6, z: -3.9 }));

  // ---------------------------------------------------------------- front (cab-over face)
  const zf = V.front;
  G.push(glass(1.62, 0.62, 0.06, { y: 1.95, z: zf - 0.004 }));
  G.push(part(bev(1.74, 0.08, 0.05, 0.02), CREAM, { y: 2.31, z: zf - 0.03 })); // sun visor lip
  for (const s of [-1, 1]) {
    // big round headlight "eyes" with chrome bezels
    G.push(latheBands([[0, -0.05], [0.22, -0.05], [0.22, 0.0], [0.19, 0.03], [0.14, 0.055], [0, 0.06]], 16,
      (y, i) => (i < 3 ? CHROME : LAMP), { x: s * 0.6, y: 1.34, z: zf - 0.01, rx: -Math.PI / 2 }));
    G.push(part(bev(0.2, 0.1, 0.05, 0.03), P.tangerine, { x: s * 0.94, y: 1.3, z: zf + 0.08 }));
    // mirrors
    M.push(part(rod([s * 1.1, 1.95, -4.05], [s * 1.36, 2.0, -4.2], 0.028, 6), DARK));
    G.push(part(bev(0.24, 0.34, 0.08, 0.035), P.tomato, { x: s * 1.4, y: 1.96, z: -4.2 }));
    M.push(part(bev(0.19, 0.28, 0.02, 0.008), '#c9e6f7', { x: s * 1.4, y: 1.96, z: -4.155 }));
  }
  // smiling grille + badge roundel between the headlights
  const smile = new THREE.Shape();
  smile.absarc(0, 0, 0.42, Math.PI * 1.12, Math.PI * 1.88, false);
  smile.absarc(0, 0, 0.27, Math.PI * 1.88, Math.PI * 1.12, true);
  const smileG = new THREE.ExtrudeGeometry(smile, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1, curveSegments: 10 });
  smileG.deleteAttribute('uv');
  G.push(part(smileG, DARK, { y: 1.3, z: zf - 0.06, ry: Math.PI }));
  for (const dy of [-0.34, -0.26]) G.push(part(bev(0.5, 0.028, 0.03, 0.012), CHROME, { y: 1.3 + dy, z: zf - 0.125 }));
  D.push(decalQuad(0.34, 0.34, A.uv('roundel'), xform({ y: 1.42, z: zf - 0.018, ry: Math.PI })));
  // bumpers + plates
  for (const [z, s] of [[zf - 0.07, -1], [V.rear + 0.07, 1]]) {
    G.push(part(new THREE.CapsuleGeometry(0.13, 2.0, 4, 12), CREAM, { y: 0.74, z, rz: Math.PI / 2 }));
    for (const x of [-1.12, 1.12]) M.push(part(ball(0.14, 1), DARK, { x, y: 0.74, z, sx: 0.9 }));
    D.push(decalQuad(0.5, 0.125, A.uv('plate'), xform({ y: 0.74, z: z + s * 0.132, ry: s < 0 ? Math.PI : 0 })));
  }

  // ---------------------------------------------------------------- sides
  for (const s of [-1, 1]) {
    const x = s * (V.width / 2 + 0.004);
    G.push(glass(0.05, 0.6, 1.12, { x, y: 1.92, z: -3.62 }));
    M.push(part(bev(0.02, 1.36, 0.035, 0.008), DARK, { x: s * 1.152, y: 1.62, z: -2.95 }));
    M.push(part(bev(0.05, 0.05, 0.2, 0.02), CHROME, { x: s * 1.165, y: 1.52, z: -3.12 }));
    // livery panel
    D.push(decalQuad(3.3, 1.03, A.uv('side'), xform({ x: s * (V.width / 2 + 0.006), y: 1.76, z: -1.02, ry: s * Math.PI / 2 })));
    // fender flares over the wheels
    for (const z of V.axles) G.push(part(arc(V.wheelR + 0.1, 0.085, Math.PI, 8, 18), P.tomato, { x: s * 1.16, y: 0.56, z, ry: Math.PI / 2, sz: 0.8 }));
  }

  // ---------------------------------------------------------------- rear doors
  const zr = V.rear;
  M.push(part(bev(0.03, 1.36, 0.02, 0.008), DARK, { y: 1.62, z: zr + 0.002 }));
  for (const s of [-1, 1]) {
    G.push(glass(0.62, 0.38, 0.05, { x: s * 0.44, y: 2.02, z: zr + 0.003 }));
    G.push(part(bev(0.24, 0.16, 0.06, 0.03), TAIL, { x: s * 0.66, y: 0.94, z: zr + 0.015 }));
    M.push(part(bev(0.05, 0.16, 0.05, 0.02), CHROME, { x: s * 0.12, y: 1.22, z: zr + 0.02 }));
  }
  D.push(decalQuad(0.72, 0.27, A.uv('rear'), xform({ x: 0.43, y: 1.5, z: zr + 0.006 })));

  // ---------------------------------------------------------------- roof: mast turret, rack, board
  const ry = V.roofY;
  G.push(part(puck(0.58, 0.3, 0.08, 24), P.cobalt, { y: ry + 0.12 }));
  G.push(part(new THREE.TorusGeometry(0.51, 0.055, 8, 32), P.sunflower, { y: ry + 0.28, rx: Math.PI / 2 }));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    M.push(part(ball(0.04, 0), CREAM, { x: Math.sin(a) * 0.58, y: ry + 0.13, z: Math.cos(a) * 0.58 }));
  }
  // rack
  const rz0 = -4.02, rz1 = -1.05;
  for (const s of [-1, 1]) {
    M.push(part(bev(0.07, 0.07, rz1 - rz0, 0.025), DARK, { x: s * 0.94, y: ry + 0.2, z: (rz0 + rz1) / 2 }));
    for (const z of [rz0 + 0.1, -2.55, rz1 - 0.1]) M.push(part(bev(0.06, 0.2, 0.06, 0.02), DARK, { x: s * 0.94, y: ry + 0.08, z }));
  }
  for (const z of [-3.85, -3.0, -2.15, -1.25]) M.push(part(bev(1.95, 0.05, 0.07, 0.02), DARK, { y: ry + 0.24, z }));
  const top = ry + 0.265;
  // planks + toolbox + cones + hose + bucket with mop
  M.push(part(bev(0.3, 0.06, 2.5, 0.02), P.woodLight, { x: -0.5, y: top + 0.03, z: -2.55, ry: 0.02 }));
  M.push(part(bev(0.26, 0.06, 2.2, 0.02), P.wood, { x: -0.46, y: top + 0.09, z: -2.45, ry: -0.03 }));
  G.push(part(bev(0.66, 0.3, 0.36, 0.06), P.tomato, { x: -0.48, y: top + 0.27, z: -1.75, ry: 0.12 }));
  G.push(part(bev(0.68, 0.06, 0.38, 0.03), '#d9443a', { x: -0.48, y: top + 0.43, z: -1.75, ry: 0.12 }));
  M.push(part(arc(0.14, 0.022, Math.PI, 6, 10), DARK, { x: -0.48, y: top + 0.46, z: -1.75, ry: 0.12 }));
  M.push(...trafficCone({ x: 0.5, y: top, z: -1.35 }));
  M.push(...trafficCone({ x: 0.52, y: top, z: -1.85, ry: 0.4 }));
  for (let i = 0; i < 3; i++) M.push(part(new THREE.TorusGeometry(0.26 - i * 0.012, 0.055, 8, 22), HOSE, { x: 0.48, y: top + 0.06 + i * 0.1, z: -2.65, rx: Math.PI / 2 }));
  M.push(bucket({ x: 0.45, y: top, z: -3.4 }));
  M.push(part(rod([0.45, top + 0.1, -3.4], [0.15, top + 1.0, -3.12], 0.025, 6), P.woodLight));
  M.push(part(ball(0.12, 1), '#ffe07a', { x: 0.45, y: top + 0.28, z: -3.4, sy: 0.6 }));
  // front roof sign board (livery both faces) + amber beacon domes
  const by = ry + 0.56;
  G.push(part(bev(2.04, 0.46, 0.08, 0.035), P.cobalt, { y: by, z: -4.06 }));
  for (const s of [-1, 1]) M.push(part(bev(0.06, 0.34, 0.06, 0.02), DARK, { x: s * 0.8, y: ry + 0.3, z: -4.06 }));
  D.push(decalQuad(2.0, 0.42, A.uv('front'), xform({ y: by, z: -4.105, ry: Math.PI })));
  D.push(decalQuad(2.0, 0.42, A.uv('front'), xform({ y: by, z: -4.015 })));
  for (const s of [-1, 1]) M.push(part(puck(0.13, 0.08, 0.02, 14), DARK, { x: s * 0.86, y: by + 0.27, z: -4.06 }));

  // ---------------------------------------------------------------- meshes
  const group = new THREE.Group();
  group.name = 'jacksVan';
  const body = new THREE.Group();
  body.name = 'vanBody';
  group.add(body);
  const paint = new THREE.Mesh(merge(G), materials.glossy);
  paint.name = 'vanPaint';
  const matte = new THREE.Mesh(merge(M), materials.toy);
  matte.name = 'vanMatte';
  const decals = new THREE.Mesh(merge(D), A.material);
  decals.name = 'vanLivery';
  for (const m of [paint, matte]) { m.castShadow = true; m.receiveShadow = true; }
  decals.receiveShadow = true;
  body.add(paint, matte, decals);

  // amber beacons (own material: pulses while the mast moves)
  const beaconMat = new THREE.MeshStandardMaterial({ color: '#ffb03a', emissive: '#ff9a1c', emissiveIntensity: 0.35, roughness: 0.3 });
  beaconMat.name = 'perch-beacon';
  const beaconGeo = merge([-1, 1].map((s) => part(lathe([[0.1, 0], [0.1, 0.06], [0.085, 0.13], [0.05, 0.17], [0, 0.18]], 14), '#ffffff', { x: s * 0.86, y: by + 0.31, z: -4.06 })));
  const beacons = new THREE.Mesh(beaconGeo, beaconMat);
  beacons.name = 'vanBeacons';
  beacons.castShadow = true;
  body.add(beacons);

  // ---------------------------------------------------------------- wheels
  const wgeo = wheelGeo({ r: V.wheelR, w: 0.4, hub: P.cobalt, tyre: TYRE, cap: P.sunflower, hubR: 0.6, seg: 18 });
  const wheels = [];
  const shapes = [];
  for (const z of V.axles) {
    for (const s of [-1, 1]) {
      const p = new THREE.Group();
      p.name = `wheel${wheels.length}`;
      p.position.set(s * V.track, V.wheelR, z);
      group.add(p);
      wheels.push(p);
      shapes.push(s < 0 ? new THREE.Matrix4().makeRotationY(Math.PI) : null);
    }
  }
  const wheelMesh = new InstancedPieces(wgeo, materials.toy, wheels, shapes);
  wheelMesh.name = 'vanWheels';
  group.add(wheelMesh);
  wheelMesh.sync(true);

  // ---------------------------------------------------------------- stabiliser legs (1 draw call)
  const legs = new LiveMesh(materials.toy);
  legs.name = 'vanLegs';
  const legPivots = [];
  const beam = part(new THREE.BoxGeometry(0.95, 0.17, 0.22, 8, 1, 1), P.sunflower);
  paintFaces(beam, (x, y, z, nx, ny, nz, c) => { if (Math.floor((x + 0.475) / 0.119) % 2 === 1) c.set(P.ink); });
  const legGeo = (s) => merge([
    beam.clone().applyMatrix4(xform({ x: -s * 0.46 })),
    part(bev(0.26, 0.32, 0.28, 0.06), P.cobalt, { y: -0.05 }),
    part(puck(0.07, 0.04, 0.015, 10), CREAM, { y: 0.12 }),
  ]);
  const ramGeo = merge([
    part(new THREE.CylinderGeometry(0.055, 0.055, 0.5, 10), CHROME, { y: 0.14 }),
    part(puck(0.22, 0.08, 0.03, 16), P.cobalt, { y: -0.12 }),
    part(puck(0.21, 0.04, 0.015, 16), DARK, { y: -0.18 }),
  ]);
  for (const z of [0.86, -2.25]) {
    for (const s of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(s * 1.02, 0.62, z);
      leg.userData.side = s;
      const ram = new THREE.Group();
      leg.add(ram);
      leg.userData.ram = ram;
      group.add(leg);
      legs.addPiece(leg, legGeo(s));
      legs.addPiece(ram, ramGeo);
      legPivots.push(leg);
    }
  }
  group.add(legs);
  legs.build();

  const smooth = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  /** 0 = stowed, 1 = feet planted on the ground (slide out, then press down). */
  function setLegs(k) {
    const out = smooth(0, 0.55, k), down = smooth(0.45, 1, k);
    for (const leg of legPivots) {
      leg.position.x = leg.userData.side * (1.02 + out * 0.62);
      leg.userData.ram.position.y = -down * 0.42;
    }
    legs.sync();
  }
  setLegs(0);

  let bob = 0;
  let beaconT = 0;
  const api = {
    group, body, wheels, legs, beacons, beaconMat, setLegs, speed: 0, beaconsOn: false,
    tick(dt, t) {
      const v = api.speed;
      if (v) for (const w of wheels) w.rotation.x -= (v / V.wheelR) * dt;
      wheelMesh.sync();
      const a = Math.min(1, Math.abs(v) / 4);
      bob += (a - bob) * Math.min(1, dt * 4);
      body.position.y = Math.abs(Math.sin(t * 8.5)) * 0.03 * bob;
      body.rotation.x = Math.sin(t * 4.2) * 0.01 * bob;
      beaconT += dt;
      beaconMat.emissiveIntensity = api.beaconsOn ? 0.6 + 2.2 * Math.max(0, Math.sin(beaconT * 9)) : 0.35;
    },
  };
  return api;
}
