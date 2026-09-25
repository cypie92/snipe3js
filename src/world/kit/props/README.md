# Props kit (`src/world/kit/props/`)

Chunky, glossy-toy props for the dioramas: street furniture, yard clutter, market, festive/gameplay
pieces, vehicles and gag/job props. 100% procedural, vertex-coloured, deterministic (`seed`).

```js
import * as K from '../world/kit/props/index.js';
const lamp = K.lampPost({ seed: 3 });
lamp.position.set(4, 0, -12);
ctx.root.add(lamp);
ctx.onUpdate(lamp.userData.update);     // needed for anything animated (safe to call for all props)
```

## Conventions
- **Units / placement**: 1 unit = 1 m, Y up. Every builder returns a `THREE.Group` with its origin at the
  **ground contact point** and its **front facing +Z**. Move/rotate the group; never edit its children.
  Exceptions: `bunting`/`washingLine` take `from`/`to` points in the parent's space - leave those groups
  at the origin.
- **Draw calls**: static parts are merged (geo.js `part()/merge()`); every prop is **≤ 3 draw calls**
  (most are 1-2). Vehicle wheels, balloons, flags, clothes, melons, sign arrows are separate *pivots*
  drawn by one `InstancedPieces` / `LiveMesh` (see Helpers) - you can still move/rotate/hide each pivot.
- **Budgets**: props ≤ 1.5k tris, vehicles ≤ 4k (tables below list actual counts).
- **`group.userData`** on every prop:
  - `parts` - named gameplay sub-objects (pivots with sensible origins; see each builder).
  - `update(dt, t)` - advances animations, wheel spin, flapping, etc. Register it with `ctx.onUpdate`.
  - `wobble(strength = 1)` - springy squash & stretch (a free "fun prop hit" reaction for any prop).
  - `surface` - impact hint: `ctx.surface(obj, obj.userData.surface)` (`wood|metal|stone|soft|glass|grass`).
  - `kind` - builder name. `anims` - the prop's small animation runner (internal).
  - Methods that animate return a `Promise` resolving `true` when done (`false` if interrupted).
- **Colliders**: small or thin targets carry an invisible, enlarged `collider` mesh child (visible=false
  still raycasts). Colliders switch themselves off while any ancestor is hidden, so popped balloons,
  stowed coils or hidden flags never steal shots. Put `userData.hit` on the *part* (pivot), e.g.
  `ctx.job({ targets: [bunting.userData.parts.coil] })` - the parent-chain walk finds it from the collider.
  `LiveMesh` pieces are only hittable through their colliders (the merged mesh ignores rays).
- **Randomness**: layout/variation uses the seeded `Rng`; upright props (lamp posts, signposts, bollards,
  notice boards) get a seeded 1-3° hand-made lean (`tilt: 0` to disable).

## Street furniture
| builder | parts / userData | tris | dc |
|---|---|---|---|
| `lampPost({ seed, height = 4.4, color, arms: 1 \| 2, lit = true, tilt })` | `parts.bulb` (emissive mesh + collider), `parts.post`; `setLit(bool)`, `setFlicker(bool)` (job tell), `lit` | 688 / 1160 (2 arms) | 2 |
| `bench({ seed, length = 1.9, color, wood })` | `parts.bench` | 996 | 1 |
| `bin({ seed, color, overflow = false })` | `parts.lid` (pivot at the back hinge, `rotation.x < 0` opens), `parts.body`; `setOpen(bool)`, `pop()` | 760 / 1100 | 2-3 |
| `bollard({ seed, color, band, tilt })` | - | 288 | 1 |
| `planter({ seed, w = 1.5, d = 0.7, h = 0.55, plant: 'flowers' \| 'shrub' \| 'topiary', color })` | `parts.box`, `parts.plants` (foliage) | 1212 | 2 |
| `signpost({ seed, height = 2.7, arrows: [{ yaw, color, len, textColor }], tilt })` | `parts.arrows[i]` (pivot on the post axis; `rotation.y` = pointing), colliders; `spinArrow(i \| arrow, turns)`, `pointArrow(i \| arrow, yaw)` | 528 | 2 |
| `noticeBoard({ seed, tilt })` | roofed board, pinned notes + LOST CAT poster | 1476 | 1 |
| `bikeRack({ seed, n = 4, color })` | - | 664 | 1 |
| `hydrant({ seed, color })` | `parts.spout` (Object3D at the front nozzle, facing +Z: water FX spawn) | 1004 | 1 |
| `trafficCone({ seed, color })` | - | 260 | 1 |
| `gardenTap({ seed, mount: 'post' \| 'wall', under: 'bucket' \| 'can' \| 'none', dripping = false })` | `parts.handle` (pivot, spins about Y, collider), `parts.spout` (drip spawn point, below the nozzle), `parts.drop`; `setDripping(bool)` (built-in falling droplet tell), `turnHandle(turns = 1)`, `dripping` | 1016 | 2-3 |
| `bicycle({ seed, color, basket = true })` | `parts.wheels` [rear, front], `parts.frame`, `parts.body`; `speed` | 1372 | 2 |
| `picnicTable({ seed, cloth = true, picnic = true })` | gingham cloth, basket, lemonade jug, sandwiches | 1164 | 1 |
| `parasolTable({ seed, colors: [c1, c2], chairs = 2, open = true })` | `parts.parasol` (pivot at pole top), `parts.table`; `setOpen(bool)` folds/unfolds | 1128 | 2 |

