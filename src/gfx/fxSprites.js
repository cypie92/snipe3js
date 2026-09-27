// Procedural toy FX sprites: ONE instanced draw call for every soft effect in the game.
//   PUFF    cel-shaded cotton puff: lumpy crisp outline, sun-side rim, see-through core, dissolves as it dies
//   STAR    chunky 5-point cartoon star (HDR gold core + warm outline, blooms)
//   RING    thin shock ring (impacts, pops)
//   FLASH   4-point impact sparkle (HDR, ~0.1 s)
//   DROP    water droplet: teardrop stretched along its velocity, highlight + darker rim
//   STREAK  glowing spark stretched along its velocity
//   FOAM    foam splat lying flat on a water surface, breaks up as it fades
//   WRING   double ripple ring lying flat on a water surface
// Particles are simulated on the CPU (a few hundred at most), sorted back-to-front each frame and
// uploaded as per-instance attributes. Sprites never smear the lens (they fade out close to the
// camera), can keep a minimum on-screen size (hits still read at 100 m) and a maximum one (no blobs
// filling the scope). Colours are linear (THREE.Color handles sRGB hex input).
import * as THREE from 'three';
import { envUniforms } from './Environment.js';

export const KIND = { PUFF: 0, STAR: 1, RING: 2, FLASH: 3, DROP: 4, STREAK: 5, FOAM: 6, WRING: 7 };

