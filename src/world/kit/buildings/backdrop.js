// The world beyond the playable diorama: a ring of rolling faceted hills with patchwork fields,
// hedgerows (instanced bushes along field borders), tree clumps and woods, distant hamlets,
// a windmill with turning sails, a far church spire and a glint of sea through a valley.
// Cheap by design: ~8 draw calls, ~100k triangles. Nothing casts shadows.
import { THREE, materials, Kit, prism, ngonFrustum, rngOf, shade, mix, wobbleColor, TAU, clamp, lerp } from './common.js';
import { box, cyl, ico, cone } from '../../geo.js';
import { hash3 } from '../../../core/rng.js';
import { P } from '../../../gfx/palette.js';

const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function vnoise(x, z, s) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const h = (a, b) => hash3(a * 1.31 + s * 17.13, b * 0.97 - s * 3.7, s * 0.71);
  return lerp(lerp(h(xi, zi), h(xi + 1, zi), u), lerp(h(xi, zi + 1), h(xi + 1, zi + 1), u), v);
}

const FIELD_TYPES = [
  ['#7cc653', 5], ['#8fd35e', 3.2], ['#68b548', 3], ['#a6da6c', 2.2],
  ['#f4d84e', 1.2], ['#ecc766', 1.7], ['#cf9f66', 1.1], ['#b9d26a', 1.3], ['#b48ce8', 0.3], ['wood', 1.4],
];

const seaVert = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const seaFrag = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform float uTime, uCoast;
  uniform vec3 uNear, uFar;
  varying vec3 vWorld;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    float d = length(vWorld.xz);
    vec3 col = mix(uNear, uFar, smoothstep(350.0, 900.0, d));
    col = mix(vec3(0.25, 0.85, 0.95), col, smoothstep(uCoast - 10.0, uCoast + 60.0, d));
    vec2 g = floor(vWorld.xz * vec2(0.22, 0.6) + vec2(uTime * 0.4, 0.0));
    float s = step(0.955, h21(g)) * (0.5 + 0.5 * sin(uTime * 3.0 + h21(g + 7.0) * 40.0));
    float band = 0.5 + 0.5 * sin(vWorld.x * 0.05 + vWorld.z * 0.08 + uTime * 0.6);
    col = mix(col, col * 1.18, band * 0.5);
    col += vec3(1.0, 0.97, 0.9) * s * 2.2;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

const oceanFrag = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform float uTime;
  uniform vec3 uNear, uFar;
  varying vec3 vWorld;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    float d = length(vWorld.xz);
    vec3 col = mix(uNear, uFar, smoothstep(60.0, 700.0, d));
    // soft swell bands
    float sw = sin(vWorld.x * 0.045 + vWorld.z * 0.09 + uTime * 0.7) * sin(vWorld.x * 0.11 - vWorld.z * 0.03 - uTime * 0.5);
    col *= 1.0 + sw * 0.06;
    vec3 V = normalize(cameraPosition - vWorld);
    float graze = 1.0 - clamp(V.y, 0.0, 1.0);
    // glitter: denser toward the horizon
    float dist = length(cameraPosition - vWorld);
    vec2 g = floor(vWorld.xz * vec2(1.4, 2.6) * clamp(40.0 / dist, 0.18, 1.0) + vec2(uTime * 0.3, 0.0));
    float tw = step(0.992 - 0.05 * graze * graze, h21(g)) * (0.5 + 0.5 * sin(uTime * 4.0 + h21(g + 7.0) * 40.0));
    col += vec3(1.0, 0.96, 0.86) * tw * (0.25 + 1.1 * graze * graze);
    col = mix(col, col + vec3(0.18, 0.22, 0.24), pow(graze, 6.0));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

/**
 * backdrop({ radius = 800, inner = 105, seed, seaAngle, windmill, spire, hedgeRange }).
 * Angles are measured from -Z (the perch's forward view) toward +X, in radians.
 * userData.heightAt(x, z) samples the terrain; userData.update(dt, t) turns the sails.
 */
