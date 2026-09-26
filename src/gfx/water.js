// Stylised toy water for ponds, fountains, streams and harbours + splash rings.
//
// USAGE (level designer)
//   import { createWater, createSplashRings } from '../../gfx/water.js';
//
//   // A duck pond: 16 x 10 m ellipse, centred on its origin, surface at local y = 0.
//   const pond = createWater({ width: 16, depth: 10, shape: 'ellipse' });
//   pond.position.set(-48, 0.05, 30);        // sit it a few cm above the ground it replaces
//   ctx.root.add(pond);
//   ctx.surface(pond, 'water');              // bullets make splashes + rings (see Particles 'water')
//
//   // Any outline: points [x, z] in the mesh's local XZ plane (or a THREE.Shape).
//   const harbour = createWater({ shape: [[-80, 0], [80, 0], [80, -60], [-80, -60]], waves: 0.25, foamWidth: 1.2 });
//
//   // Rings on the surface (drips, fish, ducks): spawn anywhere, they expand + fade on the GPU.
//   const rings = createSplashRings(ctx.root);
//   rings.spawn(new THREE.Vector3(x, y, z), { size: 0.6 });
//
// OPTIONS  width, depth (m, for 'rect' | 'ellipse' | 'circle'), shape ('rect' | 'ellipse' | 'circle' |
//   [[x, z], ...] | THREE.Shape), shallow / deep / foam (colours, default palette water), foamWidth (m of
//   edge foam, default 0.5), depthScale (m from the edge to reach the deep colour, default ~30% of the
//   short side), waves (swell height in m, 0 = flat; use for the harbour), rippleScale (1 = default
//   ripple size), flow ([x, z] m/s drift of ripples, e.g. a stream), sparkle (0..2, default 1),
//   segments (grid resolution when waves > 0).
// No per-frame call is needed: time, sun and sky colours come from Environment (envUniforms).
// The mesh is opaque (no sorting issues, cheap), receives shadows and fog, and never casts shadows.
import * as THREE from 'three';
import { P } from './palette.js';
import { envUniforms } from './Environment.js';

const waterVert = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  #include <shadowmap_pars_vertex>
  uniform float uEnvTime;
  uniform float uWaves;
  varying vec3 vWorld;
  varying vec2 vLocal;
  float swell(vec2 p, float t) {
    return sin(p.x * 0.31 + t * 1.1) * 0.5 + sin(p.y * 0.23 - t * 0.9 + p.x * 0.07) * 0.35 + sin((p.x + p.y) * 0.53 + t * 1.7) * 0.15;
  }
  void main() {
    vLocal = position.xz;
    #include <begin_vertex>
    transformed.y += uWaves * swell(position.xz, uEnvTime);
    #include <beginnormal_vertex>
    #include <defaultnormal_vertex>
    #include <project_vertex>
    #include <worldpos_vertex>
    vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
    #include <shadowmap_vertex>
    #include <fog_vertex>
  }
