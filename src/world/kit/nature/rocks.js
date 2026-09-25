// Faceted toy rocks: squashed jittered icospheres with a mossy top (1 draw call, facet material).
import * as THREE from 'three';
import { part, merge, jitter } from '../../geo.js';
import { materials } from '../../../gfx/materials.js';
import { Rng } from '../../../core/rng.js';
import { paintFaces, noise3, finish, mesh } from '../props/lib.js';

const STONE = ['#9d9486', '#b9b0a2', '#d3cbbd', '#e6dfd2'];
const MOSS = '#78b84e';
const _c = new THREE.Color();

function rockGeo(r, seed, rng, squash) {
  const g = jitter(new THREE.IcosahedronGeometry(r, 1), r * 0.22, seed);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let y = pos.getY(i) * squash;
    if (y < -r * 0.25) y = -r * 0.25 + (y + r * 0.25) * 0.2; // flat-ish bottom sunk in the ground
    pos.setY(i, y + r * 0.22);
  }
  g.computeVertexNormals();
  return part(g, '#fff', { ry: rng.range(0, Math.PI * 2) });
}

/**
 * rock({ seed, size = 1, kind: 'boulder'|'flat'|'cluster', moss = true, color })
 * Sits on y = 0 (slightly sunk). parts: { rock }.
 */
export function rock({ seed = 1, size = 1, kind = 'boulder', moss = true, color = null } = {}) {
  const rng = new Rng(`rock-${seed}`);
  const list = [];
  if (kind === 'cluster') {
    list.push(rockGeo(0.7, seed, rng, 0.75));
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + rng.range(-0.4, 0.4);
      const r = rng.range(0.3, 0.45);
      const g = rockGeo(r, seed + i + 1, rng, 0.8);
      g.translate(Math.cos(a) * 0.75, 0, Math.sin(a) * 0.75);
      list.push(g);
    }
  } else {
    list.push(rockGeo(0.8, seed, rng, kind === 'flat' ? 0.42 : 0.72));
  }
  const geo = merge(list);
  const stops = color ? [new THREE.Color(color).multiplyScalar(0.72), color, new THREE.Color(color).lerp(new THREE.Color('#fff'), 0.3)] : STONE;
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  paintFaces(geo, (x, y, z, nx, ny, nz, c) => {
    const n = noise3(x * 3 + seed, y * 3, z * 3);
    let t = (y - min.y) / (max.y - min.y) * 0.45 + ny * 0.3 + (nx + nz) * 0.1 + (n - 0.5) * 0.3 + 0.3;
    t = Math.min(1, Math.max(0, t)) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(t));
    c.set(stops[i]).lerp(_c.set(stops[i + 1]), t - i);
    if (moss && ny > 0.62 && n > 0.35) c.set(MOSS).multiplyScalar(0.85 + n * 0.25);
  });
  const g = new THREE.Group();
  const m = mesh(geo, materials.facet, 'rock');
  m.scale.setScalar(size);
  g.add(m);
  return finish(g, { name: 'rock', parts: { rock: m }, surface: 'stone' });
}
