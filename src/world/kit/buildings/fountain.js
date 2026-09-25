// Tiered village fountain with animated water. Default: dry (murky still water + a sad drip).
//   group.userData.setFlowing(bool)  jets grow from their spouts, water rises and brightens
//   parts.valve   red hand-wheel (pivot at the hub, spins about local Z, faces +Z)
//   parts.spout   the fish's mouth (Object3D), parts.frogs[] rim spouts
import { THREE, materials, Kit, cbox, lathe, cylBetween, rngOf, shade, TAU, addCollider, merge } from './common.js';
import { box, cyl, ico, sphere, torus, cone } from '../../geo.js';
import { P } from '../../../gfx/palette.js';
import { paintedTexture } from './signs.js';

const WATER = { deep: '#2a9fe0', shallow: '#6fd8f7', foam: '#effcff', murky: '#6f9f8c' };

const surfVert = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const surfFrag = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform float uTime, uFlow;
  uniform vec3 uDeep, uShallow, uFoam, uMurky;
  varying vec2 vUv;
  varying vec3 vWorld;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    float slow = sin(p.x * 6.0 + uTime * 0.6) * sin(p.y * 5.0 - uTime * 0.45);
    vec3 col = mix(uDeep, uShallow, smoothstep(0.05, 1.0, r * 0.95 + slow * 0.07));
    float rings = sin(r * 24.0 - uTime * 4.5);
    float ripple = smoothstep(0.55, 1.0, rings) * uFlow * (1.0 - 0.5 * r);
    float rim = smoothstep(0.84, 1.0, r);
    col = mix(col, uFoam, ripple * 0.4 + rim * (0.25 + 0.3 * uFlow));
    vec2 g = floor(vWorld.xz * 5.0 + vec2(uTime * 0.5, uTime * 0.35));
    float tw = step(0.975, h21(g)) * (0.5 + 0.5 * sin(uTime * 8.0 + h21(g + 3.1) * 30.0));
    col += tw * (0.25 + 0.5 * uFlow);
    col = mix(uMurky, col, 0.25 + 0.75 * uFlow);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;
const streamVert = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  attribute float aT;
  attribute float aU;
  varying float vT;
  varying float vU;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vT = aT;
    vU = aU;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const streamFrag = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform float uTime, uFlow;
  uniform vec3 uA, uB, uFoam;
  varying float vT;
  varying float vU;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    if (vT > uFlow * 1.2 - 0.1) discard;
    float wav = sin(vU * 37.7 + vT * 5.0) * 0.35 + sin(vU * 81.0 - vT * 3.0) * 0.15;
    float s1 = fract(vT * 7.0 - uTime * 2.2 + wav);
    float streak = smoothstep(0.0, 0.1, s1) * smoothstep(0.42, 0.14, s1);
    float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6);
    vec3 col = mix(uA, uB, streak * 0.85) + uFoam * fres * 0.45;
    float alpha = clamp(0.42 + 0.4 * streak + 0.45 * fres, 0.0, 0.95);
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

function waterSurfaceMaterial() {
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uFlow: { value: 0 },
      uDeep: { value: new THREE.Color(WATER.deep) }, uShallow: { value: new THREE.Color(WATER.shallow) },
      uFoam: { value: new THREE.Color(WATER.foam) }, uMurky: { value: new THREE.Color(WATER.murky) },
    }]),
    vertexShader: surfVert, fragmentShader: surfFrag, fog: true,
  });
  m.name = 'fountainWater';
  return m;
}

function streamMaterial() {
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uFlow: { value: 0 },
      uA: { value: new THREE.Color('#7fdcff') }, uB: { value: new THREE.Color('#e9fbff') }, uFoam: { value: new THREE.Color('#ffffff') },
    }]),
    vertexShader: streamVert, fragmentShader: streamFrag, fog: true, side: THREE.DoubleSide,
    transparent: true, depthWrite: false,
  });
  m.name = 'fountainStreams';
  return m;
}

