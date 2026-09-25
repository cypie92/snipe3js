# Location 2 — Barnacle Bay (harbour) — level design spec

**Mood:** breezy, glittering late afternoon; gulls everywhere; chaotic, salty seaside comedy.
**Preset:** `golden` (warm low sun from the perch side). **Par:** 270 s. **Ambience:** `harbour`.
**Perch:** Jack's van on the harbour road at the south; eye ≈ (0, 12, 64) looking north (−Z) over
the basin to the lighthouse. Yaw ±80°, pitch −40°…+18°.

## Layout (top view, north = −Z)
```
                 open sea · distant islands · passing ship on the horizon
   ┌───────────────────────────────────────────────────────────────────┐
   │ WRECKED GALLEON on rocks (NW)        LIGHTHOUSE at end of the        │
   │ seals on rocks                       breakwater pier (N), bell buoy  │
   │                                                                     │
   │ CRANE + cargo boat (W quay)   ~~~~ HARBOUR BASIN (water) ~~~~        │
   │ crates, forklift              fishing boats · rowboat · ferry pier   │
   │ FISH MARKET hall (W)          sailing dinghy · lobster pots · buoys  │
   │                                                                     │
   │ quay road · chip shop + queue · bollards · nets · ICE-CREAM kiosk    │
   │         BEACH (E): beach huts, deckchairs, windbreaks, sandcastles   │
   │ stacked colourful cottages up the hillside (E and W edges)          │
   │                     JACK'S VAN (perch) on the harbour road           │
   └───────────────────────────────────────────────────────────────────┘
```

## Jobs (10 main + 2 secret)
| id | Title | Clue | Target | Tell | Reaction |
|---|---|---|---|---|---|
| `pelican` | Stop that thief! | "A cheeky pelican keeps nicking Fred's fish. Shut the fish box!" | stick propping the fish-box lid | pelican gulping fish, Fred shaking fist | lid slams, pelican squawks & waddles off in a huff |
| `lighthouse` | Light the lighthouse | "Fog's rolling in and the lighthouse is having a nap." | lamp switch lever on the gallery | dark lamp, keeper waving | lamp blazes on and sweeps a beam |
| `crane` | Jammed crane | "The dockside crane's stuck with a crate dangling. Again." | brake gear on the crane | crate swaying, dockers scratching heads | crate lowers onto the cargo boat, dockers cheer |
| `foghorn` | All aboard! | "The ferry can't leave without a toot." | foghorn pull cord on the ferry pier | ferry idling, captain checking watch | BWAAAMP, ferry chugs off across the basin |
| `buoy` | Bell buoy | "The bell buoy's gone quiet. Boats keep getting lost!" | bell on the bobbing buoy (moving target) | buoy bobbing, lost rowers going in circles | bell dings, rowers find their way |
| `nets` | Tangled nets | "Old Salty's net is snagged on a bollard." | the knot on the bollard | fisherman tugging | net flops into his boat, he dances a jig |
| `sail` | Hoist the sail | "Young Kit's dinghy won't go without its sail." | cleat rope on the dinghy mast | kid paddling with hands | sail unfurls, dinghy zips away |
| `anchor` | Runaway rowboat | "Grandad's snoozing in a rowboat and he's drifting out to sea!" | rope holding the anchor on the rowboat | Zzz, boat drifting (moving) | anchor drops with a splash, boat stops |
| `beachhut` | Locked out | "Mrs Dune's beach-hut door is stuck and her sandwiches are inside." | door latch on the pink beach hut | lady pulling the door | door springs open, sandwiches retrieved |
| `chips` | Chip shop shutter | "The chippy's shutter is jammed and there's a queue round the block." | shutter release on the chip shop | long queue tapping feet | shutter rolls up, queue cheers |

Secret jobs: `treasure` — shoot the lock on the chest in the wrecked galleon (gold coins spill, bonus
coins); `seal` — shoot the beach ball on the rocks so the seals play catch.
Golden Spanners: lighthouse gallery, inside a lobster pot, top of the crane jib.

## Life & gags
Dockers in hi-vis, fishermen, a captain, lifeguard in a tall chair, swimmers bobbing, sunbathers,
kids building sandcastles, chip-eating tourists being eyed by gulls, a man chasing a runaway
deckchair, a dog on a paddleboard. Animals: gull flocks (scatter on nearby impacts), the pelican,
seals on the rocks, crabs on the beach. Everything on water bobs; boats move on loops; flags/
bunting flap; lighthouse beam sweeps after its job; a ship crosses the horizon.

## New kit needed
- Buildings: lighthouse (gallery, lamp, switch lever), fish market hall with giant fish sign, quay
  walls/steps/breakwater, stacked hillside cottages variant, beach huts, chip shop (shutter), kiosk.
- Props: fishing boat, rowboat (anchor + rope), sailing dinghy (furled sail + cleat), ferry,
  cargo boat, wrecked galleon (+ treasure chest), dockside crane (jib, hook, crate, brake gear),
  buoys (bell buoy), lobster pots, fish boxes (lid + prop stick), nets, bollards, rope coils,
  lifebuoys, deckchairs, windbreaks, sandcastles, beach balls, lifeguard chair, foghorn.
- Characters: docker, sailor/captain, lifeguard, swimmer (bobbing in water), sunbather; animals:
  seal, crab; actions: eat (chips), swim, row.
- Water: tech-art `createWater()` for the basin and sea.
