// Bullet tracers: a thin, bright slug racing to the target plus a faint vapour trail that lingers and
// thins out. Camera-facing ribbons with a constant on-screen width (fraction of screen height), so they
// stay crisp and classy at any distance. Pooled: no allocations or shader compiles per shot.
import * as THREE from 'three';

const POOL = 8;
const WIDTH = 0.0044; // ribbon half-width at the head, fraction of screen height (~4 px at 900p)

const vert = /* glsl */ `
  attribute vec2 aRib;          // x: 0 at the muzzle end .. 1 at the head end, y: side (-1..1)
  uniform vec3 uFrom;
  uniform vec3 uTo;
  uniform float uHead;          // 0..1 along from -> to
  uniform float uWidth;         // half width as a fraction of screen height
  uniform float uAspect;
  varying vec2 vRib;
  varying float vLen;
  varying float vSx;            // vSx / vSw = screen-linear position along the ribbon (0 muzzle .. 1 head)
  varying float vSw;
  void main() {
    vec3 B = mix(uFrom, uTo, uHead);
    vec4 ca = projectionMatrix * viewMatrix * vec4(uFrom, 1.0);
    vec4 cb = projectionMatrix * viewMatrix * vec4(B, 1.0);
    vec2 sa = ca.xy / max(ca.w, 1e-3);
    vec2 sb = cb.xy / max(cb.w, 1e-3);
    vec2 dir = (sb - sa) * vec2(uAspect, 1.0);
    float l = length(dir);
    dir = l > 1e-5 ? dir / l : vec2(1.0, 0.0);
    vec2 nrm = vec2(-dir.y, dir.x) / vec2(uAspect, 1.0);
    vec4 cp = mix(ca, cb, aRib.x);
    // comet taper: thin at the muzzle, full width at the head (constant on-screen size)
    cp.xy += nrm * aRib.y * uWidth * 2.0 * mix(0.4, 1.0, aRib.x) * cp.w;
    vRib = aRib;
    vLen = distance(uFrom, B);
    vSx = aRib.x * cp.w;
    vSw = cp.w;
    gl_Position = cp;
  }
`;
const frag = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uTrail;
  uniform vec3 uInk;
  uniform float uSlug;          // min slug length (m)
  uniform float uSlugScreen;    // slug = last fraction of the on-screen length
  uniform float uTrailAlpha;
  uniform float uCoreOn;
  varying vec2 vRib;
  varying float vLen;
  varying float vSx;
  varying float vSw;
  void main() {
    float across = abs(vRib.y);
    float ts = vSx / vSw;
    float slugS = smoothstep(1.0 - uSlugScreen, 1.0 - uSlugScreen * 0.3, ts);
    float slugW = 1.0 - smoothstep(uSlug * 0.3, uSlug, (1.0 - vRib.x) * vLen);
    float slug = max(slugS, slugW) * uCoreOn;
    // HDR gold core (blooms a touch) with a thin ink rim so it reads on bright walls and sky too
    float aCore = (1.0 - smoothstep(0.3, 0.6, across)) * slug;
    float aRim = smoothstep(0.45, 0.68, across) * (1.0 - smoothstep(0.85, 1.0, across)) * slug * 0.5;
    // vapour: soft, strongest just behind the slug, fading toward the muzzle
    float aTrail = (1.0 - smoothstep(0.05, 0.75, across)) * uTrailAlpha * mix(0.3, 1.0, ts);
    float wsum = aCore + aRim + aTrail;
    if (wsum < 0.003) discard;
    vec3 col = (uCore * 3.0 * aCore + uInk * aRim + uTrail * aTrail) / wsum;
    float a = clamp(aCore + (aRim + aTrail) * (1.0 - aCore), 0.0, 1.0);
    gl_FragColor = vec4(col, a);
  }
