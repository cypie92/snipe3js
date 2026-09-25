// Ground & layout pieces: cobbled square, roads (kerbs + dashes), pavements, low stone walls,
// picket fences and clipped hedges. Paths are arrays of [x, z] (or [x, y, z] / Vector3).
import { THREE, materials, Kit, cbox, prism, sweep, resample, roundRectPath, rngOf, shade, wobbleColor } from './common.js';
import { box, ico } from '../../geo.js';
import { hash3 } from '../../../core/rng.js';
import { P } from '../../../gfx/palette.js';
import { paintedTexture } from './signs.js';

// ------------------------------------------------------------------ cobbles
const cobbleCache = new Map();
/** Seamless, low-contrast toy cobble texture covering `tile` metres. */
export function cobbleTexture({ seed = 1, base = P.cobble, mortar, tile = 4 } = {}) {
  const key = `${seed}|${base}|${tile}`;
  if (cobbleCache.has(key)) return cobbleCache.get(key);
  const rng = rngOf(seed, 'cobble');
  const S = 512;
  const mort = mortar ?? shade(base, -0.1);
  const tex = paintedTexture(S, S, (ctx) => {
    ctx.fillStyle = mort;
    ctx.fillRect(0, 0, S, S);
    const rowH = S / 16;
    for (let r = 0; r < 16; r++) {
      let x = rng.range(0, 30);
      const start = x;
      while (x < start + S) {
        const len = rng.range(rowH * 1.1, rowH * 1.8);
        const col = wobbleColor(rng, base, 0.035, 0.03, 0.01);
        for (const off of [0, -S]) {
          const cx = x + off, cy = r * rowH;
          const g = ctx.createLinearGradient(cx, cy, cx + len * 0.6, cy + rowH);
          g.addColorStop(0, shade(col, 0.05));
          g.addColorStop(1, shade(col, -0.035));
          ctx.fillStyle = g;
          const pad = 2.5;
          const rr = rowH * 0.36;
          ctx.beginPath();
          ctx.moveTo(cx + pad + rr, cy + pad);
          ctx.arcTo(cx + len - pad, cy + pad, cx + len - pad, cy + rowH - pad, rr);
          ctx.arcTo(cx + len - pad, cy + rowH - pad, cx + pad, cy + rowH - pad, rr);
          ctx.arcTo(cx + pad, cy + rowH - pad, cx + pad, cy + pad, rr);
          ctx.arcTo(cx + pad, cy + pad, cx + len - pad, cy + pad, rr);
          ctx.fill();
        }
        x += len;
      }
    }
  }, { repeat: true, anisotropy: 8 });
  if (tex) tex.repeat.set(1 / tile, 1 / tile);
  const mat = new THREE.MeshStandardMaterial({ map: tex, color: tex ? '#ffffff' : base, roughness: 0.85, metalness: 0 });
  mat.name = 'cobbles';
  cobbleCache.set(key, mat);
  return mat;
}

/**
 * Cobbled plaza: rounded rectangle (width x depth, corner radius; width = depth = 2*radius gives a
 * circle) raised 0.1 m with a chunky kerb. userData.surfaceY = walking height.
 */
