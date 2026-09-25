# Buildings kit (`src/world/kit/buildings/`)

Procedural, seeded, toy-like architecture for *Jack of All Blasts*: houses, terraces, shops, the pub,
the church, the fountain, small street furniture, ground/layout pieces and the backdrop beyond the
diorama. Everything is 100 % code (vertex colours + a few painted CanvasTextures).

```js
import * as B from '../world/kit/buildings/index.js';

const h = B.house({ seed: 12, floors: 2, roofStyle: 'gable' });
h.position.set(-20, 0, -30);
ctx.root.add(h);
```

Preview everything: `/sandbox/buildings.html` (`?set=village|houses|shops|civic|small|ground|backdrop`,
plus the usual stage params `cam=close|scope|wide|top&focus=<i>&dist=&zoom=&yaw=`; item indices are
logged to the console and exposed as `window.__info`).

## Conventions (all builders)

- **Returns a `THREE.Group`.** Origin = footprint centre **at ground level (y = 0)**, **front faces +Z**
  (rotate the group to face the perch). 1 unit = 1 m.
- **Deterministic:** every random choice comes from `seed` (number or string). Same seed = same building.
  Explicit options always win over seeded choices.
- **Static geometry is merged** per material: `materials.toy` (vertex colours), `materials.glossy`
  (window glass, gold bits), `materials.foliage` (hedges), plus one textured decal material where text is
  painted (house numbers, sign boards, clock face, stained glass). Houses are 3 draw calls (4 with a gnome).
- **Gameplay sub-objects are separate, named `Object3D`s** with sensible pivots, listed in
  `group.userData.parts`. Tiny targets (pub bolt, valve, bell, bucket) have an enlarged invisible
  `collider` child (raycastable, `visible = false`).
- **Anchors** (empty `Object3D`s) mark useful spots: `door` (in front of the step), `windows[]`
  (pane centres, +Z out of the wall), `chimneyTops[]` (smoke spawn points), `ridge` (roof top) ...
- **Animated builders** expose `group.userData.update(dt, t)`; call it every frame (e.g. `ctx.onUpdate`).
- `group.userData.kind` names the builder; `group.userData.size` gives rough `{ width, depth, height }`.
- Canvas text uses the font stack `Fredoka, "Arial Rounded MT Bold", sans-serif` and redraws itself once
  web fonts finish loading. Load Fredoka 600/700 somewhere (the UI does; the sandbox imports
  `@fontsource/fredoka/700.css`).
- `B.stats(object)` -> `{ draws, tris }` for budgeting.

---

## `house(opts)` - cottages & townhouses

| option | default (seeded) | notes |
|---|---|---|
| `seed` | `1` | |
| `width`, `depth` | 5.4-7.4, 5.2-6.4 | metres |
| `floors` | 1-3 (mostly 2) | ground floor 2.9 m, upper 2.7 m |
| `wall` | palette walls (brick style -> brick reds) | hex |
| `roof` | palette roofs | hex |
| `roofStyle` | `'gable'`/`'hip'`/`'mansard'` | |
| `gableFront` | 35 % of gables | gable end faces the street, attic window in the gable |
| `pitch` | 40-48 | degrees |
| `style` | `'plain'`/`'quoins'`/`'tudor'`/`'brick'` | tudor = jettied upper floor with timbers |
| `door`, `doorStyle` | accent colour, `'panel'`/`'roundtop'`/`'stable'` | |
| `porch` | `'none'`/`'hood'`/`'gable'`/`'porch'` | canopy over the door |
| `windowStyle` | `'sash'`/`'roundtop'`/`'shuttered'` | `shutter` colour |
| `windowBoxes`, `flowers` | 65 %, 2 accents | flower boxes under windows |
| `chimneys` | 1-2 | chimney pots give `parts.chimneyTops` |
| `drainpipes`, `gutters`, `doorstep` | `true` | |
| `number` | 1-48 | painted plaque by the door (readable at 8x / 90 m) |
| `bay`, `climber`, `brickPatch`, `pots`, `dormers` | seeded | bay window, climbing rose, exposed-brick gag, door topiary, dormers |
| `gag` | `'none'` (60 %), `'gnome'`, `'birdhouse'` | the gnome is a separate object (`parts.gnome`) |
| `wonk` | `1` | scales the hand-made lean / sag / jitter (0 = straight) |
| `lean`, `sag` | seeded | explicit shear (x per metre of height) and ridge sag (m) |
| `budget` | `5000` | triangle cap: optional extras you did not request are dropped to fit |

