// Chunky striped lighthouse on a rock base (Barnacle Bay's hero landmark).
//   parts.lamp      Group at the lens centre; lamp.userData.setLit(on) (same as group.userData.setLit)
//   parts.beam      rotating pivot holding two additive light cones (hidden while unlit)
//   parts.lever     gallery switch lever (pivot at its hinge, big collider) - the job target
//   parts.door      keeper's door (hinged at its left edge); userData.openDoor(open)
//   parts.gallery   anchor on the gallery floor by the lever (keeper / golden spanner spot)
// Origin = centre of the base at quay level (y = 0); the rock mound runs down past the sea.
import { THREE, materials, Kit, cbox, prism, extrude, archPath, lathe, rngOf, shade, wobbleColor, DEG, TAU, addCollider, Tweens, ease } from './common.js';
import { box, cyl, ico, sphere, torus, cone, jitter } from '../../geo.js';
import { hash3 } from '../../../core/rng.js';
import { P } from '../../../gfx/palette.js';
import { addWindow, STREAK } from './facade.js';
import { displayGlassMaterial } from './shop.js';
import { SEA_LEVEL, HARBOUR_STONE, addBoulder } from './harbour.js';
import { paintedTexture } from './signs.js';

const beamVert = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  varying float vAlong;
  varying vec3 vN;
  varying vec3 vV;
  uniform float uLength;
  void main() {
    vAlong = clamp(length(position) / uLength, 0.0, 1.0);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const beamFrag = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform vec3 uColor;
  uniform float uIntensity;
  varying float vAlong;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float along = pow(1.0 - vAlong, 1.6) * smoothstep(0.0, 0.04, vAlong);
    float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.3);
    float a = along * edge * uIntensity;
    #ifdef USE_FOG
      #ifdef FOG_EXP2
        float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
      #else
        float fogF = smoothstep(fogNear, fogFar, vFogDepth);
      #endif
      a *= 1.0 - fogF;
    #endif
    gl_FragColor = vec4(uColor * a, 1.0);
    #include <colorspace_fragment>
  }
