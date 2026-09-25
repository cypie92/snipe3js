# Jack of All Blasts — Game Design & Architecture

> A Three.js odd-job sniper hidden-object game. Fan tribute inspired by *Sniper Dan* (Denki / PQube).
> Original names, characters and assets only.

## Fiction
**Jack** runs *Jack's Odd Jobs* ("No job too small, no shot too long!") in the clumsy county of
**Muddlecombe**. Residents post odd jobs; Jack drives his van to each location, raises the
van's telescopic crow's-nest and solves every problem with one well-placed rifle shot:
turn on fountains, ring bells, pop balloons, fix signs, feed pigeons, launch fireworks.
Nobody ever gets hurt. Hitting a person or animal is a **Bad Hit** (they get startled, hat flies off).
Grades are stamped by **Inspector Pidge**, a pigeon with a clipboard.

## Core loop
1. **Office hub** (3D, navigated by *shooting* things): pinboard with job flyers (level select),
   workbench (rifle upgrades), trophy shelf (grades), radio (music), calendar (modes).
2. **Level intro**: van arrives, tower rises, camera sweeps the diorama, clipboard slides in.
3. **Play**: look around from the perch, scope in (2x/4x/8x), read clues, find problems, shoot.
   Timer vs. par, magazine + bolt + reload, sway + hold breath, limited hints.
4. **Last job** triggers a slow-motion bullet-cam.
5. **Results**: tallies, coins, Inspector Pidge stamps a grade (S/A/B/C/D).
6. Spend coins on upgrades; stars unlock the next location.

## Grades
- **S**: all jobs done, none failed, time <= par, 0 bad hits.
- **A**: all jobs done, time <= 1.5 x par, <= 1 bad hit.
- **B**: >= 75% jobs done, <= 3 bad hits.
- **C**: >= 50% jobs done. **D**: otherwise.
Stars per level: grade S=3, A=2, B/C=1, plus 1 for finding all 3 Golden Spanners.

## Locations (target: 4–6, each dense and hand-composed)
1. **Puddleby Green** — village square: fountain, clock tower, market, pub, fête bunting.
2. **Barnacle Bay** — harbour: boats, lighthouse, fish market, crane, a thieving pelican, gulls.
3. **Wobbleton Farm** — barn, windmill, cows/sheep/chickens, tractor, scarecrow, hot-air balloon.
4. **Pickle Park** — pond, ducks, bandstand, kites, playground, ice-cream van.
5. **Muddlecombe Airfield**, 6. **Downtown** (stretch goals).

## Modes (unlocked after first clear)
- **Contracts** (default), **Time Attack** (beat your best), **Ammo Hunt** (limited bullets;
  shoot hidden ammo crates to refill), **Snapshot** (photo mode).

## Controls
- Mouse look (pointer lock; drag-to-look fallback), **LMB** fire, **RMB** hold/toggle scope,
  **Wheel / 1-4** zoom, **Shift** hold breath, **R** reload, **Tab** clipboard, **H** hint, **Esc** pause.

---

## Architecture (vanilla ES modules + Vite, three r186, pmndrs postprocessing, N8AO)

```
src/
  main.js                    bootstrap
  core/     Game.js (state machine + loop), Renderer.js (renderer + post), Input.js,
            CameraRig.js (perch look, scope zoom, sway, recoil), Events.js, Save.js,
            rng.js (seeded RNG), tween.js, Debug.js (window.__game automation API)
  gfx/      palette.js, materials.js, Environment.js (sky, sun, fog, clouds, env map),
            Particles.js, Tracer.js, wind.js (vertex sway)
  world/    geo.js (vertex-colour part/merge helpers), kit/ (prop builders),
            characters/ (Person, animals, controllers)
  gameplay/ Rifle.js, Shooting.js, Jobs.js, Scoring.js, Progression.js, BulletCam.js
  audio/    Audio.js (100% WebAudio-synthesised SFX, ambience, music)
  ui/       Hud.js, Screens.js, *.css
  levels/   index.js (registry), <id>/index.js
  hub/      Office.js
sandbox/    stand-alone preview pages for asset work (kit.html, characters.html, audio.html)
tools/      snap.mjs, capture.mjs, browser.mjs (headless Chromium + SwiftShader)
```

### Units & space
1 unit = 1 m, Y up. Level origin = centre of the diorama; playable area about x∈[-70,70], z∈[-75,55].
The perch is usually around (0, 12, 70) looking toward -Z.

