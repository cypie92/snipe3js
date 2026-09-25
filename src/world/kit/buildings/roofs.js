// Chunky toy roofs. Gable roofs are stacks of overlapping rounded tile courses (each course a
// slightly different shade, like hand-painted tiles); hip / mansard / n-gon roofs are stepped
// frustum tiers. All builders work in the kit's current frame, centred on x=z=0.
import { THREE, materials, cbox, frustum, ngonFrustum, prism, cylBetween, shade, wobbleColor, DEG } from './common.js';
import { cyl } from '../../geo.js';
import { P } from '../../../gfx/palette.js';

/**
 * Gable roof, ridge along local X. span = wall-to-wall distance across the ridge (Z), length along X.
 * opts: yW (wall top), pitch (rad), oe (eave overhang), ovL/ovR (verge overhangs), t, color, rng,
 * gable (wall colour -> adds the triangular gable walls), barge (trim colour -> bargeboards),
 * gutter (colour | null). Returns geometry facts for placing chimneys/dormers.
 */
export function gableRoof(kit, o) {
  const { span, length, yW, color, rng } = o;
  const th = o.pitch ?? 42 * DEG;
  const oe = o.oe ?? 0.38;
  const ovL = o.ovL ?? o.ov ?? 0.32;
  const ovR = o.ovR ?? o.ov ?? 0.32;
  const t = o.t ?? 0.24;
  const half = span / 2;
  const hR = half * Math.tan(th);
  const S = (half + oe) / Math.cos(th);
  const L = length + ovL + ovR;
  const xc = (ovR - ovL) / 2;
  const rows = o.rows ?? Math.max(3, Math.round(S / 0.62));
  const step = 0.04;
  const rowLen = S / rows;
  const ridgeU = new THREE.Vector3(0, yW + hR, 0);
  const sin = Math.sin(th), cos = Math.cos(th);
  const sides = o.sides ?? [1, -1];
  for (const side of sides) {
    const u = new THREE.Vector3(0, -sin, cos * side);
    const n = new THREE.Vector3(0, cos, sin * side);
    for (let i = 0; i < rows; i++) {
      const sMid = S - (i + 0.5) * rowLen + 0.04;
      const top = i === rows - 1;
      const len = rowLen * 1.2 + (top ? t * 0.8 : 0);
      const c = ridgeU.clone().addScaledVector(u, sMid - (top ? t * 0.4 : 0)).addScaledVector(n, t / 2 + i * step);
      const base = i % 2 ? shade(color, 0.035) : color;
      const col = rng ? wobbleColor(rng, base, 0.018, 0.02, 0.004) : base;
      kit.add(cbox(L + (rng ? rng.range(-0.05, 0.05) : 0), t, len, 0.075), col, {
        x: xc + (rng ? rng.range(-0.03, 0.03) : 0), y: c.y, z: c.z, rx: side * th + (rng ? rng.range(-0.6, 0.6) * DEG : 0),
      });
    }
  }
  const lift = t + (rows - 1) * step;
  const ridgeY = yW + hR + lift / cos;
  kit.add(cyl(0.2, 0.2, L + 0.06, 10), shade(color, -0.12), { x: xc, y: ridgeY - 0.06, rz: Math.PI / 2 });
  // gable walls (triangular prisms under the verges)
  if (o.gable) kit.add(prism([[-half, 0], [half, 0], [0, hR - 0.03]], length), o.gable, { y: yW - 0.01, ry: Math.PI / 2 });
  // bargeboards following the verge underside
  if (o.barge) {
    for (const [end, ov] of [[-1, ovL], [1, ovR]]) {
      if (ov < 0.1) continue;
      const x = end * (length / 2 + ov - 0.1) + 0;
      for (const side of sides) {
        const a = new THREE.Vector3(x, yW + hR - 0.02, 0);
        const b = new THREE.Vector3(x, yW - oe * Math.tan(th) + 0.02, side * (half + oe - 0.05));
        const mid = a.clone().add(b).multiplyScalar(0.5);
        kit.add(cbox(0.12, 0.3, a.distanceTo(b) + 0.1, 0.04), o.barge, { x: mid.x, y: mid.y - 0.08, z: mid.z, rx: side * th });
      }
    }
  }
  const gutters = [];
  if (o.gutter !== null) {
    const gc = o.gutter ?? P.metalDark;
    for (const side of sides) {
      const gy = yW - oe * Math.tan(th) - 0.12;
      const gz = side * (half + oe - 0.08);
      const a = [-length / 2 - ovL + 0.1, gy, gz];
      const b = [length / 2 + ovR - 0.1, gy, gz];
      kit.add(cylBetween(a, b, 0.1, 0.1, 8), gc);
      gutters.push({ side, y: gy, z: gz, x0: a[0], x1: b[0] });
    }
  }
  return {
    hR, ridgeY, lift, pitch: th, rows, gutters,
    /** outer roof surface height at lateral distance |z| from the ridge */
    topAt: (z) => ridgeY - 0.04 - Math.abs(z) * Math.tan(th),
    eaveY: yW - oe * Math.tan(th),
  };
}

