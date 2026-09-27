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
- [x] Puddleby Green finished by the level designer (12 jobs incl. 2 secrets, 3 spanners, 45 villagers,
      27 animals, vehicles; ~520 draw calls / 1.1M tris; all jobs verified by real shots).
- [x] 3D office hub integrated (shoot flyers/workbench/cabinet); Jack's van perch per level.
- [x] Lead: post-shift secret hunt ("Shift done! N secrets left" → clock off), par judged at shift end.
- [x] Review 1 done: 5.9/10 (review/REVIEW-1.md). Blocker: world too far from the perch.
- [x] Lead review-1 fixes: level reuse (no double build) + loading card, briefing clipboard after the
      swoop (click starts the shift), two-tier hints (radio nudge → marker), first-shift coach marks,
      bullet-cam unscope + shake, voiced/capped/scope-clipped bubbles, reactions get shot origin,
      heartbeat on hold-breath, 'oi' on bad hits, vanished-row CSS bug, spanner ids, capture clock-off.
- [x] Round 2 done (a weekly usage limit paused it 10:30–16:15 UTC): level pulled in (perch 0,16,44,
      14 jobs, Dunk the Sarge first laugh, nags, decoys, cricket), tech art (raking light, grade, sky,
      water, lens, 90→63 programs, NaN/AO fixes), characters (tell stickers, face shooter, voices,
      full harbour cast incl. seals/crabs/gulls/pelican), audio (babble, vocals, loops, hold-breath).
- [x] Lead: nest eye raised (railing only when looking down), loading-card/intro/capture fixes.
- [x] Review 2 done: 7.2/10 (review/REVIEW-2.md). New blocker (office-path intro) fixed by the lead,
      plus coach marks, bubble layout (max 3, on-screen), hit-stop, bullet-cam blur off, shift-end
      stinger, office-path capture.
- [~] Round 3 partly landed (fresh agents from 01:25 UTC Sep 27; all four were cut by a session limit
      ~04:00 UTC, their work checkpointed): level skill jobs in `games.js` (coconut shy = combo,
      Splat the Rat = timing, Catch the six = moving ball over the cricket match), 17 jobs total;
      tech-art toy FX sprites + crown splashes (`fxSprites.js`, `fxCrown.js`), muzzle puff never in
      the scope; props stall-sign lettering (`signs.js`) + harbour props; hub outside diorama
      (`outside.js`), flyer/board polish, hit-box fixes. Still open from round 3: bare lawn / backdrop
      fields / lavender slab, key characters facing, heart spam, Sarge hair, hub entry push-in and
      Pidge reactions. Next: buildings harbour kit + Barnacle Bay, then review 3.
- [x] **Checkpoint for user testing (07:00 UTC Sep 27):** build + full play-through verified headless
      (title → office dart → intro → briefing → every job by real shots → clock-off → results, 0
      console errors, ~440 draw calls at play start). Playable build published as a private Artifact:
      https://claude.ai/artifact/R9tqJFmwUaAfwFVLnaJ7BL (v1 = commit 2c7be32). To republish:
      `npx vite build && node tools/artifact-page.mjs`, then Artifact publish `dist/artifact.html`
      with the `files` map from `dist/artifact.files.json` and `url` set to that link.
      **Loop paused here at the user's request so they can play-test.** On resume: fold in their
      feedback first, then the open round-3 items above, Barnacle Bay, review 3.
- Kit bugs to fix (found by the level designer, worked around in the level): buildings addCollider()
  doesn't flag colliders; church update overwrites weathervane rotation; bunting coil scale reset each
  frame; phone box glass opaque; birdseed spill point at bag origin.

## ▶ RESUMED 2026-09-26 05:15 UTC (was paused ~00:00–05:10 UTC at the user's request)
Resumed first: level designer, tech artist, hub/perch. Harbour-kit trio resumes after the first review.
Lead since resume: Jack's van perch integrated into Game (mast rises during the intro); clipboard
now has expanded (2-column clues) → compact (titles) → closed modes, auto-compacts after 9 s.

### State at the pause (kept for reference)
Everything is committed. The game builds and runs with no console errors.
State of each unfinished stream, and how to resume:
- **Puddleby Green** (`src/levels/village/`): wired up and playable: 12 jobs, about 465 draw calls,
  1.3M tris. The designer was mid-polish. Resume: finish the job verification pass and 3 critique
  rounds, then run `node tools/capture.mjs --level village`.
- **Tech art**: unfinished renderer/environment changes are parked in `src/core/Renderer.wip.js` and
  `src/gfx/Environment.wip.js`. They had a post-processing shader compile error
  (`e2MainImage` overload), so the live files are the last good versions. `src/gfx/post.js`,
  `src/gfx/water.js` and `sandbox/lookdev.html` are also WIP. Resume: fix the custom effect
  signature, then move the sun to the perch side.
- **Hub & perch**: `src/world/perch/` (van + crow's nest) is mostly done; `src/hub/` (3D office) is
  partial (corkboard/trophy shelf were next). Not yet integrated into Game.js.
- **Harbour kit** (Barnacle Bay): partial builders exist in kit/buildings (harbour, lighthouse,
  seaside, fishmarket, harbourBackdrop), kit/props (boats, harbour, beach) and characters (wet.js,
  new presets/actions). Mid-way through their visual critique rounds.
- To resume: re-run `/loop` with the prompt in this file's header, and re-brief or resume the six
  specialists (level designer, tech artist, hub/perch, buildings, props, characters).

## Backlog (prioritised)
1. Puddleby Green level: dense, gag-filled, 8–10 jobs + 2 secret jobs + 3 golden spanners.
2. 3D office hub navigated by shooting (job board flyers, workshop bench, trophy shelf, radio).
3. Jack's van + crow's-nest perch visible in first person.
4. Wind sway on foliage, water shader, chimney smoke, birds.
5. Locations 2–4 (Barnacle Bay harbour, Wobbleton Farm, Pickle Park).
6. Modes: Time Attack, Ammo Hunt, Snapshot.
7. Adaptive quality + perf budget checks; touch controls.
8. Deploy: build + publish the demo.