export function cobbleSquare(opts = {}) {
  const W = opts.width ?? 30, D = opts.depth ?? 30;
  const radius = Math.min(opts.radius ?? 4, W / 2 - 0.01, D / 2 - 0.01);
  const kerbW = opts.kerbWidth ?? 0.35;
  const top = 0.1;
  const group = new THREE.Group();
  group.name = opts.name ?? 'cobbleSquare';
  const shape = roundRectPath(W, D, radius, new THREE.Shape(), 6);
  const surf = new THREE.ExtrudeGeometry(shape, { depth: top + 0.1, bevelEnabled: false, curveSegments: 6 });
  surf.rotateX(-Math.PI / 2).translate(0, -0.1, 0);
  const mesh = new THREE.Mesh(surf, cobbleTexture({ seed: opts.seed ?? 1, base: opts.color ?? P.cobble, tile: opts.tile ?? 4 }));
  mesh.name = 'cobbles';
  mesh.receiveShadow = true;
  group.add(mesh);
  if (opts.kerb !== false) {
    const outer = roundRectPath(W + 2 * kerbW, D + 2 * kerbW, radius + kerbW, new THREE.Shape(), 6);
    outer.holes.push(new THREE.Path(roundRectPath(W, D, radius, new THREE.Shape(), 6).getPoints()));
    const k = new THREE.ExtrudeGeometry(outer, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2, curveSegments: 6 });
    k.rotateX(-Math.PI / 2).translate(0, 0.02, 0);
    const kit = new Kit('kerb');
    kit.add(k, opts.kerbColor ?? P.kerb);
    kit.build(group);
  }
  group.userData.kind = 'cobbleSquare';
  group.userData.parts = { surface: mesh };
  group.userData.surfaceY = top;
  group.userData.size = { width: W + 2 * kerbW, depth: D + 2 * kerbW };
  return group;
}

// ------------------------------------------------------------------ roads
const KERB_PROFILE = [[0, -0.05], [0, 0.15], [0.05, 0.2], [0.2, 0.2], [0.26, 0.15], [0.26, -0.05]];

/**
 * Road ribbon through XZ points: asphalt slab, kerbs both sides, dashed centre line.
 * opts: points, width (6.5), closed, kerbs (true), dashes (true), edgeLines (false), color, seed.
 */
export function road(opts = {}) {
  const pts = resample(opts.points ?? [[-30, 0], [30, 0]], opts.step ?? 1.2, { smooth: opts.smooth ?? true, closed: !!opts.closed });
  const W = opts.width ?? 6.5;
  const asphalt = opts.color ?? '#7a8091';
  const kit = new Kit('road');
  const surfY = 0.07;
  const half = W / 2;
  const slab = sweep([[-half - 0.05, -0.08], [-half - 0.05, surfY], [half + 0.05, surfY], [half + 0.05, -0.08]], pts, { closed: !!opts.closed });
  kit.add(slab, (x, y, z, c) => {
    const n = hash3(Math.floor(x / 3), 0, Math.floor(z / 3));
    c.set(shade(asphalt, (n - 0.5) * 0.03));
  });
  if (opts.kerbs !== false) {
    for (const s of [-1, 1]) {
      const prof = KERB_PROFILE.map(([x, y]) => [s * (half + x), y]);
      kit.add(sweep(s > 0 ? prof : prof.slice().reverse(), pts, { closed: !!opts.closed, hard: false }), opts.kerbColor ?? P.kerb);
    }
  }
  const frames = frameAlong(pts, !!opts.closed);
  if (opts.dashes !== false) {
    const dash = opts.dash ?? 1.6, gap = opts.gap ?? 1.6;
    let acc = 0;
    for (let i = 0; i < frames.length - 1; i++) {
      const a = frames[i], b = frames[i + 1];
      const segLen = a.p.distanceTo(b.p);
      let t = 0;
      while (t < segLen) {
        const phase = acc % (dash + gap);
        const inDash = phase < dash;
        const step = Math.max(1e-3, Math.min(segLen - t, inDash ? dash - phase : dash + gap - phase));
        if (inDash && step > 0.05) {
          const p = a.p.clone().lerp(b.p, (t + step / 2) / segLen);
          const ang = Math.atan2(b.p.x - a.p.x, b.p.z - a.p.z);
          kit.add(box(0.16, 0.05, step), opts.lineColor ?? '#fff8ee', { x: p.x, y: surfY + 0.012, z: p.z, ry: ang });
        }
        t += step;
        acc += step;
      }
    }
  }
  if (opts.edgeLines) {
    for (const s of [-1, 1]) kit.add(sweep([[s * (half - 0.35) - 0.06, surfY + 0.01], [s * (half - 0.35) - 0.06, surfY + 0.025], [s * (half - 0.35) + 0.06, surfY + 0.025], [s * (half - 0.35) + 0.06, surfY + 0.01]], pts, { closed: !!opts.closed, caps: false }), opts.edgeColor ?? P.sunflower);
  }
  const group = kit.build(new THREE.Group());
  group.name = opts.name ?? 'road';
  group.userData.kind = 'road';
  group.userData.parts = {};
  group.userData.path = pts;
  group.userData.surfaceY = surfY;
  return group;
}

