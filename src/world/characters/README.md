# Characters — bean folk, animals & controllers

Chunky "plasticine toy" villagers and animals, 100% procedural. Every character is **one
`SkinnedMesh`** (vertex colours, shared `materials.toy`) animated by procedural poses, so a person
costs **1 draw call** (+1 in the shadow-map pass, +1 for its blob shadow unless batched, +1 per held
prop). Geometry is cached per look and shared; each instance only owns a small skeleton.

```js
import { Person, Walker, Crowd, PigeonFlock, Pelican, ANIMALS } from '../world/characters/index.js';
```

Units: metres, Y up, every character's `root` has its feet at y = 0 and faces **+Z**.
All randomness is seeded (`src/core/rng.js`), so layouts and looks are reproducible.

## Person

```js
const p = new Person({ seed: 42 });                       // random villager from a seed
const q = Person.random(rng);                             // next villager from an Rng
const chef = Person.preset('chef', { seed: 7 });          // named preset
const r = new Person({ seed: 3, hat: 'bowler', hair: 'quiff', top: { type: 'suit', color: '#3d4a6b' },
                       bottom: 'trousers', accessory: 'newspaper', glasses: 'round', facial: 'moustache' });
scene.add(p.root);
p.root.position.set(4, 0, -2);
p.setAction('talk');            // cross-fades (0.3 s default): p.setAction(name, opts, fadeSeconds)
p.lookAt(camera.position);      // head (+ a bit of body) turns to a Vector3 / Object3D; null to stop
p.update(dt, t);                // every frame (drives its Walker too, if any)
const secs = p.react(hit);      // bad-hit: hat pops off & tumbles, jump + spin, "!?", fist shake, hat flies back
p.celebrate();                  // happy double hop + heart
```

Any config field can be pinned; everything else comes from the seed.

| option | values |
|---|---|
| `seed` | number or string |
| `preset` | `postman chef vicar bride groom kid fisherman farmer police tourist oldLady builder trader jogger painter` |
| `age` | `'adult' \| 'kid' \| 'elder'` (kids are smaller with bigger heads; elders stoop and move slower) |
| `skin` | hex or index into `P.skin` |
| `hair` | `'bob' \| 'bun' \| 'spiky' \| 'bald' \| 'balding' \| 'quiff' \| 'pigtails' \| 'curly' \| 'afro' \| 'long' \| 'ponytail' \| 'short' \| 'parted' \| 'mohawk'` or `{ style, color, tie }` |
| `hat` | `null \| 'flatcap' \| 'bowler' \| 'tophat' \| 'beanie' \| 'hardhat' \| 'chef' \| 'sunhat' \| 'straw' \| 'fisherman' \| 'police' \| 'postman' \| 'cap' \| 'bucket' \| 'beret' \| 'party' \| 'veil' \| 'headband'` or `{ type, color, color2, band }` |
| `top` | `'tee' \| 'shirt' \| 'jumper' \| 'stripes' \| 'hivis' \| 'suit' \| 'overalls' \| 'apron' \| 'dress' \| 'cardigan' \| 'hawaiian' \| 'sport' \| 'raincoat' \| 'smock' \| 'chef' \| 'vicar' \| 'police' \| 'postman' \| 'wedding'` or `{ type, color, color2, sleeves: 'long'\|'short'\|'none', sleeveColor, tie, bow, apronStripe, ... }` |
| `bottom` | `'trousers' \| 'shorts' \| 'skirt' \| 'long'` or `{ type, color }` |
| `accessory` | worn: `'bag' 'handbag' 'shopping' 'postbag' 'balloon' 'scarf'`; held: `'newspaper' 'camera' 'icecream' 'broom' 'rod' 'book' 'bouquet' 'brush' 'palette'` (string or array) |
| `glasses` | `null \| 'round' \| 'square' \| 'shades'` |
| `facial` | `null \| 'moustache' \| 'handlebar' \| 'beard' \| 'bigbeard' \| 'stubble'` |
| `face` | `{ eyeSize, eyeGap, pupil, nose, noseShape, brows, blush, cheeks, mouthW, smile }` |
| `build` | `{ height, width, belly, head, legs }` (multipliers, ~0.9–1.3) |
| `scale` | overall scale (kids ≈ 0.72) |
| `motion` | `{ energy, tempo, stoop, idle: 'relaxed'\|'hips'\|'behind'\|'front'\|'fidget'\|'look' }` |
| `action`, `actionOptions` | initial action |
| `shadow` | `false` to skip the per-person blob shadow (Crowd/PigeonFlock batch theirs) |
| `name` | `root.name` |

### Actions (`Person.actions`)

`idle walk run wave talk cheer sit sleep point sweep fish dance panic lookUp clap` plus job-tell extras
`read photo eat paint scratch shrug angry`.