`;

const waterFrag = /* glsl */ `
  #include <common>
  #include <packing>
  #include <fog_pars_fragment>
  #include <lights_pars_begin>
  #include <shadowmap_pars_fragment>
  #include <shadowmask_pars_fragment>
  uniform float uEnvTime;
  uniform vec3 uSunDir, uSunColor, uSkyColor, uHorizonColor;
  uniform vec3 uShallow, uDeep, uFoam, uShadowTint;
  uniform vec4 uShape;          // type (0 rect, 1 ellipse, 2 sdf texture), half width, half depth, -
  uniform sampler2D uSdf;
  uniform vec4 uSdfRect;        // min x, min z, size x, size z (local)
  uniform float uFoamWidth, uDepthScale, uRippleScale, uSparkle, uWaves;
  uniform vec2 uFlow;
  varying vec3 vWorld;
  varying vec2 vLocal;

  // signed distance to the shoreline in metres, positive inside the water
  float shoreDist(vec2 p) {
    if (uShape.x < 0.5) return min(uShape.y - abs(p.x), uShape.z - abs(p.y));
    if (uShape.x < 1.5) {
      vec2 ab = uShape.yz;
      float k0 = length(p / ab);
      float k1 = length(p / (ab * ab));
      return -(k0 - 1.0) * k0 / max(k1, 1e-4);
    }
    return texture2D(uSdf, (p - uSdfRect.xy) / uSdfRect.zw).r;
  }
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  // ripple height gradient: a few crossing wave trains (cheap, toy-like, no textures)
  vec2 rippleGrad(vec2 p, float t) {
    vec2 g = vec2(0.0);
    vec2 d;
    d = vec2(0.8, 0.6);  g += d * cos(dot(p, d) * 2.1 + t * 1.9) * 0.9;
    d = vec2(-0.5, 0.86); g += d * cos(dot(p, d) * 2.9 - t * 2.3) * 0.6;
    d = vec2(0.96, -0.28); g += d * cos(dot(p, d) * 4.3 + t * 2.9) * 0.35;
    d = vec2(-0.2, -0.98); g += d * cos(dot(p, d) * 6.1 - t * 3.7) * 0.2;
    return g;
  }
  void main() {
    float d = shoreDist(vLocal);
    float aa = max(fwidth(d), 1e-4);
    float cover = smoothstep(-aa, aa * 0.5, d);
    if (cover < 0.02) discard;
    float t = uEnvTime;
    vec2 rp = vLocal * uRippleScale - uFlow * t;
    vec2 g = rippleGrad(rp, t) * 0.07;
    if (uWaves > 0.0) {
      vec2 q = vLocal;
      g += uWaves * vec2(cos(q.x * 0.31 + t * 1.1) * 0.155 + cos((q.x + q.y) * 0.53 + t * 1.7) * 0.08 + cos(q.y * 0.23 - t * 0.9 + q.x * 0.07) * 0.0245,
                         cos(q.y * 0.23 - t * 0.9 + q.x * 0.07) * 0.08 + cos((q.x + q.y) * 0.53 + t * 1.7) * 0.08);
    }
    vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
    vec3 v = normalize(cameraPosition - vWorld);
    float shade = getShadowMask();

    // body colour: shallow at the shore, deep in the middle; toy "caustic" wobble lines in the shallows
    float deep = smoothstep(0.0, uDepthScale, d);
    vec3 col = mix(uShallow, uDeep, deep);
    vec2 cp = vLocal * 0.9 * uRippleScale + vec2(sin(t * 0.4), cos(t * 0.33)) * 0.6;
    float caus = abs(sin(cp.x * 2.3 + sin(cp.y * 1.7 + t * 0.8) * 1.4) * sin(cp.y * 2.1 + sin(cp.x * 1.3 - t * 0.7) * 1.2));
    col += uFoam * smoothstep(0.82, 0.98, caus) * (1.0 - deep) * 0.16 * shade;

    // sky reflection (toned down: toy water keeps its colour even at grazing angles)
    float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 4.0);
    vec3 r = reflect(-v, n);
    vec3 sky = mix(uHorizonColor, uSkyColor, smoothstep(0.0, 0.6, r.y));
    col = mix(col, sky, fres * 0.5);

    // sun glint + always-on twinkling sparkles (the sun is usually behind the perch)
    vec3 h = normalize(uSunDir + v);
    float spec = pow(max(dot(n, h), 0.0), 260.0) * 5.0;
    vec2 cell = floor(vLocal * 1.6);
    vec2 f = fract(vLocal * 1.6) - 0.5;
    float rnd = hash12(cell);
    vec2 jit = vec2(hash12(cell + 7.1), hash12(cell + 3.3)) - 0.5;
    float tw = pow(max(sin(t * (2.0 + rnd * 3.0) + rnd * 40.0), 0.0), 12.0);
    float spark = (1.0 - smoothstep(0.02, 0.09, length(f - jit * 0.6))) * tw * step(0.55, rnd);
    col += uSunColor * (spec + spark * 2.6 * uSparkle) * shade;

    // shoreline foam: a broken band plus ripple lines that travel out from the edge
    float wob = sin(vLocal.x * 3.1 + t * 1.3) * sin(vLocal.y * 2.7 - t * 1.1);
    float band = 1.0 - smoothstep(uFoamWidth * 0.3, uFoamWidth, d + wob * uFoamWidth * 0.25);
    float ph = fract(d / max(uFoamWidth, 0.05) * 0.8 - t * 0.35);
    float lines = (1.0 - smoothstep(0.0, 0.12, abs(ph - 0.5) - 0.34)) * (1.0 - smoothstep(uFoamWidth, uFoamWidth * 3.5, d));
    col = mix(col, uFoam, clamp(max(band, lines * 0.45), 0.0, 1.0));

    // received shadow: darker and bluer, never black
    col *= mix(uShadowTint, vec3(1.0), shade);
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
  }
