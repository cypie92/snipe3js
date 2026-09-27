# Props kit (`src/world/kit/props/`)

Chunky, glossy-toy props for the dioramas: street furniture, yard clutter, market, festive/gameplay
pieces, vehicles, gag/job props and the Barnacle Bay harbour set (boats, dockside, beach).
100% procedural, vertex-coloured, deterministic (`seed`).

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
  still raycasts). Every collider is made by `collider()` / `boxCollider()` / `ballCollider()` and carries
  `userData.collider = true` - Shooting skips invisible meshes without it (`?stats=1` in the sandbox flags
  any that don't; all builders pass). Colliders switch themselves off while any ancestor is hidden, so popped balloons,
  stowed coils or hidden flags never steal shots. Put `userData.hit` on the *part* (pivot), e.g.
  `ctx.job({ targets: [bunting.userData.parts.coil] })` - the parent-chain walk finds it from the collider.
  `LiveMesh` pieces are only hittable through their colliders (the merged mesh ignores rays).
- **Painted words**: real text (stall signs, the lifeguard board...) is painted in Fredoka on the shared
  **sign atlas** (see *Painted signs*): every kit sign shares one material, so a level's static batcher
  draws all the signs in a batch cell with ONE draw call. Pages repaint once `document.fonts` has Fredoka.
- **Randomness**: layout/variation uses the seeded `Rng`; upright props (lamp posts, signposts, bollards,
  notice boards) get a seeded 1-3° hand-made lean (`tilt: 0` to disable).

## Street furniture
| builder | parts / userData | tris | dc |
|---|---|---|---|
| `lampPost({ seed, height = 4.4, color, arms: 1 \| 2, lit = true, tilt })` | `parts.bulb` (emissive mesh + collider), `parts.post`; `setLit(bool)`, `setFlicker(bool)` (job tell), `lit` | 688 / 1160 (2 arms) | 2 |
| `bench({ seed, length = 1.9, color, wood })` | `parts.bench` | 996 | 1 |
| `bin({ seed, color, overflow = false })` | `parts.lid` (pivot at the back hinge, `rotation.x < 0` opens), `parts.body`; `setOpen(bool)`, `pop()` | 760 / 1100 | 2-3 |
| `wheelieBin({ seed, color, lidColor, open = false })` | tall two-wheeled bin for the "man stuck in a bin" gag. `parts.lid` (back hinge), `parts.body`, `parts.mouth` (Object3D at the opening: seat a character there); `setOpen(bool)`, `pop()` | 744 | 2 |
| `bollard({ seed, color, band, tilt })` | - | 288 | 1 |
| `planter({ seed, w = 1.5, d = 0.7, h = 0.55, plant: 'flowers' \| 'shrub' \| 'topiary', color })` | `parts.box`, `parts.plants` (foliage) | 1212 | 2 |
| `signpost({ seed, height = 2.7, arrows: [{ yaw, color, len, textColor, text }], tilt })` | fingerpost with **painted destinations** on both faces of each arrow (`text`; default seeded from BARNACLE BAY, WOBBLETON, PICKLE PARK, NOWHERE, THE FETE...; `''` = blank). `parts.arrows[i]` (pivot on the post axis; `rotation.y` = pointing), colliders; `spinArrow(i \| arrow, turns)`, `pointArrow(i \| arrow, yaw)` - the words turn with the arrows | 216 | 3 |
| `noticeBoard({ seed, tilt })` | roofed board, pinned notes + a big painted **LOST CAT** poster (red LOST, orange cat face) | 1358 | 2 |
| `bikeRack({ seed, n = 4, color })` | - | 664 | 1 |
| `hydrant({ seed, color })` | `parts.spout` (Object3D at the front nozzle, facing +Z: water FX spawn) | 1004 | 1 |
| `trafficCone({ seed, color })` | - | 260 | 1 |
| `gardenTap({ seed, mount: 'post' \| 'wall', under: 'bucket' \| 'can' \| 'none', dripping = false })` | `parts.handle` (pivot, spins about Y, collider), `parts.spout` (drip spawn point, below the nozzle), `parts.drop`, `parts.puddle` (`under:'none'` only); `setDripping(bool)` (built-in falling droplet tell; with `under:'none'` a puddle spreads while dripping and dries up after), `turnHandle(turns = 1)`, `dripping` | 638-1016 | 3 |
| `bicycle({ seed, color, basket = true })` | `parts.wheels` [rear, front], `parts.frame`, `parts.body`; `speed` | 1372 | 2 |
| `picnicTable({ seed, cloth = true, picnic = true })` | gingham cloth, basket, lemonade jug, sandwiches | 1164 | 1 |
| `parasolTable({ seed, colors: [c1, c2], chairs = 2, open = true })` | `parts.parasol` (pivot at pole top), `parts.table`; `setOpen(bool)` folds/unfolds | 1128 | 2 |
| `easel({ seed, painting: 'landscape' \| 'portrait' \| 'abstract' })` | painter's easel with a painting + palette. `parts.canvas` (pivot + collider); `splat(color)` pops a paint splat onto the canvas (fun hit), `clean()` | 556 | 1-2 |

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
### `marketStall({ goods: 'fruit' | 'veg' | 'fish' | 'flowers' | 'cakes', awning: [c1, c2], seed, sign = true, topper = true })`
~2.6 m wide x 3.5 m tall (with its sign), customer side = +Z. Striped sloped awning with scalloped valance,
scalloped counter skirt, tilted display crates, back shelf and goods on the ground, and a **painted sign
board** on top of the awning: a 2.46 x 0.64 m board in the awning colour with a paper panel carrying the
words in big Fredoka letters (ink, with the `&` and a hard drop shadow in the goods' accent colour), plus a
chunky 3D goods mascot on top (`topper`: apple / carrot / fish / flower / cupcake).
- `sign`: `true` = the stall type's words (`STALL_SIGNS`: fruit `FRUIT & VEG`, veg `GARDEN VEG`, fish
  `FRESH FISH`, flowers `FLOWERS`, cakes `CAKES & BAKES`), a string = your own words (case kept, e.g.
  `'Fresh Flowers'`, `'CAKES 20p'`; long text wraps to two lines when that gives bigger letters),
  `false` = no board.
- Legibility: cap height ~0.2 m for 11-13 letters (more for short words) - readable through the 4x scope
  at 50-80 m (checked in the village at 37-75 m).
- parts: `{ stall, goods (glossy mesh), sign (decal mesh on the sign atlas, or null) }`. 3 draw calls
  (2 without a sign), 1.39-1.49k tris. All stall signs share the atlas material: the village's 12 stall
  signs batch into 4 draw calls (one per batch cell), 14 tris each.
```js
const stall = K.marketStall({ goods: 'veg', awning: [P.teal, '#fff8ee'], seed: 2 });
const cakes = K.marketStall({ goods: 'cakes', awning: [P.sunflower, P.bubblegum], sign: 'TEA & CAKES' });
```
### `melonStack({ seed })`
Pyramid of 9 striped watermelons on a pallet. **Every melon is its own pivot** (`parts.melons`, with
colliders) → great fun hits: `userData.knock(melon, dirX = ±1)` tumbles it off onto the ground.
`avalanche()` knocks them all off, top first (the "melon mayhem" secret). 2 draw calls, 1076 tris.
```js
const stack = K.melonStack({ seed: 1 });
for (const m of stack.userData.parts.melons) ctx.prop(m, { onHit: () => stack.userData.knock(m, Math.sign(m.position.x) || 1) });
```

## Festive & gameplay
### `bunting({ from, to, sag = 0.6, colors, spacing = 0.55, flagSize = 0.42, furled = false, seed, coilSize = 1 })`
Catenary rope with pennants that gently wave, hooks at both ends. **1 draw call** (rope, hooks, flags
and coil are all LiveMesh pieces), ~1.36k tris for 6 m.
- `parts.flags[i]` (pivots with colliders), `parts.hooks` [from, to], `parts.rope`.
- `parts.coil`: pivot on the hook at `from`. The furled bunting is a fat **rainbow roll** (~0.8 x 0.5 m, wound
  in the flag colours, pennant tips poking out, rope sling) hanging just along the line from the hook, so it
  clears the wall or post the hook is on. Its collider covers the hook and the roll - use it as the job
  target. **Scale / rotate / hide `parts.coil` freely**: the kit only animates its inner nodes (the roll
  shrinks and spins away as the line pays out). `coilSize` = its starting scale.
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

### `kite({ seed, colors: [c1, c2], stuck = true })`
Smiley diamond kite with a waving bow tail, tangled by its string. **The group origin is the tangled knot**:
put it at the edge of a tree canopy (`tree()` round canopies reach ~3.3 m from the trunk). parts: `knot`
(job target, collider r=0.32), `kite` (pivot + collider), `tail`. `free()` → knot unties, kite floats up
~2.7 m and hovers fluttering (re-parent/move `parts.kite` to hand it to a character); `flyAway()` drifts it
off and hides it; `freed`. 1 draw call, ~510 tris.

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
| `iceCreamVan({ seed, color, trim, roofColor })` | pastel van, giant cone with scoops/flake/cherry on the roof, striped serving hatch (+X side), drip trim. `parts.speaker` (roof loudspeaker pivot + collider); `jingle(bool)` pulses it (tell), `breakSpeaker()` stops it and droops the horn (job reaction) | 3454 | 3 |
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
| `cameraOnTripod({ seed, color })` | retro camera on a wooden tripod. `parts.camera` (pivot at the tripod head: aim with rotation), `parts.flash`, `parts.photo`; `snap()` = flash + a photo pops out and flutters to the ground in front (selfie job reaction), `flash()`, `aim(yaw, pitch)` | 1020 | 2-3 |
| `birdseedBag({ seed, drop = 0 })` | paper sack with a bird label. `parts.bag` (pivot at the front-bottom edge), `parts.spill` (ground point where the seed lands - send pigeons here; move it and the seed follows), `parts.pile`, `parts.seeds`; `spill()` tips the bag and pours seed **from its mouth**, each seed arcing onto the pile in front; `reset()`. `drop` = height of the bag's base above the ground (e.g. `0.51` on a bench seat - put it at the front of the seat): the bag topples off the ledge, flops on the ground and pours there, and `parts.spill` starts on the ground | 634 (+590 spilled) | 1 (3 spilled) |
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

## Barnacle Bay: boats (`boats.js`, `boatlib.js`)
Boats sit with the **waterline at y = 0** (put the group at the water surface, e.g. the buildings kit's
`SEA_LEVEL`), bow = +Z. Floating boats bob: everything is wrapped in `parts.float`, which heaves, rolls and
pitches; `userData.bob` = amplitude (live: 0 = still, 1 = default, 2 = choppy). `wobble()` rocks the boat.
Moving a boat along a path is the level's job.

| builder | parts / userData | tris | dc |
|---|---|---|---|
| `fishingBoat({ seed, color, number, name, bob = 1 })` | ~7 m trawler: wheelhouse, mast + signal pennants, net pile with floats, fish boxes, tyre fenders, 7-segment hull number on both bows, **painted name** on both sides aft (seeded pun: OLD SALTY, REEL LIFE, CODFATHER...; `name: 'X'` / `name: false`). `parts.wheelhouse`, `parts.nets` (foredeck net pile: `snaggedNet.free({ to })` target), `parts.deck` (aft deck) | 2841 | 2 (1 unnamed) |
| `rowboat({ seed, color, bob = 1 })` | clinker rowing boat, seats, oars, a chunky anchor dangling off the bow on a bright orange rope from a brass cleat. `parts.anchorRope` (**job target**, collider r 0.24; target `[anchorRope, anchor]`), `parts.anchor` (collider), `parts.splash` (water point), `parts.seat` (rower / snoozer), `parts.oars` [L, R]; `dropAnchor()` → anchor drops, splashes (`onSplash(worldPos)`), sinks; `anchored`; `rowing = true` sweeps the oars | 1683 | 2 |
| `dinghy({ seed, color, sailColor, bob = 1 })` | sailing dinghy, sail furled on the boom; a bright orange halyard runs down the mast to a fat coil on a brass cleat. `parts.cleat` (**job target**, collider), `parts.sail`, `parts.boom`, `parts.seat`; `hoistSail()` → sail rises and fills, boom swings out; `sailing` | 1489 | 2 |
| `ferry({ seed, color, funnel, smoke = true, name, bob = 1 })` | ~12 m harbour ferry: saloon, sun deck, bridge, striped funnel puffing world-space smoke, **painted name** on both bows (seeded: PUFFIN, SEA BISCUIT...). `parts.funnel`, `parts.smoke` (funnel top), `parts.gangway` (side door); `setSmoking(bool)`, `toot()` (big puffs, the whole ferry shudders: pair it with the foghorn) | 3665 | 3 |
| `cargoBoat({ seed, color, name, bob = 1 })` | ~14 m coaster with stacked containers, **painted name** on both bows (seeded: BIG BERTHA, SLOW BOAT...). `parts.deck` (open hatch: where the crane lands its crate), `parts.bridge` | 2879 | 2 (1 unnamed) |
| `wreckedGalleon({ seed, list = 0.24, coinFloor })` | ~12 m pirate galleon aground on rocks (does not bob): listing planked hull, castles, snapped mast, tattered fluttering sails, flag, a hole in the starboard (+X) side with a **treasure chest** wedged in it over a rock ledge. `parts.lock` (**secret job target**, collider r 0.32), `parts.chest`, `parts.lid`, `parts.coins`, `parts.ship`; `openChest()` → lock pops, lid flips, 44 gold coins spill: most land on the rocks, strays plop into the sea and sink (`coinFloor` = flat landing height instead) (`onOpen(worldPos)`); `opened` | 5161 | 2 (3 with coins) |

Hulls are hit through their own meshes (no enclosing box collider), so crew and passengers aboard stay
shootable; only the small job targets carry enlarged colliders.
Helpers: `hull(opts)` (parametric toy hull, returns `{ geo, widthAt, gunwaleAt, zAt, deckY, draftAt }`),
`floatRig(group, { bob, heave, roll, pitch })` (bobbing for anything that floats; animate
`node.userData.kick = { heave, roll, pitch }` for extra bumps - `wobble()` and `toot()` use it),
`digits(str, h, color)` (chunky 7-segment numerals), `hullName(h, text, { at: 'sides' | 'transom', z0, z1, y,
height, paper, ink })` (painted name on strips bent to the hull, 1 draw call).

## Barnacle Bay: dockside (`harbour.js`)
Origin = quay ground (buoys: waterline), front = +Z.

| builder | parts / userData | tris | dc |
|---|---|---|---|
| `dockCrane({ seed, color, jibAngle = 0.56, cable = 5.5 })` | portal crane on rail bogies: slewing house with cab + counterweight, lattice jib (tip ≈ (0, 11.6, 11.6)), cable, hook block, **dangling crate**. `parts.brake` (**job target**: red brake gear on the house side, collider r 0.95), `parts.tip` (jib tip: golden spanner spot), `parts.crate`, `parts.hook`, `parts.cab` (slew pivot), `parts.jib`, `parts.cable`; `jammed` (default true: crate swings, gear judders), `lowerCrate({ toY = 1.2 })` → brake spins, cable pays out until the crate bottom is at `toY` (group space), `release()` (leaves the crate, hook rises), `slew(yaw)` | 4288 | 3 |
| `foghorn({ seed, color })` | brass horn on a riveted compressor box with a painted **PULL!** plate (a hint). `parts.cord` (**job target**: chunky cord + red T handle, collider), `parts.horn`, `parts.mouth`, `parts.plate`; `blast(duration = 1.6)` → cord yanks, horn shudders, sound rings burst out (`onBlast(worldPos)`) | 1358 | 3 |
| `bellBuoy({ seed, color, bob = 1 })` | striped float, braced cage, bell + clapper, lamp; bobs and rolls a lot (**moving target**). `parts.bell` (collider r 0.6), `parts.float`; `ring()` → big swing + clapper hits (`onRing(worldPos)`) | 780 | 2 |
| `buoy({ seed, kind: 'mooring' \| 'can' \| 'cone' \| 'pot', color, bob = 1 })` | basin dressing, bobbing: fat mooring float with pick-up ring, red can / green cone channel markers with top marks, lobster-pot marker float on a flag stick | 122-316 | 1 |
| `lobsterPot({ seed })` | D-shaped creel with netting, entrance ring, rope + float. `parts.inside` (stash a golden spanner or a crab) | 648 | 1 |
| `fishBox({ seed, propped = true })` | fish on ice; lid hinged at the back, propped open by a fat yellow stick (the pelican's buffet). `parts.stick` (**job target**, collider r 0.2), `parts.lid`; `slamLid()` → stick kicks out, lid slams with a bounce; `prop()` re-props it; `propped` | 666 | 2 |
| `netPile({ seed })` | heap of folded net with a cork line of floats and a trailing rope | 916 | 1 |
| `snaggedNet({ seed })` | net snagged on an iron bollard, draped over the quay edge (+Z) and swaying. `parts.knot` (**job target**, collider r 0.45), `parts.net`, `parts.bollard`; `free({ to })` → knot unties, net slides off and flops toward `to` (default (0, -1.3, 2.6): into a boat below); `freed` | 1260 | 2 |
| `mooringBollard({ seed, color, rope = false })` | cast-iron bollard (also `bollard({ style: 'mooring' })`), optional rope loop | 540 | 1 |
| `ropeCoil({ seed, color })` | flat coil of thick rope with a loose end | 1000 | 1 |
| `lifebuoy({ seed, mount: 'post' \| 'wall' \| 'none' })` | ring buoy on a post, a wall board with a painted LIFEBUOY label (back at z 0) or lying flat. `parts.ring` (collider) | 366-440 | 1-3 |
| `anchorProp({ seed, color })` | big display anchor with a draped chain | 852 | 1 |

## Barnacle Bay: beach (`beach.js`)
Origin = sand contact point, front = +Z.

| builder | parts / userData | tris | dc |
|---|---|---|---|
| `deckchair({ seed, colors })` | striped canvas deckchair. `parts.seat` (in the sling; `userData.seat` = its height for the characters' deckchair pose), `parts.chair` (pivot at its middle); `collapse()` (fun hit: tips back and folds flat), `tumbling = true` (cartwheels end over end with hops: move the group along ±Z for the runaway deckchair), `reset()` | 492 | 1 |
| `windbreak({ seed, colors, panels = 4 })` | striped canvas panels between poles, fluttering. `parts.panels` | 568 | 2 |
| `sandcastle({ seed })` | bucket towers, walls, keep, wet moat, shells, starfish, paper flag. `parts.flag`, `parts.castle`; `crumble()` (fun hit: slumps, flag pops off), `reset()` | 1348 | 2 |
| `beachBall({ seed, size = 0.36, bob = 0 })` | six-gore glossy ball. `parts.ball` (pivot + collider); `bounce(height)`, `toss(to, { height, duration, world })` → arcs to a point then bounces (seals playing catch); `bob > 0` floats it | 428 | 1 |
| `lifeguardChair({ seed, text = 'LIFEGUARD' })` | tall white tower: ladder, parasol, red flag, lifebuoy, **painted sign**. `parts.seat` (sit the lifeguard here), `parts.sign` | 944 | 2 |
| `bucketSpade({ seed, color })` | toy bucket, spade and a turned-out turret | 488 | 1 |
| `surfboard({ seed, color, stand = true, bob = 0 })` | board stuck upright in the sand, or flat (`stand: false`); with `bob` a flat board floats (the dog's paddleboard). `parts.board`, `parts.deck` (stand a dog / character on it) | 210-226 | 1-2 |
| `crab({ seed, color })` | chunky decor crab (the animated ones live in the characters kit) | 664 | 1 |
| `beachTowel({ seed, colors, w = 0.9, l = 1.8 })` | rumpled striped towel with a rolled pillow end; `userData.lie` = height for a sunbather | 204 | 1 |
| `beachParasol({ seed, colors, tilt = 0.2 })` | striped umbrella planted in the sand, leaning. `parts.canopy`; `spin(impulse)` (fun hit) | 182 | 2 |

## Barnacle Bay job hooks (docs/levels/barnacle-bay.md)
| job | build | target | on complete |
|---|---|---|---|
| `pelican` | `fishBox()` | `parts.stick` | `slamLid()` |
| `crane` | `dockCrane()` beside `cargoBoat()` | `parts.brake` | `lowerCrate({ toY: <cargo deck y in crane space> })`, then `release()` |
| `foghorn` | `foghorn()` on the ferry pier + `ferry()` | `parts.cord` | `blast()`, `ferry.userData.toot()`, then move the ferry off |
| `buoy` | `bellBuoy({ bob: 1.5 })` | `parts.bell` (moving) | `ring()` |
| `nets` | `snaggedNet()` on the quay edge + `fishingBoat()` below | `parts.knot` | `free({ to: <boat parts.nets in net space> })` |
| `sail` | `dinghy()` | `parts.cleat` | `hoistSail()`, then move the dinghy off |
| `anchor` | `rowboat()` drifting (+ a snoozer on `parts.seat`) | `parts.anchorRope` | `dropAnchor()`; stop moving it |
| `treasure` (secret) | `wreckedGalleon()` on the rocks | `parts.lock` | `openChest()` |
| `seal` (secret) | `beachBall()` on the rocks | `parts.ball` | `toss(<seal>)` back and forth |
| spanners | `goldenSpanner()` on `dockCrane().parts.tip`, in `lobsterPot().parts.inside` | the spanner | `collect()` |
Gags: `deckchair()` with `tumbling = true` for the runaway deckchair; `surfboard({ stand: false, bob: 1 })`
for the dog's paddleboard; `sandcastle().crumble()` / `deckchair().collapse()` / `beachParasol().spin()`
as fun hits.

## Puddleby Green job hooks (docs/levels/puddleby-green.md)
| job | build | target (`ctx.job({ targets })`) | tell | on complete |
|---|---|---|---|---|
| `bunting` | `bunting({ from, to, furled: true })` (scale `parts.coil` up if it must read from far away) | `parts.coil` | rainbow roll on the hook | `setFurled(false)` |
| `pigeons` | `birdseedBag({ drop: 0.51 })` at the front of Mrs Crumb's bench seat | `parts.bag` | (characters) | `spill()`; flock to `parts.spill` |
| `icecream` | `iceCreamVan()` + `jingle(true)` | `parts.speaker` | pulsing horn (+ audio) | `breakSpeaker()` |
| `postman` | `alarmClock()` on the bench | `parts.bell` or the clock | (Zzz from characters) | `ring(true)`, stop later with `ring(false)` |
| `kite` | `kite()` knot at the oak canopy edge | `parts.knot` | kite flapping | `free()` |
| `selfie` | `cameraOnTripod()` | `parts.camera` | tourists posing | `snap()` |
| `tap` | `gardenTap({ mount: 'wall', under: 'none', dripping: true })` | `parts.handle` | droplet + puddle | `turnHandle(1)` then `setDripping(false)` |
| `vane` (secret) | `weathervane()` | `parts.vane` | - | `spin(14)` |
| `melons` (secret) | `melonStack()` beside the fruit stall | any melon | - | `avalanche()` |
| spanners | `goldenSpanner()` x3 | the group | twinkle | `collect()` |
Gags: `wheelieBin({ open: true })` + a character at `parts.mouth`; `easel()` for the painter (`splat()` on a
fun hit); `gnome({ pose: 'fishing' })` on a roof; `giantMarrow()` at the fête; `balloonBunch()` at a stall.

## Painted signs (`signs.js`, exported from `index.js`)
Real words in the **Fredoka** toy font, painted on canvas. Every sign paints into a slot of a shared
**sign atlas** (1024 px pages, shelf-packed), so all kit signs share ONE `MeshStandardMaterial` per page
(`kit-signs`, satin like `materials.toy`, polygon-offset so it sits on its board): the static batcher
merges every sign in a batch cell into one draw call. Pages repaint once `document.fonts` has loaded
Fredoka (pages import `@fontsource/fredoka`; the game's `main.js` does). Without a DOM (Node stats) decals
get a plain paper material.
- `wordSign(text, w, h, { paper, ink, accent, keyline = 1, bounce = 1, twoLines = true, pad, px = 512, round })`
  → a `w` x `h` m decal mesh facing +Z (put it 4 mm in front of its board): paper panel, thin ink keyline,
  the words fitted as big as they go (one line, or two balanced lines if that is bigger), each letter with
  a tiny seeded tilt / bounce (hand-painted look), `accent` for `&` / `!` and a hard drop shadow. Same
  text + options → same atlas slot.
- `signDecal(key, w, h, draw(ctx, pw, ph), { px, round, bleed })` → decal with your own canvas painting.
- `paintBoard(ctx, w, h, text, opts)` / `fitWords(ctx, text, x, y, maxW, maxH, opts)` → the painters.
- `whenFontsReady()`, `SIGN_FONT`, `signPages()` (debug: the atlas canvases).
- Size for legibility: at 4x the scope shows ~41 px per metre at 80 m, ~65 px/m at 50 m; aim for a cap
  height >= 0.2 m (font size ~0.28 m) for words that must read at 80 m.
```js
const board = K.wordSign('CHIPS', 1.6, 0.5, { paper: P.sunflower, accent: P.tomato });
board.position.set(0, 2.4, 0.06);
shop.add(board);
```

## Helpers (exported from `index.js`)
- `stats(object)` → `{ tris, calls }` of visible, non-collider meshes.
- `collider(geo, t)`, `boxCollider(w, h, d, t)`, `ballCollider(r, t)` → invisible raycast targets.
- `LiveMesh(material)` - one Mesh drawing many pieces that follow pivot Object3Ds:
  `live.addPiece(pivot, geometry, deform?)`, `group.add(live)`, `live.build()`, then `live.sync(t)` every
  frame. `deform(v, t, piece)` bends vertices in pivot space (cloth/flags). Pieces may carry UVs (a
  `LiveMesh` with a sign-atlas material draws moving painted words, e.g. the signpost arrows).
- `InstancedPieces(geometry, material, pivots, shapes?)` - InstancedMesh following pivots; `sync()`.
- `Anims` / `ease` / `wobble(obj, anims, strength)` - the tiny per-prop animation runner.
- `goldMaterial` - the shared shiny gold used by trophies and the spanner.
- Geometry helpers live in `lib.js` (`bev` 44-tri bevelled box, `puck`, `lathe`, `latheBands`, `rod`,
  `arc`, `slab`, `lettering`, `paint`, `paintFaces`, ...).

## Sandbox
`/sandbox/props.html` shows every asset (nature + props) with labels, using the real renderer/post/lighting.
- `set=nature,street,yard,market,festive,vehicles,gags,boats,dockside,beach` - categories (`set=harbour` =
  boats + dockside + beach); `only=<name>,<name>` - substring filter.
- `stats=1` - triangle / draw-call / collider table (red = over budget: props 1.5k, vehicles + boats 4k,
  galleon + crane 8k, > 3 draw calls, or a collider without `userData.collider`); `colliders=1` - show hit
  colliders; `atlas=1` - overlay the sign atlas page(s).
- `demo=1` - pokes every interactive prop every 2.5 s (unfurl, pop, launch, ring, raise, spill, snap, splat,
  drop anchor, hoist sail, open chest, lower crate, blast, slam lid, bounce, toot, crumble, collapse...).
- `gap=<m>` spacing between items, `row=<m>` max row width (layout wraps per category).
- stage.js params: `cam=close|scope|top|wide`, `dist`, `zoom`, `yaw`, `focus=<index>`, `quality`, `labels=0`.
- Gameplay check: `?cam=scope&dist=80&zoom=4&focus=<index>` (indices are listed in the stats panel and
  logged to the console as `[props] i:name(tris/dc)`; `window.__catalog` has the table).
