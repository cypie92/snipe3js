# Review 2: Jack of All Blasts · Puddleby Green + office hub

**Build:** `1750902` (HEAD, clean tree) · **Viewport:** 1600×900, `quality=high`, headless Chromium + SwiftShader
**Shots:** `review/shots/iter2/` (git-ignored, local only). `00`–`40` come from `tools/capture.mjs`. The `x-*` shots come from my own Playwright passes:
- perch, edges, 8x targets and characters, decoys;
- the real office → dart → intro → briefing → click → shift → results → office path;
- bullet-cam, bad hit, nags, and DOM/camera checks.

**Harness caveats:**
- fps can't be measured under SwiftShader.
- The results screens show `Time 00:00` because captures freeze the clock.
- The "Click to aim" pill in scoped shots appears only because headless Chromium has no pointer lock.

## Verdict

This is a different game from Review 1. Pulling the diorama in, adding the raking light and filling the fête green fixed the Review 1 Blocker outright. The first play frame (`x-play-first-frame`, `03-overview`) now reads as a sunny toy-box diorama: church, terrace, pub, bandstand, fountain, two market rows, and a fête right under the van. Kids are already missing the Sarge ("Whoosh! Nope!").

The jobs are funnier and better staged, the villagers talk, reactions face the shooter, and the briefing clipboard is a proper game UI. Through the scope it's charming at every distance.

Three things still stop it being a demo you'd put in front of a stranger:
1. **The canonical path shows a blank intro.** Title → office → dart the flyer gives a 4-second blurred void instead of the swoop, because a one-line override bug freezes the camera at the office. The capture tool never takes this path, so nobody saw it.
2. **Several of the new systems are half-landed:**
   - The coach marks are invisible.
   - The new miniature DOF smears the bullet-cam impact.
   - Nag bubbles pile on top of each other.
   - Every market stall still has placeholder dash lettering.
3. **Scope:** one location, no modes, and every job is still "find the object, shoot it once".

## Scores

| # | Category | R1 | R2 | Why |
|---|---|---|---|---|
| 1 | Art direction match | 7 | **8** | Now instantly a toy-box diorama from the perch (`x-perch-default`, `02-intro`): chunky, saturated, cohesive, great silhouettes. Held back by placeholder stall signs, a plain near lawn, and sawtooth backdrop fields. |
| 2 | Scene density & life | 5 | **7.5** | 85 villagers and 16 animals; a cricket match (SIX into the duck pond), a car-boot sale, a one-man band, a hot-air balloon. The flanks are now 20–22% featureless (was 51–56%). The near lawn and parts of the square are still bare. |
| 3 | Characters & animation | 7 | **8** | Charming and readable at 8x out to ~80 m (`x-char8x-Mrs-Crumb`, `x-char8x-Sergeant-Bumble`). Per-person voices, tell stickers, and a fist-shake that now faces Jack (head within 4–6° at 1–1.5 s). Key characters face away from the perch, and heart stickers get spammy. |
| 4 | Lighting & rendering | 5.5 | **7.5** | The raking −110°/30° sun with lilac fill, AO and ground filter gives real form, and the miniature DOF sells the toy look. Minus: tilt DOF blurs the cinematics, effects are opaque blobs, and backdrop fields show triangle noise. |
| 5 | Gameplay depth | 5 | **6.5** | 12 jobs, 2 secrets, 3 spanners, 3 decoys (flour, cone, water butt), 2 chains, problem-style clues, radio nudge then marker, nags. Still every job is one static target and one shot; no moving, timing or combo jobs; no modes. |
| 6 | Game feel / juice | 6 | **7** | The dunk sequence is a genuine first laugh. The ribbon opening brings fanfare, fireworks and released balloons, and the bullet-cam flight is clean. The impact frame is blurred with a white blob on top, there's no hit-stop, and the splash reads as a pile of balls. |
| 7 | UI / UX | 5 | **6** | The briefing clipboard, compact play clipboard (~14% UI at first frame), radio hints and the row fix are all good. But: a blank intro on the real path, invisible coach marks, overlapping and edge-clipped bubbles, and an unchanged hub. |
| 8 | Audio (code) | 7.5 | **8.5** | Babble voice per villager on every bubble, plus oi/yay/aww/hey reactions. Positional tell loops (drip, snore, creak, jingle), heartbeat and muffle on hold-breath, and a crowd limiter. Music is still 3 static tracks with no shift-end stinger. |
| 9 | Performance | 7 | **7.5** | 541–604 draw calls, 1.17–1.31 M triangles, 63–66 programs (was 80–90); no double build on the office path. Draw calls crept up 15%, and boot/Retry still build synchronously. |
| 10 | Completeness & polish | 4 | **5** | 0 console errors in every run, and the full loop works with persistence. But: one location, three "coming soon" flyers, the modes board says "soon", plus the new visible bugs listed below. |
| | **Average** | **5.9** | **7.2** | |