`parts`: `chimneyTops[]`, `windows[]`, `door`, `ridge`, `number`, `gnome?`.

```js
const h = B.house({ seed: 'mrs-pebble', floors: 2, roofStyle: 'gable', gag: 'gnome', number: 7 });
for (const top of h.userData.parts.chimneyTops) fx.smoke(top.getWorldPosition(new THREE.Vector3()));
ctx.job({ id: 'gnome', title: 'Gnome on the roof!', targets: [h.userData.parts.gnome] });
```

## `terrace(count, opts)` - a row of joined houses

Shared party walls/chimneys, stepped roof heights, varied colours. One merged Group (3-4 draw calls).
Options: `seed`, `depth`, `floors` (number or `[min, max]`, default `[2, 3]`), `widths` (`[min, max]`),
`width` (number or per-house array), `walls` (palette list), `roof` (shared colour; default varies),
`roofStyle` (`'gable'` | `'mixed'`), `style`, `startNumber`, `numberStep` (2 = odd/even side), `house`
(extra `house()` options for all). `parts`: `houses[]` (each with its own anchors, `x`, `width`),
`chimneyTops[]`, `windows[]`, `doors[]`.

```js
const row = B.terrace(5, { seed: 3, startNumber: 1, numberStep: 2 });
```

## `shop(opts)` - shopfronts

House body + projecting painted shopfront: pilasters, display window with goods on shelves, glazed
door with an OPEN sign, A-board, striped scalloped awning, painted fascia sign (CanvasTexture).
`kind`: `bakery`, `fishchips`, `post`, `hardware`, `grocer`, `sweets`, `florist`, `cafe`, `butcher`
(`B.SHOP_KINDS` has the colours/goods). Other options: `text` (sign text override), `sub` (small
second line), `width`, `depth`, `floors`, `wall`, `roof`, `roofStyle`, `front` (paint), `awning`
(`[a, b]` colours or `false`), `awningObject` (true -> awning is `parts.awning`, hinged at the wall:
rotate `.rotation.x` to roll it up), `seed`. 4 draw calls.

`parts`: `door`, `sign`, `displayWindow`, `awning?`, plus the house anchors (`windows`, `chimneyTops`, `ridge`).

```js
const chippy = B.shop({ kind: 'fishchips', text: 'FISH & CHIPS', floors: 3, seed: 4 });
```

## `pub(opts)` - The Wonky Pint

Tudor pub with a gold-lettered fascia, bay windows, lanterns, hanging baskets, barrels, chalk board,
picnic tables with parasols and a **hanging sign** on a post (board faces +Z so it reads from the perch).

Options: `name` (`'The Wonky Pint'`), `seed`, `crooked` (hang by one chain, ~35 deg), `tiltDeg`,
`width` (10.2), `depth` (7), `color` (frontage paint), `roof`, `tables` (2), `signMount`
(`'post'` default | `'wall'` traditional bracket, edge-on to the street), `signSide` (-1 | 1), `lean`, `sag`.

