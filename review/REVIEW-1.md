# Review 1: Jack of All Blasts · Puddleby Green + office hub

**Build:** `31d531a` (HEAD, 2026-09-26 07:22 UTC) · **Viewport:** 1600×900, `quality=high`, headless Chromium + SwiftShader
**Shots:** `review/shots/iter1/` (git-ignored, so they're local only). `00`–`40` come from `tools/capture.mjs`. The `x-*` shots come from my own Playwright passes: perch/edges/8x/characters, office → intro → shift → results, bullet-cam, bad hit, and DOM and raycast checks.
**Baseline:** this is the first review, so there's nothing to compare against yet. The metrics at the end are the yardstick for Review 2.
**Tech-art in progress:** the runs were served from the working tree, which included the tech artist's uncommitted `Tracer.js` edit (07:26). Their later edits to Environment colours, Renderer DOF bokeh and post (08:15 onward) came after my captures. None of them change the sun direction, the lens CA amount or the bullet-cam scope state, so issues #3, #6 and the CA note still apply.

## Verdict

The kit is better than the game built from it. Through the scope, Puddleby Green is genuinely charming. You can read the Wonky Pint sign at 70 m. There's a golden bell with a Golden Spanner on the belfry ledge, a gnome on Mr Grubb's roof, and an ice-cream van with a giant cone. The jobs pay off like little set pieces. The office hub is the best thing in the build.

The view you actually play from is another story. Unscoped, from the crow's nest, the village is a thin strip beyond 45 m of lawn. It's arranged around a 4,330 m² empty beige plaza, lit flat from behind the camera, and for the first 9 seconds a clipboard covers the left 40% of the screen. It reads as a tidy model railway, not "a colourful toy box brought to life".

The reward moment is broken too: the job you just finished vanishes from the clipboard. The climax bullet-cam is smeared with scope chromatic aberration. The puzzles are "find the thing the clue names". There is one location. It's a strong prototype with excellent parts, but it isn't yet a demo that makes a stranger say wow.

## Scores

| # | Category | Score | Why |
|---|---|---|---|
| 1 | Art direction match | **7** | The kit nails chunky, rounded and saturated up close (`x-8x-sign`, `10-job-10-tap-4x`, `01-office`). At play distance it's flat lawn, flat plaza and faceted hills, all front-lit, so it reads as a model railway rather than a toy box. |
| 2 | Scene density & life | **5** | 44 villagers, 11 animals (ducks, dogs, cat, hens, gulls), 16 pigeons and good gags (the man in the bin, the dog walking its owner, the runaway hat, the maypole). They're spread over a 4,330 m² plaza and ~250 m of lawn, though. At the ±75° yaw limits, 51–56% of the ground band is featureless. |
| 3 | Characters & animation | **7** | Varied, charming bean folk with lids, pupils and brows, readable at 8x out to ~70 m (`x-char8x-Mrs-Crumb`, `x-8x-icecream`), and a good hat-pop reaction. But they're 60–70 px tall at 110 m even at 8x (`x-char8x-bride`), they're mute, and the fist-shake never faces Jack. |
| 4 | Lighting & rendering | **5.5** | N8AO, soft shadows, bloom, grade, outlines, DOF focus pull and lovely chunky clouds are all there. But the sun sits behind the player (azimuth −50°) so everything is flat, the ground is one tone, the scope CA smears rainbows, and the CA and DOF bleed into the bullet-cam (`x-bulletcam-a-flight`). The tech-art pass is still in progress. |
| 5 | Gameplay depth | **5** | 10 jobs, 2 secrets, 3 spanners, one decoy, one dependency, a two-hit bell, the post-shift hunt, grades and upgrades. But the clues name their targets, hints jump straight to a marker (the written hint text is never shown), there's no pressure and there are no modes. |
| 6 | Game feel / juice | **6** | Recoil springs, bolt animation, tracers, per-surface bursts, pigeons scattering, set-piece reactions, and a slow-mo letterboxed bullet-cam with a nice pull-back. Against that: the finished row vanishes, there's no hit-stop, the bullet-cam is smeared and its impact frame is a confetti mess, and the flour and soft-hit puffs turn into white boulders. |
| 7 | UI / UX | **5** | The sticker and clipboard style is on-brief and well built. But: the completed row vanishes (a CSS bug), a third of the first frame is UI, there's no onboarding, speech bubbles pile up and float over the scope mask, the flyer names are covered by stickers, and the game freezes silently for ~5 s after you pick a job. |
| 8 | Audio (code) | **7.5** | 51 LUFS-calibrated SFX, a positional mix with air absorption, a scope-focus ambience filter, 5 beds with events and 3 composed swing tracks. But the villagers are mute, `heartbeat` and `hey` are never played, and the dogs aren't positional. |
| 9 | Performance | **7** | 441–518 draw calls and 1.0–1.15 M triangles at the overview (within the 700-call budget), static batching, 1-call characters, shadow LOD and adaptive quality. But there are 80–90 shader programs and a 4.8 s main-thread level build that runs twice per session. fps can't be measured under SwiftShader. |
| 10 | Completeness & polish | **4** | The full loop (title → office → intro → play → hunt → results → office) works with 0 console errors in every run. But there's one location, three "coming soon" flyers, a "soon" modes easel, no tutorial, and visible UI and FX bugs. |
| | **Average** | **5.9** | |

## First 10 seconds: would a stranger say "wow"?

**No. "Aww, cute" at best, and the cute part is the menu.**

1. **Loading screen.** "Loading the village…" stays up while the level builds on the main thread (4.8 s of CPU here). There's no progress indicator.
2. **Title** (`00-title`). The logo slam is great, but the orbiting aerial is dominated by the empty plaza.
3. **Office** (`01-office`, `x-hub-hover-flyer`). This is the high point: a cutaway toy office, sticker tooltips, Pidge tracking your aim, a sleeping cat, and suction darts that go THWOCK. It lands.
4. **Shoot the flyer** (`x-hub-dart-on-flyer`). The game then freezes for about 5 s while the already-built village is rebuilt, with no feedback.
5. **Intro swoop** (`x-intro-t1`). It opens 75 m up over the bare plaza. The best frame in the whole build (`x-intro-t2`: windmill, sea and fête from a high 3/4 angle) flashes past mid-swoop.
6. **First play frame** (`x-play-first-frame`). The left 40% of the screen is clipboard, plus a key legend, a "Click to aim" pill and a big orange rifle. The village is 40–60 px tall. Nothing moves near the camera, and no problem is visible without the scope.

A wow needs three things: a dense, close, well-lit diorama in the first play frame, a guaranteed laugh within the first 10 s of play, and no dead time between the office and the level.

## Top 12 issues (ordered by impact)

### 1. [Blocker] From the crow's nest the village is a distant model railway, not a toy box (level, perch)
- **Evidence:** `x-perch-p0` (compact clipboard). The whole village sits in a band about 270 px tall (y≈380–650 of 900). Terrace, church and pub are 40–60 px tall. In front of them are 45 m of lawn, road and flat flowerbed discs. The plaza is a beige void.
  - `02-intro` and `x-intro-t1`: the plaza holds 8 stalls, a fountain and about 20 people.
  - `10-job-12-melons-4x`: even at 4x the market is mostly bare cobbles.
- **Cause:** In `layout.js:13`, `SQUARE` spans x −50.5…37 and z −44.5…14.5, about 87×59 m or 4,330 m². In `util.js:8`, `PERCH = (0,12,62)`. That puts the perch 47.5 m from the plaza's near edge, 74 m from the fountain and 110–123 m from the terrace, church and oak. `dressing.js` puts only 4+4 stalls and about 10 crates in the square.
- **Fix:**
  - Shrink `SQUARE` to about 55×40 m by sliding the west row (`F0`), the east shops (`east[].f`), `PUB` and the terrace (z −47.6 → about −36) inward.
  - Move `PERCH` to about (0, 16, 44), with the road and van at z≈50. A 16 m eye looks down at about 25°, which reads as a tabletop diorama. Note how much better `x-intro-t2` looks from higher up.
  - Fill the square: a second market row, a queue at every stall, a bandstand or war memorial, parked cars and a milk float, a street performer, prams. Aim for at least one character or gag per ~40 m² of plaza.
  - Put the fête (bouncy castle, coconut shy, tombola, marquee) on the lawn directly under the van instead of 25–45 m off to the side.
  - Re-verify every job sight line afterwards. The `HIDDEN` tree list and the wedding-party placement both depend on the current geometry.

### 2. [Major] The job you just finished disappears from the clipboard (UI)
- **Evidence:** In `20-feedback-jobdone`, `21-feedback-after` and `x-play-07`, the "Fountain's gone dry" row vanishes and every other row shifts column. In `x-play-02-flour-fail`, the failed "Feed the pigeons" row vanishes the same way, so you never see its red ✗ when it happens. A DOM dump shows `<li class="done flash">` computing to `position:absolute; inset:0; opacity:0`, 536 px tall, invisibly covering the paper. After a clean full run the last row was still `done flash`, so it was still hidden.
- **Cause:** `Hud.renderJobs()` (`Hud.js:124`) tags the changed row with class `flash`. The full-screen hit-flash overlay rule `.flash { position:absolute; inset:0; opacity:0 }` (`hud.css:132`) also matches it. Every complete, fail or progress event hides the newest row. That includes the bell after its first DING.
- **Fix:** Rename the row class in `Hud.js:124` and `hud.css:87`, for example to `li.just`, or scope the overlay rule to `.hud > .flash`. Then make the tick land: an animated ✓ stroke plus the `stamp` SFX.

### 3. [Major] Flat front light, and the ground is one flat colour (tech-art, still in progress)
- **Evidence:** In `x-perch-p0` and `03-overview` the facades are evenly lit and every shadow falls behind its caster, where the perch can't see it. The lawns and plaza are single flat tones, and haze is the only depth cue. Compare `x-intro-t2`, where a higher angle finally shows shadows and form.
- **Cause:** `Environment.js:19` sets morning `sunAzim −50`, `sunElev 38` ("over the player's left shoulder"), so the light direction is roughly the view direction. The ground colour noise in `layout.js` `groundMesh` uses 9 m and 23 m cells with only about ±10% variation.
- **Fix:**
  - Move the key light to the side-back (`sunAzim` ≈ −105…−120°, elevation 28–32°). Fronts still get grazing light, and long soft shadows rake across the cobbles toward the camera.
  - Use cool lilac shadow fill and stronger ground AO (high preset: `ao.intensity` 3→4, `radius` 2.6→3.5).
  - Add mowing stripes on every lawn, darker grass under trees and along walls, and a worn edge on the plaza.
  - Try the existing `toggles.tilt` miniature DOF lightly on the unscoped view.

### 4. [Major] About a third of the first play frame is UI (UI, gameplay)
- **Evidence:** In `x-play-first-frame` and `03-overview`, the expanded clipboard covers 38% of the width and 60% of the height for 9 s, hiding the church, the west row and the allotments. On top of that: the "Click to aim" pill, a two-line key legend, the ammo and chips, and a rifle filling most of the bottom-right quadrant. In `x-perch-p0` the orange stock and orange mittens merge into one blob.
- **Cause:** `Hud.setup()` sets `setClipMode('expanded')` and `clipAuto = 9` (`Hud.js:114`). The viewmodel hip is `(0.22, −0.2, −0.56)` at scale 0.42 (`Viewmodel.js:86`).
- **Fix:**
  - Show the clue list as a briefing card during the intro swoop, when the screen is idle anyway, and start play in compact mode.
  - Fade the key legend after the first shot rather than after 14 s.
  - Drop the rifle about 30% lower and further right (hip ≈ (0.26, −0.27, −0.6)) and give the mittens a colour that contrasts with the walnut.

### 5. [Major] Shooting the flyer freezes the game for ~5 s, then the intro opens on the emptiest view in the game (gameplay, hub)
- **Evidence:** Timing hooks show `def.build` taking **4,785 ms** on the main thread after the dart lands, while `x-hub-dart-on-flyer` stays on screen. In `x-intro-t1` the swoop starts 75 m up over the bare plaza.
- **Cause:** `Game.onOfficeAction` calls `startLevel(a.id)` (`Game.js:347`), which calls `loadLevel`, which runs `disposeLevel` and then a synchronous rebuild. But `boot()` already built `LEVELS[0]` for the title and office backdrop (`Game.js:289`). `playIntro` starts at r=120, h=75 m looking at the plaza centre (`Game.js:456`).
- **Fix:**
  - Reuse the boot-built level while it's still fresh (reset its jobs and actors instead of rebuilding), or build it in the background while the office is open.
  - If a rebuild is unavoidable, cover it with a "Jack drives to Puddleby Green…" card.
  - Re-author the swoop: start low behind the van, rise with the mast, pass over the busiest cluster, hold for a beat on the `x-intro-t2` angle with the title card, then settle on the perch.

### 6. [Major] The shift's climax, the bullet-cam, is smeared by scope lens CA and DOF, and its impact frame is unreadable (tech-art, gameplay)
- **Evidence:** `x-bulletcam-a-flight`, `-b-impact` and `-c-pullback` all show heavy RGB-split ghosting on roads, houses and walls, plus DOF blur, in every bullet-cam frame. The impact frame is a close-up wall filled by an opaque white puff and flat confetti planes. The pull-back framing on Mr Grubb in `-c` is good.
- **Cause:** `BulletCam.play()` (`BulletCam.js:26`) never unscopes. `Game.frame` keeps calling `renderer.setScope(rig.scopeT, …)` (`Game.js:654`), so `lens.amount` stays at 0.012 and the DOF stays on during the cinematic (`Renderer.js:347`). Players almost always fire the last shot while scoped. The `rig.shake(0.6)` at impact also does nothing, because `CameraRig.update` returns early while `override` owns the camera.
- **Fix:**
  - In `BulletCam.play`, set `rig.setScoped(false)`, `rig.scopeT = 0` and `renderer.setScope(0)`, or make the Renderer ignore the scope while `rig.override` is set. Focus the DOF on the bullet.
  - At impact, cut to a 3/4 angle 6–8 m from the target for 0.3 s, then pull back.
  - Add a 60–80 ms hit-stop, and apply the shake to the override pose.

### 7. [Major] Half the frame is bare lawn at the yaw limits (level)
- **Evidence:** In `x-edge-left75`, `x-edge-right75` and `x-edge-right-4x`, 51–56% of the ground band is flat-colour 16 px blocks, and 42–53% of it is plain lawn. At 248 m, `x-edge-right-4x` shows one flagpole and one tree in an empty field.
- **Cause:** `yawLimit` is ±75° (`index.js:36`), but nothing stands west of the west road or east of the east lane apart from trees scattered at 64–104 m. The ground disc (R=132 m) meets the backdrop in a visible seam.
- **Fix:** Either narrow the yaw limit to ±55–60°, or dress both flanks. For the west, a farm paddock (the kits already have cows, sheep and a tractor); for the east, a cricket match or car-boot sale, a duck pond and a caravan. Add a hedgerow patchwork on the diorama ground (reuse the backdrop hedges) and a gentle ground rise to hide the seam.

### 8. [Major] Puzzles are "find the named object", and hints hand you the answer (gameplay, UI)
- **Evidence:** The clues in `jobs.js` name their targets: "seed bag", "ice-cream van jingle", "garden tap", "stuck up the big oak". There's only one decoy (the flour), one dependency (selfie ← fountain) and one two-hit job (the bell). `useHint()` drops a spinning marker on the target, and the carefully written `hint:` strings are never displayed: `Game.js:589` toasts `job.title`, and `Hud.showHint` ignores `job.hint`. The hint also picks the first un-hinted job in list order, not the one you're looking at.
- **Fix:**
  - Make hints two-tier: the first press shows `job.hint` text, the second drops the marker. Pick the open job nearest the reticle.
  - Rewrite about half the clues as observations: "Somebody's got the whole square humming", "The fête can't open till the flags are out".
  - Add two more decoys (two alarm clocks, two identical bags) and one or two more chains, e.g. tap → Grubb waters the prize marrow → marrow secret.
  - Tighten par below 240 s once the level is denser.

### 9. [Major] The tells don't read from the perch, and nobody signals for help (characters, level)
- **Evidence:** From `x-perch-p0` none of the 10 problems can be identified unscoped. The tell poses (scratch, shrug, lookUp, point) never pop an icon. The chatter hint only fires while scoped within 0.22 NDC of a talker.
- **Cause:** `ACTION_ICONS` (`personActions.js:671`) only covers `jig`, `shakeFist`, `whistle` and `impatient`.
- **Fix:**
  - Give the tell actions '?' or '!' stickers, sized to read unscoped at 100 m.
  - Once a job has been open ~45 s, have its owner pop a '!' every ~8 s and give the target a bigger tell: the sign swings and creaks, the fountain coughs a puff, the kite flaps hard, the clock rattles.

### 10. [Major] No onboarding, and no guaranteed first laugh (gameplay, UI)
- **Evidence:** `seenTutorial` exists (`Progression.js:19`) but nothing reads it. The first frame is the full clue list plus a key legend. The nearest job is 54 m away (the pigeons); most are 70–120 m.
- **Fix:** Write a 20-second first-shift beat:
  - The intro ends pointing at an easy, close job about 25 m from the van, e.g. a cat stuck on the van's ladder or the policeman's helmet on a lamp.
  - A sticker prompt says "Right-click: scope · Click: shoot".
  - Hitting it gets a big reaction (cheer, confetti, a voice).
  - Only then does the rest of the clipboard slide in.

### 11. [Major] The villagers are mute (audio)
- **Evidence:** 40+ talkers have scripted lines (`cast.js`), and every reaction bubble is silent. A bad hit plays the `badHit` sting, but the victim never yelps: the `hey` SFX exists and is never called. `heartbeat` is never used during hold-breath. Dogs bark only as a non-positional ambience event (`ambience/index.js`).
- **Fix:**
  - A synthesized gibberish "babble" voice per character (pitch by age and scale, 3–8 syllables per bubble), triggered from `Popups.bubble` / `ctx.say`.
  - `hey` / "oi!" at the victim's position from `Person.react`.
  - A heartbeat loop plus a mix low-pass while holding breath.
  - Route woofs to the visible dogs.

### 12. [Minor] The comedy beats misfire (gameplay, tech-art, UI)
- **Evidence:**
  - **The fist-shake never faces Jack.** `x-badhit-grubb-t100`: Grubb shakes his fist at his front door. `Shooting.js:141` passes the raw raycast hit to `actor.react(hit)`. `Person.react` looks for `origin`, `from`, `ray` or `direction`, finds none, so `reactFace = 0` and `personActions.js:692` rotates by 0.
  - **The flour sack becomes a 6 m opaque white boulder** that hides Mrs Crumb (`x-play-03-flour-after`). Four `smoke` bursts at scale 2.6 (`jobs.js:272`) use opaque, growing blobs. The `soft` hit puffs at 8x do the same (`x-badhit-grubb-t025`).
  - **Speech bubbles float over the black scope mask for off-scope speakers and pile up.** See `x-play-07` (the flour line hangs outside the circle) and `x-shiftdone-card` (7–8 overlapping bubbles, one clipped at the edge).
- **Fix:**
  - Pass `{ ...hit, origin }` from `Shooting.fire` into `impact` and on to `react`.
  - Give the flour its own burst: many 0.3–0.6 m puffs, a dust ring, and Mrs Crumb turned white.
  - Cap big blob sizes at high zoom.
  - Hide bubbles outside the scope circle while scoped, show at most 3 at once (nearest the reticle first), and clamp them to the screen.

## Wow multipliers (most delight per effort)

1. **Pull the world in (level + perch, about a day).** Issue #1 is mostly coordinates: a smaller square, a higher and closer perch, the fête under the van, and more people per square metre using the existing kit. The unscoped view turns from a distant strip into a framed tabletop diorama. That's the single biggest jump in the "wow in 10 s" test, and every future location should be built to the same template.
2. **Light it like a toy photo (tech-art, hours).** Use a raking 3/4 side-back sun with long lilac shadows across the cobbles, a mild `toggles.tilt` miniature DOF on the unscoped view (the code already exists), and a clean bullet-cam (issue #6). Screenshots and the intro swoop instantly look like a product.
3. **Give the village a voice and a first laugh (audio + level, 1–2 days).** Gibberish babble on every bubble, "oi!" on bad hits, and a scripted close-range first job with a big reaction (issue #10). The bubble system, synth voice kit and crowd cheer all exist; this turns "cute" into "ha!" inside the first 10 seconds of play.

## Also found (below the top 12)

- **UI:** In the office, the "Barnacle Bay" and "Wobbleton Farm" flyer names are covered by the SOON stickers, and flyer titles are about 10 px tall at 1600×900 (`01-office`). The room also floats in an empty faceted-green void. Fix: move the stickers, bring the camera closer (`Office.js:28`, z 12.9→~11, fov 31→28), and set the room in a lane with Jack's van parked outside.
- **UI:** The off-screen hint arrow can hide under the clipboard (`x-play-12-hint`).
- **UI:** Level speech bubbles keep popping behind the results panel (`x-results-completeAll`). The results screen is also static; Pidge waddling in and coins flying into the chip would make it feel finished.
- **tech-art:** Normal scoping has too much CA: rainbow smears on the maypole ribbons and bunting across the outer third of the circle (`10-job-05-pigeons-4x`, `10-job-04-bunting-4x`). Lower the lens amount from 0.012 to about 0.005 and start it at 80% radius.
- **props:** From the perch the flowerbeds read as flat pizza discs (`x-perch-p25`). Raise their rims and add height.
- **props:** The bunting bundle (a job target) reads as a small beige blob at 84 m (`10-job-04-bunting-4x`). Make it a fat rainbow roll with flags poking out.
- **level:** The landlord, who is the pub sign's tell, stands exactly behind a lamp post from the perch (`x-char8x-landlord`). Move him about 1 m.
- **level:** Above the horizon the sky is empty (`x-sky-up15`). A hot-air balloon, a blimp towing a fête banner, fête kites or a bird flock would add "busy" cheaply.
- **gameplay:** Collecting a spanner loses its id. `Game.collect()` deletes `userData.hit` (`Game.js:596`), so `showResults` records every spanner as `c.name` (`Game.js:551`). The save shows `spanners: ["goldenSpanner"]`, so per-spanner progress can never be tracked.
- **gameplay:** Bad hits and wasted shots during the post-shift hunt still lower the grade and accuracy, even though the card says the shift is done. Either freeze grading at the end of the shift or say so on the card.
- **gameplay/tools (lead):** `capture.mjs:128` no longer reaches the results screen: `40-results` shows the Shift-done card, so the tool needs to call `game.clockOff()`. Also, `Debug.shootJob` resets sway but not `rig.recoil`, `recoilVel`, `recoilYaw` or `shakeAmt`. In frozen automation those never decay, so consecutive scripted shots drift: my first scripted pass missed the bell, sign, kite and bride, while a pass with recoil zeroed hit everything.

## What works (protect it)

- **The office hub** (`x-hub-hover-flyer`, `x-hub-after-shift`): a cutaway toy room, sticker tooltips, suction darts with THWOCK pops, Pidge tracking your aim, a trophy appearing after a graded shift. The best 10 seconds in the build.
- **Close-up kit quality:** the pub sign (`x-8x-sign`), the belfry with a readable Golden Spanner (`x-8x-bell`), Mr Grubb's garden with a gnome on the roof (`10-job-10-tap-4x`), the ice-cream van (`x-8x-icecream`), the smiling kite (`x-8x-kite`), and Mrs Crumb (`x-8x-pigeons`).
- **Jobs are staged as set pieces:**
  - The fountain gushes and the kids cheer (`21-feedback-after`, `x-play-07`), then ducks fly in and pigeons bathe.
  - The bunting unfurls line by line across the square (`x-play-11`).
  - The melons roll and the trader gives chase (`x-play-17`).
  - The tourists turn and pose once the fountain runs.
  - The in-world chatter clues ("That's the seed bag, dear. The brown one.") are exactly the right idea.
- **The audio engineering** (LUFS-calibrated SFX, positional mix, scope-focus ambience filtering, composed music) is ahead of the visuals.
- **Tech:** under 520 draw calls and about 1.1 M triangles at the overview, and 0 console errors across every run.

## Play-through log (through `window.__game`, shots taken with recoil and sway zeroed)

- **Requires chain:** Shooting the selfie camera before the fountain leaves the job `open` (it registers as locked). After the fountain it goes `done`.
- **Bell:** DING leaves it at 1/2 and still `open`; DONG makes it `done`.
- **All jobs:**
  - Every main job completes with a real shot from the perch: fountain, selfie, bell ×2, sign, bunting, pigeons (via the correct bag), ice-cream, postman, kite, tap.
  - The two secrets (vane, melons) complete the same way.
  - All 3 spanners are hittable and collect.
  - A raycast sweep shows 6–14 of 147 bbox rays reaching each spanner, so they're visible but small.
- **Decoy:** Shooting the flour sack sets pigeons to `failed`, with a red ✗ (once the row reappears, see #2), an anger icon and Mrs Crumb's line.
- **Bad hit:** A shot at Mr Grubb registers (`badHits` 1): BAD HIT!, a "!?" sticker, the hat pops, then an anger cloud. The fist-shake faces the wrong way.
- **Bullet-cam:** It triggers on the last main job (the tap) and runs 3.75 s of sim time, including a 1.3 s flight.
- **Post-shift hunt:** The "Shift done! 5 secrets left" card shows and the timer freezes. Finding the last spanner auto clocks off and goes to results.
- **Results:** A clean run with 1 bad hit got an A (10/10, +600). `completeAll` got an S with Pidge's gold stamp (`x-results-completeAll`). The hub then shows 790 coins, 3★ and a gold trophy.
- **Console errors:** 0 across the capture run, both play-throughs, the hub flow and all DOM and raycast checks.

## Baseline metrics for Review 2

| Metric | Now | Target |
|---|---|---|
| Overview draw calls / triangles | 441–518 / 1.00–1.15 M | ≤700 / ≤1.5 M |
| Shader programs after a full shift | 80–90 | fewer, precompiled |
| Level build on the main thread (flyer → intro) | 4,785 ms, run twice per session | 0 (reuse) or covered by a card |
| Featureless ground blocks at ±75° yaw | 51–56% | <15% |
| Featureless ground band in the default view (`x-perch-p0`) | 18% | <10% |
| Plaza area / stalls / people in the plaza | 4,330 m² / 8 / ~20 | ~2,200 m² / 12+ / 50+ |
| Village height on screen in the unscoped default view | 40–60 px | 120+ px |
| Screen area covered by UI at the first play frame | ~34% (clipboard ≈23%, rifle ≈7%, chips, legend and prompt ≈4%) | <12% |
| Nearest job to the perch | 54 m | ≤25 m (tutorial beat) |
| Console errors | 0 | 0 |

## Since last review

Nothing to compare: this is the first review. Watch for these regressions in Review 2:
- After the recompose, job sight lines still hold (the bride/groom, the chimney and phone-box spanners).
- Draw calls stay under 700 once the square is densified.
- The clipboard still shows every row.
- The bullet-cam is free of scope effects.