function frameAlong(pts, closed) {
  const list = pts.map((p) => ({ p: p.clone() }));
  if (closed && list.length) list.push({ p: list[0].p.clone() });
  return list;
}

/**
 * Pavement: either along a path (points + width, raised 0.15 with paving slabs and an optional
 * kerb on `kerbSide` = 1 | -1 | 0) or a plain rectangle (width x depth).
 */
export function pavement(opts = {}) {
  const rng = rngOf(opts.seed ?? 'pave', 'pave');
  const base = opts.color ?? '#e6dccb';
  const H = opts.height ?? 0.15;
  const kit = new Kit('pavement');
  const slab = opts.slab ?? 0.95;
  if (opts.points) {
    const pts = resample(opts.points, slab, { smooth: opts.smooth ?? true, closed: !!opts.closed });
    const W = opts.width ?? 2.2;
    const across = Math.max(1, Math.round(W / slab));
    const n = opts.closed ? pts.length : pts.length - 1;
    const pos = [];
    const col = [];
    const c = new THREE.Color();
    const side = (i) => {
      const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length];
      const t = (opts.closed || (i > 0 && i < pts.length - 1)) ? b.clone().sub(a) : i === 0 ? pts[1].clone().sub(pts[0]) : pts[i].clone().sub(pts[i - 1]);
      t.y = 0; t.normalize();
      return new THREE.Vector3(t.z, 0, -t.x);
    };
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % pts.length;
      const s0 = side(i), s1 = side(j);
      for (let k = 0; k < across; k++) {
        const u0 = -W / 2 + (k / across) * W, u1 = -W / 2 + ((k + 1) / across) * W;
        const A = pts[i].clone().addScaledVector(s0, u0).setY(H), B = pts[i].clone().addScaledVector(s0, u1).setY(H);
        const C = pts[j].clone().addScaledVector(s1, u1).setY(H), Dd = pts[j].clone().addScaledVector(s1, u0).setY(H);
        pos.push(A.x, A.y, A.z, C.x, C.y, C.z, B.x, B.y, B.z, A.x, A.y, A.z, Dd.x, Dd.y, Dd.z, C.x, C.y, C.z);
        c.set(shade(base, ((i + k) % 2 ? 0.012 : -0.008) + rng.range(-0.018, 0.018)));
        for (let v = 0; v < 6; v++) col.push(c.r, c.g, c.b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    // fix winding if the normals face down
    if (g.attributes.normal.getY(0) < 0) {
      for (let i = 0; i < pos.length; i += 9) {
        for (let d = 0; d < 3; d++) { const t = pos[i + 3 + d]; pos[i + 3 + d] = pos[i + 6 + d]; pos[i + 6 + d] = t; }
      }
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
    }
    kit.buckets.set(materials.toy, [g]);
    // side walls
    kit.add(sweep([[-W / 2, -0.05], [-W / 2, H], [-W / 2 + 0.001, H]], pts, { closed: !!opts.closed, caps: false }), shade(base, -0.12));
    kit.add(sweep([[W / 2 - 0.001, H], [W / 2, H], [W / 2, -0.05]], pts, { closed: !!opts.closed, caps: false }), shade(base, -0.12));
    if (opts.kerbSide) {
      const s = opts.kerbSide;
      const prof = KERB_PROFILE.map(([x, y]) => [s * (W / 2 - 0.26 + x), y + 0.0]);
      kit.add(sweep(s > 0 ? prof : prof.slice().reverse(), pts, { closed: !!opts.closed, hard: false }), opts.kerbColor ?? P.kerb);
    }
  } else {
    const W = opts.width ?? 6, D = opts.depth ?? 3;
    const nx = Math.max(1, Math.round(W / slab)), nz = Math.max(1, Math.round(D / slab));
    const sw = W / nx, sd = D / nz;
    kit.add(box(W, H + 0.05, D), shade(base, -0.12), { y: (H - 0.05) / 2 });
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
      kit.add(box(sw - 0.03, 0.05, sd - 0.03), shade(base, ((i + k) % 2 ? 0.012 : -0.008) + rng.range(-0.018, 0.018)), { x: -W / 2 + sw * (i + 0.5), y: H + 0.01, z: -D / 2 + sd * (k + 0.5) });
    }
  }
  const group = kit.build(new THREE.Group());
  group.name = opts.name ?? 'pavement';
  group.userData.kind = 'pavement';
  group.userData.parts = {};
  group.userData.surfaceY = H;
  return group;
}