const vert = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  attribute vec4 iPos;   // xyz centre, w radius (m)
  attribute vec4 iCol;   // linear rgb (HDR allowed), a opacity
  attribute vec4 iDir;   // xyz stretch axis (world), w stretch (length / width, 1 = round)
  attribute vec4 iPrm;   // x kind, y rotation (rad), z life 0..1, w seed 0..1
  attribute vec4 iExt;   // x min radius (px), y near-lens fade distance (m), z max radius (px), w -
  uniform float uViewH;  // drawing-buffer height (px)
  uniform vec3 uSunDir;  // world, toward the sun
  varying vec2 vUv;
  varying vec4 vCol;
  varying vec4 vPrm;
  varying vec3 vSun;
  void main() {
    float kind = floor(iPrm.x);
    vUv = position.xy;
    vCol = iCol;
    vPrm = iPrm;
    vSun = normalize(mat3(viewMatrix) * uSunDir);
    float size = iPos.w;
    vec4 mvPosition;
    if (kind > 5.5) {
      // lies flat on a horizontal surface
      float c = cos(iPrm.y), s = sin(iPrm.y);
      vec2 r = vec2(c * position.x - s * position.y, s * position.x + c * position.y) * size;
      mvPosition = viewMatrix * vec4(iPos.xyz + vec3(r.x, 0.0, r.y), 1.0);
    } else {
      mvPosition = viewMatrix * vec4(iPos.xyz, 1.0);
      float depth = max(-mvPosition.z, 1e-3);
      float px = size * projectionMatrix[1][1] * 0.5 * uViewH / depth;
      float sc = 1.0;
      if (iExt.x > 0.0) sc = max(sc, iExt.x / max(px, 1e-4));
      if (iExt.z > 0.0) sc = min(sc, iExt.z / max(px, 1e-4));
      float sz = size * sc;
      vec2 off;
      if (iDir.w > 1.001) {
        // stretched along the projected axis; foreshortened when the axis points at the camera
        vec3 ax = mat3(viewMatrix) * iDir.xyz;
        float l2 = length(ax.xy);
        vec2 a2 = l2 > 1e-5 ? ax.xy / l2 : vec2(0.0, 1.0);
        float st = mix(1.0, iDir.w, clamp(l2 / max(length(ax), 1e-5), 0.0, 1.0));
        off = (a2 * position.y * st + vec2(-a2.y, a2.x) * position.x) * sz;
      } else {
        float c = cos(iPrm.y), s = sin(iPrm.y);
        off = vec2(c * position.x - s * position.y, s * position.x + c * position.y) * sz;
      }
      mvPosition.xy += off;
      // never smear the lens: anything this close to the camera fades out
      vCol.a *= smoothstep(iExt.y * 0.4, iExt.y, depth);
    }
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const frag = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform vec3 uShade;   // shadow-side multiplier for puffs (cool lilac, never grey)
  uniform vec3 uRim;     // sunny rim colour
  varying vec2 vUv;
  varying vec4 vCol;
  varying vec4 vPrm;
  varying vec3 vSun;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  // iq's 5-point star distance
  float sdStar5(vec2 p, float r, float rf) {
    const vec2 k1 = vec2(0.809016994375, -0.587785252292);
    const vec2 k2 = vec2(-k1.x, k1.y);
    p.x = abs(p.x);
    p -= 2.0 * max(dot(k1, p), 0.0) * k1;
    p -= 2.0 * max(dot(k2, p), 0.0) * k2;
    p.x = abs(p.x);
    p.y -= r;
    vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
    float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
    return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
  }
  // crisp, anti-aliased step (toy look: hard shapes, no gaussian mush)
  float inside(float d) {
    float w = max(fwidth(d), 1e-4) * 0.8;
    return 1.0 - smoothstep(-w, w, d);
  }

  void main() {
    float kind = floor(vPrm.x);
    float k = vPrm.z;
    float seed = vPrm.w;
    vec2 p = vUv;
    float r = length(p);
    vec3 col = vCol.rgb;
    float a = vCol.a;
    if (kind < 0.5) {
      // PUFF
      float ang = atan(p.y, p.x + 1e-5);
      float edge = 0.8 + 0.075 * sin(ang * 5.0 + seed * 37.0) + 0.045 * sin(ang * 8.0 - seed * 21.0);
      float d = r / edge;
      float n = vnoise(p * 2.4 + seed * 13.1) * 0.62 + vnoise(p * 5.1 - seed * 7.3) * 0.38;
      float body = (1.0 - d) * 1.25 + (n - 0.5) * 0.5 - smoothstep(0.35, 1.0, k) * 1.35;
      float m = inside(-body);
      vec3 nv = vec3(p / edge, sqrt(max(1.0 - d * d, 0.0)));
      float ndl = dot(normalize(nv), vSun);
      float lit = smoothstep(-0.3, -0.02, ndl);                       // wrap-around 2-tone terminator
      col = mix(col * uShade, col, lit);
      // sunny rim; brightest when the sun is behind the puff (silver lining, like the sky's clouds)
      float rim = smoothstep(0.7, 0.97, d) * max(lit, 0.6 * clamp(-vSun.z, 0.0, 1.0));
      col += uRim * rim * (0.22 + 0.4 * clamp(-vSun.z, 0.0, 1.0));
      // dense pop at birth, then the core clears so whatever was hit shows through
      float core = mix(0.95, 0.34, smoothstep(0.06, 0.45, k));
      a *= m * mix(core, 0.92, smoothstep(0.3, 0.93, d));
    } else if (kind < 1.5) {
      // STAR
      float d = sdStar5(vec2(p.x, -p.y), 0.86, 0.46) - 0.08;
      float core = inside(d + 0.17);
      col = mix(vec3(1.0, 0.36, 0.06), col, core);
      a *= inside(d);
    } else if (kind < 2.5) {
      // RING
      a *= inside(abs(r - 0.8) - mix(0.13, 0.04, k));
    } else if (kind < 3.5) {
      // FLASH
      vec2 ap = abs(p);
      float d = min(sqrt(ap.x) + sqrt(ap.y) - 1.0, r - 0.34);
      col = mix(col, max(col, vec3(3.2)), 1.0 - smoothstep(0.0, 0.42, r));
      a *= inside(d);
    } else if (kind < 4.5) {
      // DROP: round head leading along +y, tail tapering behind it
      float hy = 0.38;
      float head = length(vec2(p.x, p.y - hy)) - 0.6;
      float t = clamp((hy - p.y) / (1.0 + hy), 0.0, 1.0);
      float tail = p.y < hy ? abs(p.x) - 0.6 * (1.0 - t) * (1.0 - 0.25 * t) : 1.0;
      float d = min(head, tail);
      col = mix(col, col * vec3(0.5, 0.72, 0.95), (1.0 - inside(d + 0.16)) * 0.85);
      float hl = inside(length((p - vec2(-0.2, hy + 0.16)) * vec2(1.0, 1.35)) - 0.17);
      col = mix(col, vec3(1.7), hl);
      a *= inside(d);
    } else if (kind < 5.5) {
      // STREAK
      float d = length(vec2(p.x, max(abs(p.y) - 0.6, 0.0))) - 0.4;
      col = mix(col, max(col, vec3(3.4, 3.1, 2.4)), 1.0 - smoothstep(0.0, 0.3, abs(p.x)));
      a *= inside(d);
    } else if (kind < 6.5) {
      // FOAM (flat)
      float ang = atan(p.y, p.x + 1e-5);
      float edge = 0.78 + 0.1 * sin(ang * 6.0 + seed * 31.0) + 0.06 * sin(ang * 11.0 - seed * 17.0);
      float d = r / edge;
      float n = vnoise(p * 3.4 + seed * 9.0);
      float body = (1.0 - d) * 1.1 + (n - 0.5) * 0.7 - smoothstep(0.2, 1.0, k) * 1.3;
      a *= inside(-body) * mix(0.72, 0.95, d);
    } else {
      // WRING (flat)
      float w = mix(0.1, 0.035, k);
      float r1 = inside(abs(r - 0.82) - w);
      float r2 = inside(abs(r - 0.55) - w * 0.7);
      a *= max(r1, r2 * 0.6 * (1.0 - k));
    }
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, a);
    #include <fog_fragment>
  }