export function backdrop(opts = {}) {
  const radius = opts.radius ?? 800;
  const inner = opts.inner ?? 105;
  const seed = opts.seed ?? 7;
  const rng = rngOf(seed, 'backdrop');
  const ns = (typeof seed === 'number' ? seed : 7) % 97;
  const seaAngle = opts.seaAngle ?? 0.62;
  const seaHalf = opts.seaHalf ?? 0.26;
  const dirOf = (a) => [Math.sin(a), -Math.cos(a)];
  const angOf = (x, z) => Math.atan2(x, -z);
  const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  const place = (a, r) => { const [dx, dz] = dirOf(a); return [dx * r, dz * r]; };
  const windmillAt = place(opts.windmillAngle ?? -0.62, opts.windmillDist ?? Math.min(radius * 0.4, 310));
  const spireAt = place(opts.spireAngle ?? 0.22, opts.spireDist ?? Math.min(radius * 0.62, 500));
  const bumps = [[...windmillAt, 20, 70], [...spireAt, 12, 90]];

  // bay mode (harbour): sea north of a coastline that sweeps out into two headlands
  const bay = opts.bay ?? null;
  const seaLevel = bay ? (bay.seaLevel ?? -1.6) : 0;
  const coastZ = (x) => -(bay.coastDist ?? 95) - (bay.headlandDepth ?? 430) * smooth(bay.mouth ?? 150, (bay.mouth ?? 150) + 300, Math.abs(x))
    + (vnoise(x * 0.011, 3.3, ns + 7) - 0.5) * 46;
  const seaMask = (x, z) => {
    if (bay) return smooth(9, -9, z - coastZ(x));
    if (opts.sea === false) return 0;
    const a = angOf(x, z), r = Math.hypot(x, z);
    return smooth(seaHalf + 0.16, seaHalf, angDiff(a, seaAngle)) * smooth(inner + 40, inner + 120, r);
  };
  function heightAt(x, z) {
    const r = Math.hypot(x, z);
    const ramp = smooth(inner + 4, inner + 34, r);
    let h = vnoise(x * 0.0042, z * 0.0042, ns) * 34;
    h += vnoise(x * 0.012 + 5, z * 0.012, ns + 1) * 11;
    h += vnoise(x * 0.035, z * 0.035 + 9, ns + 2) * 2.2;
    h *= 0.3 + 0.7 * smooth(inner, 520, r);
    h += smooth(radius * 0.55, radius, r) * 38 * (0.6 + 0.8 * vnoise(x * 0.006, z * 0.006, ns + 3));
    for (const [bx, bz, amp, w] of bumps) h += amp * Math.exp(-((x - bx) ** 2 + (z - bz) ** 2) / (w * w));
    const m = seaMask(x, z);
    if (bay) {
      // cliffs: land stays high right up to the coastline, then drops to the seabed
      const land = (h + 2 + (bay.cliff ?? 16) * smooth(0, 70, z - coastZ(x))) * ramp - (1 - ramp) * 0.6;
      return land * (1 - m) + (seaLevel - 9) * m;
    }
    const coast = opts.coast ?? inner + 145;
    const coastH = lerp(0.35, -7, smooth(coast - 14, coast + 25, r));
    h = (h + 1.0) * (1 - m) + coastH * m;
    return h * ramp - (1 - ramp) * 0.6;
  }
  const steep = (x, z) => Math.abs(heightAt(x + 2.5, z) - heightAt(x - 2.5, z)) + Math.abs(heightAt(x, z + 2.5) - heightAt(x, z - 2.5)) > 3.4;

  // ---------------- patchwork fields (jittered-grid Voronoi)
  const C = opts.fieldSize ?? 62;
  const seedAt = (i, j) => [
    (i + 0.5 + (hash3(i * 1.7, j * 3.1, ns) - 0.5) * 0.8) * C,
    (j + 0.5 + (hash3(j * 2.3, i * 0.7, ns + 5) - 0.5) * 0.8) * C,
  ];
  function nearest(x, z) {
    const ci = Math.floor(x / C), cj = Math.floor(z / C);
    let best = 1e18, id = 0, second = 1e18, b1 = null, b2 = null;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const i = ci + di, j = cj + dj;
      const sp = seedAt(i, j);
      const d = (sp[0] - x) ** 2 + (sp[1] - z) ** 2;
      if (d < best) { second = best; b2 = b1; best = d; b1 = sp; id = i * 73856093 ^ j * 19349663; } else if (d < second) { second = d; b2 = sp; }
    }
    const along = b1 && b2 ? Math.atan2(-(b2[1] - b1[1]), b2[0] - b1[0]) : 0;
    return { id, edge: Math.sqrt(second) - Math.sqrt(best), along };
  }
  const totalW = FIELD_TYPES.reduce((a, [, w]) => a + w, 0);
  const fieldType = (id) => {
    let u = hash3(id * 0.001, 7.7, ns) * totalW;
    for (const [c, w] of FIELD_TYPES) { if ((u -= w) <= 0) return c; }
    return FIELD_TYPES[0][0];
  };
  const woodGround = '#4f9a3c';

  // ---------------- terrain mesh (polar grid, jittered, flat shaded, per-triangle colours)
  const radii = [];
  for (let r = inner; r < radius + 1;) { radii.push(Math.min(r, radius)); r += 5.5 + (r - inner) * 0.062; }
  const seg = opts.segments ?? 220;
  const grid = radii.map((r, ri) => {
    const row = [];
    for (let s = 0; s < seg; s++) {
      const jr = ri === 0 ? 0 : (hash3(ri, s, 1.3) - 0.5) * 0.5 * (radii[Math.min(ri + 1, radii.length - 1)] - radii[ri - 1]) * 0.5;
      const ja = (hash3(s, ri, 2.9) - 0.5) * 0.45 * (TAU / seg) * (ri === 0 ? 0 : 1);
      const a = (s / seg) * TAU + ja + (ri % 2) * (TAU / seg) * 0.5;
      const rr = r + (ri === radii.length - 1 ? 0 : jr);
      const x = Math.sin(a) * rr, z = -Math.cos(a) * rr;
      row.push([x, heightAt(x, z), z]);
    }
    return row;
  });
  const pos = [];
  const col = [];
  const c = new THREE.Color();
  const pushTri = (A, B, Cc) => {
    const cx = (A[0] + B[0] + Cc[0]) / 3, cz = (A[2] + B[2] + Cc[2]) / 3, cy = (A[1] + B[1] + Cc[1]) / 3;
    const r = Math.hypot(cx, cz);
    const f = nearest(cx, cz);
    let hex = fieldType(f.id);
    if (hex === 'wood') hex = woodGround;
    const sm = seaMask(cx, cz);
    const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [Cc[0] - A[0], Cc[1] - A[1], Cc[2] - A[2]];
    const ny = e1[2] * e2[0] - e1[0] * e2[2];
    if (bay) {
      const nx = e1[1] * e2[2] - e1[2] * e2[1], nz = e1[0] * e2[1] - e1[1] * e2[0];
      const up = Math.abs(ny) / Math.max(1e-6, Math.hypot(nx, ny, nz));
      const hr = hash3(cx * 0.21, cz * 0.19, 2.2);
      if (cy < seaLevel - 2.5) hex = '#6f9a94';
      else if (up < 0.62) hex = hr < 0.5 ? '#c2ab86' : hr < 0.8 ? '#ab9a80' : '#d1bf98';
      else if (cy < seaLevel + 1.6) hex = '#f0dca6';
    } else if (sm > 0.3) hex = mix(hex, cy < 0.8 ? '#e8d29a' : '#8fd35e', clamp((sm - 0.3) * 2, 0, 1));
    hex = mix(hex, P.grass, (1 - smooth(inner + 8, inner + 45, r)) * (bay && cy < seaLevel + 1.6 ? 0 : 1));
    c.set(hex);
    const jit = (hash3(cx * 0.37, cz * 0.53, 4.1) - 0.5) * 0.06 + clamp(cy / 90, 0, 0.25) * 0.15;
    c.offsetHSL(0, 0, jit);
    // winding: ensure faces point up
    const tri = ny >= 0 ? [A, B, Cc] : [A, Cc, B];
    for (const v of tri) { pos.push(v[0], v[1], v[2]); col.push(c.r, c.g, c.b); }
  };
  for (let ri = 0; ri < radii.length - 1; ri++) {
    for (let s = 0; s < seg; s++) {
      const a = grid[ri][s], b = grid[ri][(s + 1) % seg], d = grid[ri + 1][s], e = grid[ri + 1][(s + 1) % seg];
      pushTri(a, b, e);
      pushTri(a, e, d);
    }
  }
  // skirt down from the outer rim so the horizon never shows a gap
  const outer = grid[grid.length - 1];
  for (let s = 0; s < seg; s++) {
    const a = outer[s], b = outer[(s + 1) % seg];
    const a2 = [a[0] * 1.5, a[1] + 25, a[2] * 1.5], b2 = [b[0] * 1.5, b[1] + 25, b[2] * 1.5];
    pushTri(a, b, b2);
    pushTri(a, b2, a2);
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  tg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  tg.computeVertexNormals();
  tg.computeBoundingSphere();
  const terrain = new THREE.Mesh(tg, materials.facet);
  terrain.name = 'backdropTerrain';
  terrain.receiveShadow = false;

  const group = new THREE.Group();
  group.name = opts.name ?? 'backdrop';
  group.add(terrain);

  // ---------------- hedgerows + trees (instanced)
  const hedgeMax = opts.hedgeRange ?? Math.min(radius * 0.62, 500);
  const bushT = [], bushC = [];
  const roundT = [], roundC = [];
  const pineT = [], pineC = [];
  const step = 5.2;
  const inPlay = (x, z) => Math.hypot(x, z) < inner + 18;
  for (let x = -hedgeMax; x <= hedgeMax; x += step) {
    for (let z = -hedgeMax; z <= hedgeMax; z += step) {
      const r = Math.hypot(x, z);
      if (r > hedgeMax || inPlay(x, z) || seaMask(x, z) > 0.4 || (bay && steep(x, z))) continue;
      const f = nearest(x, z);
      if (f.edge > step * 0.62) continue;
      if (hash3(x * 0.1, z * 0.1, 9.9) > 0.9) continue;
      const jx = x + (hash3(x, z, 1.1) - 0.5) * 1.5, jz = z + (hash3(z, x, 2.2) - 0.5) * 1.5;
      const y = heightAt(jx, jz);
      if (hash3(x * 0.3, z * 0.7, 5.5) < 0.05) {
        const s = rng.range(0.85, 1.35);
        roundT.push({ x: jx, y: y - 0.3, z: jz, s, ry: rng.range(0, TAU) });
        roundC.push(wobbleColor(rng, '#ffffff', 0.08, 0.05, 0.02));
      } else {
        const s = rng.range(2.3, 3.0);
        bushT.push({ x: jx, y: y + s * 0.18, z: jz, sx: s * 0.95, sy: s * 0.75, sz: s * 1.75, ry: f.along + rng.range(-0.15, 0.15) });
        bushC.push(wobbleColor(rng, '#ffffff', 0.06, 0.04, 0.015));
      }
    }
  }
  // woods: fill 'wood' fields with trees
  for (let x = -radius * 0.8; x <= radius * 0.8; x += 11) {
    for (let z = -radius * 0.8; z <= radius * 0.8; z += 11) {
      const jx = x + (hash3(x, z, 3.3) - 0.5) * 9, jz = z + (hash3(z, x, 4.4) - 0.5) * 9;
      const r = Math.hypot(jx, jz);
      if (r < inner + 30 || r > radius * 0.82 || seaMask(jx, jz) > 0.2 || (bay && steep(jx, jz))) continue;
      const f = nearest(jx, jz);
      if (fieldType(f.id) !== 'wood' || f.edge < 3) continue;
      const y = heightAt(jx, jz);
      const s = rng.range(0.9, 1.5) * (1 + r / 900);
      if (hash3(jx, jz, 6.6) < 0.35) {
        pineT.push({ x: jx, y: y - 0.3, z: jz, s, ry: rng.range(0, TAU) });
        pineC.push(wobbleColor(rng, '#ffffff', 0.07, 0.05, 0.02));
      } else {
        roundT.push({ x: jx, y: y - 0.3, z: jz, s, ry: rng.range(0, TAU) });
        roundC.push(wobbleColor(rng, '#ffffff', 0.08, 0.05, 0.02));
      }
    }
  }
  // lone field trees
  for (let i = 0; i < (opts.loneTrees ?? 90); i++) {
    const a = rng.range(0, TAU), r = rng.range(inner + 30, radius * 0.75);
    const x = Math.sin(a) * r, z = -Math.cos(a) * r;
    if (seaMask(x, z) > 0.2 || (bay && steep(x, z))) continue;
    roundT.push({ x, y: heightAt(x, z) - 0.3, z, s: rng.range(0.9, 1.5), ry: rng.range(0, TAU) });
    roundC.push(wobbleColor(rng, '#ffffff', 0.08, 0.05, 0.02));
  }
  const inst = (geo, mat, list, colors, name) => {
    if (!list.length) return null;
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    list.forEach((t, i) => {
      p.set(t.x, t.y, t.z);
      q.setFromEuler(e.set(0, t.ry || 0, 0));
      sc.set(t.sx ?? t.s ?? 1, t.sy ?? t.s ?? 1, t.sz ?? t.s ?? 1);
      m.setMatrixAt(i, mx.compose(p, q, sc));
      m.setColorAt(i, c.set(colors[i]));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    m.name = name;
    m.castShadow = false;
    m.receiveShadow = false;
    group.add(m);
    return m;
  };
  const kb = new Kit('bush');
  kb.add(ico(1, 0), [shade(P.hedge, -0.1), shade(P.hedge, 0.06)], {}, materials.foliage);
  const bushGeo = [...kb.buckets.values()][0][0];
  const kr = new Kit('tree');
  kr.add(cyl(0.45, 0.6, 3.2, 5), P.woodDark, { y: 1.6 }, materials.foliage);
  kr.add(ico(3.6, 0), ['#4f9a3c', '#86cc55'], { y: 5.6, sy: 0.92 }, materials.foliage);
  kr.add(ico(2.3, 0), ['#5fae44', '#9bd86a'], { x: 1.2, y: 7.4, z: 0.6, ry: 0.5 }, materials.foliage);
  const roundGeo = mergeList([...kr.buckets.values()][0]);
  const kp = new Kit('pine');
  kp.add(cyl(0.35, 0.45, 2.2, 5), P.woodDark, { y: 1.1 }, materials.foliage);
  kp.add(cone(2.6, 5.2, 6), ['#2f7a4a', '#4f9a5c'], { y: 4.4 }, materials.foliage);
  kp.add(cone(1.9, 4.0, 6), ['#3a8a52', '#5fae66'], { y: 7.0 }, materials.foliage);
  const pineGeo = mergeList([...kp.buckets.values()][0]);
  inst(bushGeo, materials.foliage, bushT, bushC, 'hedgerows');
  inst(roundGeo, materials.foliage, roundT, roundC, 'trees');
  inst(pineGeo, materials.foliage, pineT, pineC, 'pines');

  // ---------------- distant hamlets, a farm, a church and the windmill
  const bk = new Kit('farBuildings');
  const walls = ['#fff1d6', '#fff8ee', '#ffe9c2', '#ffd9c0', '#f4f0e6'];
  const roofs = [P.roofTerracotta, P.roofBrick, P.roofSlate, '#b85a3c'];
  const hamlets = opts.hamlets ?? [[-0.25, 250, 6], [0.95, 330, 5], [-1.25, 420, 6], [0.42, 215, 3], [-0.85, 560, 4], [1.5, 470, 4], [0.1, 640, 5]];
  for (const [a, r, n] of hamlets) {
    const [hx, hz] = place(a, r);
    if (seaMask(hx, hz) > 0.3 || (bay && steep(hx, hz))) continue;
    for (let i = 0; i < n; i++) {
      const x = hx + rng.range(-28, 28), z = hz + rng.range(-22, 22);
      const y = heightAt(x, z);
      const w = rng.range(5, 8), d = rng.range(5, 7), h = rng.range(3.2, 5.5);
      const barn = rng.chance(0.15);
      const wall = barn ? '#c8503a' : rng.pick(walls);
      const ry = rng.range(0, TAU);
      bk.at({ x, y: y - 0.5, z, ry }, () => {
        bk.add(box(w, h + 0.5, d), wall, { y: (h + 0.5) / 2 });
        bk.add(prism([[-d / 2 - 0.5, 0], [d / 2 + 0.5, 0], [0, d * 0.5]], w + 0.6), barn ? '#6b7280' : rng.pick(roofs), { y: h + 0.5, ry: Math.PI / 2 });
        if (!barn) bk.add(box(0.8, 2, 0.8), P.brick, { x: w * 0.3, y: h + d * 0.3 + 0.5 });
      });
    }
  }
  // far church on its hill
  {
    const [x, z] = spireAt;
    const y = heightAt(x, z) - 0.5;
    const stone = '#d8d0c0';
    bk.at({ x, y, z, ry: rng.range(0, TAU) }, () => {
      bk.add(box(8, 8, 16), stone, { y: 4, z: -6 });
      bk.add(prism([[-4.6, 0], [4.6, 0], [0, 5]], 17), P.roofSlate, { y: 8, z: -6 });
      bk.add(box(6, 18, 6), stone, { y: 9 });
      bk.add(ngonFrustum(8, 3.2, 0.05, 16, Math.PI / 8), P.roofSlate, { y: 18 });
      bk.add(ico(0.5, 0), P.gold, { y: 34.3 });
    });
  }
  // windmill body (sails are a separate rotor)
  const [wx, wz] = windmillAt;
  const wy = heightAt(wx, wz) - 0.8;
  const faceA = Math.atan2(-wx, -wz); // face the village
  const WM = opts.windmillScale ?? 1.45;
  bk.at({ x: wx, y: wy, z: wz, ry: faceA, s: WM }, () => {
    bk.add(ngonFrustum(8, 4.2, 3.0, 15, Math.PI / 8), ['#f2ead8', '#fff8ee'], {});
    bk.add(ngonFrustum(8, 4.6, 4.6, 0.5, Math.PI / 8), P.woodDark, { y: 5.2 });
    bk.add(ngonFrustum(8, 3.3, 1.0, 3.2, Math.PI / 8), '#6b4a3a', { y: 15 });
    bk.add(box(1.6, 2.8, 0.6), P.woodDark, { y: 1.4, z: 3.9 });
    bk.add(box(1.0, 1.2, 0.5), '#3a78bd', { y: 9.5, z: 3.2 });
  });
  const farMesh = new THREE.Group();
  bk.build(farMesh, { shadows: false });
  farMesh.children.forEach((m) => { m.castShadow = false; m.receiveShadow = false; });
  farMesh.name = 'farBuildings';
  group.add(farMesh);
  const rotor = new THREE.Group();
  rotor.name = 'windmillSails';
  const rk = new Kit('sails');
  rk.add(cyl(0.6, 0.6, 1.4, 8), P.woodDark, { rx: Math.PI / 2 });
  for (let i = 0; i < 4; i++) {
    rk.at({ rz: (i / 4) * TAU + 0.3 }, () => {
      rk.add(box(0.45, 11, 0.35), P.woodDark, { y: 5.8, z: 0.2 });
      rk.add(box(2.3, 8.2, 0.15), '#fff1d6', { x: 1.3, y: 6.6, z: 0.25 });
      for (let k = 0; k < 3; k++) rk.add(box(2.4, 0.18, 0.2), '#c9b89a', { x: 1.3, y: 3.6 + k * 2.8, z: 0.32 });
    });
  }
  rk.build(rotor, { shadows: false });
  const up = new THREE.Vector3(Math.sin(faceA), 0, Math.cos(faceA));
  rotor.scale.setScalar(WM);
  rotor.position.set(wx, wy + 16.4 * WM, wz).addScaledVector(up, 3.4 * WM);
  rotor.rotation.y = faceA;
  group.add(rotor);

  // ---------------- sea: open ocean (bay mode) or a glint through a valley
  let seaMat = null;
  let seaMesh = null;
  if (bay && opts.sea !== false) {
    seaMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: { value: 0 }, uNear: { value: new THREE.Color(bay.near ?? '#2fb3d9') }, uFar: { value: new THREE.Color(bay.far ?? '#1f78c8') },
        uCoast: { value: 0 },
      }]),
      vertexShader: seaVert, fragmentShader: oceanFrag, fog: true,
    });
    seaMat.name = 'ocean';
    const R = radius * 2.4;
    const sg = (opts.seaInner ?? 0) > 0 ? new THREE.RingGeometry(opts.seaInner, R, 96, 8) : new THREE.CircleGeometry(R, 96);
    sg.rotateX(-Math.PI / 2);
    seaMesh = new THREE.Mesh(sg, seaMat);
    seaMesh.position.y = seaLevel;
    seaMesh.name = 'sea';
    seaMesh.receiveShadow = true;
    group.add(seaMesh);
  } else if (opts.sea !== false) {
    seaMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: { value: 0 }, uCoast: { value: opts.coast ?? inner + 145 },
        uNear: { value: new THREE.Color('#1c86d6') }, uFar: { value: new THREE.Color('#3aa4e8') },
      }]),
      vertexShader: seaVert, fragmentShader: seaFrag, fog: true,
    });
    seaMat.name = 'sea';
    const phi = Math.PI / 2 - seaAngle;
    const span = seaHalf + 0.25;
    const sg = new THREE.RingGeometry((opts.coast ?? inner + 145) - 20, radius * 1.3, 36, 3, phi - span, span * 2).rotateX(-Math.PI / 2);
    seaMesh = new THREE.Mesh(sg, seaMat);
    seaMesh.position.y = 0.12;
    seaMesh.name = 'sea';
    group.add(seaMesh);
  }

  group.userData.kind = 'backdrop';
  group.userData.heightAt = heightAt;
  group.userData.parts = { terrain, sea: seaMesh, windmillSails: rotor, windmill: new THREE.Vector3(wx, wy, wz), spire: new THREE.Vector3(spireAt[0], heightAt(...spireAt), spireAt[1]) };
  group.userData.seaMask = seaMask;
  group.userData.seaLevel = seaLevel;
  if (bay) group.userData.coastZ = coastZ;
  group.userData.update = (dt, t) => {
    rotor.rotation.z -= dt * 0.55;
    if (seaMat) seaMat.uniforms.uTime.value = t;
  };
  return group;
}

function mergeList(list) {
  // merge parts produced by Kit.add (all position/normal/color, non-indexed)
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