## First 10 seconds: would a stranger say "wow"?

**Almost, and it's broken at exactly the wrong moment.**

1. **Title** (`00-title`). The logo over an orbiting aerial of the new, compact diorama is attractive and inviting. That's a real improvement.
2. **Office** (`x-hub-hover-flyer`). It's still charming, but unchanged since R1.
3. **Shoot the flyer.** THWOCK. Then **~4.2 s of a blurred blue-green void** under the title card (`x-intro-t06`, `-t22`, `-t36` are three identical frames). The camera sits at the office position (−9.3, 4.1, 4001) looking at nothing. What the player *should* see is `x-intro-expected-t06` and `x-intro-expected-t26`: a gorgeous aerial of the whole village. That's the best "wow" frame in the build, and no real player sees it.
4. **Briefing** (`x-briefing`). A big, readable two-column clipboard over the village, with "Start the shift ▶". Good.
5. **First play frame** (`x-play-first-frame`). This is the wow candidate: a dense, sunlit diorama, the fête under your feet, and the Sarge taunting from the dunk tank at 25 m. But the coach mark that should say "Right-click to scope" is invisible, so a newcomer gets only a two-line key legend.

**Fix #1 and #2 below, and the first 10 seconds become the strongest part of the demo.**

## Top 12 issues (ordered by impact)

### 1. [Blocker] The level-intro swoop is a blank blurred void on the real office path (gameplay (lead), hub)
- **Evidence:**
  - `x-intro-t06`, `x-intro-t22` and `x-intro-t36` are identical frames of blurred sky and haze.
  - Camera logs at t = 0, 0.6 and 2.2 s show `cam (-9.3, 4.1, 4001)` with `rig.override === office.view`, and the office root already removed from the scene.
  - Reproduced 3 times via a real mouse dart.
  - The same swoop started outside `office.update` renders correctly (`x-intro-expected-t06`, `-t26`), and so does `?level=village` (`02-intro`).
- **Cause:**
  - `Game.frame()` runs `this.office.update(realDt, this.time)` and then `this.rig.override = this.office.view` in the same branch (`Game.js:730–731`).
  - The dart's `later(0.3)` fires `onAction → startLevel → playIntro()` *inside* `office.update()`. On the reuse path that runs synchronously: it sets `state = 'intro'` and `rig.override = o`.
  - Line 731 then overwrites the override with the dead office view for the whole 4.2 s tween. The miniature DOF blurs the empty world.
- **Fix:**
  - Change the frame branch to `this.office.update(...); if (this.state === 'office') this.rig.override = this.office.view;`, or defer `onOfficeAction` to the next frame.
  - Add an "office → dart flyer → intro frames" step to `tools/capture.mjs`. It currently opens `?level=` directly, which is why the team never saw this.

### 2. [Major] First-shift coach marks are invisible (UI)
- **Evidence:** `.coach` computed opacity is 0 at 0.7, 1.5 and 3 s after it appears, and still 0 after scoping in. Its transform is the toast end-pose `matrix(0.9,0,0,0.9,0,-18)`, which also drops the `translateX(-50%)` centring.
- **Cause:** `.coach { animation: toast .5s … both }` (`hud.css:198`) reuses the toast keyframes. Those end at `opacity: 0` and override the transform (`hud.css:142`). Each step flashes for about 0.4 s and then stays invisible.
- **Fix:** A dedicated keyframe that stays visible, e.g. `@keyframes coachin { 0% { opacity:0; transform: translateX(-50%) scale(.3) rotate(-8deg) } 100% { opacity:1; transform: translateX(-50%) } }` with fill `both`. Also add a "✓" pop when a step completes.