`;

function shapePoints(shape, width, depth) {
  if (Array.isArray(shape)) return shape.map((p) => (Array.isArray(p) ? new THREE.Vector2(p[0], p[1]) : new THREE.Vector2(p.x, p.y ?? p.z)));
  if (shape?.isShape) return shape.getPoints(48);
  return null;
}

/** Signed distance field of a polygon (metres, + inside) baked into a half-float texture. */
function polygonSdf(pts, res = 128, pad = 2) {
  const box = new THREE.Box2().setFromPoints(pts);
  box.expandByScalar(pad);
  const size = box.getSize(new THREE.Vector2());
  const nx = Math.max(8, Math.round(size.x >= size.y ? res : (res * size.x) / size.y));
  const nz = Math.max(8, Math.round(size.y >= size.x ? res : (res * size.y) / size.x));
  const data = new Uint16Array(nx * nz);
  const n = pts.length;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = box.min.x + ((i + 0.5) / nx) * size.x;
      const z = box.min.y + ((j + 0.5) / nz) * size.y;
      let best = Infinity, inside = false;
      for (let k = 0, m = n - 1; k < n; m = k++) {
        const a = pts[m], b = pts[k];
        if ((a.y > z) !== (b.y > z) && x < ((b.x - a.x) * (z - a.y)) / (b.y - a.y) + a.x) inside = !inside;
        const ex = b.x - a.x, ez = b.y - a.y;
        const tt = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.y) * ez) / (ex * ex + ez * ez || 1)));
        const dx = x - (a.x + ex * tt), dz = z - (a.y + ez * tt);
        best = Math.min(best, dx * dx + dz * dz);
      }
      data[j * nx + i] = THREE.DataUtils.toHalfFloat((inside ? 1 : -1) * Math.sqrt(best));
    }
  }
  const tex = new THREE.DataTexture(data, nx, nz, THREE.RedFormat, THREE.HalfFloatType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return { tex, rect: new THREE.Vector4(box.min.x, box.min.y, size.x, size.y), box };
}

let blankSdf = null;

/** Build a water surface mesh. See the header comment for options. */
export function createWater(opts = {}) {
  const {
    width = 10, depth = 10, shape = 'rect', shallow = P.water, deep = P.waterDeep, foam = P.foam,
    foamWidth = 0.5, waves = 0, rippleScale = 1, flow = [0, 0], sparkle = 1, segments,
  } = opts;
  const pts = shapePoints(shape, width, depth);
  let type = 0, hw = width / 2, hd = depth / 2, sdf = null, bx = null;
  if (pts) {
    type = 2;
    sdf = polygonSdf(pts);
    bx = sdf.box;
  } else if (shape === 'ellipse' || shape === 'circle') {
    type = 1;
    if (shape === 'circle') hw = hd = Math.max(width, depth) / 2;
  }
  const w = bx ? bx.max.x - bx.min.x : hw * 2;
  const dd = bx ? bx.max.y - bx.min.y : hd * 2;
  const segX = waves > 0 ? (segments ?? Math.min(160, Math.ceil(w / 1.5))) : 1;
  const segZ = waves > 0 ? (segments ?? Math.min(160, Math.ceil(dd / 1.5))) : 1;
  const geo = new THREE.PlaneGeometry(w, dd, segX, segZ).rotateX(-Math.PI / 2);
  if (bx) geo.translate((bx.min.x + bx.max.x) / 2, 0, (bx.min.y + bx.max.y) / 2);
  geo.deleteAttribute('uv');

  if (!blankSdf) {
    blankSdf = new THREE.DataTexture(new Uint16Array([0]), 1, 1, THREE.RedFormat, THREE.HalfFloatType);
    blankSdf.needsUpdate = true;
  }
  const minSide = type === 2 ? Math.min(w, dd) * 0.5 : Math.min(hw, hd);
  const mat = new THREE.ShaderMaterial({
    name: 'toyWater',
    vertexShader: waterVert,
    fragmentShader: waterFrag,
    lights: true,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.lights, THREE.UniformsLib.fog, {
      uShallow: { value: new THREE.Color(shallow) },
      uDeep: { value: new THREE.Color(deep) },
      uFoam: { value: new THREE.Color(foam) },
      uShadowTint: { value: new THREE.Color('#6b78b8') },
      uShape: { value: new THREE.Vector4(type, hw, hd, 0) },
      uSdf: { value: sdf ? sdf.tex : blankSdf },
      uSdfRect: { value: sdf ? sdf.rect : new THREE.Vector4(0, 0, 1, 1) },
      uFoamWidth: { value: Math.max(0.05, foamWidth) }, // > 0: foam smoothstep edges must differ
      uDepthScale: { value: opts.depthScale ?? Math.max(0.6, minSide * 0.6) },
      uRippleScale: { value: rippleScale },
      uSparkle: { value: sparkle },
      uWaves: { value: waves },
      uFlow: { value: new THREE.Vector2(flow[0], flow[1]) },
    }]),
  });
  // shared, live uniforms (time, sun, sky) - same objects as Environment updates
  Object.assign(mat.uniforms, {
    uEnvTime: envUniforms.uEnvTime, uSunDir: envUniforms.uSunDir, uSunColor: envUniforms.uSunColor,
    uSkyColor: envUniforms.uSkyColor, uHorizonColor: envUniforms.uHorizonColor,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'water';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.userData.surface = 'water';
  mesh.userData.water = { type, halfWidth: hw, halfDepth: hd, sdf };
  mesh.renderOrder = -1; // draw early: cheap discard edges never overdraw props
  return mesh;
}

// ---------------------------------------------------------------- splash rings
const ringVert = /* glsl */ `
  attribute vec4 iPos;     // xyz centre, w birth time
  attribute vec2 iSize;    // max radius, life (s)
  uniform float uEnvTime;
  varying vec2 vP;
  varying float vK;
  varying float vR;
  void main() {
    float k = (uEnvTime - iPos.w) / iSize.y;
    vK = k;
    float R = iSize.x * (0.25 + 0.75 * (1.0 - (1.0 - clamp(k, 0.0, 1.0)) * (1.0 - clamp(k, 0.0, 1.0))));
    vR = R;
    vP = position.xz * R * 1.3;
    vec3 wp = iPos.xyz + vec3(vP.x, 0.0, vP.y);
    if (k < 0.0 || k > 1.0) wp = vec3(0.0, -1e5, 0.0);
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }
`;
const ringFrag = /* glsl */ `
  uniform vec3 uColor;
  varying vec2 vP;
  varying float vK;
  varying float vR;
  void main() {
    if (vK < 0.0 || vK > 1.0) discard;
    float r = length(vP);
    float w = 0.06 + 0.1 * vR * (1.0 - vK);
    float aa = max(fwidth(r) * 1.2, 1e-4); // smoothstep edges must never coincide
    float ring1 = 1.0 - smoothstep(w * 0.5 - aa, w * 0.5 + aa, abs(r - vR));
    float ring2 = 1.0 - smoothstep(w * 0.35 - aa, w * 0.35 + aa, abs(r - vR * 0.62));
    float a = (ring1 + ring2 * 0.6 * (1.0 - vK)) * (1.0 - vK) * (1.0 - vK) * 0.85;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

/**
 * GPU splash rings (expanding double ring that fades). createSplashRings(parent, { max, color })
 * -> { mesh, spawn(position, { size = 0.8, life = 0.9 }) }. Time comes from Environment.
 */
export function createSplashRings(parent, { max = 32, color = '#f4feff' } = {}) {
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  geo.index = quad.index;
  geo.setAttribute('position', quad.attributes.position);
  const iPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 4).fill(-1e4), 4);
  const iSize = new THREE.InstancedBufferAttribute(new Float32Array(max * 2).fill(1), 2);
  iPos.setUsage(THREE.DynamicDrawUsage);
  iSize.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iPos', iPos);
  geo.setAttribute('iSize', iSize);
  geo.instanceCount = max;
  const mat = new THREE.ShaderMaterial({
    name: 'splashRings', vertexShader: ringVert, fragmentShader: ringFrag,
    uniforms: { uEnvTime: envUniforms.uEnvTime, uColor: { value: new THREE.Color(color) } },
    transparent: true, depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'splash-rings';
  mesh.frustumCulled = false;
  mesh.userData.noHit = true;
  mesh.raycast = () => {};
  mesh.renderOrder = 2;
  parent.add(mesh);
  let next = 0;
  return {
    mesh,
    spawn(p, { size = 0.8, life = 0.9 } = {}) {
      const i = next;
      next = (next + 1) % max;
      iPos.setXYZW(i, p.x, p.y + 0.02, p.z, envUniforms.uEnvTime.value);
      iSize.setXY(i, size, life);
      iPos.needsUpdate = true;
      iSize.needsUpdate = true;
    },
    clear() {
      iPos.array.fill(-1e4);
      iPos.needsUpdate = true;
    },
  };
}
