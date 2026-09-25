# Improvement loop — state & log

The lead (Claude) runs a self-paced `/loop`: every iteration = harsh review (screenshots + play-through
via `tools/capture.mjs`) → prioritised issue list → team agents fix/add in parallel (disjoint file
ownership) → lead integrates, verifies, commits, pushes → update this file.

**Stop condition:** a harsh reviewer scores every category ≥ 9/10 (graphics, art cohesion, gameplay
depth, game feel/juice, UI/UX, audio, performance, completeness) and the demo is genuinely "wow".

## Team (agents)
| Role | Owns |
|---|---|
| Lead / integrator | `src/core`, `src/gameplay`, `src/ui`, `src/levels/index.js`, `tools/`, docs |
| Environment artist — architecture | `src/world/kit/buildings`, `sandbox/buildings.html` |
| Environment artist — props & nature | `src/world/kit/props`, `src/world/kit/nature`, `sandbox/props.html` |
| Character artist & animator | `src/world/characters`, `sandbox/characters.html` |
| Sound designer & composer | `src/audio`, `sandbox/audio.html` |
| Level designer (from iteration 1) | `src/levels/<id>/` |
| Tech artist (from iteration 1) | `src/gfx` post/sky/water/wind, `src/core/Renderer.js` grading |
| Harsh reviewer (every iteration) | writes `review/REVIEW-<n>.md` only |

## Status
- [x] Iteration 0 — foundation: renderer + post (N8AO, DOF scope, bloom, grade), environment/sky/clouds,
      input/pointer lock, camera rig (scope 2-12x, sway, hold breath, recoil), rifle, shooting + hit
      resolution, jobs/fail/progress/locked, scoring + grades, progression + workshop, HUD, screens
      (title, job board, workshop, intro, pause, results with Inspector Pidge), bullet-cam, particles,
      tracers, popups, debug API, capture tooling, dev test range.
- [x] Wave 1 done & committed: buildings kit, props/nature kit (72 props), characters (15 presets,
      22 actions, 9 animals, 1 draw call each), synthesized audio (51 SFX, 5 beds, 3 music tracks).
- [x] Lead: viewmodel composition, results/pause panels, touch controls, wind, adaptive quality.
- [ ] Wave 2 (running): level designer (Puddleby Green), tech artist (grade/sky/water/scope),
      hub & perch designer (3D office + Jack's van), harbour kit (buildings/props/characters)
      for Barnacle Bay (docs/levels/barnacle-bay.md). All six were interrupted by an API session
      limit at ~22:00 UTC and resumed at 23:45 UTC.
- [ ] Iteration 1 review — first harsh review once Puddleby Green is playable.

## Backlog (prioritised)
1. Puddleby Green level: dense, gag-filled, 8–10 jobs + 2 secret jobs + 3 golden spanners.
2. 3D office hub navigated by shooting (job board flyers, workshop bench, trophy shelf, radio).
3. Jack's van + crow's-nest perch visible in first person.
4. Wind sway on foliage, water shader, chimney smoke, birds.
5. Locations 2–4 (Barnacle Bay harbour, Wobbleton Farm, Pickle Park).
6. Modes: Time Attack, Ammo Hunt, Snapshot.
7. Adaptive quality + perf budget checks; touch controls.
8. Deploy: build + publish the demo.