// ------------------------------------------------------------------ walls, fences, hedges
function segmentsOf(points, closed) {
  const V = points.map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(p[0], p.length > 2 ? p[1] : 0, p.length > 2 ? p[2] : p[1])));
  const segs = [];
  for (let i = 0; i < V.length - (closed ? 0 : 1); i++) segs.push([V[i], V[(i + 1) % V.length]]);
  return segs;
}

/** Dry-stone / brick garden wall with rounded coping. opts: height (0.9), thick (0.45), style, color. */
export function lowWall(points, opts = {}) {
  const rng = rngOf(opts.seed ?? 'wall', 'wall');
  const H = opts.height ?? 0.9, T = opts.thick ?? 0.45;
  const style = opts.style ?? 'stone';
  const base = opts.color ?? (style === 'brick' ? P.brick : '#d6c6a6');
  const cap = opts.capColor ?? (style === 'brick' ? '#e8dcc4' : shade(base, 0.06));
  const kit = new Kit('lowWall');
  for (const [a, b] of segmentsOf(points, !!opts.closed)) {
    const len = a.distanceTo(b);
    const ang = Math.atan2(b.x - a.x, b.z - a.z);
    kit.at({ x: a.x, y: a.y, z: a.z, ry: ang }, () => {
      const courses = style === 'brick' ? 4 : 3;
      const ch = (H - 0.16) / courses;
      for (let c = 0; c < courses; c++) {
        let z = c % 2 ? -0.25 : 0;
        while (z < len) {
          const bl = style === 'brick' ? 0.5 : rng.range(0.5, 0.95);
          const z0 = Math.max(0, z), z1 = Math.min(len, z + bl);
          if (z1 - z0 > 0.08) {
            kit.add(cbox(T - rng.range(0, 0.05), ch + 0.02, z1 - z0 - 0.03, style === 'brick' ? 0.02 : 0.06), wobbleColor(rng, base, style === 'brick' ? 0.03 : 0.06, 0.04), {
              x: rng.range(-0.015, 0.015), y: ch * (c + 0.5) - 0.04, z: (z0 + z1) / 2,
            });
          }
          z += bl;
        }
      }
      kit.add(cbox(T + 0.12, 0.18, len + 0.06, 0.08), cap, { y: H - 0.12, z: len / 2 });
    });
  }
  const group = kit.build(new THREE.Group());
  group.name = opts.name ?? 'lowWall';
  group.userData.kind = 'lowWall';
  group.userData.parts = {};
  return group;
}

