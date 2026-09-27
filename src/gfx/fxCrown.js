// Water splash crowns: a thin translucent sheet that shoots up from the surface, flares out into a
// spiky crown and collapses. One instanced draw call for every crown on screen. The sheet is see-through
// where it faces the camera and bright only along its silhouette and foamy lip, so whoever just got
// dunked stays visible inside it.
import * as THREE from 'three';
import { envUniforms } from './Environment.js';

const SEG = 40, ROWS = 6;

const vert = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  attribute float aSpike;  // 0 on the body, 0..1 lift on the rim points
  attribute vec4 iPos;     // xyz base centre (the water surface), w radius (m)
  attribute vec4 iPrm;     // x life 0..1, y height / radius, z seed (turns), w opacity
  attribute vec3 iCol;
  uniform vec3 uSunDir;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vCol;
  varying vec3 vSun;
  varying float vH;
  varying float vAng;
  varying float vK;
  varying float vA;
  void main() {
    float k = iPrm.x;
    float h = position.y;
    float ang = atan(position.z, position.x) + iPrm.z * 6.2831853;
    // the base ring races outward, the rim flares further as the sheet rises
    float grow = 1.0 - pow(1.0 - clamp(k * 1.7, 0.0, 1.0), 3.0);
    float lift = sin(3.14159 * clamp(k * 1.18, 0.0, 1.0));
    float rad = iPos.w * (0.42 + 0.58 * grow) * (1.0 + h * (0.28 + 0.55 * k));
    float hgt = iPrm.y * iPos.w * lift * (h + aSpike * 0.55 * (1.0 - 0.4 * k));
    vec3 wp = iPos.xyz + vec3(cos(ang) * rad, hgt, sin(ang) * rad);
    // outward-leaning normal of a flared cone
    vec3 n = normalize(vec3(cos(ang), -0.35 - 0.3 * h, sin(ang)));
    vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
    vN = normalize(mat3(viewMatrix) * n);
    vV = -mvPosition.xyz;
    vSun = normalize(mat3(viewMatrix) * uSunDir);
    vCol = iCol;
    vH = h + aSpike * 0.55;
    vAng = ang;
    vK = k;
    vA = iPrm.w;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const frag = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform vec3 uFoam;
  uniform vec3 uShade;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vCol;
  varying vec3 vSun;
  varying float vH;
  varying float vAng;
  varying float vK;
  varying float vA;
  void main() {
    vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
    vec3 v = normalize(vV);
    float fres = 1.0 - abs(dot(n, v));
    float lit = smoothstep(-0.25, 0.3, dot(n, vSun));
    vec3 col = mix(vCol * uShade, vCol, lit);
    float lip = smoothstep(0.72, 1.0, vH);
    col = mix(col, uFoam, lip * 0.85);
    // clear sheet facing the camera, bright silhouette lines and a foamy lip
    float a = mix(0.12, 0.88, pow(fres, 1.5));
    a = max(a, lip * mix(0.4, 0.9, fres)); // the lip thins where it crosses in front of the victim
    a *= 0.8 + 0.2 * sin(vAng * 19.0 + vH * 3.0);          // streaky water sheet
    a *= gl_FrontFacing ? 1.0 : 0.55;                        // the far wall reads fainter
    a *= smoothstep(0.0, 0.14, vH);                          // melts into the water at its base
    a *= vA * (1.0 - smoothstep(0.55, 1.0, vK));
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, a);
    #include <fog_fragment>
  }
`;

function crownGeometry() {
  const pos = [], spike = [], idx = [];
  for (let j = 0; j <= ROWS; j++) {
    const h = j / ROWS;
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      pos.push(Math.cos(a), h, Math.sin(a));
      // rounded points on the rim (9 of them), none on the body
      spike.push(j === ROWS ? Math.pow(0.5 + 0.5 * Math.cos(a * 9), 3) : 0);
    }
  }
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < SEG; i++) {
      const a = j * (SEG + 1) + i, b = a + SEG + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSpike', new THREE.Float32BufferAttribute(spike, 1));
  g.setIndex(idx);
  return g;
}

export class CrownPool {
  constructor(parent, { max = 12 } = {}) {
    this.max = max;
    const base = crownGeometry();
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('aSpike', base.attributes.aSpike);
    const mk = (name, n) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(max * n), n);
      a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, a);
      return a;
    };
    this.iPos = mk('iPos', 4);
    this.iPrm = mk('iPrm', 4);
    this.iCol = mk('iCol', 3);
    geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      name: 'fx-crown', vertexShader: vert, fragmentShader: frag,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uFoam: { value: new THREE.Color('#f2fdff') },
        uShade: { value: new THREE.Color('#9fb6ea') },
      }]),
    });
    mat.uniforms.uSunDir = envUniforms.uSunDir;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'fx-crowns';
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    mesh.userData.noHit = true;
    mesh.raycast = () => {};
    mesh.visible = false;
    parent.add(mesh);
    this.mesh = mesh;
    this.geo = geo;
    this.list = [];
  }

  /** Returns false when a crown just started at (almost) the same spot: callers then only add spray. */
  spawn(p, { radius = 0.8, height = 1.0, life = 0.9, color = '#bdefff', opacity = 1, seed = Math.random() } = {}) {
    for (const c of this.list) {
      if (c.t < 0.3 && Math.hypot(c.x - p.x, c.z - p.z) < Math.max(c.r, radius) * 1.1 && Math.abs(c.y - p.y) < 0.5) {
        c.r = Math.max(c.r, radius); // a follow-up splash just feeds the crown that is already rising
        return false;
      }
    }
    if (this.list.length >= this.max) this.list.shift();
    const col = new THREE.Color(color);
    this.list.push({ x: p.x, y: p.y, z: p.z, r: radius, h: height, life, t: 0, seed, a: opacity, col });
    return true;
  }

  update(dt) {
    const l = this.list;
    for (let i = l.length - 1; i >= 0; i--) {
      l[i].t += dt;
      if (l[i].t >= l[i].life) l.splice(i, 1);
    }
    const n = l.length;
    this.mesh.visible = n > 0;
    this.geo.instanceCount = n;
    if (!n) return;
    const P = this.iPos.array, R = this.iPrm.array, C = this.iCol.array;
    for (let i = 0; i < n; i++) {
      const c = l[i];
      P[i * 4] = c.x; P[i * 4 + 1] = c.y; P[i * 4 + 2] = c.z; P[i * 4 + 3] = c.r;
      R[i * 4] = c.t / c.life; R[i * 4 + 1] = c.h; R[i * 4 + 2] = c.seed; R[i * 4 + 3] = c.a;
      C[i * 3] = c.col.r; C[i * 3 + 1] = c.col.g; C[i * 3 + 2] = c.col.b;
    }
    for (const a of [this.iPos, this.iPrm, this.iCol]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * a.itemSize);
      a.needsUpdate = true;
    }
  }

  clear() {
    this.list.length = 0;
    this.geo.instanceCount = 0;
    this.mesh.visible = false;
  }
}
