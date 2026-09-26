# Characters — bean folk, animals & controllers

Chunky "plasticine toy" villagers and animals, 100% procedural. Every character is **one
`SkinnedMesh`** (vertex colours, one shared character material) animated by procedural poses, so a
person costs **1 draw call** (+1 in the shadow-map pass, +1 for its blob shadow unless batched, +1 per
held prop). Geometry is cached per look and shared; each instance only owns a small skeleton.

```js
import { Person, Walker, Crowd, PigeonFlock, GullFlock, Pelican, Seal, SealCatch, Crab, ANIMALS,
         onCharacterEvent, setCharacterLook, setCharacterScale } from '../world/characters/index.js';
```

Units: metres, Y up, every character's `root` has its feet at y = 0 and faces **+Z**.
All randomness is seeded (`src/core/rng.js`), so layouts and looks are reproducible.

## Person

```js
const p = new Person({ seed: 42 });                       // random villager from a seed
const q = Person.random(rng, { theme: 'harbour' });       // next villager from an Rng (theme: 'beach' | 'harbour')
const chef = Person.preset('chef', { seed: 7 });          // named preset
const r = new Person({ seed: 3, hat: 'bowler', hair: 'quiff', top: { type: 'suit', color: '#3d4a6b' },
                       bottom: 'trousers', accessory: 'newspaper', glasses: 'round', facial: 'moustache' });
scene.add(p.root);
p.root.position.set(4, 0, -2);
p.setAction('talk');            // cross-fades (0.3 s default): p.setAction(name, opts, fadeSeconds)
p.perform('cheer', 2);          // play an action for 2 s, then go back to what it was doing (keeps its options)
p.lookAt(camera.position);      // head (+ body if needed) turns to a Vector3 / Object3D; lookAt(obj, 3) = for 3 s
p.update(dt, t);                // every frame (drives its Walker too, if any)
const secs = p.react(hit);      // bad hit: hat pops off & tumbles, jump + spin, "!?", fist shaken AT THE SHOOTER
p.celebrate();                  // happy double hop, arms up, heart
p.tell('?');                    // pop a tell sticker now ('!' '?' '!?' '♪' 'z' 'heart' 'anger')
p.setTell('!', { every: 6 });   // ...or repeat one until setTell(null) (a job owner asking for help)
```

Any config field can be pinned; everything else comes from the seed.