/** Wonky white picket fence along a polyline. opts: height (1.0), color, spacing (0.17), gateAt (segment index). */
export function picketFence(points, opts = {}) {
  const rng = rngOf(opts.seed ?? 'fence', 'fence');
  const H = opts.height ?? 1.0;
  const color = opts.color ?? '#fff8ee';
  const post = opts.postColor ?? color;
  const sp = opts.spacing ?? 0.17;
  const kit = new Kit('picketFence');
  const picket = prism([[-0.045, 0], [0.045, 0], [0.045, H - 0.1], [0, H], [-0.045, H - 0.1]], 0.035);
  for (const [a, b] of segmentsOf(points, !!opts.closed)) {
    const len = a.distanceTo(b);
    const ang = Math.atan2(b.x - a.x, b.z - a.z);
    const nPosts = Math.max(1, Math.round(len / 2.0));
    kit.at({ x: a.x, y: a.y, z: a.z, ry: ang }, () => {
      for (let i = 0; i <= nPosts; i++) {
        const z = (i / nPosts) * len;
        kit.add(cbox(0.12, H + 0.1, 0.12, 0.03), post, { y: (H + 0.1) / 2 - 0.05, z, rz: rng.range(-0.03, 0.03) });
        kit.add(prism([[-0.07, 0], [0.07, 0], [0, 0.12]], 0.13), post, { y: H + 0.05, z, ry: Math.PI / 2 });
      }
      for (const y of [H * 0.28, H * 0.72]) kit.add(box(0.05, 0.08, len), shade(color, -0.04), { x: -0.06, y, z: len / 2 });
      const n = Math.floor(len / sp);
      for (let i = 0; i < n; i++) {
        const z = (i + 0.5) * (len / n);
        if (Math.abs(((z / len) * nPosts) % 1) < 0.06 || Math.abs(((z / len) * nPosts) % 1) > 0.94) continue;
        kit.add(picket, wobbleColor(rng, color, 0.02, 0.01), { x: 0.0, y: rng.range(-0.07, -0.02), z, ry: Math.PI / 2, rz: 0, rx: rng.range(-0.05, 0.05) });
      }
    });
  }
  const group = kit.build(new THREE.Group());
  group.name = opts.name ?? 'picketFence';
  group.userData.kind = 'picketFence';
  group.userData.parts = {};
  return group;
}

/** Clipped hedge along a polyline (faceted foliage). opts: height (1.2), width (1.0), flowers (0..1). */
export function hedgeRow(points, opts = {}) {
  const rng = rngOf(opts.seed ?? 'hedge', 'hedge');
  const H = opts.height ?? 1.2, Wd = opts.width ?? 1.0;
  const dark = opts.color ?? P.hedge;
  const lightC = shade(dark, 0.1);
  const kit = new Kit('hedgeRow');
  const flowers = opts.flowers ?? 0.25;
  const flowerCol = opts.flowerColor ?? rng.pick(['#fff8ee', '#ffb8c2', P.sunflower]);
  for (const [a, b] of segmentsOf(points, !!opts.closed)) {
    const len = a.distanceTo(b);
    const ang = Math.atan2(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.round(len / 1.6));
    kit.at({ x: a.x, y: a.y, z: a.z, ry: ang }, () => {
      for (let i = 0; i < n; i++) {
        const z0 = (i / n) * len, z1 = ((i + 1) / n) * len;
        const h = H * rng.range(0.92, 1.08);
        const w = Wd * rng.range(0.94, 1.06);
        kit.add(cbox(w, h, z1 - z0 + 0.25, 0.28), [shade(dark, -0.08), lightC], { y: h / 2 - 0.1, z: (z0 + z1) / 2, rx: rng.range(-0.02, 0.02) }, materials.foliage);
        for (let k = 0; k < 2; k++) {
          const z = z0 + (k + 0.5) * ((z1 - z0) / 2) + rng.range(-0.2, 0.2);
          kit.add(ico(w * 0.36, 0), shade(lightC, rng.range(-0.02, 0.05)), { x: rng.range(-0.1, 0.1), y: h - 0.05, z, ry: rng.range(0, 3), sy: 0.55 }, materials.foliage);
        }
        if (rng.chance(flowers)) {
          for (let k = 0; k < 3; k++) kit.add(ico(0.07, 0), flowerCol, { x: rng.sign() * (w / 2 + 0.01), y: rng.range(0.4, h - 0.1), z: rng.range(z0, z1) }, materials.foliage);
        }
      }
    });
  }
  const group = kit.build(new THREE.Group());
  group.name = opts.name ?? 'hedgeRow';
  group.userData.kind = 'hedgeRow';
  group.userData.parts = {};
  return group;
}