### 3. [Major] The miniature DOF smears the bullet-cam impact and anything near the lens (tech-art)
- **Evidence:** `x-bulletcam-b-impact` (the tap, door and window all soft, with a white blob on top) vs `x-bulletcam-a-flight` (sharp). Also the crow's-nest rail when you look down (`x-dunk-t045`).
- **Cause:** `const mini = !scoped && this.toggles.tilt …` (`Renderer.js:353`) is active whenever unscoped, including cinematics. The bullet-cam sits 1.3–3 m from the target, inside the near-blur ramp `tilt.near [4, 14] m`.
- **Fix:** Skip tilt while the bullet-cam owns the camera (for example a `renderer.cinematic` flag set from `BulletCam.play`/`stop`), or focus the CoC on the bullet/target distance with a narrow near ramp. Keep tilt for the intro aerial, where it looks great.

### 4. [Major] Every job is one static object and one shot (gameplay, level)
- **Evidence:** In the play-through, all 12 main jobs and both secrets completed with a single well-aimed shot at a stationary collider. The only structure is 3 decoys, 2 chains (selfie ← fountain, ribbon ← bunting) and the two-hit bell. Nothing moves, nothing is timed, nothing combos.
- **Fix:** Add 2–3 jobs of new *verbs*, using things the level already animates:
  - A moving target, e.g. "catch" the cricket ball mid-air on a SIX, or pop the balloon escaping from the kid in the ice-cream queue.
  - A timing job, e.g. ring the bell exactly as the couple step out.
  - A multi-shot combo, e.g. knock all three coconuts at the shy.
  - A 3-step chain, e.g. tap → Grubb waters the marrow → the marrow wins the show.

### 5. [Major] One location, no modes (completeness)
- **Evidence:** The corkboard shows Barnacle Bay, Wobbleton Farm and Pickle Park as "COMING SOON", and the modes easel says "soon" (`x-hub-hover-flyer`). Completeness can't pass 5 while that's true.
- **Fix:** Ship Barnacle Bay next. The harbour kit and cast already exist, so use the Puddleby template (perch 16 m, diorama within 25–90 m, first-laugh job under the van). Add Time Attack as the cheapest mode; par and timer already exist.

### 6. [Major] All 12 market and fête stall signs use placeholder dash lettering (props)
- **Evidence:** The "▬ ▬▬ ▬" boards in `10-job-11-selfie-4x`, `10-job-14-melons-4x`, `x-char8x-bride` and `x-briefing`. In a game about inspecting details at 8x, placeholder text next to the real PUDDLEBY FÊTE, DUNK THE SARGE! and WONKY PINT signs reads as unfinished.
- **Cause:** `marketStall` builds its sign from `lettering()` boxes (`market.js:237`).
- **Fix:** Canvas-texture signs with words per goods ("FRUIT & VEG", "FRESH FLOWERS", "CAKES 20p", "MELONS!"). The level already has `boardMaterial(text)` in `custom.js` to reuse.

### 7. [Major] Nag bubbles pile on top of each other and run off-screen (UI)
- **Evidence:** In `x-nags-70s`, five villagers nag at once: "Come on, somebody… open it for me…" is buried under "It just goes plip!", and "Somebody sort that si…" is cut off at the right edge.
- **Cause:** Nags start at 45 + 6·i s, so five owners are all nagging by 70 s. `Popups` caps bubbles at 5 but never lays them out or clamps them to the viewport.
- **Fix:**
  - Stack bubbles greedily when their rectangles overlap.
  - Clamp them to the screen, with the tail still pointing at the speaker.
  - Show at most 3 unscoped bubbles, nearest the reticle first.
  - Let only one nag line speak per ~4 s window. Stickers can repeat; voices shouldn't overlap.

### 8. [Major] Effects are opaque piles of spheres that hide the payoff (tech-art, props)
- **Evidence:**
  - The dunk splash is a heap of blue/white balls over the Sarge (`20-feedback-jobdone`).
  - The bad-hit "soft" puff covers the victim's head (`30-badhit`).
  - The flour is a white cloud hiding the bag and bench (`x-decoy-flour`).
  - The bullet-cam impact is a white ball in front of the tap (`x-bulletcam-b-impact`).
