// Props kit: street furniture, yard clutter, market, festive, vehicles, gags. See README.md.
export { lampPost, bench, bin, wheelieBin, bollard, planter, signpost, noticeBoard, bikeRack, hydrant, trafficCone, gardenTap } from './street.js';
export { bicycle, picnicTable, parasolTable, easel } from './leisure.js';
export { crate, barrel, sack, wheelbarrow, ladder } from './yard.js';
export { marketStall, melonStack, STALL_SIGNS } from './market.js';
export { bunting, balloonBunch, washingLine, flagPole, weathervane, kite } from './festive.js';
export { car, iceCreamVan, bus, tractor, wheelGeo, rigWheels } from './vehicles.js';
export { gnome, giantMarrow, alarmClock, cameraOnTripod, birdseedBag, teapot, fireworkRocket, trophy, goldenSpanner } from './gags.js';
// Barnacle Bay (harbour): boats float with the waterline at y = 0
export { fishingBoat, rowboat, dinghy, ferry, cargoBoat, wreckedGalleon } from './boats.js';
export { dockCrane, foghorn, bellBuoy, buoy, lobsterPot, fishBox, netPile, snaggedNet, mooringBollard, ropeCoil, lifebuoy, anchorProp } from './harbour.js';
export { deckchair, windbreak, sandcastle, beachBall, lifeguardChair, bucketSpade, surfboard, crab, beachTowel, beachParasol } from './beach.js';
export { hull, floatRig, digits } from './boatlib.js';
// painted signs on the shared sign atlas (one material for every kit sign -> batches into one draw call)
export { wordSign, signDecal, paintBoard, fitWords, whenFontsReady, signPages, SIGN_FONT } from './signs.js';
// helpers the level code may want
export { stats, collider, boxCollider, ballCollider, LiveMesh, InstancedPieces, Anims, ease, wobble, lean, goldMaterial } from './lib.js';