`;

export class Tracers {
  constructor(scene) {
    this.scene = scene;
    const geo = new THREE.BufferGeometry();
    // 2 x 5 grid: muzzle end, head end x across the ribbon (extra verts keep the profile smooth)
    const rib = [];
    const idx = [];
    const across = [-1, -0.5, 0, 0.5, 1];
    for (const x of [0, 1]) for (const y of across) rib.push(x, y);
    for (let j = 0; j < across.length - 1; j++) idx.push(j, j + 1, j + 5, j + 1, j + 6, j + 5);
    geo.setAttribute('aRib', new THREE.Float32BufferAttribute(rib, 2));
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(rib.length / 2 * 3), 3));
    geo.setIndex(idx);
    this.geo = geo;
    this.pool = [];
    this.active = [];
    for (let i = 0; i < POOL; i++) {
      const mat = new THREE.ShaderMaterial({
        name: 'tracer', vertexShader: vert, fragmentShader: frag,
        transparent: true, depthWrite: false, fog: false,
        side: THREE.DoubleSide, // winding flips with the screen-space direction of the shot
        uniforms: {
          uFrom: { value: new THREE.Vector3() }, uTo: { value: new THREE.Vector3() }, uHead: { value: 0 },
          uWidth: { value: WIDTH }, uAspect: { value: 1.6 }, uSlug: { value: 4 }, uSlugScreen: { value: 0.3 }, uTrailAlpha: { value: 0 },
          uCoreOn: { value: 1 }, uCore: { value: new THREE.Color('#ffe7a3') }, uTrail: { value: new THREE.Color('#f2f6ff') },
          uInk: { value: new THREE.Color('#2b2b3a') },
        },
      });
      const m = new THREE.Mesh(geo, mat);
      m.frustumCulled = false;
      m.userData.noHit = true;
      m.raycast = () => {};
      m.renderOrder = 3;
      // Idle ribbons have zero length and are hidden, except pool[0] which stays visible so the (shared)
      // program is compiled together with the level instead of hitching on the first shot.
      m.visible = i === 0;
      scene.add(m);
      this.pool.push(m);
    }
  }

  spawn(from, to, travel = 0.15) {
    const m = this.pool.find((p) => !p.userData.busy) || this.active.shift()?.mesh;
    if (!m) return;
    const u = m.material.uniforms;
    u.uFrom.value.copy(from);
    u.uTo.value.copy(to);
    u.uHead.value = 0;
    u.uCoreOn.value = 1;
    u.uTrailAlpha.value = 0.5;
    u.uWidth.value = WIDTH;
    const dist = from.distanceTo(to);
    u.uSlug.value = Math.min(12, Math.max(3, dist * 0.12));
    m.userData.busy = true;
    m.visible = true;
    this.active = this.active.filter((a) => a.mesh !== m);
    this.active.push({ mesh: m, t: 0, travel: Math.max(0.03, travel), fade: 0 });
  }

  update(dt, camera) {
    const aspect = camera?.aspect || 1.6;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i];
      const u = a.mesh.material.uniforms;
      u.uAspect.value = aspect;
      a.t += dt;
      const k = Math.min(1, a.t / a.travel);
      u.uHead.value = k;
      if (k >= 1) {
        a.fade += dt;
        u.uCoreOn.value = Math.max(0, 1 - a.fade / 0.06);
        u.uTrailAlpha.value = 0.5 * Math.max(0, 1 - a.fade / 0.5);
        u.uWidth.value = WIDTH * (1 + a.fade * 2.2);
        if (a.fade > 0.5) this.release(i);
      }
    }
  }

  release(i) {
    const a = this.active[i];
    const u = a.mesh.material.uniforms;
    u.uHead.value = 0;
    u.uTrailAlpha.value = 0;
    u.uCoreOn.value = 0;
    u.uWidth.value = WIDTH;
    a.mesh.userData.busy = false;
    a.mesh.visible = a.mesh === this.pool[0];
    this.active.splice(i, 1);
  }

  clear() {
    for (let i = this.active.length - 1; i >= 0; i--) this.release(i);
  }
}