- **Cause:** `Particles` "blob" is opaque, emissive icosahedra that only shrink out. Every splash, puff and smoke uses it.
- **Fix:**
  - Splash: arcing droplets, a thin ring (the `createSplashRings` pool already exists) and a short vertical sheet.
  - Puffs: fewer and smaller, pushed along the surface normal *behind* faces and targets.
  - Cap blob screen size while scoped.

### 9. [Minor] Remaining empty patches in the default view (level)
- **Evidence:** In `x-perch-default` and `x-play-first-frame`, the near lawn under the van (bottom ~20% of the frame, around the white path) is plain green. The square's centre ring and south-east corner are bare cobbles (`03-overview`, `10-job-11-selfie-4x`). About 14% of the ground band is still featureless lawn.
- **Fix:**
  - Near lawn: picnic blankets, a tug-of-war line, a lost-property table, a sleeping dog, fête litter.
  - Square: a queue at the cake stall, prams, a juggler by the fountain, some chalked hopscotch.

### 10. [Minor] Backdrop fields read as rendering noise (buildings/backdrop)
- **Evidence:** The golden fields render as sawtooth light/dark triangles (`x-edge-left-4x`). A flat, saturated lavender slab dominates the top-left of the title, the intro aerials and `02-intro`.
- **Fix:** One colour per field (no per-triangle alternation) with a subtle stripe or row pattern. Desaturate the lavender and give it rows.

### 11. [Minor] Key characters face away, and celebrations spam hearts (characters, level)
- **Evidence:**
  - The wedding party shows the backs of their heads (`x-char8x-bride`), and so does the landlord (`x-char8x-landlord`). Both are tells for their jobs.
  - `cheerNear` pops hearts on everyone within 14 m (eight hearts in `x-dunk-t155`).
  - Sergeant Bumble's long hair reads as floppy dog ears under the helmet (`x-char8x-Sergeant-Bumble`).
- **Fix:** Turn the bride/groom and landlord about 3/4 toward the perch. Limit celebrate hearts to the job owner plus the 2 nearest (the rest just cheer). Give the Sarge short hair.

### 12. [Minor] The office hub is unchanged since Review 1 (hub)
- **Evidence:** In `x-hub-hover-flyer` the flyers are about 80 px wide and names are part-covered by the SOON band and sticker. The room still floats in a flat green void. After a shift, the trophy is small and easy to miss (`x-hub-after-shift`).
- **Fix:** Same as R1: move the camera in (`Office.js:28`), use bigger flyers, and set the room in a lane with Jack's van outside the window. Also add a celebratory "new trophy" beat when returning with a grade.

## Wow multipliers (most delight per effort)

