// Sky dome, sun + fill lights, fog, drifting clouds and a soft PMREM environment.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { part, merge, ico } from '../world/geo.js';
import { Rng } from '../core/rng.js';

export const PRESETS = {
  morning: {
    zenith: '#5fb0ff', horizon: '#d9f0ff', below: '#b9d99a', sun: '#fff0d6', sunIntensity: 2.5,
    sunElev: 40, sunAzim: 135, hemiSky: '#cfe8ff', hemiGround: '#8d9c6c', hemiIntensity: 0.85,
    fog: '#d4ecff', fogNear: 160, fogFar: 900, env: 0.3, cloudTint: '#e3ecfa',
  },
  noon: {
    zenith: '#4aa3ff', horizon: '#cdeaff', below: '#b9d99a', sun: '#ffffff', sunIntensity: 3.3,
    sunElev: 58, sunAzim: 160, hemiSky: '#d6ecff', hemiGround: '#8d9c6c', hemiIntensity: 1.15,
    fog: '#cfe8ff', fogNear: 180, fogFar: 950, env: 0.45, cloudTint: '#e6eefa',
  },
  golden: {
    zenith: '#6f9cf0', horizon: '#ffdcb0', below: '#d6b98a', sun: '#ffc27a', sunIntensity: 3.0,
    sunElev: 20, sunAzim: 235, hemiSky: '#ffe2c2', hemiGround: '#8a7a5a', hemiIntensity: 0.95,
    fog: '#ffe1bf', fogNear: 140, fogFar: 800, env: 0.35, cloudTint: '#f7d2c2',
  },
  indoor: {
    zenith: '#bfe3ff', horizon: '#e8f5ff', below: '#e8f5ff', sun: '#fff0d6', sunIntensity: 2.2,
    sunElev: 45, sunAzim: 200, hemiSky: '#fff4e0', hemiGround: '#9a8a74', hemiIntensity: 1.3,
    fog: '#e8f5ff', fogNear: 400, fogFar: 1200, env: 0.6, cloudTint: '#eef3fa',
  },
};

const skyVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;
const skyFrag = /* glsl */ `
  uniform vec3 zenith; uniform vec3 horizon; uniform vec3 below; uniform vec3 sunColor; uniform vec3 sunDir;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = mix(horizon, zenith, pow(smoothstep(-0.02, 0.55, h), 0.75));
    col = mix(col, below, smoothstep(0.0, -0.12, h));
    float s = max(dot(d, sunDir), 0.0);
    col += sunColor * (pow(s, 900.0) * 6.0 + pow(s, 60.0) * 0.35 + pow(s, 6.0) * 0.12);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export class Environment {
  constructor(scene, renderer, { shadowMapSize = 4096 } = {}) {
    this.scene = scene;
    this.renderer = renderer;
    this.group = new THREE.Group();
    this.group.name = 'environment';
    scene.add(this.group);

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1500, 32, 16),
      new THREE.ShaderMaterial({
        vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: {
          zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, below: { value: new THREE.Color() },
          sunColor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) },
        },
      }),
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1000;
    this.sky.name = 'sky';
    this.group.add(this.sky);

    this.hemi = new THREE.HemisphereLight('#cfe8ff', '#8d9c6c', 1.1);
    this.group.add(this.hemi);

    this.sun = new THREE.DirectionalLight('#fff0d6', 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = 2.5;
    this.group.add(this.sun, this.sun.target);
    this.setShadowFocus(new THREE.Vector3(0, 0, -5), 100);

    // Weak cool rim/fill from the opposite side so shadowed faces still have form.
    this.fill = new THREE.DirectionalLight('#b8d4ff', 0.35);
    this.group.add(this.fill, this.fill.target);

    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = this.envMap;

    this.clouds = this.makeClouds();
    this.group.add(this.clouds);
    this.sunDir = new THREE.Vector3();
    this.apply('morning');
  }

  apply(name) {
    const p = PRESETS[name] || PRESETS.morning;
    this.preset = name;
    const u = this.sky.material.uniforms;
    u.zenith.value.set(p.zenith);
    u.horizon.value.set(p.horizon);
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
    this.fill.position.copy(this.sunDir).multiplyScalar(-100).setY(60);
    this.scene.fog = new THREE.Fog(p.fog, p.fogNear, p.fogFar);
    this.scene.environmentIntensity = p.env;
    this.cloudMat.color.set(p.cloudTint);
    this.placeSun();
  }

  /** Fit the sun's shadow frustum around the playable area. */
  setShadowFocus(center, radius) {
    this.shadowCenter = center.clone();
    const c = this.sun.shadow.camera;
    c.left = -radius; c.right = radius; c.top = radius; c.bottom = -radius;
    c.near = 1; c.far = radius * 4 + 200;
    c.updateProjectionMatrix();
    this.shadowRadius = radius;
    if (this.sunDir) this.placeSun();
  }

  placeSun() {
    const d = this.shadowRadius * 1.5 + 80;
    this.sun.target.position.copy(this.shadowCenter);
    this.sun.position.copy(this.shadowCenter).addScaledVector(this.sunDir, d);
    this.fill.target.position.copy(this.shadowCenter);
  }

  makeClouds() {
    const rng = new Rng('clouds');
    const group = new THREE.Group();
    group.name = 'clouds';
    this.cloudMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 1, metalness: 0, fog: false, emissive: '#6e7fa6', emissiveIntensity: 0.28, flatShading: true,
    });
    const protos = [];
    for (let k = 0; k < 4; k++) {
      const parts = [];
      const puffs = rng.int(5, 8);
      for (let i = 0; i < puffs; i++) {
        const r = rng.range(8, 16) * (1 - Math.abs(i - puffs / 2) / puffs);
        const g = ico(r + 4, 2);
        const pos = g.attributes.position;
        for (let v = 0; v < pos.count; v++) if (pos.getY(v) < -r * 0.25) pos.setY(v, -r * 0.25);
        g.computeVertexNormals();
        parts.push(part(g, ['#c9d6ec', '#ffffff'], { x: (i - puffs / 2) * 11 + rng.range(-3, 3), y: rng.range(-2, 5), z: rng.range(-6, 6) }));
      }
      protos.push(merge(parts));
    }
    this.cloudList = [];
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(protos[i % protos.length], this.cloudMat);
      const a = rng.range(0, Math.PI * 2);
      const dist = rng.range(420, 900);
      m.position.set(Math.sin(a) * dist, rng.range(110, 220), Math.cos(a) * dist);
      m.rotation.y = rng.range(0, Math.PI * 2);
      m.scale.setScalar(rng.range(0.9, 1.8));
      m.userData.speed = rng.range(1.5, 3.5);
      group.add(m);
      this.cloudList.push(m);
    }
    return group;
  }

  update(dt, camera) {
    if (camera) this.sky.position.copy(camera.position);
    for (const c of this.cloudList) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 950) c.position.x = -950;
    }
  }
}