/**
 * Hip roof over a W x D wall rectangle (or pyramid when square). Stepped tile tiers + hip caps.
 */
export function hipRoof(kit, o) {
  const { W, D, yW, color, rng } = o;
  const th = o.pitch ?? 36 * DEG;
  const oe = o.oe ?? 0.4;
  const A = W + 2 * oe, B = D + 2 * oe;
  const short = Math.min(A, B);
  const H = (short / 2) * Math.tan(th);
  const tiers = o.tiers ?? Math.max(3, Math.round(H / 0.42));
  const lip = 0.07;
  const fascia = 0.26;
  kit.add(cbox(A, fascia, B, 0.08), shade(color, -0.1), { y: yW + fascia / 2 - 0.06 });
  const base = yW + fascia - 0.06;
  for (let k = 0; k < tiers; k++) {
    const f0 = k / tiers, f1 = (k + 1) / tiers;
    const w0 = A - short * f0, d0 = B - short * f0;
    const w1 = Math.max(0.001, A - short * f1), d1 = Math.max(0.001, B - short * f1);
    const baseCol = k % 2 ? shade(color, 0.035) : color;
    const col = rng ? wobbleColor(rng, baseCol, 0.018, 0.02, 0.004) : baseCol;
    kit.add(frustum(w0 + 2 * lip, d0 + 2 * lip, w1, d1, H / tiers + 0.002), col, { y: base + (k * H) / tiers });
  }
  const top = base + H;
  const rx = (A - short) / 2, rz = (B - short) / 2;
  const cap = shade(color, -0.12);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    kit.add(cylBetween([sx * (A / 2 + 0.02), base + 0.04, sz * (B / 2 + 0.02)], [sx * rx, top + 0.04, sz * rz], 0.12, 0.12, 8), cap);
  }
  if (rx > 0.05 || rz > 0.05) kit.add(cylBetween([-rx - 0.1, top + 0.04, -rz], [rx + 0.1, top + 0.04, rz], 0.14, 0.14, 8), cap);
  else kit.add(new THREE.SphereGeometry(0.22, 10, 8), o.finial ?? cap, { y: top + 0.12 });
  const gutters = [];
  if (o.gutter !== null) {
    const gc = o.gutter ?? P.metalDark;
    for (const side of [1, -1]) {
      const gy = yW - 0.08;
      const gz = side * (B / 2 - 0.02);
      kit.add(cylBetween([-A / 2 + 0.05, gy, gz], [A / 2 - 0.05, gy, gz], 0.1, 0.1, 8), gc);
      gutters.push({ side, y: gy, z: gz, x0: -A / 2 + 0.05, x1: A / 2 - 0.05 });
    }
  }
  return { ridgeY: top + 0.1, H, base, A, B, gutters, topAt: (z) => top - Math.max(0, Math.abs(z) - rz) * Math.tan(th), eaveY: base };
}