| action | options | notes |
|---|---|---|
| `walk` / `run` | — | gait is synced to `person.speed` (m/s) so feet don't skate; in place if speed is 0 |
| `talk` | `{ role: 'speak'\|'listen', period }` | default alternates speaking/listening; set `p.s.talkPhase` to offset partners |
| `sit` | `{ height }` (seat height, default 0.45 m) | feet dangle; put the root at the bench's front edge, facing out |
| `sleep` | `{ height, stand: true }` | seated slump by default, floating "z" stickers |
| `point` | `{ at: Vector3 \| Object3D }` | or `p.pointAt(target)`; head follows the arm |
| `fish` | `{ waterY, cast, sit }` | auto-holds a rod; line + float drawn to `cast` m ahead at `waterY` (relative to root) |
| `sweep` `read` `photo` `eat` `paint` | — | auto-attach a broom / newspaper / camera (with flash) / ice cream / brush when not held |
| `lookUp`, `scratch`, `point` | — | good "something's wrong over there" tells |

`p.busy` is true while reacting/celebrating. `p.hold('broom')`, `p.drop('R')` manage permanent props.
`p.faceTowards(point)` snaps the root yaw. `p.dispose()` removes it and frees its skeleton.

`react(hit)` accepts `{ point, origin | from | ray, direction }`: the character turns to shake a fist
toward the shooter when an origin/direction is given. Seated people stay on their bench. Duration 2.6 s.

## Walker

```js
new Walker(person, [[0, 0], [12, 0], [12, 6]], {
  speed: 1.1,            // m/s (±12% variety); > 2.2 runs. action: 'walk' | 'run' | 'panic'
  loop: true,            // closed path; or pingPong: true; neither = walk once, then endAction ('idle') + onArrive(w)
  pauseAt: { 1: 3 },     // or [{ index: 1, duration: 3, action: 'lookUp', actionOptions, lookAt: obj }]
  start: 0.5, startFraction: true, reverse: false, smooth: true, lane: 0, groundY: (x, z) => 0,
});
person.update(dt, t);    // the walker is person.controller; it pauses automatically while the person reacts
```
Points may be `[x, z]`, `[x, y, z]` or `Vector3`. Corners are rounded with a centripetal Catmull-Rom;
heading uses a look-ahead point so turns are smooth. `walker.stop()`, `walker.resume()`, `walker.setPath(pts)`.
Animals with a `walk` action (dog, cat, cow, sheep, duck, chicken, pigeon, pelican) work with Walker too.

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
wave, point, scratch their heads... (`ambient: false` to disable). `crowd.people`, `crowd.walkers`,
`crowd.groups`, `crowd.idlers` are exposed.

## Animals

Same API shape: `root`, `setAction(name, opts, fade)`, `react(hit)`, `celebrate()`, `lookAt()`,
`update(dt, t)`, `hasAction(name)`, `busy`, `speed`, `controller`. `new Dog({ seed, variant: {...}, scale })`.

| class | actions | notes |
|---|---|---|
| `Pigeon` | idle walk run peck hop flutter fly glide land | head-bob strut; use `PigeonFlock` |
| `PigeonFlock` | — | `new PigeonFlock({ seed, count, area, groundY })`, `.update(dt)`, `.scare(worldPoint, radius)`: burst into flight, circle, land elsewhere. Shooting a pigeon scares the ones around it. |
| `Duck` | swim dabble quack idle walk ... | default `swim`: put the root on the water surface (body sits low); `dabble` = bottoms up |
| `Dog` | idle walk run sit wag bark sniff sleep | react = jump then bark at you |
| `Cat` | sit idle lick swish walk run sleep | sleep = curled loaf with Zzz; react = hiss & puff |
| `Gull` | idle walk peck fly glide land squawk circle | `setAction('circle', { center, radius, height, speed, clockwise })` glides in circles |
| `Pelican` | idle walk flap gulp snap fly sit | the harbour thief: sly half-lids, `gulp` bulges its throat pouch |
| `Cow` | graze idle walk moo sleep | cowbell included |
| `Sheep` | graze idle walk hop baa sleep | `hop` = stiff-legged boing |
| `Chicken` | idle peck walk run hop flap flutter ... | react = flappy panic |

`ANIMALS` maps species names to classes.

## Budgets (measured)

| | triangles | draw calls |
|---|---|---|
| villager (random, avg / p90 / max of 200) | ~2.8k / 3.1k / 3.5k | 1 mesh + 1 shadow pass + blob (batched in Crowd) |
| presets | 2.7k–3.7k (chef tallest hat) | same, + held prop mesh (+line/float when fishing) |
| pigeon / gull / duck / chicken | 1.1k–1.4k | 1 (+1 shadow pass) |
| cat / sheep / dog / pelican / cow | 1.6k–2.7k | 1 (+1 shadow pass) |

CPU: ~0.02 ms per character update; building a new look ≈ 7–10 ms (then cached).

## Integration notes

- Hit detection: `SkinnedMesh.raycast` is pose-accurate. Each root carries `root.userData.character`
  (the Person/Animal) — walk up the parent chain from the hit object to find it.
- Bounding spheres are set generously (hat flights) so frustum culling never pops characters.
- Everything animates from `update(dt)`; nothing reads wall-clock time, so `step()`-ing the game is deterministic.
- Sandbox: `sandbox/characters.html` (`?set=all|presets|random|animals|crowd&action=wave&t=1.5&react=0.2&cam=scope&dist=80&zoom=8`).