`parts`: `signPivot` (Object3D at the outer chain's hinge; `.rotation.z` swings/tilts the board),
`sign` (board + chain), `looseChain`, `bolt` (loose bolt on the arm, enlarged collider), `tables[]`,
`door`, `windows[]`, `chimneyTops[]`, `ridge`.
`userData`: `update(dt, t)` (spring + breeze), `setCrooked(bool)`, `fixSign()`, `isCrooked()`.

```js
const pub = B.pub({ crooked: true });
ctx.root.add(pub);
ctx.onUpdate(pub.userData.update);
ctx.job({ id: 'sign', title: 'Fix the pub sign', targets: [pub.userData.parts.bolt],
  onComplete: () => pub.userData.fixSign() });   // swings back level with a springy wobble
```

## `church(opts)` - church + bell tower

Nave with buttresses and stained glass, side porch, rose window, west tower with clock, open belfry,
battlements, pinnacles, octagonal spire, weathervane, a few friendly headstones.
Options: `seed`, `stone`, `roof`, `spire` (true), `time` (seconds since midnight, default 10:08),
`clockRate` (1 = real time; e.g. 600 for a broken racing clock), `graves` (6), `bellColor`. ~10k tris.

`parts`: `bell` (pivot at the headstock axle; swing = `.rotation.z`), `clock` (dial group, faces +Z),
`hourHand`, `minuteHand` (pivot at dial centre, clockwise = negative `.rotation.z`), `weathervane`
(rotor, spins about Y), `door`, `belfry`, `spireTop`.
`userData`: `update(dt, t)`, `ringBell(strength = 1)` (damped pendulum), `clock` (`{ time, rate }`, mutable),
`bell` (`{ angle, vel }`).

```js
const ch = B.church({ clockRate: 0 });            // stopped clock job
ctx.job({ id: 'bell', targets: [ch.userData.parts.bell], onComplete: () => ch.userData.ringBell(1.2) });
```

## `fountain(opts)` - tiered village fountain

Round basin, two bowls, a spouting fish finial, four rim frogs, lily pads, a rubber duck and a red
valve standpipe. Animated water surfaces (custom shader) and translucent streams.
**Default: dry** - murky still water, lily pads, a sad drip from the top bowl.
Options: `seed`, `radius` (3.4), `stone`, `flowing` (false), `frogs` (4), `fishColor`, `valveColor`,
`valveSide` (1 | -1), `lilies`, `duck`.

`parts`: `valve` (hand-wheel, pivot at hub, spins about local Z, faces +Z, enlarged collider),
`spout` (fish mouth anchor), `frogs[]` (mouth anchors), `water`, `jets`, `droplets`, `drip`, `duck`.
`userData`: `setFlowing(bool)` (streams grow from their spouts, water rises & brightens, the wheel
spins, droplets fly), `isFlowing()`, `update(dt, t)`.

```js
const f = B.fountain();
ctx.job({ id: 'fountain', targets: [f.userData.parts.valve], onComplete: () => f.userData.setFlowing(true) });
```

## Small architecture

| builder | notes | parts / userData |
|---|---|---|
| `phoneBox({ color })` | red kiosk, glazed panels, TELEPHONE lightboxes | `top`, `door`; `ring(secs)` rattles it, `update` |
| `postBox({ color })` | chunky pillar box with slot, plate, cipher | `slot` |
| `busStop({ color, side, label })` | glass shelter, bench, timetable, pole + BUS roundel | `bench`, `sign` |
| `bandstand({ radius, color, stripe })` | octagonal platform, balustrade, candy-striped roof, flag | `stage`, `finial` |
| `wellHouse({ stone, roof, bucketUp })` | wishing well with roof, crank, rope and bucket | `crank`, `bucket`, `rope`; `setBucket(0..1)`, `update` |

## Ground & layout

Paths are arrays of `[x, z]` (or `[x, y, z]` / `Vector3`) in the group's local space.

- `cobbleSquare({ width = 30, depth = 30, radius = 4, seed, color, kerbColor, kerbWidth, tile = 4 })` -
  rounded-rectangle plaza (width = depth = 2*radius -> circle) with a seamless low-contrast painted cobble
  texture (4 m tile) and a chunky kerb. Surface at `userData.surfaceY` (0.1 m). 2 draw calls.
- `road({ points, width = 6.5, closed, smooth = true, kerbs = true, dashes = true, edgeLines, color, lineColor })` -
  CatmullRom ribbon with kerbs and dashed centre line (1 draw call). `userData.path`, `surfaceY` (0.07).
- `pavement({ points, width = 2.2, kerbSide: 1 | -1 | 0, closed, color })` along a path, or
  `pavement({ width, depth })` as a rectangle. Raised 0.15 m, paving-slab colour variation. 1 draw call.
- `lowWall(points, { height = 0.9, thick = 0.45, style: 'stone' | 'brick', color, capColor, closed, round })`
  (`round: true` = pillowy rounded stones, ~4x the triangles; use for hero close-ups only)
- `picketFence(points, { height = 1.0, color, postColor, spacing = 0.17, closed })` - wonky pickets.
- `hedgeRow(points, { height = 1.2, width = 1.0, color, flowers = 0.25, flowerColor, closed })` - clipped,
  faceted hedge (`materials.foliage`).

```js
ctx.root.add(B.cobbleSquare({ width: 36, depth: 24, radius: 6 }));
ctx.root.add(B.road({ points: [[-90, 23], [0, 24], [90, 25]], width: 7 }));
ctx.root.add(B.pavement({ points: [[-90, 17.6], [0, 18.6], [90, 19.6]], width: 3, kerbSide: 1 }));
```

## `backdrop({ radius = 800, inner = 105, seed = 7, ... })` - the world beyond the diorama

A ring of rolling faceted hills from `inner` to `radius` with patchwork fields (per-facet colours),
hedgerows (instanced bushes laid along the field borders), woods and lone trees (instanced), hamlets,
a far church spire, a windmill with turning sails on a hill, and a glint of sea through a valley.
~7 draw calls, ~120k triangles, nothing casts shadows, built in ~0.3 s.
The terrain starts 0.6 m below y = 0 at `inner` and rises within ~35 m, so it tucks under a level's own
flat ground. Angles are measured from -Z (the perch's forward view) toward +X, in radians.

Options: `seaAngle` (0.62), `seaHalf` (0.26), `coast` (distance, `inner + 145`), `sea` (true),
`windmillAngle` (-0.62), `windmillDist` (310), `windmillScale` (1.45), `spireAngle` (0.22),
`spireDist` (500), `fieldSize` (62), `hedgeRange` (500), `loneTrees` (90), `hamlets` (`[[angle, dist, count], ...]`).

`userData`: `heightAt(x, z)` (terrain height), `update(dt, t)` (sails + sea sparkle),
`parts`: `terrain`, `windmillSails`, `windmill` (Vector3), `spire` (Vector3).

## Building blocks (for bespoke architecture)

`Kit` (part accumulator with a transform stack: `kit.add(geo, colour, t, material)`, `kit.at(t, fn)`,
`kit.anchor(name, t)`, `kit.warp(fn)`, `kit.build(group)`), `cbox` (44-triangle chamfered box with rounded
normals), `frustum`, `ngonFrustum`, `prism`, `extrude`, `lathe`, `sweep`, facade parts (`addWindow`,
`addDoor`, `addChimney`, `addDormer`, `addWindowBox`, `addDrainpipe`, `addGutter`, `addQuoins`,
`addTimbers`, `addClimber`, `addHangingBasket`, `addBrickPatch`), roofs (`gableRoof`, `hipRoof`,
`mansardRoof`, `ngonRoof`), painted materials (`signMaterial`, `labelMaterial`, `roundelMaterial`,
`clockFaceMaterial`, `stainedGlassMaterial`, `numberPlate`). Facade functions work in the kit's current
frame: wall plane z = 0, +Z out of the wall, origin at the element's bottom centre.

```js
const kit = new B.Kit('kiosk');
kit.add(B.cbox(2, 2.4, 2, 0.12), '#ffc9a3', { y: 1.2 });
kit.at({ z: 1 }, () => B.addWindow(kit, { w: 1, h: 1, style: 'roundtop', trim: '#fff8ee' }));
const kiosk = kit.build();
```

## Budgets (measured with `B.stats`)

| asset | draw calls | triangles |
|---|---|---|
| house | 3 (4 with a gnome) | <= 5,000 guaranteed (300-seed sweep: median ~4,000, max 4,936) |
| terrace(4) / terrace(5) | 3-4 | ~14,000 / ~18,700 |
| shop | 4 (5 with `awningObject`) | 4,300-7,300 |
| pub | 8 (static 3 + sign 3 + loose chain + bolt) | ~9,000 |
| church | 10 (static 4 + bell 2 + clock 2 + hands + vane) | ~10,100 |
| fountain | 7 dry / 8 flowing (surfaces, streams, droplets, valve, duck, drip) | ~8,000 / ~9,200 |
| phone box / post box / bus stop | 3 / 2 / 3 | ~1,000 / 600 / 900 |
| bandstand / wishing well | 2 / 4 | ~3,000 / 1,900 |
| cobble square | 2 | ~800 |
| road / pavement | 1 / 1 | ~70 / ~55 per metre |
| lowWall / picketFence / hedgeRow | 1 each | ~52 (190 round) / ~45 / ~30 per metre |
| backdrop | 7 | ~118,000 |
| the whole sandbox village (24 items incl. backdrop) | 83 | ~217,000 |

## Integration notes

- **Shared, cached materials:** sign, digit, label, clock, stained-glass, cobble and pub-atlas materials
  are cached module-wide and shared between buildings. When unloading a level dispose geometries, not
  these materials (or dispose them once, globally).
- **Lighting:** the current presets put the sun behind the diorama (toward -Z), so facades facing the
  perch (+Z) are in soft shade. Colours were tuned to stay bright in shade; a sun from the perch side
  would make fronts pop even more.
- **Hittables:** attach `userData.hit` to the part you want (`pub.userData.parts.bolt`,
  `fountain.userData.parts.valve`, `church.userData.parts.bell`...); their `collider` children make
  them easy to hit at 90 m.
- **Smoke / birds / characters:** use the anchors (`chimneyTops`, `ridge`, `door`, `windows`,
  `bench`, `stage`, `tables`) rather than hard-coded offsets; they include the house's lean.