1. **Fix the intro and make it the hero shot (minutes).** Make the one-line override fix (#1), then hold the swoop for a beat on the `x-intro-expected-t26` framing with the title card, and end it facing the dunk tank so the first laugh is framed. That aerial is the most impressive image the game makes, and today no player sees it.
2. **Make 8x inspection pay off everywhere (1–2 days).** Real stall signage (#6), key characters turned toward the perch (#11), and readable splash/puff effects (#8). Scoping in on anything should reward you, because that's the core pleasure of the genre. Right now placeholder dashes and white blobs break it at the moments you look closest.
3. **Add one moving-target job and one combo (1–2 days).** The cricket SIX catch and the three coconuts (#4) add skill and variety to a purely static hidden-object loop, using systems that already animate.

## Since Review 1

### Improved (verified)

| R1 issue | Status | Evidence |
|---|---|---|
| #1 [Blocker] village too far / sparse | **Fixed** | Perch (0,16,44); square 2,306 m² (was 4,330); fountain 51.5 m (was 74); nearest job 25.5 m (was 54). Buildings are 110–240 px tall in the default view (were 40–60). `x-perch-default` vs `iter1/x-perch-p0`. |
| #2 finished row vanished | **Fixed** | Class renamed to `justdone`. Failed and done rows stay visible (DOM: `failed justdone … op=1 pos=static`; `20-feedback-jobdone`). |
| #3 flat front light, flat ground | **Fixed** | `sunAzim −110, sunElev 30`, lilac fill, bluish AO, ground filter, mowing stripes (`x-perch-default`). |
| #4 first frame 40% UI | **Mostly fixed** | Briefing card, then compact clipboard; about 14% UI at the first play frame. But see new #2 (coach marks). |
| #5 5 s freeze + weak intro | **Freeze fixed, intro regressed** | The office path reuses the level (no `loadLevel` in the trace), and there's a loading card for rebuilds. But the swoop is now a void on that path (new #1). |
| #6 bullet-cam smeared by scope CA/DOF | **Partly** | Unscopes and shakes; flight is clean (`x-bulletcam-a-flight`). The impact is now blurred by tilt DOF (new #3). |
| #7 empty flanks | **Fixed** | Yaw ±62°, cricket match, car-boot sale, allotments; 20–22% featureless at the limits (was 51–56%) (`x-edge-left`, `x-edge-right`). |
| #8 literal clues, hint = answer | **Mostly fixed** | Problem-style clues ("The square's gone very quiet… sulky plip"). H gives a radio nudge with the written hint, and a second H within 10 s gives a marker ("MARKED Dunk the Sarge", hints 2→1). Plus 3 decoys and 2 chains. The hint picks list order, not the job nearest the reticle. |
| #9 tells unreadable, no nags | **Fixed** | Idle "?"/anger stickers for owners; "!" nags from 45 s with target escalation (the sign swings, the bundle shakes, the tap spurts). At 70 s, 5 owners were nagging (`x-nags-70s`). |
| #10 no onboarding / first laugh | **Partly** | Dunk the Sarge at 25.5 m is an excellent first laugh (kids miss, "Whoosh! Nope!", SPLOSH!, "Oi! …Actually, it's quite refreshing."). The coach marks are invisible (new #2). |
| #11 mute villagers | **Fixed** | Babble voice on every bubble, per-person voice types; oi/yay/aww/hey; positional tell loops; heartbeat on hold-breath. |
| #12 comedy misfires | **Mostly fixed** | Fist-shake faces Jack (head angle to Jack 153° → 4–6° at 1–1.5 s). Bubbles are one per speaker, capped, and clipped to the scope (`x-decoy-flour`). The flour is still a big white cloud (#8). |

**Also fixed:**
- Scope colour fringing is now rim-only at 0.005 (clean centres in `10-job-*`).
- The bunting bundle is now a readable rainbow roll (`x-8x-bunting`).
- The landlord is no longer hidden by a lamp post.
- The sky has a hot-air balloon.
- Spanner ids now persist (save: `spanner-church`, `spanner-phonebox`, `spanner-chimney`).
- `capture.mjs` reaches the results screen.
- `Debug.shootJob` resets recoil.
- 90 → 63 shader programs.

### Regressed or new

1. **The office-path intro is a blank void (new Blocker, #1).** It's a side effect of the synchronous level-reuse path running inside `office.update()`.
2. **Coach marks are invisible (#2).** The new tutorial ships broken.
3. **The miniature DOF blurs close-up cinematics (#3).** This is a side effect of turning `tilt` on for the high preset.
4. **Draw calls crept up 15%**, from 441–518 to 541–604 at the overview. That's still under the 700 budget but leaves little headroom for the next location.

### Not re-checked this round

The off-screen hint arrow under the clipboard and the static results screen, which still looks unchanged.

## Also found (below the top 12)

- **gameplay:** Bad hits during the post-shift hunt still count toward the grade (`Shooting.js:141` has no `shiftDone` guard). Either freeze grading when the shift ends, or say so on the "Shift done" card.
- **gameplay:** Locked jobs say "Finish another job first." Name the prerequisite instead ("Needs: Fountain's gone dry") so the chain is a puzzle, not a mystery.
- **gameplay:** The H nudge picks the first open job in list order (it gave "Dunk the Sarge" with the reticle elsewhere). Pick the open job nearest the reticle.
- **audio:** No stinger when the last main job lands ("ALL JOBS DONE!" is silent apart from `jobDone`), and the level track doesn't change for the post-shift hunt. A short brass sting and a lighter "hunt" mix would mark the moment.
- **perf:** Boot and Retry still build the level synchronously (the loading card covers Retry; the boot splash covers first load). Consider splitting `build()` across frames.
- **UI:** The first-person rifle still covers a chunk of the fête in the default view (lower right, `x-perch-default`). It's smaller than R1 but still the biggest single occluder.

## What works (protect it)

- **The default perch view** (`x-perch-default`, `03-overview`): a genuinely attractive, dense, well-lit toy diorama. Keep this framing as the template for every location.
- **Dunk the Sarge:** a readable tell, a funny payoff and a guaranteed first laugh at 25 m (`x-play-first-frame`, `x-dunk-t155`, `21-feedback-after`).
- **The jobs as set pieces:**
  - The ribbon opening brings fanfare, fireworks and released balloons.
  - The decoys each get a gag line ("Not the cone! Now it's stuck on FAST!", "Not the BUTT! Now it's a swamp!").
  - Nag escalation gives the level a living clock.
- **Characters at 8x** (Mrs Crumb, the Mayor, the Sarge, the cricketers) and the **voiced villagers**.
- **The briefing clipboard** and the **radio hint**, both well written and on-style.
- **0 console errors** across the capture run, the perch/decoy pass, two full office-to-results flows and the verification pass.

## Play-through log (through `window.__game`, real shots with recoil and sway zeroed)

- **Office path:**
  - A real mouse dart at the Puddleby flyer reuses the level (no rebuild, no loading card needed) and goes to the intro. The swoop is a void (#1).
  - Then `state=briefing`: the clipboard lists all 14 jobs; locked ones say "Finish another job first."
  - A click starts the shift and requests pointer lock.
- **Chains:**
  - Ribbon before bunting stays `open`, and so does the selfie before the fountain.
  - After their prerequisites, both go `done`.
- **All jobs:**
  - All 12 main jobs complete with a real shot: dunk, fountain, selfie, bunting, ribbon, sign, pigeons, icecream, postman, kite, bell ×2 (DING = 1/2, DONG = done), tap.
  - The secrets (vane, melons) complete too.
  - All 3 spanners are collected.
- **Decoys:**
  - Flour → pigeons `failed`.
  - Giant cone → ice-cream `failed` (the jingle goes into overdrive).
  - Water butt → tap `failed`.
  - Each gets an anger sticker and a gag line (`x-decoy-*`).
- **Bad hit (Mr Grubb):** `badHits` 1, BAD HIT!, hat pops, and his head turns to Jack (4–6° off at 1–1.5 s), then back.
- **Bullet-cam:** triggers on the last main job while scoped, then unscopes. Flight 1.3 s, then the pull-back ("About time too! Right, my petunias…").
- **Post-shift hunt:** "Shift done! 5 secrets left" card. Finding the last spanner auto clocks off and goes to results.
- **Results:** A grade (12/12, 3/3 spanners, 1 bad hit, 86%). The office shows 978 coins, 3★, "Best grade A", and `seenTutorial: true`.
- **Nags at 70 s:** fountain, pigeons, icecream, sign and bunting were nagging; the rest were calm.

## Baseline metrics for Review 3

| Metric | R1 | R2 | Target |
|---|---|---|---|
| Overview draw calls / triangles | 441–518 / 1.00–1.15 M | 541–604 / 1.17–1.31 M | ≤700 / ≤1.5 M |
| Shader programs | 80–90 | 63–66 | ≤65 |
| Plaza area | 4,330 m² | 2,306 m² | ≈2,300 m² |
| People / animals | 44 / 11 | 85 / 16 | keep density |
| Nearest job to perch | 54 m | 25.5 m | ≤25 m |
| Featureless ground at the yaw limits | 51–56% | 20–22% | <15% |
| Featureless ground in the default view | 18% | 19% (14% plain near lawn) | <10% |
| Building height on screen, unscoped default | 40–60 px | 110–240 px | keep |
| UI area at the first play frame | ~34% | ~14% | <12% |
| Office-path intro frames showing the village | n/a | 0 of 3 | 3 of 3 |
| Coach mark visible after 1 s | n/a | no (opacity 0) | yes |
| Stall signs with real text | n/a | 0 of 12 | 12 of 12 |
| Console errors | 0 | 0 | 0 |