/**
 * Mansard: steep lower slopes (room for dormers) + shallow hipped cap, with a moulded kerb.
 */
export function mansardRoof(kit, o) {
  const { W, D, yW, color, rng } = o;
  const oe = o.oe ?? 0.3;
  const low = o.lowPitch ?? 72 * DEG;
  const hm = o.lowHeight ?? 2.2;
  const A = W + 2 * oe, B = D + 2 * oe;
  const inset = hm / Math.tan(low);
  const fascia = 0.26;
  kit.add(cbox(A, fascia, B, 0.08), shade(color, -0.1), { y: yW + fascia / 2 - 0.06 });
  const base = yW + fascia - 0.06;
  const tiers = 3;
  const lip = 0.06;
  for (let k = 0; k < tiers; k++) {
    const f0 = k / tiers, f1 = (k + 1) / tiers;
    const baseCol = k % 2 ? shade(color, 0.035) : color;
    const col = rng ? wobbleColor(rng, baseCol, 0.018, 0.02, 0.004) : baseCol;
    kit.add(frustum(A - 2 * inset * f0 + 2 * lip, B - 2 * inset * f0 + 2 * lip, A - 2 * inset * f1, B - 2 * inset * f1, hm / tiers + 0.002), col, { y: base + (k * hm) / tiers });
  }
  const A2 = A - 2 * inset, B2 = B - 2 * inset;
  const kerbY = base + hm;
  kit.add(cbox(A2 + 0.3, 0.2, B2 + 0.3, 0.07), o.trim ?? P.white, { y: kerbY + 0.06 });
  const cap = hipRoof(kit, { W: A2 - 0.1, D: B2 - 0.1, yW: kerbY + 0.1, pitch: o.topPitch ?? 22 * DEG, oe: 0.12, color: shade(color, -0.04), rng, gutter: null, tiers: 2 });
  const gutters = [];
  if (o.gutter !== null) {
    const gc = o.gutter ?? P.metalDark;
    for (const side of [1, -1]) {
      const gy = yW - 0.08;
      const gz = side * (B / 2 - 0.02);
      kit.add(cylBetween([-A / 2 + 0.05, gy, gz], [A / 2 - 0.05, gy, gz], 0.1, 0.1, 8), gc);
      gutters.push({ side, y: gy, z: gz, x0: -A / 2 + 0.05, x1: A / 2 - 0.05 });
    }
  }
  return {
    ridgeY: cap.ridgeY, base, hm, inset, kerbY, A, B, gutters,
    /** z of the steep slope surface at height y above base */
    slopeZ: (y) => B / 2 - ((y - base) / hm) * inset,
    eaveY: base,
  };
}

/** Regular n-gon roof (bandstand, towers): stepped tiers, optional flared eave and finial. */
export function ngonRoof(kit, o) {
  const { n = 8, r, h, y = 0, color, rng } = o;
  const tiers = o.tiers ?? 4;
  const lip = o.lip ?? 0.08;
  const rot = o.rot ?? Math.PI / n;
  const colors = o.colors;
  if (o.fascia !== false) kit.add(ngonFrustum(n, r + 0.05, r + 0.05, 0.22, rot), shade(color, -0.1), { y: y - 0.02 });
  const base = y + 0.2;
  for (let k = 0; k < tiers; k++) {
    const f0 = k / tiers, f1 = (k + 1) / tiers;
    // gentle ogee: concave profile
    const r0 = r * Math.pow(1 - f0, o.curve ?? 1.25);
    const r1 = Math.max(0.001, r * Math.pow(1 - f1, o.curve ?? 1.25));
    const baseCol = colors ? colors[k % colors.length] : k % 2 ? shade(color, 0.035) : color;
    const col = rng ? wobbleColor(rng, baseCol, 0.015, 0.015, 0.003) : baseCol;
    kit.add(ngonFrustum(n, r0 + lip, r1, h / tiers + 0.002, rot), col, { y: base + (k * h) / tiers });
  }
  return { top: base + h };
}