`;

let glowTex = null;
function glowTexture() {
  if (glowTex !== null) return glowTex;
  glowTex = paintedTexture(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.18, 'rgba(255,240,190,0.9)');
    g.addColorStop(0.5, 'rgba(255,210,120,0.25)');
    g.addColorStop(1, 'rgba(255,200,100,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }, { anisotropy: 1 });
  return glowTex;
}

/**
 * lighthouse(opts): seed, height (tower, 14), stripes ([red, white]), bands (5), rocks (true),
 * seaLevel, lit (false), beamLength (36), beamColor, speed (rad/s, 0.9), doorColor.
 */
export function lighthouse(opts = {}) {
  const rng = rngOf(opts.seed ?? 'lighthouse', 'lh');
  const seaLevel = opts.seaLevel ?? SEA_LEVEL;
  const H = opts.height ?? 14;
  const [red, white] = opts.stripes ?? ['#e8413c', '#fff8ee'];
  const bands = opts.bands ?? 5;
  const ink = '#26404a';
  const kit = new Kit('lighthouse');
  const S = HARBOUR_STONE;
  const r0 = opts.baseRadius ?? 3.35, r1 = opts.topRadius ?? 2.5;
  const baseY = 0.9;
  const rAt = (y) => r0 + (r1 - r0) * ((y - baseY) / H);
  const parts = {};

  // ---- rock mound + round stone plinth
  if (opts.rocks !== false) {
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * TAU + rng.range(-0.12, 0.12);
      const big = i % 2 === 0;
      const rr = big ? rng.range(5.6, 6.8) : rng.range(6.9, 8.4);
      addBoulder(kit, {
        r: big ? rng.range(1.6, 2.3) : rng.range(1.0, 1.6), seed: i * 5.1, detail: 1,
        color: wobbleColor(rng, rng.pick(['#a79f91', '#978f82', '#b3a896']), 0.05),
        t: { x: Math.cos(a) * rr, y: big ? rng.range(-0.9, -0.2) + (seaLevel + 1.2) * 0.4 : seaLevel + rng.range(-0.4, 0.3), z: Math.sin(a) * rr, ry: rng.range(0, TAU), rx: rng.range(-0.2, 0.2) },
      });
    }
  }
  const plinth = lathe([[5.8, seaLevel - 2.5], [5.4, seaLevel + 0.3], [4.95, 0.0], [4.85, baseY - 0.1], [5.0, baseY - 0.05], [5.0, baseY + 0.05], [0.01, baseY + 0.05]], 32);
  kit.addFaces(plinth, (x, y, z, c) => {
    const i = Math.floor(y / 0.45);
    const k = Math.floor((Math.atan2(z, x) / TAU) * 32 + (i % 2) * 0.5);
    const h = hash3(k, i, 4);
    if (y > baseY - 0.02) c.set(shade('#d8cfbf', (h - 0.5) * 0.05));
    else if (y < seaLevel + 0.5) c.set(shade(y < seaLevel - 0.3 ? S.wet : S.algae, (h - 0.5) * 0.05));
    else c.set(shade(h > 0.7 ? S.light : S.base, (h - 0.5) * 0.06));
  });
  // steps up to the door
  for (let i = 0; i < 3; i++) kit.add(cbox(2.4 - i * 0.1, 0.3 * (i + 1), 0.5, 0.05), shade('#d8cfbf', -0.03 * i), { y: 0.15 * (i + 1) - 0.02, z: 4.8 + (2 - i) * 0.45 + 0.2 });

  // ---- striped tower (bands + proud lips between them)
  const bh = H / bands;
  for (let b = 0; b < bands; b++) {
    const y0 = baseY + b * bh, y1 = y0 + bh;
    const col = b % 2 === 0 ? red : white;
    kit.add(cyl(rAt(y1), rAt(y0), bh, 24, true), [shade(col, -0.05), col], { y: (y0 + y1) / 2 });
    if (b > 0) kit.add(cyl(rAt(y0) + 0.07, rAt(y0) + 0.07, 0.16, 24, true), shade(col, -0.12), { y: y0 });
  }
  kit.add(cyl(r0 + 0.12, r0 + 0.16, 0.3, 24), shade(red, -0.1), { y: baseY + 0.15 });
  // windows spiralling up (radial)
  const wins = [[baseY + bh * 1.45, 0.0], [baseY + bh * 2.55, 1.05], [baseY + bh * 3.6, -0.9]];
  parts.windows = [];
  for (const [wy, a] of wins) {
    const rr = rAt(wy + 0.5) - 0.06;
    kit.at({ x: Math.sin(a) * rr, y: wy, z: Math.cos(a) * rr, ry: a }, () => {
      addWindow(kit, { w: 0.86, h: 1.3, style: 'roundtop', trim: ink, headColor: ink, sillColor: '#fff8ee', rng, curtains: '#ffe590' });
      parts.windows.push(kit.anchor('window', { y: 0.6, z: 0.1 }));
    });
  }
  // keeper's door frame, lantern and lifebuoy (the door leaf is a hinged part below)
  const dz = r0 - 0.1;
  const dw = 1.35, dh = 2.35;
  kit.at({ y: baseY, z: dz }, () => {
    const ring = archPath(dw + 0.44, dh + 0.3);
    ring.holes.push(new THREE.Path(archPath(dw, dh).getPoints()));
    kit.add(extrude(ring, 0.36, { curveSegments: 1 }), '#fff8ee', { z: 0.08 });
    kit.add(extrude(archPath(dw, dh), 0.05, { curveSegments: 1 }), '#3a2a22', { z: 0.075 });
    kit.add(cbox(0.3, 0.36, 0.3, 0.05), ink, { x: 0.95, y: dh + 0.25, z: 0.3 });
    kit.add(box(0.2, 0.24, 0.32), '#ffe08a', { x: 0.95, y: dh + 0.25, z: 0.3 }, materials.glossy);
    kit.at({ x: -1.15, y: 1.35, z: 0.28 }, () => {
      for (let q = 0; q < 4; q++) kit.add(torus(0.36, 0.1, 5, 6, Math.PI / 2), q % 2 ? '#fff8ee' : P.tomato, { rz: (q * Math.PI) / 2 });
      kit.add(box(0.06, 0.12, 0.2), ink, { y: 0.45, z: -0.1 });
    });
  });

  // ---- gallery: slab, corbels, railing
  const gy = baseY + H;
  kit.add(cyl(r1 + 1.4, r1 + 1.25, 0.36, 32), [shade(ink, -0.05), ink], { y: gy + 0.18 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    kit.at({ x: Math.sin(a) * (r1 + 0.15), y: gy, z: Math.cos(a) * (r1 + 0.15), ry: a }, () => {
      kit.add(prism([[0, 0], [1.25, 0], [0, -0.85]], 0.36), '#fff8ee', { ry: -Math.PI / 2 });
    });
  }
  const railR = r1 + 1.22;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    kit.add(cyl(0.045, 0.045, 1.05, 5), ink, { x: Math.sin(a) * railR, y: gy + 0.34 + 0.52, z: Math.cos(a) * railR });
  }
  kit.add(torus(railR, 0.065, 4, 36), ink, { y: gy + 0.34 + 1.05, rx: Math.PI / 2 });
  kit.add(torus(railR, 0.04, 3, 36), ink, { y: gy + 0.34 + 0.55, rx: Math.PI / 2 });

  // ---- lamp room: red base wall, glazing (transparent), mullions, dome, finial
  const ly = gy + 0.34;
  kit.add(cyl(2.02, 2.1, 0.85, 24), [shade(red, -0.08), red], { y: ly + 0.42 });
  const glassY0 = ly + 0.85, glassH = 2.2;
  kit.raw(new THREE.CylinderGeometry(1.88, 1.88, glassH, 24, 1, true), displayGlassMaterial(), { y: glassY0 + glassH / 2 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + TAU / 16;
    kit.add(box(0.1, glassH, 0.1), ink, { x: Math.sin(a) * 1.88, y: glassY0 + glassH / 2, z: Math.cos(a) * 1.88, ry: a });
  }
  kit.add(torus(1.9, 0.055, 3, 24), ink, { y: glassY0 + glassH * 0.5, rx: Math.PI / 2 });
  kit.add(cyl(2.28, 2.18, 0.2, 24), ink, { y: glassY0 + glassH + 0.1 });
  kit.add(new THREE.SphereGeometry(2.14, 20, 8, 0, TAU, 0, Math.PI / 2), [red, shade(red, 0.08)], { y: glassY0 + glassH + 0.18, sy: 0.7 });
  const domeTop = glassY0 + glassH + 0.18 + 2.14 * 0.7;
  kit.add(cyl(0.12, 0.18, 0.4, 10), ink, { y: domeTop + 0.1 });
  kit.add(sphere(0.3, 12, 8), ink, { y: domeTop + 0.45 });
  kit.add(cone(0.06, 0.9, 6), ink, { y: domeTop + 1.1 });
  kit.add(box(1.1, 0.05, 0.05), ink, { y: domeTop + 0.8 });
  kit.add(prism([[0, 0.14], [0.3, 0], [0, -0.14]], 0.04), P.gold, { x: 0.55, y: domeTop + 0.8 }, materials.glossy);
  parts.top = kit.anchor('top', { y: domeTop + 1.6 });
  parts.gallery = kit.anchor('gallery', { x: 1.0, y: gy + 0.36, z: r1 + 0.75 });
  parts.galleryPoints = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * TAU;
    return kit.anchor('galleryPoint', { x: Math.sin(a) * (r1 + 0.7), y: gy + 0.36, z: Math.cos(a) * (r1 + 0.7), ry: a });
  });
  // switch box for the lever (the lever itself is a part)
  const leverPos = new THREE.Vector3(-0.95, gy + 0.36, r1 + 0.62);
  kit.at({ x: leverPos.x, y: leverPos.y, z: leverPos.z }, () => {
    kit.add(cyl(0.08, 0.1, 0.5, 8), ink, { y: 0.25 });
    kit.add(cbox(0.8, 0.62, 0.5, 0.07), P.sunflower, { y: 0.78 });
    kit.add(cbox(0.86, 0.1, 0.56, 0.03), ink, { y: 1.1 });
    for (let k = 0; k < 3; k++) kit.add(box(0.12, 0.5, 0.02), ink, { x: -0.25 + k * 0.25, y: 0.76, z: 0.26, rz: 0.6 });
    kit.add(box(0.16, 0.16, 0.05), '#6cd66b', { x: -0.22, y: 0.98, z: 0.27 }, materials.glossy);
    kit.add(box(0.16, 0.16, 0.05), '#ff6b5e', { x: 0.22, y: 0.98, z: 0.27 }, materials.glossy);
  });

  const group = kit.build(new THREE.Group());
  group.name = opts.name ?? 'lighthouse';

  // ---- keeper's door (hinged)
  const door = new THREE.Group();
  door.name = 'door';
  const dk = new Kit('lighthouseDoor');
  dk.add(extrude(archPath(dw - 0.04, dh - 0.02), 0.1, { curveSegments: 1 }), [shade(opts.doorColor ?? '#2f7d62', -0.06), opts.doorColor ?? '#2f7d62'], { x: dw / 2 });
  for (const y of [0.55, 1.45]) dk.add(box(dw * 0.8, 0.08, 0.04), shade(opts.doorColor ?? '#2f7d62', -0.15), { x: dw / 2, y, z: 0.07 });
  dk.add(ico(0.07, 0), P.gold, { x: dw * 0.85, y: 1.05, z: 0.09 }, materials.glossy);
  dk.build(door);
  door.position.set(-dw / 2 + 0.02, baseY, dz + 0.14);
  group.add(door);

  // ---- the lamp: lens + glow + beams
  const lamp = new THREE.Group();
  lamp.name = 'lamp';
  lamp.position.set(0, glassY0 + glassH * 0.5, 0);
  const lensMat = new THREE.MeshStandardMaterial({ color: '#f5c86a', roughness: 0.18, metalness: 0.1, emissive: '#ffd27a', emissiveIntensity: 0.0 });
  lensMat.name = 'lighthouseLens';
  const lk = new Kit('lens');
  lk.add(cyl(0.5, 0.62, 0.3, 12), '#b8872b', { y: -0.75 }, materials.glossy);
  lk.add(cyl(0.12, 0.12, 0.5, 8), '#b8872b', { y: -1.05 }, materials.glossy);
  lk.build(lamp);
  const lensGeo = new THREE.CylinderGeometry(0.74, 0.74, 1.4, 12, 4);
  {
    // barrel-shaped Fresnel "beehive"
    const pa = lensGeo.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const y = pa.getY(i);
      const k = 1 - (y / 0.7) ** 2 * 0.28;
      pa.setX(i, pa.getX(i) * k);
      pa.setZ(i, pa.getZ(i) * k);
    }
    lensGeo.computeVertexNormals();
  }
  const lens = new THREE.Mesh(lensGeo, lensMat);
  lens.name = 'lens';
  lamp.add(lens);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffe3a0', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  glow.name = 'glow';
  glow.scale.setScalar(5.5);
  glow.raycast = () => {};
  lamp.add(glow);
  const L = opts.beamLength ?? 36;
  const beamMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uColor: { value: new THREE.Color(opts.beamColor ?? '#ffe6a8').multiplyScalar(2.3) }, uIntensity: { value: 0 }, uLength: { value: L },
    }]),
    vertexShader: beamVert, fragmentShader: beamFrag, fog: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  beamMat.name = 'lighthouseBeam';
  const beamGeo = new THREE.ConeGeometry(4.2, L, 20, 1, true).translate(0, -L / 2, 0);
  const beams = [];
  const beam = new THREE.Group();
  beam.name = 'beam';
  for (const s of [1, -1]) {
    // cone apex at the lens, opening along +/-X, dipping slightly toward the sea
    const m = new THREE.Mesh(beamGeo.clone().rotateZ(s * Math.PI / 2), beamMat);
    m.rotation.z = -s * 0.06;
    m.frustumCulled = false;
    m.renderOrder = 10;
    m.raycast = () => {};
    beams.push(m);
    beam.add(m);
  }
  beam.visible = false;
  lamp.add(beam);
  group.add(lamp);

  // ---- lever
  const lever = new THREE.Group();
  lever.name = 'lever';
  const vk = new Kit('lever');
  vk.add(cyl(0.06, 0.06, 1.0, 6), '#fff8ee', { y: 0.5 });
  vk.add(sphere(0.2, 12, 8), P.tomato, { y: 1.04 }, materials.glossy);
  vk.add(cyl(0.1, 0.1, 0.3, 8), ink, { rx: Math.PI / 2 });
  vk.build(lever);
  lever.position.set(leverPos.x, leverPos.y + 1.15, leverPos.z + 0.05);
  addCollider(lever, 0.8, [0, 0.5, 0]);
  group.add(lever);

  Object.assign(parts, { lamp, lens, beam, glow, lever, door });
  group.userData.kind = 'lighthouse';
  group.userData.surface = 'stone';
  group.userData.parts = parts;
  group.userData.size = { width: 16, depth: 16, height: domeTop + 1.6 };

  const tw = new Tweens();
  const OFF = 0.8, ON = -0.8;
  const state = { lit: false, level: 0, spin: 0, speed: opts.speed ?? 0.9 };
  lever.rotation.z = OFF;
  const apply = (k) => {
    state.level = k;
    lensMat.emissiveIntensity = 3.2 * k;
    glow.material.opacity = k;
    beamMat.uniforms.uIntensity.value = k;
    beam.visible = k > 0.01;
  };
  const setLit = (on = true) => {
    state.lit = !!on;
    const from = state.level;
    const l0 = lever.rotation.z;
    tw.run('lever', 0.4, (e) => { lever.rotation.z = l0 + ((on ? ON : OFF) - l0) * e; }, ease.outBack);
    return tw.run('lit', on ? 1.1 : 0.6, (e) => apply(from + ((on ? 1 : 0) - from) * e), on ? ease.outCubic : ease.inOutSine);
  };
  lamp.userData.setLit = setLit;
  group.userData.setLit = setLit;
  group.userData.isLit = () => state.lit;
  group.userData.openDoor = (open = true) => {
    const from = door.rotation.y;
    return tw.run('door', 0.7, (e) => { door.rotation.y = from + ((open ? -1.9 : 0) - from) * e; }, open ? ease.outBack : ease.inOutSine);
  };
  group.userData.update = (dt, t) => {
    dt = Math.min(dt, 0.05);
    tw.update(dt);
    const target = state.lit ? state.speed : 0;
    state.spin += (target - state.spin) * Math.min(1, dt * 0.8);
    beam.rotation.y += state.spin * dt;
    if (state.level > 0) glow.material.opacity = state.level * (0.9 + 0.1 * Math.sin(t * 7.3));
  };
  if (opts.lit) { state.lit = true; state.spin = state.speed; lever.rotation.z = ON; apply(1); }
  return group;
}