let dropTex = null;
function dropTexture() {
  if (dropTex !== null) return dropTex;
  dropTex = paintedTexture(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(26, 26, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(210,245,255,1)');
    g.addColorStop(0.8, 'rgba(95,208,245,0.9)');
    g.addColorStop(1, 'rgba(95,208,245,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(32, 32, 30, 0, TAU); ctx.fill();
  }, { anisotropy: 1 });
  return dropTex;
}

/** Tag a stream geometry with aT (0 at the source, 1 at the end) and strip to the shared attributes. */
function streamGeo(g, tFrom = (uv) => uv.x, uFrom = (uv) => uv.y) {
  const uv = g.attributes.uv;
  const aT = new Float32Array(uv.count);
  const aU = new Float32Array(uv.count);
  for (let i = 0; i < uv.count; i++) {
    const q = { x: uv.getX(i), y: uv.getY(i) };
    aT[i] = tFrom(q);
    aU[i] = uFrom(q);
  }
  const out = g.index ? g.toNonIndexed() : g;
  const expand = (arr) => {
    if (!g.index) return arr;
    const idx = g.index.array;
    const a2 = new Float32Array(idx.length);
    for (let i = 0; i < idx.length; i++) a2[i] = arr[idx[i]];
    return a2;
  };
  out.setAttribute('aT', new THREE.BufferAttribute(expand(aT), 1));
  out.setAttribute('aU', new THREE.BufferAttribute(expand(aU), 1));
  for (const k of Object.keys(out.attributes)) if (!['position', 'normal', 'uv', 'aT', 'aU'].includes(k)) out.deleteAttribute(k);
  return out;
}

/**
 * fountain(opts): seed, radius (basin, default 3.4), stone, flowing (default false), frogs (4).
 */
export function fountain(opts = {}) {
  const rng = rngOf(opts.seed ?? 'fountain', 'fountain');
  const R = opts.radius ?? 3.4;
  const k = R / 3.4;
  const stone = opts.stone ?? '#e3d6bd';
  const light = shade(stone, 0.06);
  const kit = new Kit('fountain');
  const parts = {};

  // step ring + basin (lathe, fat bullnose rim)
  kit.add(lathe([[0, -0.1], [R + 0.55, -0.1], [R + 0.62, 0.1], [R + 0.5, 0.22], [0, 0.22]], 40), [shade(stone, -0.14), shade(stone, -0.06)]);
  const basin = [[R + 0.02, 0.18], [R + 0.06, 0.55], [R + 0.08, 0.68], [R - 0.02, 0.8], [R - 0.2, 0.84], [R - 0.36, 0.78], [R - 0.42, 0.62], [R - 0.42, 0.25], [0, 0.25]];
  kit.add(lathe(basin, 40), (x, y, z, c) => c.set(y > 0.5 ? light : shade(stone, -0.04)));
  // decorative panel ribs round the basin wall
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    kit.add(cbox(0.2, 0.44, 0.14, 0.05), shade(stone, -0.02), { x: Math.cos(a) * (R + 0.08), y: 0.42, z: Math.sin(a) * (R + 0.08), ry: -a + Math.PI / 2 });
  }
  // pedestal, middle bowl, stem, top bowl (all lathes)
  kit.add(lathe([[0.95 * k, 0.24], [0.95 * k, 0.5], [0.62 * k, 0.62], [0.46 * k, 0.95], [0.58 * k, 1.22], [0.36 * k, 1.5], [0.3 * k, 1.72], [0.001, 1.8]], 20), [shade(stone, -0.05), light]);
  const mb = 1.55 * k;
  kit.add(lathe([[0.3 * k, 1.7], [0.9 * k, 1.86], [mb - 0.1, 2.08], [mb, 2.26], [mb - 0.05, 2.36], [mb - 0.18, 2.34], [mb - 0.2, 2.2], [0.001, 2.18]], 28), [shade(stone, -0.04), light]);
  kit.add(lathe([[0.3 * k, 2.2], [0.3 * k, 2.3], [0.2 * k, 2.55], [0.26 * k, 2.75], [0.16 * k, 2.95], [0.001, 3.02]], 16), light);
  const tb = 0.8 * k;
  kit.add(lathe([[0.16 * k, 2.94], [0.5 * k, 3.02], [tb - 0.06, 3.16], [tb, 3.3], [tb - 0.06, 3.38], [tb - 0.14, 3.34], [tb - 0.15, 3.24], [0.001, 3.22]], 20), [shade(stone, -0.04), light]);

  // the fish finial (mouth up, spouting)
  const fishC = opts.fishColor ?? '#ff9f43';
  kit.at({ y: 3.26 }, () => {
    kit.add(sphere(0.3, 14, 10), [shade(fishC, -0.08), shade(fishC, 0.08)], { y: 0.46, sx: 0.85, sy: 1.35, sz: 0.8 }, materials.glossy);
    for (const s of [-1, 1]) {
      kit.add(cone(0.16, 0.34, 6), shade(fishC, -0.1), { x: s * 0.14, y: 0.08, rz: s * 0.6, sz: 0.4 }, materials.glossy);
      kit.add(sphere(0.1, 10, 8), '#fff8ee', { x: s * 0.2, y: 0.66, z: 0.12 });
      kit.add(sphere(0.05, 8, 6), P.ink, { x: s * 0.24, y: 0.67, z: 0.18 });
      kit.add(cone(0.1, 0.22, 5), shade(fishC, -0.05), { x: s * 0.28, y: 0.42, z: 0.02, rz: -s * 1.9, sz: 0.3 }, materials.glossy);
    }
    kit.add(torus(0.085, 0.045, 6, 12), '#ff6f8a', { y: 0.86, rx: Math.PI / 2 }, materials.glossy);
    parts.spout = kit.anchor('spout', { y: 0.9 });
  });

  // frogs on the rim spouting inward
  const nFrogs = opts.frogs ?? 4;
  parts.frogs = [];
  const frogAngles = [];
  for (let i = 0; i < nFrogs; i++) {
    const a = Math.PI / 4 + (i / nFrogs) * TAU;
    frogAngles.push(a);
    const fr = R - 0.2;
    kit.at({ x: Math.cos(a) * fr, y: 0.84, z: Math.sin(a) * fr, ry: -a - Math.PI / 2 }, () => {
      const g = '#57b84a';
      kit.add(sphere(0.3, 12, 8), [shade(g, -0.1), g], { y: 0.16, sy: 0.72, sz: 1.05 }, materials.glossy);
      for (const s of [-1, 1]) {
        kit.add(sphere(0.11, 10, 8), g, { x: s * 0.14, y: 0.34, z: 0.06 }, materials.glossy);
        kit.add(sphere(0.075, 8, 6), '#fff8ee', { x: s * 0.15, y: 0.38, z: 0.12 });
        kit.add(sphere(0.04, 6, 5), P.ink, { x: s * 0.16, y: 0.39, z: 0.18 });
      }
      kit.add(torus(0.06, 0.03, 5, 10), '#ff7eb6', { y: 0.14, z: 0.3 });
      parts.frogs.push(kit.anchor('frogMouth', { y: 0.14, z: 0.33 }));
    });
  }

  // lily pads on the stagnant (dry-state) water; the rising water swallows them
  if (opts.lilies !== false) {
    for (let i = 0; i < 4; i++) {
      const a = rng.range(0, TAU), r = rng.range(1.4, R - 0.8);
      kit.add(cyl(0.3, 0.3, 0.03, 10), i % 2 ? '#5fae44' : '#7cc653', { x: Math.cos(a) * r, y: 0.455, z: Math.sin(a) * r, ry: rng.range(0, TAU) });
      if (i === 0) kit.add(ico(0.1, 0), P.bubblegum, { x: Math.cos(a) * r, y: 0.5, z: Math.sin(a) * r });
    }
  }

  // valve standpipe in front, pipe running into the basin
  const vx = (opts.valveSide ?? 1) * 1.7 * k, vz = R + 0.95;
  kit.at({ x: vx, z: vz }, () => {
    kit.add(cbox(0.5, 1.0, 0.5, 0.08), [shade(stone, -0.12), stone], { y: 0.5 });
    kit.add(cbox(0.62, 0.14, 0.62, 0.05), light, { y: 1.04 });
    kit.add(cylBetween([0, 0.3, -0.2], [0, 0.3, -0.7], 0.11, 0.11, 8), P.metalDark);
    kit.add(cyl(0.12, 0.12, 0.3, 10), P.metalDark, { y: 0.7, z: 0.35, rx: Math.PI / 2 });
  });
  const valve = new THREE.Group();
  valve.name = 'valve';
  const vk = new Kit('valve');
  const red = opts.valveColor ?? '#e8413c';
  vk.add(torus(0.34, 0.06, 6, 20), red, {}, materials.glossy);
  for (let i = 0; i < 3; i++) vk.add(box(0.66, 0.07, 0.06), red, { rz: (i / 3) * Math.PI }, materials.glossy);
  vk.add(cyl(0.1, 0.1, 0.12, 10), shade(red, -0.15), { rx: Math.PI / 2 }, materials.glossy);
  vk.add(ico(0.06, 0), P.gold, { z: 0.08 }, materials.glossy);
  vk.build(valve);
  valve.position.set(vx, 0.7, vz + 0.55);
  addCollider(valve, 0.5);
  kit.anchors.push(valve);

  const group = kit.build(new THREE.Group());
  group.name = opts.name ?? 'fountain';

  // ---------------- water surfaces (one mesh, three discs)
  const surfMat = waterSurfaceMaterial();
  const discs = [
    { r: R - 0.4, y0: 0.44, y1: 0.62 },
    { r: mb - 0.17, y0: 2.21, y1: 2.29 },
    { r: tb - 0.13, y0: 3.24, y1: 3.3 },
  ];
  const surfGeo = merge(discs.map((d) => {
    const g = new THREE.CircleGeometry(d.r, 40).rotateX(-Math.PI / 2).toNonIndexed();
    g.deleteAttribute('normal');
    g.computeVertexNormals();
    return g;
  }));
  // per-vertex which disc (for level animation)
  const baseY = new Float32Array(surfGeo.attributes.position.count);
  const discOf = new Uint8Array(surfGeo.attributes.position.count);
  {
    let o = 0;
    discs.forEach((d, i) => {
      const n = 40 * 3;
      for (let v = 0; v < n; v++) { discOf[o + v] = i; }
      o += n;
    });
  }
  const water = new THREE.Mesh(surfGeo, surfMat);
  water.name = 'water';
  water.receiveShadow = true;
  group.add(water);
  const setLevel = (f) => {
    const p = surfGeo.attributes.position;
    for (let v = 0; v < p.count; v++) { const d = discs[discOf[v]]; p.setY(v, d.y0 + (d.y1 - d.y0) * f); }
    p.needsUpdate = true;
  };

  // ---------------- streams (one mesh; each vertex knows how far along its stream it is)
  const streams = [];
  const spoutY = 3.26 + 0.9;
  // central jet: up from the fish then an umbrella falling into the top bowl
  const jetPts = [[0.06, spoutY], [0.075, spoutY + 0.55], [0.085, spoutY + 1.05], [0.16, spoutY + 1.22], [0.3, spoutY + 1.16], [0.44, spoutY + 0.86], [0.56, spoutY + 0.3], [tb - 0.18, 3.34]];
  streams.push(streamGeo(lathe(jetPts, 14), (uv) => uv.y, (uv) => uv.x));
  // overflow spouts spilling from the bowl lips
  const spill = (r0, y0, r1, y1, n, arc) => {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU + 0.2;
      const pts = [[r0, y0], [r0 + (r1 - r0) * 0.35, y0 - (y0 - y1) * 0.25], [r0 + (r1 - r0) * 0.75, y0 - (y0 - y1) * 0.6], [r1, y1]];
      streams.push(streamGeo(lathe(pts, 4, a0, arc), (uv) => uv.y, (uv) => uv.x * 0.3 + i * 0.37));
    }
  };
  spill(tb + 0.02, 3.36, tb + 0.2, 2.28, 6, 0.42);
  spill(mb + 0.02, 2.34, mb + 0.3, 0.6, 8, 0.34);
  // frog arcs
  const arcPts = [];
  for (const a of frogAngles) {
    const from = new THREE.Vector3(Math.cos(a) * (R - 0.2 - 0.33), 0.98, Math.sin(a) * (R - 0.2 - 0.33));
    const to = new THREE.Vector3(Math.cos(a) * 1.95 * k, 0.6, Math.sin(a) * 1.95 * k);
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const p = from.clone().lerp(to, t);
      p.y += Math.sin(Math.PI * t) * 0.75 * k;
      pts.push(p);
    }
    arcPts.push(pts);
    streams.push(streamGeo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.09, 6, false), (uv) => uv.x, (uv) => uv.y));
  }
  const streamMat = streamMaterial();
  const jets = new THREE.Mesh(merge(streams), streamMat);
  jets.name = 'jets';
  jets.castShadow = false;
  group.add(jets);

  // ---------------- droplets (points)
  const N = 110;
  const dropPos = new Float32Array(N * 3);
  const dropVel = new Float32Array(N * 3);
  const dropLife = new Float32Array(N);
  const dropGeo = new THREE.BufferGeometry();
  dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPos, 3));
  const drops = new THREE.Points(dropGeo, new THREE.PointsMaterial({
    size: 0.17 * k, map: dropTexture(), color: '#ffffff', transparent: true, depthWrite: false, alphaTest: 0.05, sizeAttenuation: true,
  }));
  drops.name = 'droplets';
  drops.frustumCulled = false;
  group.add(drops);

  // ---------------- the sad drip
  const drip = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6).scale(1, 1.35, 1), new THREE.MeshStandardMaterial({ color: WATER.shallow, roughness: 0.15, emissive: '#3aa7d8', emissiveIntensity: 0.25 }));
  drip.name = 'drip';
  group.add(drip);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 4, 20).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: WATER.foam }));
  ring.name = 'dripRing';
  group.add(ring);

  // rubber duck gag: floats on the basin water, bobs, drifts when the fountain runs
  const duck = new THREE.Group();
  duck.name = 'duck';
  const dk = new Kit('duck');
  dk.add(sphere(0.22, 12, 8), P.sunflower, { y: 0.1, sx: 1.2, sz: 0.95 }, materials.glossy);
  dk.add(sphere(0.14, 10, 8), P.sunflower, { x: 0.16, y: 0.3 }, materials.glossy);
  dk.add(cone(0.06, 0.14, 6), P.tangerine, { x: 0.32, y: 0.28, rz: -Math.PI / 2 }, materials.glossy);
  for (const sz of [-1, 1]) dk.add(sphere(0.03, 6, 4), P.ink, { x: 0.25, y: 0.35, z: sz * 0.08 });
  dk.add(cone(0.08, 0.12, 5), shade(P.sunflower, -0.05), { x: -0.26, y: 0.2, rz: 1.2 }, materials.glossy);
  dk.build(duck);
  if (opts.duck !== false) group.add(duck);
  const duckA = rng.range(0, TAU);

  Object.assign(parts, { valve, water, jets, droplets: drops, drip, duck });
  group.userData.kind = 'fountain';
  group.userData.parts = parts;
  group.userData.size = { width: 2 * (R + 1.2), depth: 2 * (R + 1.6), height: 5.2 };

  const state = { on: !!opts.flowing, flow: opts.flowing ? 1 : 0, t: 0, dripT: 0, spin: 0 };
  let spawnAcc = 0;
  const sources = () => {
    const list = [{ p: [0, spoutY + 0.95, 0], v: 1.2, spread: 1.4, up: 0.8 }];
    for (const pts of arcPts) {
      const e = pts[pts.length - 1];
      list.push({ p: [e.x, e.y + 0.05, e.z], v: 0.6, spread: 1.2, up: 1.6 });
    }
    list.push({ p: [0, 0.62, 0], v: 0, spread: 0, up: 0, ring: mb + 0.24, y: 0.62 });
    return list;
  };
  const src = sources();
  function spawn(i) {
    const s = src[Math.floor(Math.random() * src.length)];
    if (s.ring) {
      const a = Math.random() * TAU;
      dropPos.set([Math.cos(a) * s.ring, s.y + 0.02, Math.sin(a) * s.ring], i * 3);
      dropVel.set([Math.cos(a) * 0.9, 1.6 + Math.random() * 1.2, Math.sin(a) * 0.9], i * 3);
    } else {
      const a = Math.random() * TAU;
      const sp = s.spread * (0.4 + Math.random() * 0.6);
      dropPos.set(s.p, i * 3);
      dropVel.set([Math.cos(a) * sp, s.up + Math.random() * s.up, Math.sin(a) * sp], i * 3);
    }
    dropLife[i] = 0.5 + Math.random() * 0.6;
  }
  const park = (i) => { dropPos[i * 3] = 0; dropPos[i * 3 + 1] = 1.0; dropPos[i * 3 + 2] = 0; };
  for (let i = 0; i < N; i++) { dropLife[i] = -1; park(i); }
  dropGeo.boundingBox = new THREE.Box3(new THREE.Vector3(-R, 0, -R), new THREE.Vector3(R, 5.5, R));
  dropGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2.5, 0), R + 2);

  group.userData.setFlowing = (on = true) => { state.on = !!on; };
  group.userData.isFlowing = () => state.on;
  group.userData.update = (dt, t) => {
    dt = Math.min(dt, 0.05);
    state.t = t;
    state.flow += ((state.on ? 1 : 0) - state.flow) * Math.min(1, dt * (state.on ? 1.1 : 0.8));
    const f = state.flow;
    surfMat.uniforms.uTime.value = t;
    surfMat.uniforms.uFlow.value = f;
    streamMat.uniforms.uTime.value = t;
    streamMat.uniforms.uFlow.value = f;
    jets.visible = f > 0.02;
    setLevel(f);
    const da = duckA + t * 0.12 * f;
    const dr = 2.45 * k;
    duck.position.set(Math.cos(da) * dr, 0.44 + 0.18 * f + Math.sin(t * 2.3) * 0.02 * (0.3 + f), Math.sin(da) * dr);
    duck.rotation.set(Math.sin(t * 1.7) * 0.06 * (0.3 + f), -da - Math.PI / 2, Math.sin(t * 2.1) * 0.05);
    // valve spins while the water is coming on
    state.spin += ((state.on ? 1 : 0) - state.spin) * Math.min(1, dt * 2);
    valve.rotation.z -= dt * 6 * Math.abs((state.on ? 1 : 0) - state.spin) * 1.5;
    // droplets
    spawnAcc += dt * 160 * f;
    for (let i = 0; i < N; i++) {
      if (dropLife[i] <= 0) {
        if (spawnAcc >= 1) { spawn(i); spawnAcc -= 1; } else { park(i); continue; }
      }
      dropLife[i] -= dt;
      dropVel[i * 3 + 1] -= 9.8 * dt;
      dropPos[i * 3] += dropVel[i * 3] * dt;
      dropPos[i * 3 + 1] += dropVel[i * 3 + 1] * dt;
      dropPos[i * 3 + 2] += dropVel[i * 3 + 2] * dt;
      if (dropPos[i * 3 + 1] < 0.55) dropLife[i] = 0;
    }
    spawnAcc = Math.min(spawnAcc, 5);
    dropGeo.attributes.position.needsUpdate = true;
    drops.visible = f > 0.05;
    // sad drip (only when dry)
    const dry = f < 0.15;
    drip.visible = dry;
    if (dry) {
      state.dripT += dt;
      const period = 2.6;
      const tt = state.dripT % period;
      const top = 3.3, land = 2.22, lipZ = tb + 0.04;
      const fall = Math.max(0, tt - 1.0);
      const y = top - 0.06 - 4.9 * fall * fall;
      drip.position.set(0, Math.max(land, y), lipZ);
      drip.scale.setScalar(tt < 1.0 ? 0.35 + 0.65 * (tt / 1.0) : 1);
      const since = y < land ? fall - Math.sqrt((top - 0.06 - land) / 4.9) : -1;
      ring.visible = since >= 0 && since < 0.6;
      if (ring.visible) {
        ring.position.set(0, land + 0.02, lipZ);
        ring.scale.setScalar(0.4 + since * 2.2);
        drip.visible = false;
      }
    } else ring.visible = false;
  };
  group.userData.update(0.016, 0);
  return group;
}
