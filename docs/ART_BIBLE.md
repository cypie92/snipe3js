# Jack of All Blasts — Art Bible

Reference: the original *Sniper Dan* (Denki / PQube, 2026) is described by press as
"a colourful toy box brought to life", "chunky, rounded designs like little plasticine
figures or oversized Lego characters", "colorful low-poly 3D visuals with simplified shapes,
saturated colors and a toy-like quality", "busy worlds, cartoon chaos", "a Fisher-Price
my-first-sniper look and feel", "exaggerated characters and expressive animation",
"environments packed with objects, small details and plenty of visual jokes".
We follow that *style* with 100% original, procedural assets. We never copy their names,
characters, logos or layouts.

## 1. One-line pitch for the look
**A sunny toy-box diorama you spy on through a scope.** Every object looks like a chunky,
soft-edged, glossy-ish vinyl/clay toy. Nothing is realistic, nothing is gritty, nothing is thin.

## 2. Shape language
- Chunky and rounded. Use `RoundedBoxGeometry` (bevel radius 8–20% of the smallest side),
  capsules, spheres, fat cylinders (>= 12 radial segments when round, 6–8 when "low-poly" is the intent).
- Exaggerate: fat chimneys, oversized doors/windows with thick frames, big round tree canopies,
  bulbous cars, giant fruit. Thin details (ropes, strings, antennas) only when they are gameplay.
- Silhouettes must read at 60–150 m through a 4x–8x scope. Test at gameplay distance, not close-up.
- Slight irregularity makes things feel hand-made: jitter rotations ±2–4°, vary sizes ±10%,
  lean fences, wobble rooflines. Never perfectly grid-aligned repetition.
- Foliage / rocks / hills = faceted low-poly (flat shading). Man-made + characters = smooth shading.

## 3. Palette (sRGB hex; `src/gfx/palette.js` is the source of truth)
Saturated, sunny, cheerful — but harmonious. Avoid pure black (#000) and pure white (#fff).
| Role | Colours |
|---|---|
| Grass | `#7cc653` main, `#5fae44` dark, `#9bd86a` light |
| Paths / cobbles / sand | `#ecdcb8`, `#d8c39a`, `#c9ad7f` |
| House walls | cream `#fff1d6`, peach `#ffc9a3`, mint `#bfe8cc`, sky `#c2e4ff`, lilac `#dccbf3`, butter `#ffe590`, rose `#ffb8c2` |
| Roofs | terracotta `#e0643c`, brick `#c8503a`, slate blue `#5b7db1`, teal `#2f9e91`, plum `#8a5a9e` |
| Wood | `#c0824a`, dark `#7a4a26` |
| Accents | tomato `#ff5a4e`, sunflower `#ffc93c`, teal `#2ec4b6`, cobalt `#3a6ee8`, bubblegum `#ff7eb6`, tangerine `#ff9f1c` |
| Metal | `#a9b4c2`, dark `#4a5566` |
| Water | shallow `#5fd0f5`, deep `#1e88c8`, foam `#e9fbff` |
| Skin | `#ffd9bd`, `#f3bd8f`, `#dca070`, `#b27449`, `#7d4c2f` |
| Ink (darkest) | `#2b2b3a` — outlines, pupils, UI strokes |

## 4. Lighting & rendering
- Warm sun (`#fff0d9`) at 35–50° elevation, soft PCF shadows; cool hemisphere fill
  (sky `#bfe3ff` / ground `#8a9a6a`). Shadows are soft, bluish-purple, never black.
- Ambient occlusion (N8AO) grounds every object; contact shadows under characters are mandatory.
- Tone mapping keeps colours punchy (Neutral/AgX + slight saturation boost). Subtle bloom only
  on genuinely bright things (sun glints, lamps, sparks, water highlights).
- Atmospheric perspective: fog tinted with the horizon colour; distant hills desaturate/blue.
- Materials: `MeshStandardMaterial`, vertex colours, roughness ~0.6–0.85 (satin toy plastic),
  metalness 0. Exceptions: glass (roughness 0.1, light blue), car paint (0.35), water (custom).
- A PMREM room environment at low intensity gives toys a soft sheen.

## 5. Characters ("bean folk")
- ~1.6 m tall; big head (≈40% of height), pill-shaped body, stubby arms/legs, mitten hands.
- Face: big white eyes with dark pupils, tiny nose, optional brows/moustache/beard/glasses.
  Faces must still read as "a face" at 80 m through 8x.
- Variety via kits: skin tones, hair (bob, bun, spiky, bald, quiff, pigtails), hats (flat cap,
  bowler, top hat, beanie, hard hat, chef, sun hat, fisherman), outfits (overalls, apron,
  dress, suit, hi-vis, stripes), accessories (bag, balloon, newspaper, camera, ice cream).
- Animation is exaggerated and bouncy: waddle walk with body bob + squash/stretch, idle sways,
  chatting gestures, sweeping, sleeping (Zzz), cheering, pointing. Reactions to being hit:
  hat pops off, spin, jump, shake fist, "!" / "?!" icon. Never violent, never injured.
- Animals: chunky and cute (pigeons, ducks, dogs, cats, gulls, pelican, cows, sheep, chickens).

## 6. Environments
- Each location is a dense diorama roughly 140 x 140 m seen from Jack's van-mounted tower.
  Busy like a *Where's Wally* page: something to look at every few metres.
- Visual gags everywhere (dog walking a man, gnome on a roof, man stuck in a bin, giant marrow).
- Layered backdrop: patchwork hills, hedgerows, distant trees, sea/lake glint, puffy clouds.
- Everything alive: trees/flags sway, chimney smoke, birds flock, NPCs walk/chat/work,
  vehicles drive loops, water ripples, laundry flaps.

## 7. Gameplay readability
- Job targets are discoverable, not highlighted: they have a *tell* (drips, sparks, wobble,
  smoke, a character looking/pointing at it, a "!" thought bubble after a while).
- Job targets must be at least ~0.25 m on screen-relevant size at their distance with 4x zoom,
  or be large enough to be hittable with a steady hand at 8x. Tiny targets get invisible
  enlarged colliders.
- Bystanders (people/animals) are never directly in front of job targets unless on purpose.

## 8. UI style ("stickers & clipboards")
- Fonts: **Fredoka** (titles, numbers, buttons) and **Patrick Hand** (clipboard handwriting).
- Chunky rounded panels, 3px ink (`#2b2b3a`) outlines, hard offset drop shadows (0 4px 0 ink),
  sticker-like badges, slight rotations (±2°) for playfulness. Bright fills from the accent palette.
- The job list is a clipboard with paper, handwritten clues and inked check marks.
- Grades are big rubber stamps (S / A / B / C / D) slammed by **Inspector Pidge**, a pigeon in a peaked cap.
- Motion: springy (overshoot) easing, 150–400 ms. Every click/hit gets feedback.

## 9. The scope
- Full-screen scope: black mask with soft inner shadow, thin ink reticle with mil-dots,
  small red centre dot, zoom badge (2x/4x/8x), range readout in metres.
- Subtle lens effects when scoped: chromatic aberration at the rim, vignette, depth-of-field
  focused on what is under the reticle, gentle sway (breath) with a hold-breath mechanic.
