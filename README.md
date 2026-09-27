# Jack of All Blasts 🎯

A cheerful **three.js** odd-job sniper hidden-object game. Jack's rifle is a *tool*, not a weapon:
scan a busy toy-box village through the scope, work out what the residents need from their vague
clues, and fix it with one perfectly placed shot — ring the wedding bell, get the fountain going,
free the kite, silence that ice-cream van. Nobody ever gets hurt (hit a bystander and they just lose
their hat — and you lose your S-rank).

> A fan-made tribute inspired by **_Sniper Dan_** by Denki / PQube. All names, characters, art, music
> and sound here are original and generated procedurally in code — no downloaded models, textures or audio.

## Play
**In the browser:** https://cypie92.github.io/snipe3js/ — rebuilt and deployed from `main` by
`.github/workflows/pages.yml` (GitHub Pages, source "GitHub Actions").

Locally:
```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # static build in dist/ (relative paths, host anywhere)
```

| Control | Action |
|---|---|
| Mouse | Look around (click to capture the mouse) |
| Left click / Space | Shoot |
| Right click (hold or tap) / Q | Scope in/out |
| Mouse wheel / 1–4 | Scope zoom 2× / 4× / 8× / 12× |
| Shift (hold) | Hold breath — steady aim |
| R | Reload |
| H | Hint (limited per shift) |
| Tab | Show/hide the job clipboard |
| Esc | Pause / settings |

## Features
- First-person perch over a living diorama; scope with 2–12× zoom, breathing sway, hold-breath,
  bolt-action cycling, recoil, bullet tracers and depth-of-field.
- Job clipboard with handwritten clues, secret jobs, multi-step and "don't hit the wrong one" jobs,
  Golden Spanner collectibles, limited hints.
- Grades stamped by **Inspector Pidge** (S / A / B / C / D) based on jobs, par time and bad hits.
- Slow-motion bullet-cam on the shot that finishes a shift.
- Coins → Workshop upgrades (magazine, reload, bolt, scope magnification, steady hands, hints).
- Stylised rendering: N8AO ambient occlusion, soft shadows, bloom, tone mapping + grade, wind-swayed
  foliage, chunky particles, procedural sky and clouds.
- 100% synthesised WebAudio sound effects, ambience and music.

## Project layout
See [`docs/DESIGN.md`](docs/DESIGN.md) (architecture + contracts) and
[`docs/ART_BIBLE.md`](docs/ART_BIBLE.md) (visual direction).
```
src/core      game loop, renderer/post, input, camera rig, level context, debug API
src/gameplay  rifle, shooting, jobs, scoring, progression, bullet-cam, viewmodel
src/gfx       palette, materials, environment/sky, particles, tracers, wind
src/world     geometry helpers, prop kits, characters & animals
src/levels    locations (one folder each)
src/audio     synthesised audio engine
src/ui        HUD, menus, popups
tools/        headless capture / screenshot tooling (Playwright + SwiftShader)
```

## Automation
`window.__game` exposes a small API (`startLevel`, `aimAt`, `shootJob`, `scope`, `completeAll`,
`stats`, …) used by `npm run capture -- --level <id>` to take review screenshots headlessly.
`node tools/artifact-page.mjs` (after a build) turns `dist/` into a single page plus a `files` map
for publishing the game as a claude.ai Artifact.
