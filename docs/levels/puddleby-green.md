# Location 1 — Puddleby Green (village square) — level design spec

**Mood:** sunny Tuesday morning, village fête being set up, cosy British comedy.
**Preset:** `morning`. **Par:** 240 s. **Ambience:** `village`.
**Perch:** Jack's van parked on the road at the south edge; crow's-nest eye at about (0, 12, 62), looking north (-Z).
Yaw limit ±75°, pitch −40°…+15°. Everything important sits within 25–130 m of the perch.

## Layout (top view, north = up = −Z; perch at bottom)
```
                    backdrop hills · windmill · distant spire
   ┌─────────────────────────────────────────────────────────────────┐
   │  CHURCH + bell tower (NW)   terrace of 5 houses (N)   OAK TREE +  │
   │  wedding party on steps                               green (NE)   │
   │  graveyard wall · yew       phone box · post box      kite in oak  │
   │                                                       bench+postman│
   │ terrace (W)        ┌──────── COBBLED SQUARE ────────┐  THE WONKY  │
   │ shops: bakery,     │  bunting lines criss-cross      │  PINT pub   │
   │ post office,       │        FOUNTAIN (centre)        │  (E) tables │
   │ hardware           │  pigeon flock · benches         │  parasols   │
   │ tap on wall        │  MARKET: 4 stalls (S of fountain)│  ice-cream │
   │                    └─────────────────────────────────┘  van on road│
   │  allotment / gardens (SW)    road ───────────────────────────────  │
   │                 JACK'S VAN (perch) · bus stop · lamp posts         │
   └─────────────────────────────────────────────────────────────────┘
```
Square ~70 × 55 m centred near (0, 0, −10). Road runs E–W along the south (z ≈ +45) and up the east side.

## Jobs (10 main + 2 secret). Each needs a *tell*, a satisfying reaction and a bystander reaction.
| id | Title (clipboard) | Clue (handwritten) | Target | Tell | Reaction |
|---|---|---|---|---|---|
| `fountain` | Fountain's gone dry | "The fountain's sulking. Something's stuck tight." | fountain valve wheel | sad drips, a kid tapping the basin | valve spins, jets gush, kids cheer, pigeons bathe |
| `bell` | Wedding bells | "The happy couple are waiting for a ding-dong." | church bell in the belfry | bride/groom looking up, vicar checking watch | bell swings + rings, confetti from the church door, couple kiss/cheer |
| `sign` | Wonky pub sign | "Landlord says his sign's gone all wonky. Again." | loose bolt on the pub sign bracket | sign hanging by one chain, creak | sign swings level with a ta-da, landlord thumbs-up |
| `bunting` | Bunting for the fête | "Can't have a fête without bunting!" | hook holding the furled bunting coil | coil on a hook by the post office | bunting unfurls across the square, villagers cheer |
| `pigeons` | Feed the pigeons | "Mrs Crumb's arms are too tired to open her seed bag." | birdseed bag on her bench | old lady on bench, bag beside her | seeds spill, flock swoops down around her, she claps |
| `icecream` | That blasted jingle | "The ice-cream van jingle's stuck on repeat. Make it stop!" | roof loudspeaker | floating ♪ notes + audible jingle loop | speaker sparks, jingle stops, van man waves |
| `postman` | Wake the postman | "Postie Pete's nodded off. The letters won't deliver themselves." | alarm clock on the bench by him | Zzz letters above the sleeping postman | clock rings & hops, Pete leaps up, resumes his round |
| `kite` | Free the kite | "Little Poppy's kite is stuck up the big oak." | the tangled string knot / small branch | kite flapping in the canopy, kid pointing up | kite floats free, Poppy runs with it |
| `selfie` | Tourist selfie | "The tourists can't reach their camera button." | camera on tripod | tourists posing, waving | flash! photo pops out, tourists cheer |
| `tap` | Leaky tap | "Mr Grubb's garden tap won't stop dribbling." | tap handle on a house wall | puddle + drips, grumpy gardener | handle spins, drip stops, gardener waters flowers |

Secret jobs (clipboard shows "Secret job ???" until found):
| `vane` | Which way's the wind? | church weathervane rotor | spins wildly, rooster crows |
| `melons` | Melon mayhem | the stacked melons on the fruit stall | melons roll away, trader chases them |

Golden Spanners (3): on the church roof ledge, inside the red phone box, tucked behind a chimney pot.

## Life & gags (bystanders — hitting them is a Bad Hit)
- 30–45 villagers: market shoppers & 4 traders, kids running around the fountain, dog walkers
  (one dog walking its owner), vicar, bride & groom + 4 guests, 3 pub-goers at tables, a painter at an
  easel, a jogger loop around the square, a policeman, the postman (asleep), 2 tourists, Mrs Crumb,
  Mr Grubb the gardener, a man stuck in a wheelie bin, a lady chasing a runaway hat.
- Animals: pigeon flock in the square (scatters on nearby impacts), a cat on a garden wall, 2 dogs,
  gulls/birds circling overhead, ducks in the fountain once it is flowing.
- Ambient motion: bunting/flags/laundry flap, chimney smoke, clock hands, windmill, clouds, a bus
  arriving/leaving on the road loop, a cyclist loop.

## Performance
Target ≤ 700 draw calls at the overview: merge static scenery per material, instance trees/flowers/
cobbles/fence posts, characters ≤ 6 draw calls each.