| option | values |
|---|---|
| `seed` | number or string |
| `preset` | `postman chef vicar bride groom kid fisherman farmer police tourist oldLady builder trader jogger painter` + harbour `docker captain lifeguard fishmonger swimmer sunbather sailorKid` |
| `theme` | `'beach'` (swimwear, sunhats, chips/ice cream, barefoot) \| `'harbour'` (sou'westers, jumpers, hi-vis, rods/fish) — re-dresses a random villager on a forked rng, so un-themed seeds are unchanged |
| `age` | `'adult' \| 'kid' \| 'elder'` (kids are smaller with bigger heads; elders stoop and move slower) |
| `skin` | hex or index into `P.skin` |
| `hair` | `'bob' \| 'bun' \| 'spiky' \| 'bald' \| 'balding' \| 'quiff' \| 'pigtails' \| 'curly' \| 'afro' \| 'long' \| 'ponytail' \| 'short' \| 'parted' \| 'mohawk'` or `{ style, color, tie }` |
| `hat` | `null \| 'flatcap' \| 'bowler' \| 'tophat' \| 'beanie' \| 'hardhat' \| 'chef' \| 'sunhat' \| 'straw' \| 'fisherman' \| 'police' \| 'postman' \| 'cap' \| 'bucket' \| 'beret' \| 'party' \| 'veil' \| 'headband' \| 'captain' \| 'swimcap' \| 'sailor' \| 'boater'` or `{ type, color, color2, band, pom }`. Hats are closed shapes (they look solid from below / when lying down) |
| `top` | `'tee' \| 'shirt' \| 'jumper' \| 'stripes' \| 'hivis' \| 'suit' \| 'overalls' \| 'apron' \| 'dress' \| 'cardigan' \| 'hawaiian' \| 'sport' \| 'raincoat' \| 'smock' \| 'chef' \| 'vicar' \| 'police' \| 'postman' \| 'wedding' \| 'swimsuit' \| 'bare' \| 'lifeguard' \| 'sailor' \| 'reefer'` or `{ type, color, color2, sleeves: 'long'\|'short'\|'none', sleeveColor, tie, bow, apronStripe, ... }` |
| `bottom` | `'trousers' \| 'shorts' \| 'skirt' \| 'long' \| 'trunks'` or `{ type, color }` |
| `barefoot`, `boots` | `true` = bare feet (beach); `boots: '#hex'` = wellies |
| `accessory` | worn: `'bag' 'handbag' 'shopping' 'postbag' 'balloon' 'scarf' 'whistle' 'watch'`; held: `'newspaper' 'camera' 'icecream' 'chips' 'fish' 'broom' 'rod' 'book' 'bouquet' 'brush' 'palette'` (string or array) |
| `glasses` | `null \| 'round' \| 'square' \| 'shades' \| 'goggles'` |
| `facial` | `null \| 'moustache' \| 'handlebar' \| 'beard' \| 'bigbeard' \| 'stubble'` (+ `facialColor`), `pipe: true` |
| `face` | `{ eyeSize, eyeGap, pupil, nose, noseShape, brows, blush, cheeks, mouthW, smile, zinc }` (`zinc`: lifeguard sun-cream nose) |
| `build` | `{ height, width, belly, head, legs }` (multipliers, ~0.9–1.3) |
| `scale` | overall scale (kids ≈ 0.72); also multiplied by the global `setCharacterScale()` |
| `motion` | `{ energy, tempo, stoop, idle: 'relaxed'\|'hips'\|'behind'\|'front'\|'fidget'\|'look' }` |
| `action`, `actionOptions` | initial action |
| `voice` | babble voice override (see Voices) |
| `shadow` | `false` to skip the per-person blob shadow (Crowd/PigeonFlock batch theirs) |
| `name` | `root.name` |

### Actions (`Person.actions`)

| action | options | notes |
|---|---|---|
| `idle` | — | breathing, glances, per-person idle style (`motion.idle`) |
| `walk` / `run` / `panic` / `chase` | — | gait synced to `person.speed` (m/s) so feet don't skate; in place if speed is 0. `chase`: running with arms out ("come back, deckchair!") |
| `wave` `cheer` `clap` `dance` `point` `lookUp` `scratch` `shrug` `angry` | `point: { at }` | `p.pointAt(target)` also works; head follows the arm |
| `talk` | `{ role: 'speak'\|'listen', period }` | alternates by default; set `p.s.talkPhase` to offset partners |
| `sit` / `sleep` | `{ height }` seat height (0.45), `sleep: { stand: true }` | feet dangle; put the root at the bench's front edge, facing out; sleep = floating "z"s, hat over the eyes |
| `fish` | `{ waterY, cast, sit }` | auto-holds a rod; line + float drawn `cast` m ahead at `waterY` (relative to root) |
| `sweep` `read` `photo` `paint` `dig` `lookout` | `lookout: { sit, height }` | auto-attach a broom / newspaper / camera (+flash) / brush / spade / binoculars |
| `eat` | `{ food: 'icecream'\|'chips' }` | defaults to what they hold; chips = paper cone held out + chip fork to the mouth, glancing about for gulls |
| `swim` | `{ style: 'doggy' }` (kids default) | breaststroke. **Root on the water surface**; use a `Walker(..., { action: 'swim', groundY: () => waterY })` to move |
| `tread` | `{ wave: false }` | bobbing head and shoulders, a cheery wave to the shore now and then. Root on the water surface |
| `row` | `{ height: 0.34, period: 2.1, bias: -1..1, lost: true, oars: false, oarlock: [x, y, z] }` | seated rowing; two oars pivot in rowlocks at `oarlock` (root space, x mirrored). `bias` = one lazy arm (going in circles); `lost` = worried looking about + "?" |
| `paddle` | `{ height: 0.3 }` | sitting in a dinghy paddling over the side with a hand (Kit) |
| `lie` | `{ pose: 'back'\|'front'\|'deckchair', height, hatOverFace, awake }` | sunbathing; root on the towel / deckchair centre. Back: hat over the face (not tall hats) |
| `jig` | — | sailor's hornpipe: hop-hop-kick, hands on hips, "♪" |
| `shakeFist` | `{ both, hand: 'L'\|'R' }` | cross, fist up beside the head (the free hand, so an ice cream stays put), storm cloud |
| `pull` | `{ height: 0.95, period: 1.4 }` | leaning back, heaving a rope / stuck door at hand height `height` m |
| `impatient` | — | hands on hips, toe tapping, sighing (the chip-shop queue) |
| `checkWatch` | — | wrist up in front of the chin, peers at it, gives it a shake (captain; wears `accessory: 'watch'`) |
| `hawk` | — | market trader holding up the catch, hand cupped by the mouth ("Fresh fiiish!") |
| `whistle` | — | lifeguard blowing the whistle, other arm waving swimmers in, "!" |
| `alarm` | — | "Over here! Help!": both arms waving, hopping, "!" |
| `pose` | `{ channels: { aFL: 1.2, nrx: 0.3, ... } }` | hold a custom static pose (PersonPose channels, see `personActions.js`) |

- `p.busy` is true while reacting/celebrating; `p.inWater` for swim/tread; `p.action` is the current name.
- `p.hold('broom')`, `p.drop('R')` manage permanent props; `p.heldProp('L'|'R')`.
  `BUSY_HANDS` (exported) lists the actions that need the hands: a carried ice cream / fish / handbag
  is tucked away meanwhile and comes back afterwards.
- `p.faceTowards(point)` snaps the root yaw. `p.dispose()` removes it and frees its skeleton.

### React & celebrate

`react(hit)` accepts `{ point, origin | from | ray, direction }`. The character turns to shake its fist
**at the shooter**: `hit.origin` (Jack's world position) is preferred; without it the camera that last
rendered the character is used, so it always faces the player. Seated/lying/swimming folk stay put and
turn head + torso instead (and look up at a high shooter). Duration 2.6 s.

### Tells (stickers)

Readable **unscoped from the perch**: stickers are bold outlined billboards that keep at least
`TELL.screen` (4.5 %) of the viewport height at any distance (capped at `TELL.maxWorld` 5.5 m), and never
shrink below their natural size up close. Types: `'!'` (bang) `'?'` (question) `'!?'` (surprise)
`'♪'` (note) `'heart'` `'anger'` (storm cloud) and the sleeping `'z'` loop.

- Automatic per action (`ACTION_ICONS`): `?` scratch / shrug / lookUp / lost rower, `!` point / panic /
  alarm / whistle, `♪` dance / jig, storm cloud shakeFist / angry, `z` sleep.
  Turn off globally with `Person.autoIcons = false`, per person with `p.autoIcons = false`, per action with
  `{ icon: false }` in the action options (Crowd does that for its background extras).
- Level-driven: `p.tell(type, { duration, size })` once, or `p.setTell(type, { every, duration })` repeating.
  Animals have the same `tell` / `setTell`.

### Voices

`root.userData.voice` (and `p.voice`) is set automatically for the babble speech bubbles: `'kid'` for kids,
`'old'` for elders (oldLady, vicar, captain...), `'posh'` for top hats / bowlers / wedding clothes / bow
ties, otherwise `'man'` or `'woman'` by facial hair, hair style and clothes. `new Person({ voice: 'posh' })`
overrides. Animals have none.

### Look & scale

- Distance rim: a warm fresnel rim fades in with camera distance (25 → 85 m) so far-away folk separate
  from busy backgrounds; close-ups are untouched. `setCharacterLook({ rim: 0.45, power: 2.4, near: 25,
  far: 85, color: '#fff1d8' })`, `rim: 0` disables it. Same single program for every character.
- `setCharacterScale(1.1)`: global size multiplier for characters created afterwards (a far-away level).

### Events (audio / FX hooks)

```js
const off = onCharacterEvent('react', (ch, hit) => audio.sfx('hey', ch.root.getWorldPosition(v)));
```
`'react'` (ch, hit) · `'celebrate'` (ch) · `'tell'` (ch, iconType) · `'action'` (ch, name, opts) — a dog's
bark, a seal's clap... · `'stealChip'` (gull, person) · `'squawk'` (flock bird). `offCharacterEvent(name, fn)`.

### Water

Water actions (`swim`, `tread`, Duck `swim`/`dabble`, Gull `float`, Seal `swim`/`dive`) expect the root
**on the water surface**. The character switches to a "wet" material that discards everything below
the root (and its shadow), so the water shader never has to hide legs, and a ripple ring replaces the
blob shadow. `setWet(mesh, on)` is exported for custom cases.

## Walker

```js
new Walker(person, [[0, 0], [12, 0], [12, 6]], {
  speed: 1.1,            // m/s (±12% variety); > 2.2 runs. action: 'walk' | 'run' | 'panic' | 'chase' | 'swim' | 'scuttle'...
  loop: true,            // closed path; or pingPong: true; neither = walk once, then endAction ('idle') + onArrive(w)
  pauseAt: { 1: 3 },     // or [{ index: 1, duration: 3, action: 'lookUp', actionOptions, lookAt: obj }]
  start: 0.5, startFraction: true, reverse: false, smooth: true, lane: 0, groundY: (x, z) => 0,
});
person.update(dt, t);    // the walker is person.controller; it pauses automatically while the person reacts
```
Points may be `[x, z]`, `[x, y, z]` or `Vector3`. Corners are rounded with a centripetal Catmull-Rom;
heading uses a look-ahead point so turns are smooth. `walker.stop()`, `walker.resume()`, `walker.setPath(pts)`.
Animals with a `walk` action (dog, cat, cow, sheep, duck, chicken, pigeon, pelican, seal, crab) work too
(a crab scuttles sideways along the path).

## Crowd

```js
const crowd = new Crowd({
  seed: 3, area: { x: 0, z: -10, w: 40, d: 24 },   // or { x, z, r } disc
  count: 40, groups: 5, groupSize: [2, 3],          // face-to-face chatting groups
  paths: [[[-15, 0], [15, 0], [15, 3], [-15, 3]]],  // strollers (≈25% of count by default; walkers: n)
  avoid: [{ x: 0, z: -10, r: 5 }],                  // keep clear of job targets / fountains
  presets: ['postman', 'police'],                   // mixed in first
});
scene.add(crowd.root);
crowd.update(dt, t);                                // updates everyone + one instanced shadow draw call
crowd.startle(point, 6);                            // nearby folk react (e.g. after a bad hit)
crowd.celebrate();
```
No overlaps (rejection sampling with `spacing`, default 1.1 m); idlers/groups also keep off the paths;
walkers keep to one side (`lane`) and ease off behind slower walkers. Idlers now and then look up,
wave, point, scratch their heads... without tell stickers (`ambient: false` to disable). `crowd.people`,
`crowd.walkers`, `crowd.groups`, `crowd.idlers` are exposed.

## Animals

Same API shape: `root`, `setAction(name, opts, fade)`, `perform(name, seconds)`, `react(hit)` (turns to
face the shooter), `celebrate()`, `lookAt()`, `tell()`, `setTell()`, `update(dt, t)`, `hasAction(name)`,
`busy`, `speed`, `controller`. `new Dog({ seed, variant: {...}, scale, action })`. `Cls.actions` lists them.

| class | actions | notes |
|---|---|---|
| `Pigeon` | idle walk run peck hop flutter fly glide land | head-bob strut; use `PigeonFlock` |
| `Gull` | idle walk run peck hop flutter fly glide land squawk float circle | `circle: { center, radius, height, speed, clockwise }`; `float` sits on the water (root on the surface); `gull.holdingChip` shows a chip in the beak |
| `PigeonFlock` / `GullFlock` | — | `new GullFlock({ seed, count, area, groundY, perches: [Vector3], water: { y, area }, circle: { x, z }, tune })`, `.update(dt, t)`, `.scare(worldPoint, radius)`: burst into flight, circle (gulls: wide and high over the water, squawking), land on the ground, a perch (bollards, roofs) or the water. Shooting a bird scares the ones around it |
| `GullFlock.stealChip(person, { onSnatch })` | — | the nearest grounded gull swoops on the person's chips: snatch → person "!?" + shakes a fist, glaring after it; the gull circles with the chip and gobbles it on landing. Returns ≈ seconds until the snatch |
| `Duck` | swim dabble quack idle walk run peck hop flutter fly glide land | default `swim` (root on the water surface); `dabble` = bottoms up |
| `Pelican` | idle walk waddle flap gulp snap huff fly flyOff sit | the harbour thief: `gulp` = fish in the beak, head back, it vanishes and the pouch bulges (+ heart); `huff` = wings out, storm cloud; `waddle` off in a huff; `pelican.flyOff({ heading, speed, climb, duration: 6, onDone })` run-up and flap away, hides at the end |
| `Seal` | idle flop walk bark clap balance slide dive swim sleep | `balance` = beach ball on the nose (`{ ball: false }` hides it); `swim`/`dive` root on the surface; `seal.slideInto(point, { duration, onDone })` belly-slides off a rock into the water and swims; `seal.nosePosition(v)`, `seal.bop()` |
| `SealCatch` | — | `const game = new SealCatch(sealA, sealB, { ball, period: 1.5, arc: 1.3 }); scene.add(game.ball)`; `game.update(dt)` after the seals; nose flicks, the odd bark; `game.stop()`. Pass `ball` to reuse a props-kit beach ball |
| `Crab` | idle scuttle walk run snap wave hide | sideways scuttle along a Walker path, pincer snaps, eye stalks; react = claws up snapping |
| `Dog` | idle walk run sit wag bark sniff sleep | react = jump then bark at you |
| `Cat` | sit idle lick swish walk run sleep | sleep = curled loaf with Zzz; react = hiss & puff |
| `Cow` | graze idle walk moo sleep | cowbell included |
| `Sheep` | graze idle walk hop baa sleep | `hop` = stiff-legged boing |
| `Chicken` | idle peck walk run hop flap flutter fly glide land | react = flappy panic |

`ANIMALS` maps species names to classes.

## Budgets (measured)

| | triangles | draw calls |
|---|---|---|
| villager (random, avg / p90 of 200) | ~2.8k / 3.1k (beach 2.9k, harbour 2.8k avg) | 1 mesh + 1 shadow pass + blob (batched in Crowd) |
| presets | 2.5k–3.7k (sailorKid 2.5k · docker 3.2k · lifeguard 3.1k · fishmonger 3.1k · swimmer 3.1k · captain 3.5k · sunbather 3.7k) | same, + held prop mesh (+ line/float when fishing, + 2 oars when rowing) |
| pigeon / gull / duck / chicken / crab | 1.1k–1.4k | 1 (+1 shadow pass) |
| seal / cat / sheep / dog / pelican / cow | 1.6k–2.7k | 1 (+1 shadow pass) |

CPU: ~0.015–0.02 ms per character update (60-person crowd ≈ 1–1.5 ms/frame); building a new look ≈ 7–10 ms
(then cached). Tell stickers are sprites (1 draw call each, only while shown).

## Integration notes

- Hit detection: `SkinnedMesh.raycast` is pose-accurate. Each root carries `root.userData.character`
  (the Person/Animal) — walk up the parent chain from the hit object to find it. Pass `hit.origin`
  (the shooter's world position) to `react()`.
- Bounding spheres are set generously (hat flights) so frustum culling never pops characters.
- Everything animates from `update(dt)`; nothing reads wall-clock time, so `step()`-ing the game is deterministic.
- Sandbox `sandbox/characters.html`:
  `?set=all|presets|random|animals|crowd|tells|harbourline|harbour` · `set=species&species=Seal[&actions=bark,clap]` ·
  `set=acts&actions=row~lost=true,lie~pose=front[&who=<preset>]` · `action=wave&aopt=k:v` · `theme=beach|harbour` ·
  `t=1.5` (frozen clock) · `react=0.2[&noorigin=1]` · `celebrate=0.2` · `cam=scope&dist=80&zoom=8` · `rim=0` · `cscale=1.1`.
