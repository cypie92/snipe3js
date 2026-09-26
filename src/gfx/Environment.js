// Sky dome, sun + fill lights, fog, drifting clouds and a soft PMREM environment.
// Levels are viewed from a perch on the +Z side looking toward -Z, so every preset keeps the sun on the
// perch side at a 3/4 angle: building fronts facing the player are lit and shadows fall away from the
// camera as long soft shapes. Presets may also carry a `grade` block that the Renderer picks up.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng } from '../core/rng.js';
import { VIEWMODEL_LAYER } from './post.js';

/**
 * sunAzim: degrees around Y measured from +Z (the perch side) toward +X. -40 = over the player's left
 * shoulder, +40 = right shoulder. Colours are sRGB hex. fog = horizon haze colour (sky, fog and cloud
 * haze share it so distant hills melt into the horizon).
 */
export const PRESETS = {
  morning: {
    zenith: '#3f93ea', horizon: '#a9d6f7', haze: '#e3f1f6', below: '#c5dccb',
    sun: '#fff0d9', sunIntensity: 2.7, sunElev: 41, sunAzim: -38,
    hemiSky: '#bcd9ff', hemiGround: '#8a9a6a', hemiIntensity: 1.05,
    fill: '#a9b9ff', fillIntensity: 0.45,
    fogNear: 110, fogFar: 1150, env: 0.28,
    cloudLit: '#fffdf8', cloudShade: '#a9b6dc', cloudHaze: 0.55,
    grade: {},
  },
  noon: {
    zenith: '#3a8ff0', horizon: '#b3dcfa', haze: '#e6f4fa', below: '#c5dccb',
    sun: '#fffaf0', sunIntensity: 3.1, sunElev: 58, sunAzim: 20,
    hemiSky: '#c3dcff', hemiGround: '#8d9c6c', hemiIntensity: 1.15,
    fill: '#b0c0ff', fillIntensity: 0.4,
    fogNear: 130, fogFar: 1250, env: 0.32,
    cloudLit: '#ffffff', cloudShade: '#b3bfdf', cloudHaze: 0.5,
    grade: { contrast: 0.16 },
  },
  golden: {
    zenith: '#5d8fe0', horizon: '#f6cfa2', haze: '#ffe4c4', below: '#d8c49a',
    sun: '#ffc07a', sunIntensity: 3.0, sunElev: 21, sunAzim: 48,
    hemiSky: '#d2c8f0', hemiGround: '#8a7a5a', hemiIntensity: 1.0,
    fill: '#9fa8ff', fillIntensity: 0.5,
    fogNear: 90, fogFar: 950, env: 0.3,
    cloudLit: '#ffe6cc', cloudShade: '#b59ac6', cloudHaze: 0.6,
    grade: { gain: [1.05, 0.99, 0.93], lift: [0.03, 0.012, 0.05], vibrance: 0.18 },
  },
  indoor: {
    zenith: '#bfe3ff', horizon: '#e8f5ff', haze: '#f1f8ff', below: '#e8f5ff',
    sun: '#fff0d6', sunIntensity: 2.2, sunElev: 48, sunAzim: -25,
    hemiSky: '#fff4e0', hemiGround: '#9a8a74', hemiIntensity: 1.3,
    fill: '#c8d4ff', fillIntensity: 0.3,
    fogNear: 400, fogFar: 1600, env: 0.55,
    cloudLit: '#ffffff', cloudShade: '#c4cde6', cloudHaze: 0.5,
    grade: { vignette: [0.6, 1.2, 0.15] },
  },
};

/** Shared uniforms for custom shaders (water etc.) that want the current sun / sky. Updated by apply(). */
export const envUniforms = {
  uEnvTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Color('#ffffff') },
  uSkyColor: { value: new THREE.Color('#5fb0ff') },
  uHorizonColor: { value: new THREE.Color('#d9f0ff') },
};

const skyVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;
const skyFrag = /* glsl */ `
  uniform vec3 zenith; uniform vec3 horizon; uniform vec3 haze; uniform vec3 below;
  uniform vec3 sunColor; uniform vec3 sunDir;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    float up = max(h, 0.0);
    vec3 col = mix(horizon, zenith, smoothstep(0.0, 1.0, pow(up, 0.55)));
    col = mix(col, haze, exp(-up * 22.0));                      // pale haze band hugging the horizon
    col = mix(col, below, smoothstep(0.0, -0.1, h));
    float cs = max(dot(d, sunDir), 0.0);
    // sun disc + tight halo + broad forward-scatter glow (stronger when the sun is low)
    float disc = smoothstep(0.99955, 0.99975, cs);
    float glow = pow(cs, 700.0) * 2.2 + pow(cs, 45.0) * 0.32 + pow(cs, 6.0) * 0.12 * (1.2 - sunDir.y);
    col += sunColor * (disc * 12.0 + glow);
    // the horizon brightens under the sun's azimuth
    vec2 hz = normalize(d.xz + 1e-5), sz = normalize(sunDir.xz + 1e-5);
    col += sunColor * pow(max(dot(hz, sz), 0.0), 5.0) * exp(-up * 9.0) * 0.12;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const cloudVert = /* glsl */ `
  attribute float aSpeed;   // orbit speed (rad/s) around the scene's Y axis
  attribute float aH;       // 0 at the cloud's flat base .. 1 at its crown
  uniform float uTime;
  varying vec3 vN;
  varying vec3 vW;
  varying float vH;
  void main() {
    float a = uTime * aSpeed;
    float s = sin(a), c = cos(a);
    mat3 R = mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
    vec4 wp = modelMatrix * vec4(R * position, 1.0);
    vW = wp.xyz;
    vN = normalize(mat3(modelMatrix) * (R * normal));
    vH = aH;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const cloudFrag = /* glsl */ `
  uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uLit; uniform vec3 uShade; uniform vec3 uHaze;
  uniform float uHazeAmt;
  varying vec3 vN;
  varying vec3 vW;
  varying float vH;
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(cameraPosition - vW);
    float ndl = dot(n, uSunDir);
    vec3 col = mix(uShade, uLit, smoothstep(-0.45, 0.8, ndl));      // soft wrap-around terminator
    col *= mix(0.84, 1.0, smoothstep(0.0, 0.55, vH));              // cooler, darker belly
    float rim = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.4);
    float toward = pow(clamp(dot(-v, uSunDir), 0.0, 1.0), 3.0);
    col += uSunColor * rim * (0.1 + 0.9 * toward);                 // silver lining, strongest when backlit
    float el = normalize(vW - cameraPosition).y;
    col = mix(col, uHaze, uHazeAmt * (1.0 - smoothstep(0.02, 0.3, el)));
    gl_FragColor = vec4(col, 1.0);
  }
`;

const _v = new THREE.Vector3();

export class Environment {
  constructor(scene, renderer, { shadowMapSize = 4096 } = {}) {
    this.scene = scene;
    this.renderer = renderer;
    this.group = new THREE.Group();
    this.group.name = 'environment';
    scene.add(this.group);
    this.time = 0;

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1500, 48, 24),
      new THREE.ShaderMaterial({
        vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: {
          zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, haze: { value: new THREE.Color() },
          below: { value: new THREE.Color() }, sunColor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) },
        },
      }),
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1000;
    this.sky.name = 'sky';
    this.sky.userData.noHit = true;
    this.group.add(this.sky);

    this.hemi = new THREE.HemisphereLight('#bcd9ff', '#8a9a6a', 1.0);
    this.group.add(this.hemi);

    this.sun = new THREE.DirectionalLight('#fff0d9', 2.7);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    this.sun.shadow.radius = shadowMapSize >= 4096 ? 3 : 2;
    this.sun.userData.refreshShadow = () => this.updateShadowBias();
    this.group.add(this.sun, this.sun.target);

    // Cool fill from the far side: lifts shadowed faces and draws a soft rim on silhouettes.
    this.fill = new THREE.DirectionalLight('#a9b9ff', 0.45);
    this.group.add(this.fill, this.fill.target);
    // The first-person rifle renders in its own pass (see post.js) and needs the same lights.
    for (const l of [this.hemi, this.sun, this.fill]) l.layers.enable(VIEWMODEL_LAYER);

    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = this.envMap;
    this.fog = new THREE.Fog('#e3f1f6', 110, 1150);
    scene.fog = this.fog;

    this.clouds = this.makeClouds();
    this.group.add(this.clouds);
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.shadowCenter = new THREE.Vector3(0, 0, -5);
    this.shadowRadius = 100;
    this.setShadowFocus(this.shadowCenter, 100);
    this.apply('morning');
  }

  apply(name) {
    const base = PRESETS[name] ? name : 'morning';
    this.preset = base;
    this.params = { ...PRESETS[base] };
    this.refresh();
  }

  /** Look-dev: override any preset field live, e.g. env.set({ sunAzim: -30, sunIntensity: 3 }). */
  set(partial = {}) {
    Object.assign(this.params, partial);
    this.refresh();
  }

  refresh() {
    const p = this.params;
    const u = this.sky.material.uniforms;
    u.zenith.value.set(p.zenith);
    u.horizon.value.set(p.horizon);
    u.haze.value.set(p.haze);
    u.below.value.set(p.below);
    u.sunColor.value.set(p.sun);
    const el = THREE.MathUtils.degToRad(p.sunElev);
    const az = THREE.MathUtils.degToRad(p.sunAzim);
    this.sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
    u.sunDir.value.copy(this.sunDir);
    this.sun.color.set(p.sun);
    this.sun.intensity = p.sunIntensity;
    this.hemi.color.set(p.hemiSky);
    this.hemi.groundColor.set(p.hemiGround);
    this.hemi.intensity = p.hemiIntensity;
    this.fill.color.set(p.fill);
    this.fill.intensity = p.fillIntensity;
    this.fog.color.set(p.haze);
    this.fog.near = p.fogNear;
    this.fog.far = p.fogFar;
    this.scene.fog = this.fog;
    this.scene.environmentIntensity = p.env;
    const cu = this.cloudMat.uniforms;
    cu.uSunDir.value.copy(this.sunDir);
    cu.uSunColor.value.set(p.sun).multiplyScalar(0.55);
    cu.uLit.value.set(p.cloudLit);
    cu.uShade.value.set(p.cloudShade);
    cu.uHaze.value.set(p.haze);
    cu.uHazeAmt.value = p.cloudHaze;
    envUniforms.uSunDir.value.copy(this.sunDir);
    envUniforms.uSunColor.value.set(p.sun).multiplyScalar(p.sunIntensity / 2.7);
    envUniforms.uSkyColor.value.set(p.zenith);
    envUniforms.uHorizonColor.value.set(p.haze);
    // Grade overrides are read by the Renderer each frame (identity change = re-apply).
    this.scene.userData.grade = { ...(p.grade || {}) };
    this.placeSun();
  }

  /** Fit the sun's shadow frustum around the playable area. */
  setShadowFocus(center, radius) {
    this.shadowCenter = center.clone();
    this.shadowRadius = radius;
    const c = this.sun.shadow.camera;
    c.left = -radius; c.right = radius; c.top = radius; c.bottom = -radius;
    c.near = 1;
    c.far = radius * 3.2 + 160;
    c.updateProjectionMatrix();
    this.updateShadowBias();
    if (this.sunDir) this.placeSun();
  }

  /** Bias in world units, scaled to the shadow texel size: no acne on slopes, no floating contact. */
  updateShadowBias() {
    const s = this.sun.shadow;
    const texel = (2 * this.shadowRadius) / s.mapSize.x;
    s.normalBias = texel * 0.9;
    s.bias = -(texel * 0.35) / (s.camera.far - s.camera.near);
  }

  placeSun() {
    const d = this.shadowRadius * 1.4 + 70;
    this.sun.target.position.copy(this.shadowCenter);
    this.sun.position.copy(this.shadowCenter).addScaledVector(this.sunDir, d);
    // fill: from the far side, low, slightly off-axis
    _v.set(-this.sunDir.x, 0, -this.sunDir.z).normalize();
    this.fill.position.copy(this.shadowCenter).addScaledVector(_v, 100).setY(this.shadowCenter.y + 55);
    this.fill.target.position.copy(this.shadowCenter);
  }

  // ---------------------------------------------------------------- clouds
  /** All clouds in one mesh; they orbit the scene slowly in the vertex shader (no per-frame JS). */
  makeClouds() {
    const rng = new Rng('clouds-v2');
    const pos = [], nrm = [], hs = [], sp = [], idx = [];
    const puff = mergeVertices(new THREE.IcosahedronGeometry(1, 2).deleteAttribute('normal').deleteAttribute('uv'));
    const pp = puff.attributes.position;
    const pi = puff.index.array;
    const n = new THREE.Vector3();
    const down = new THREE.Vector3(0, -1, 0);
    const add = (cx, cy, cz, yaw, len, hgt, speed, puffs) => {
      const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
      const base = cy - hgt * 0.32;
      const ccy = cy - hgt * 0.25;
      const list = [];
      for (let i = 0; i < puffs; i++) {
        const t = puffs === 1 ? 0.5 : i / (puffs - 1);
        const bell = Math.sin(Math.PI * (0.12 + 0.76 * t));
        const r = hgt * (0.3 + 0.36 * bell) * rng.range(0.85, 1.15);
        list.push([(t - 0.5) * len + rng.range(-0.06, 0.06) * len, hgt * 0.1 * bell + rng.range(-0.04, 0.06) * hgt, rng.range(-0.2, 0.2) * hgt, r]);
      }
      const crowns = Math.max(1, Math.round(puffs / 3));
      for (let i = 0; i < crowns; i++) {
        const t = rng.range(0.3, 0.7);
        list.push([(t - 0.5) * len * 0.8, hgt * rng.range(0.28, 0.42), rng.range(-0.12, 0.12) * hgt, hgt * rng.range(0.34, 0.46)]);
      }
      for (const [lx, ly, lz, r] of list) {
        const px = cx + lx * cosY + lz * sinY;
        const pz = cz - lx * sinY + lz * cosY;
        const py = cy + ly;
        const first = pos.length / 3;
        for (let k = 0; k < pp.count; k++) {
          const nx = pp.getX(k), ny = pp.getY(k), nz = pp.getZ(k);
          const x = px + nx * r, z = pz + nz * r;
          let y = py + ny * r * 0.92;
          const flat = y < base;
          if (flat) y = base;
          // "spherified" normals: puff detail blended with the whole cloud's volume (soft, no seams)
          _v.set(x - cx, (y - ccy) * 1.6, z - cz).normalize();
          n.set(nx, ny, nz).multiplyScalar(0.55).addScaledVector(_v, 0.45).normalize();
          if (flat) n.lerp(down, 0.7).normalize();
          pos.push(x, y, z);
          nrm.push(n.x, n.y, n.z);
          hs.push(THREE.MathUtils.clamp((y - base) / (hgt * 1.1), 0, 1));
          sp.push(speed);
        }
        for (let k = 0; k < pi.length; k++) idx.push(first + pi[k]);
      }
    };
    // Mid layer: big fair-weather cumulus. Low layer: flatter, hazier clouds sitting behind the hills.
    for (let i = 0; i < 16; i++) {
      const front = i < 11;
      const a = front ? Math.PI + rng.range(-1.45, 1.45) : rng.range(-1.6, 1.6);
      const dist = rng.range(480, 900);
      const hgt = rng.range(20, 34);
      add(Math.sin(a) * dist, rng.range(120, 210), Math.cos(a) * dist, a + rng.range(-0.4, 0.4) + Math.PI / 2,
        hgt * rng.range(2.2, 3.6), hgt, rng.range(0.0012, 0.0024) * (i % 3 ? 1 : 0.7), rng.int(5, 8));
    }
    for (let i = 0; i < 12; i++) {
      const a = Math.PI + rng.range(-1.9, 1.9);
      const dist = rng.range(850, 1250);
      const hgt = rng.range(14, 22);
      add(Math.sin(a) * dist, rng.range(55, 95), Math.cos(a) * dist, a + Math.PI / 2 + rng.range(-0.2, 0.2),
        hgt * rng.range(3.5, 5.5), hgt, rng.range(0.0008, 0.0014), rng.int(5, 7));
    }
    puff.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('aH', new THREE.Float32BufferAttribute(hs, 1));
    g.setAttribute('aSpeed', new THREE.Float32BufferAttribute(sp, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    this.cloudMat = new THREE.ShaderMaterial({
      vertexShader: cloudVert, fragmentShader: cloudFrag, fog: false,
      uniforms: {
        uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() },
        uLit: { value: new THREE.Color() }, uShade: { value: new THREE.Color() }, uHaze: { value: new THREE.Color() },
        uHazeAmt: { value: 0.5 },
      },
    });
    const mesh = new THREE.Mesh(g, this.cloudMat);
    mesh.name = 'clouds';
    mesh.frustumCulled = false;
    mesh.userData.noHit = true;
    mesh.raycast = () => {}; // never block shots or range readouts
    this.cloudTris = idx.length / 3;
    return mesh;
  }

  update(dt, camera) {
    this.time += dt;
    if (camera) this.sky.position.copy(camera.position);
    this.cloudMat.uniforms.uTime.value = this.time;
    envUniforms.uEnvTime.value = this.time;
  }
}
