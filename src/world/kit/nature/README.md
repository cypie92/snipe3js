# Nature kit (`src/world/kit/nature/`)

Chunky, faceted, toy-diorama nature: trees, instanced forests, bushes, hedges, flowers, grass and rocks.
Everything is procedural, vertex-coloured and deterministic (same `seed` = same result).

```js
import { tree, forest, bush, hedgeBlock, flowerPatch, grassTufts, scatterFlowers, rock } from '../world/kit/nature/index.js';
```

## Conventions (same as the props kit)
- 1 unit = 1 m, Y up. Every builder returns a `THREE.Group` whose origin is the **ground contact point**
  (y = 0). Place it with `obj.position.set(x, groundY, z)`, turn it with `obj.rotation.y`.
- Foliage (canopies, bushes, hedges, flowers, grass) uses **`materials.foliage`** so the wind-sway pass
  can be patched on later. Trunks and rocks use `materials.facet` (flat-shaded low-poly).
- `group.userData`: `kind`, `parts`, `surface` (hint for `ctx.surface(obj, obj.userData.surface)`: trees
  `'wood'`, foliage `'grass'`, rocks `'stone'`), `update(dt, t)` and `wobble(strength)` (a springy fun-hit
  reaction; trees sway instead). Register `ctx.onUpdate(obj.userData.update)` only if you use `wobble`.
- For dense dressing always prefer the instanced builders (`forest`, `scatterFlowers`, `grassTufts`).

## Trees
### `tree({ type, seed = 1, scale = 1 })`
`type`: `'round' | 'tall' | 'conifer' | 'fruit' | 'blossom' | 'willow'`. 2 draw calls (trunk + crown).
parts: `{ trunk, crown }`. `userData.wobble(s)` sways the whole tree (shake it when shot).

| type | height | look | tris |
|---|---|---|---|
| round | ~6.5 m | classic lollipop cluster of puffs | 516 |
| tall | ~9 m | poplar / cypress column | 476 |
| conifer | ~8 m | 4 jagged stacked tiers | 220 |
| fruit | ~6.5 m | round tree dotted with big red/orange fruit, a few fallen | 836 |
| blossom | ~5.5 m | wide pink canopy with white flecks, petal carpet underneath | 754 |
| willow | ~6 m | leaning trunk, dome + drooping fronds | 1116 |

```js
const oak = tree({ type: 'round', seed: 3 });
oak.position.set(12, 0, -20);
oak.rotation.y = 1.3;
ctx.root.add(oak);
ctx.prop(oak, { onHit: () => oak.userData.wobble(1) });
ctx.onUpdate(oak.userData.update);
```
`treeGeometry(type, seed)` returns the cached `{ trunk, crown }` BufferGeometries if you need them raw.

### `forest(points, opts)` — instanced dressing
`points`: array of `Vector3 | [x, z] | [x, y, z] | { x, y, z, type, scale, ry }`.
`opts`: `{ types = ['round','conifer','tall'], seed = 1, scale = [0.85, 1.2], tint = 0.12, variants = 1 }`.
One `InstancedMesh` for trunks + one for crowns **per type** (x `variants`) with per-instance scale,
rotation, slight lean and colour tint (warm/cool/brightness). 200 trees of 3 types = **6 draw calls**
(~83k tris). A point can force a type: `{ x, z, type: 'blossom' }`.
```js
const pts = [];
for (let i = 0; i < 200; i++) pts.push([rng.range(-70, 70), rng.range(-90, -60)]);
ctx.root.add(forest(pts, { types: ['round', 'conifer', 'tall'], seed: 7 }));
```
Instanced forests are not hittable per tree (the raycast hits the InstancedMesh; `instanceId` tells which).

## Bushes, hedges, flowers, grass
| builder | notes | draw calls | tris |
|---|---|---|---|
| `bush({ seed, size = 1, flowers = null })` | lumpy round bush ~1.5 m; `flowers: '#ff7eb6'` dots it with blooms | 1 | ~560 |
| `hedgeBlock({ w = 3, h = 1.3, d = 1.1, seed, round = 0.3, flowers = null })` | clipped lumpy box sitting on y=0; tile blocks for long hedges | 1 | ~270 (3 m) |
| `flowerPatch({ seed, radius = 1, count, colors, mound = true })` | round flower bed on a leafy mound; heads + stems instanced | 3 | ~820 (r=1) |
| `grassTufts({ seed, radius = 2, area, count = 30, scale = 1, filter })` | chunky spiky tufts, instanced, colour-varied | 1 | 42 / tuft |
| `scatterFlowers(area, count = 200, { seed, colors, filter(x,z), y(x,z), clump = 0.6, scale = 1 })` | meadow flowers in clumps | 2 | 34 / flower |

`area` is `{ x, z, w, d }` (centre + size) or `{ minX, maxX, minZ, maxZ }`. `filter(x, z)` rejects points
(e.g. keep flowers off paths); `y(x, z)` returns ground height for non-flat terrain.
```js
ctx.root.add(scatterFlowers({ x: 0, z: -30, w: 60, d: 20 }, 400, { seed: 4, filter: (x, z) => Math.abs(x) > 3 }));
ctx.root.add(grassTufts({ area: { x: 0, z: -30, w: 60, d: 20 }, count: 150, seed: 2 }));
const hedge = hedgeBlock({ w: 6, seed: 9, flowers: '#fff4e6' });
hedge.position.set(-20, 0, 5);
```
`FLOWER_COLORS` is the default bloom palette.

## Rocks
### `rock({ seed, size = 1, kind: 'boulder' | 'flat' | 'cluster', moss = true, color })`
Faceted stone, slightly sunk into the ground, mossy top faces. 1 draw call, 80 tris (cluster 320).
parts: `{ rock }`, surface `'stone'`.

## Preview
`/sandbox/props.html?set=nature` (see the props README for all sandbox params).