`'wall'` garden taps have their back plate at z = 0: stick the group on a wall facing +Z.

## Yard clutter
| builder | notes | tris | dc |
|---|---|---|---|
| `crate({ seed, size = 0.9, kind: 'wood' \| 'ammo', contents: null \| 'apples' \| 'oranges' })` | `kind:'ammo'` = olive supply crate for Ammo Hunt (`userData.kind = 'ammoCrate'`); `contents` = open crate of fruit | 710 / 648 | 1 |
| `barrel({ seed, style: 'wood' \| 'drum', color })` | staved wood barrel with hoops, or painted drum | 500 | 1 |
| `sack({ seed, color, label })` | lumpy tied sack with printed label | 432 | 1 |
| `wheelbarrow({ seed, color, load: 'soil' \| 'pumpkins' \| 'bricks' \| 'none' })` | | 1108 | 1 |
| `ladder({ seed, height = 3.2, lean = 0, color })` | `lean` (rad) tips it back toward -Z (put the wall behind); `parts.ladder` pivot at the feet; `tip()` falls over (gag) | 416 | 1 |

## Market
### `marketStall({ goods: 'fruit' | 'veg' | 'fish' | 'flowers' | 'cakes', awning: [c1, c2], seed, sign = true })`
~2.6 m wide x 3 m tall, customer side = +Z. Striped sloped awning with scalloped valance, scalloped
counter skirt, sign board with an icon, tilted display crates, back shelf and goods on the ground.
parts: `{ stall, goods }` (goods = glossy mesh). 2 draw calls, 1.3-1.5k tris.
```js
const stall = K.marketStall({ goods: 'veg', awning: [P.teal, '#fff8ee'], seed: 2 });
```
### `melonStack({ seed })`
Pyramid of 9 striped watermelons on a pallet. **Every melon is its own pivot** (`parts.melons`, with
colliders) → great fun hits: `userData.knock(melon, dirX = ±1)` tumbles it off onto the ground.
2 draw calls, 1076 tris.
```js
const stack = K.melonStack({ seed: 1 });
for (const m of stack.userData.parts.melons) ctx.prop(m, { onHit: () => stack.userData.knock(m, Math.sign(m.position.x) || 1) });
```

## Festive & gameplay
### `bunting({ from, to, sag = 0.6, colors, spacing = 0.55, flagSize = 0.42, furled = false, seed })`
Catenary rope with pennants that gently wave, hooks at both ends. **1 draw call** (rope, hooks, flags
and coil are all LiveMesh pieces), ~1.1k tris for 6 m.
- `parts.flags[i]` (pivots with colliders), `parts.coil` (the neat furled bundle hanging on the hook at
  `from`, collider r=0.36), `parts.rope`.
- `setFurled(bool, { instant })` → animated: the rope end flies from the hook to `to`, the sag grows,
  flags pop in one by one, then the line settles with a bounce (1.8 s). Furling reverses it (1.1 s).
- `userData.furled` (getter).
```js
const b = K.bunting({ from: [-8, 5.2, -3], to: [6, 5.6, -3], furled: true });
ctx.root.add(b); ctx.onUpdate(b.userData.update);
ctx.job({ id: 'bunting', title: 'Hang the bunting', targets: [b.userData.parts.coil],
  onComplete: () => b.userData.setFurled(false) });
```