`;

const backOut = (x) => 1 + 2.4 * Math.pow(x - 1, 3) + 1.4 * Math.pow(x - 1, 2);
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const _c = new THREE.Color();
const _fwd = new THREE.Vector3();

/**
 * spawn(p): { x, y, z, vx, vy, vz, kind, life, size, grow = 0, gravity = 0, drag = 0, color, alpha = 1,
 *   rot, spin, stretch (DROP/STREAK: length per m/s of speed), minPx, maxPx, near (lens-fade distance, m),
 *   floor (dies below this y), pin (pop-in fraction of life) }
 */
export class SpritePool {
  constructor(parent, { max = 1400 } = {}) {
    this.max = max;
    const quad = new THREE.PlaneGeometry(2, 2);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    const mk = (name) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
      a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, a);
      return a;
    };
    this.a = { pos: mk('iPos'), col: mk('iCol'), dir: mk('iDir'), prm: mk('iPrm'), ext: mk('iExt') };
    geo.instanceCount = 0;
    this.material = new THREE.ShaderMaterial({
      name: 'fx-sprite',
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      forceSinglePass: true,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uViewH: { value: 900 },
        uShade: { value: new THREE.Color('#c3c5ee') },
        uRim: { value: new THREE.Color('#fff2d8') },
      }]),
    });
    this.material.uniforms.uSunDir = envUniforms.uSunDir; // live, shared with Environment
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.name = 'fx-sprites';
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    mesh.userData.noHit = true;
    mesh.raycast = () => {};
    mesh.visible = false;
    parent.add(mesh);
    this.mesh = mesh;
    this.geo = geo;
    this.n = 0;
    const f = (k) => new Float32Array(max * k);
    this.pos = f(3); this.vel = f(3); this.col = f(3);
    this.life = f(1); this.maxLife = f(1); this.size = f(1); this.grow = f(1); this.grav = f(1); this.drag = f(1);
    this.alpha = f(1); this.kind = new Uint8Array(max); this.rot = f(1); this.spin = f(1); this.seed = f(1);
    this.stretch = f(1); this.minPx = f(1); this.maxPx = f(1); this.near = f(1); this.floor = f(1); this.pin = f(1);
    this.depth = f(1);
    this.order = new Uint16Array(max);
    this.scalars = [this.life, this.maxLife, this.size, this.grow, this.grav, this.drag, this.alpha, this.kind,
      this.rot, this.spin, this.seed, this.stretch, this.minPx, this.maxPx, this.near, this.floor, this.pin];
    this.attrs = Object.values(this.a);
  }

  spawn(p) {
    if (this.n >= this.max) return -1;
    const i = this.n++;
    const i3 = i * 3;
    this.pos[i3] = p.x; this.pos[i3 + 1] = p.y; this.pos[i3 + 2] = p.z;
    this.vel[i3] = p.vx || 0; this.vel[i3 + 1] = p.vy || 0; this.vel[i3 + 2] = p.vz || 0;
    _c.set(p.color ?? '#ffffff');
    if (p.hdr) _c.multiplyScalar(p.hdr);
    this.col[i3] = _c.r; this.col[i3 + 1] = _c.g; this.col[i3 + 2] = _c.b;
    this.kind[i] = p.kind;
    this.life[i] = 0;
    this.maxLife[i] = p.life;
    this.size[i] = p.size;
    this.grow[i] = p.grow ?? 0;
    this.grav[i] = p.gravity ?? 0;
    this.drag[i] = p.drag ?? 0;
    this.alpha[i] = p.alpha ?? 1;
    this.rot[i] = p.rot ?? Math.random() * 6.283;
    this.spin[i] = p.spin ?? 0;
    this.seed[i] = Math.random();
    this.stretch[i] = p.stretch ?? 0;
    this.minPx[i] = p.minPx ?? 0;
    this.maxPx[i] = p.maxPx ?? 0;
    this.near[i] = p.near ?? 1.4;
    this.floor[i] = p.floor ?? -1e9;
    this.pin[i] = p.pin ?? 0.12;
    return i;
  }

  kill(i) {
    const last = --this.n;
    if (i === last) return;
    const c3 = (arr) => { arr[i * 3] = arr[last * 3]; arr[i * 3 + 1] = arr[last * 3 + 1]; arr[i * 3 + 2] = arr[last * 3 + 2]; };
    c3(this.pos); c3(this.vel); c3(this.col);
    for (const arr of this.scalars) arr[i] = arr[last];
  }

  update(dt, camera) {
    for (let i = this.n - 1; i >= 0; i--) {
      this.life[i] += dt;
      if (this.life[i] >= this.maxLife[i]) this.kill(i);
    }
    for (let i = this.n - 1; i >= 0; i--) {
      const i3 = i * 3;
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= d; this.vel[i3 + 2] *= d;
      this.vel[i3 + 1] = this.vel[i3 + 1] * d - this.grav[i] * dt;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this.rot[i] += this.spin[i] * dt;
      if (this.pos[i3 + 1] < this.floor[i]) this.kill(i);
    }
    const n = this.n;
    this.mesh.visible = n > 0;
    this.geo.instanceCount = n;
    if (!n) return;
    // back-to-front order so overlapping translucent sprites never flicker
    const order = this.order;
    if (camera) {
      _fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
      const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
      for (let i = 0; i < n; i++) {
        const i3 = i * 3;
        this.depth[i] = (this.pos[i3] - cx) * _fwd.x + (this.pos[i3 + 1] - cy) * _fwd.y + (this.pos[i3 + 2] - cz) * _fwd.z;
        order[i] = i;
      }
      const depth = this.depth;
      const view = order.subarray(0, n);
      view.sort((a, b) => depth[b] - depth[a]);
    } else for (let i = 0; i < n; i++) order[i] = i;

    const P = this.a.pos.array, C = this.a.col.array, D = this.a.dir.array, R = this.a.prm.array, X = this.a.ext.array;
    for (let j = 0; j < n; j++) {
      const i = order[j];
      const i3 = i * 3, o = j * 4;
      const k = this.life[i] / this.maxLife[i];
      const kind = this.kind[i];
      let s = this.size[i], al = this.alpha[i];
      const pin = this.pin[i];
      if (kind === KIND.PUFF || kind === KIND.FOAM) {
        s *= (k < pin ? 0.55 + 0.45 * backOut(k / pin) : 1) * (1 + this.grow[i] * (1 - (1 - k) * (1 - k)));
        al *= 1 - smooth(0.7, 1, k);
      } else if (kind === KIND.STAR || kind === KIND.FLASH) {
        s *= (k < pin ? backOut(k / pin) : 1) * (1 - smooth(0.6, 1, k)) * (1 + this.grow[i] * k);
      } else if (kind === KIND.RING || kind === KIND.WRING) {
        s *= 0.25 + 0.75 * (1 - (1 - k) * (1 - k) * (1 - k));
        s *= 1 + this.grow[i] * k;
        al *= Math.pow(1 - k, 1.4);
      } else if (kind === KIND.DROP || kind === KIND.STREAK) {
        s *= (k < pin ? k / pin : 1) * (1 - smooth(0.75, 1, k));
      }
      P[o] = this.pos[i3]; P[o + 1] = this.pos[i3 + 1]; P[o + 2] = this.pos[i3 + 2]; P[o + 3] = Math.max(1e-4, s);
      C[o] = this.col[i3]; C[o + 1] = this.col[i3 + 1]; C[o + 2] = this.col[i3 + 2]; C[o + 3] = al;
      const vx = this.vel[i3], vy = this.vel[i3 + 1], vz = this.vel[i3 + 2];
      const sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
      const st = this.stretch[i] > 0 && sp > 1e-3 ? 1 + sp * this.stretch[i] : 1;
      if (st > 1) { D[o] = vx / sp; D[o + 1] = vy / sp; D[o + 2] = vz / sp; } else { D[o] = 0; D[o + 1] = 1; D[o + 2] = 0; }
      D[o + 3] = st;
      R[o] = kind + 0.5; R[o + 1] = this.rot[i]; R[o + 2] = k; R[o + 3] = this.seed[i];
      X[o] = this.minPx[i]; X[o + 1] = this.near[i]; X[o + 2] = this.maxPx[i]; X[o + 3] = 0;
    }
    for (const a of this.attrs) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * 4);
      a.needsUpdate = true;
    }
  }

  setViewHeight(px) {
    this.material.uniforms.uViewH.value = px;
  }

  clear() {
    this.n = 0;
    this.geo.instanceCount = 0;
    this.mesh.visible = false;
  }
}