### Geometry convention (performance + style)
Static props are built from **vertex-coloured parts merged into one geometry** sharing
`materials.toy` (smooth) or `materials.facet` (flat-shaded). See `src/world/geo.js`:
```js
import { part, merge, rbox } from '../geo.js';
const g = merge([
  part(rbox(4, 3, 4, 0.3), '#fff1d6', { y: 1.5 }),
  part(new THREE.ConeGeometry(3.2, 2, 4), '#e0643c', { y: 4, ry: Math.PI / 4 }),
]);
const mesh = new THREE.Mesh(g, materials.toy);
```
Anything that animates or is hittable stays a separate `Object3D` (named, see below).
Repeated items (trees, fence posts, flowers, cobbles) use `InstancedMesh`.

### Level module contract
```js
// src/levels/village/index.js
export default {
  id: 'village', name: 'Puddleby Green', location: 'Village Square', order: 1,
  parTime: 210, preset: 'morning',
  async build(ctx) {             // ctx: LevelContext (src/core/LevelContext.js)
    ctx.root.add(...);           // everything goes under ctx.root
    ctx.job({ id, title, clue, reward, targets: [obj], onComplete(job) {...} });
    ctx.bystander(personOrAnimal);  // hitting it = Bad Hit (calls obj.react?.(hit))
    ctx.prop(obj, { onHit(hit) {...} }); // fun reaction, no penalty
    ctx.collectible(obj);        // Golden Spanner
    ctx.onUpdate((dt, t) => {...});
    return { perch: { position, yaw, pitch, yawLimit: [min, max], pitchLimit: [min, max] } };
  },
};
```
`ctx` also provides `rng`, `fx` (bursts, confetti, popText, speech bubbles), `audio`,
`tween`/`delay`, `env`, `surface(obj, 'wood'|'metal'|'stone'|'soft'|'glass'|'water'|'grass')`
(impact effect type for scenery).

### Hittable resolution
Shooting raycasts from the camera (with sway applied). The first intersection wins
(you cannot shoot through walls). Walk up the parent chain to find `userData.hit`:
`{ kind: 'job'|'fail'|'bystander'|'prop'|'collectible'|'ui', ... }`. No `hit` = scenery impact.
Thin targets get an invisible, enlarged collider child (`visible = false` still raycasts).

### Characters contract (`src/world/characters/`)
```js
const p = new Person({ seed, skin, hair, hat, top, bottom, accessory, scale });
p.root            // THREE.Group, feet at y=0, faces +Z
p.setAction('idle'|'walk'|'wave'|'talk'|'cheer'|'sit'|'sleep'|'point'|'sweep'|'panic'|...)
p.react(hit)      // bad-hit reaction (hat pops, spin/jump, "!" bubble). Returns duration.
p.celebrate()     // job-complete happy reaction
p.update(dt, t)
new Walker(p, pathPoints, { speed, loop, pauseAt })  // simple path follower
Animals: Pigeon, Duck, Dog, Cat, Gull, Pelican, Cow, Sheep, Chicken — same API shape.
```

### Audio contract (`src/audio/Audio.js`)
```js
import { audio } from '../audio/Audio.js';
audio.unlock();                            // on first user gesture
audio.sfx(name, { position, volume, pitch, variance });
audio.ambience('village'|'harbour'|'farm'|'park'|'office'|null);
audio.music('menu'|'level'|'results'|null);
audio.setListener(camera); audio.setVolumes({ master, sfx, music, ambience });
```

### Debug / automation API (`window.__game`)
`ready`, `state`, `startLevel(id, {skipIntro})`, `goHub()`, `look(yawDeg, pitchDeg)`,
`scope(on, zoom)`, `aimAt(name)`, `fire()`, `jobs()`, `completeJob(id)`, `completeAll()`,
`freeze(bool)`, `step(seconds)`, `stats()`. URL params: `?level=village&skipIntro=1&debug=1&quality=high`.

---

## Team rules (every agent)
1. Edit only the files/folders you own (named in your brief). Need a change elsewhere? Put it in your report.
2. Never run git commands that change state (commit, push, checkout, stash, reset). The lead owns git.
3. Never add npm packages. Everything is procedural: no downloaded models, textures or sounds.
4. Verify visually: `node tools/snap.mjs <page> review/shots/<area>/<name>.png` then look at the PNG.
   Judge at **gameplay distance** (40–150 m, narrow FOV), not only close-ups.
5. Deterministic: use `src/core/rng.js` seeded RNG for layouts.
6. Budgets per level: <= 1.5M triangles, <= 700 draw calls at the overview shot, 60 fps target on a mid laptop.
7. Code style: ES modules, 2-space indent, small focused files, short comments only where non-obvious.