### `balloonBunch({ colors, count = 5, seed, height = 2.3, anchor: 'weight' | 'none' })`
Balloons on strings tied to a little sandbag (or to the group origin with `anchor:'none'`, e.g. to put in
a character's hand). Each balloon bobs and sways. 2 draw calls, ~1.3k tris.
- `parts.balloons[i]`: pivot at the balloon's knot (collider around the balloon), `balloon.userData.string`,
  `balloon.userData.color`, `.popped`, `.released`. `parts.strings`, `parts.weight`.
- `popBalloon(balloon)` → Promise: quick over-inflate, vanish, string collapses and dangles. Hook
  `userData.onPop = (balloon) => fx.burst(...)` for confetti/SFX (`balloon.getWorldPosition(v)`).
- `releaseBalloon(balloon)`: floats up and away (hidden after ~12 s). `reset()` restores all.

### `washingLine({ from, to, items, sag = 0.35, posts = true, seed })`
T-posts + line + flapping clothes. `items`: `['shirt','trousers','dress','towel','sock','pants']` or
`[{ type, color }]` (default: a seeded mix). parts: `items[i]` (pivots with colliders, `userData.type`),
`posts`. `dropItem(item)` flutters it down onto the grass. 2 draw calls, ~1.2k tris.

### `flagPole({ color, color2, height = 7, seed, raised = true, windYaw = 0 })`
White pole on a stone plinth, gold finial, waving swallowtail fête banner (`color` field, `color2`
hoist band, gold pixel-heart emblem - deliberately not any real flag). parts: `flag`
(pivot at the hoist top; slides along the pole), `pole`. `setRaised(bool)` glides the flag up/down
(job: "raise the flag"), `raised` getter. 2 draw calls, 584 tris.

### `weathervane({ seed, windYaw = 0, base: 'plinth' | 'none' })`
Gold rooster + arrow over N/E/S/W arms (~1.6 m; put it on a roof). parts: `vane` (spins about Y, drifts
with the wind). `spin(impulse = 8)` for shot reactions. 2 draw calls, 808 tris.

## Vehicles (toy proportions, front = +Z)
Body = 1 glossy mesh inside `parts.body` (a Group that bounces); wheels = `parts.wheels` pivots
(`[FL, FR, RL, RR]`, spin = `rotation.x`) drawn by one InstancedMesh that follows them.
`userData.speed = metres/second` spins the wheels and adds a gentle body bob; `bump(strength)` makes the
body hop on its springs (fun hit / car-alarm gag). Moving the vehicle along a path is the level's job.

| builder | notes | tris | dc |
|---|---|---|---|
| `car({ style: 'hatch' \| 'beetle' \| 'van' \| 'pickup', color, seed, roof: 'none' \| 'rack' \| 'luggage' \| 'surfboard' })` | big round headlights, grille "smile", bumpers, plates; seeded two-tone roof / stripe; pickup carries a hay bale + milk churn | 2.2k-3.5k | 2 |
| `iceCreamVan({ seed, color, trim, roofColor })` | pastel van, giant cone with scoops/flake/cherry on the roof, striped serving hatch (+X side), drip trim. `parts.speaker` (roof loudspeaker pivot + collider); `jingle(bool)` pulses it (tell) | 3454 | 3 |
| `bus({ seed, color })` | double-decker (default tomato), destination board, door on the +X side | 3388 | 2 |
| `tractor({ seed, color })` | big knobbly rear wheels, exhaust, open cab with roof | 3636 | 3 |

```js
const van = K.iceCreamVan();
van.userData.speed = 4;                                  // wheels roll while you move it
ctx.job({ id: 'jingle', title: 'Stop that jingle!', targets: [van.userData.parts.speaker],
  onComplete: () => van.userData.jingle(false) });
van.userData.jingle(true);
```
`wheelGeo(opts)` and `rigWheels(group, body, defs)` are exported for custom vehicles.

## Gag & job props
| builder | parts / userData | tris | dc |
|---|---|---|---|
| `gnome({ seed, pose: 'stand' \| 'fishing' \| 'toadstool' \| 'wave', hat, coat })` | glazed garden gnome ~0.8 m (toadstool ~1.3 m). `parts.hat` (pivot + collider), `parts.body`; `bonk()` hat pops up spinning and lands | 912-1300 | 2 |
| `giantMarrow({ seed })` | 1.7 m prize marrow on straw with a 1st-prize rosette and a sign. `parts.marrow` (pivot, collider; `wobble` rocks it), `parts.straw` | 1080 | 2 |
| `alarmClock({ seed, color, size = 0.55 })` | twin-bell clock. `parts.bell` (bells + hammer pivot, collider), `parts.body`; `ring(bool)` rattles + hops | 1112 | 2 |
| `cameraOnTripod({ seed, color })` | retro camera on a wooden tripod. `parts.camera` (pivot at the tripod head: aim with rotation), `parts.flash`; `flash()`, `aim(yaw, pitch)` | 1020 | 2 (+1 while flashing) |
| `birdseedBag({ seed })` | paper sack with a bird label. `parts.bag` (pivot at the front-bottom edge), `parts.spill` (ground point where seed lands - send pigeons here), `parts.pile`; `spill()` tips it and fans out seed, `reset()` | 634 | 1 (2 spilled) |
| `teapot({ seed, color, size = 0.4 })` | polka-dot china. `parts.lid`, `parts.spout` (FX point); `rattle(bool)` (boiling tell) | 1416 | 2 |
| `fireworkRocket({ seed, colors, onBurst })` | rocket in a sand bucket. `parts.rocket`, `parts.stand`, `parts.particles`; `launch()` → fuse sparks, climb with a smoke/spark trail, star burst at ~21 m (Promise resolves after the burst; `onBurst(worldPos)` / `userData.onBurst` fires at the burst); `reset()`, `launched` | 492 | 2 (3 in flight) |
| `trophy({ seed, metal: 'gold' \| 'silver' \| 'bronze', size = 0.7 })` | two-handled cup with a star on a plinth (shiny `goldMaterial`). `parts.cup`, `parts.plinth` | 884 | 2 |
| `goldenSpanner({ seed, sparkle = true, size = 0.75 })` | **collectible**: chunky shiny gold spanner that spins and bobs, with an occasional star twinkle. `parts.spanner` (pivot + collider), `parts.sparkle`; `collect()` → spins up and vanishes, `collected` | 1116 | 1 (2 twinkling) |

```js
const spanner = K.goldenSpanner({ seed: 2 });
spanner.position.set(-31, 7.4, -12);                      // on a rooftop ledge
ctx.collectible(spanner);                                 // on hit: spanner.userData.collect()
ctx.onUpdate(spanner.userData.update);
```

## Helpers (exported from `index.js`)
- `stats(object)` → `{ tris, calls }` of visible, non-collider meshes.
- `collider(geo, t)`, `boxCollider(w, h, d, t)`, `ballCollider(r, t)` → invisible raycast targets.
- `LiveMesh(material)` - one Mesh drawing many pieces that follow pivot Object3Ds:
  `live.addPiece(pivot, geometry, deform?)`, `group.add(live)`, `live.build()`, then `live.sync(t)` every
  frame. `deform(v, t, piece)` bends vertices in pivot space (cloth/flags).
- `InstancedPieces(geometry, material, pivots, shapes?)` - InstancedMesh following pivots; `sync()`.
- `Anims` / `ease` / `wobble(obj, anims, strength)` - the tiny per-prop animation runner.
- `goldMaterial` - the shared shiny gold used by trophies and the spanner.
- Geometry helpers live in `lib.js` (`bev` 44-tri bevelled box, `puck`, `lathe`, `latheBands`, `rod`,
  `arc`, `slab`, `lettering`, `paint`, `paintFaces`, ...).

## Sandbox
`/sandbox/props.html` shows every asset (nature + props) with labels, using the real renderer/post/lighting.
- `set=nature,street,yard,market,festive,vehicles,gags` - categories; `only=<name>,<name>` - substring filter.
- `stats=1` - triangle / draw-call table (over-budget rows in red); `colliders=1` - show hit colliders.
- `demo=1` - pokes every interactive prop every 2.5 s (unfurl, pop, launch, ring, raise, spill...).
- stage.js params: `cam=close|scope|top|wide`, `dist`, `zoom`, `yaw`, `focus=<index>`, `quality`, `labels=0`.
- Gameplay check: `?cam=scope&dist=80&zoom=4&focus=<index>` (indices are listed in the stats panel and
  logged to the console as `[props] i:name(tris/dc)`; `window.__catalog` has the table).
