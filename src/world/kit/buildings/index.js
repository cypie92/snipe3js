// Buildings kit: public API. See README.md in this folder for options, parts and examples.
export { house, terrace, buildHouse, resolveHouse, DOOR_COLORS, BRICKS } from './house.js';
export { shop, SHOP_KINDS, addAwning } from './shop.js';
export { pub, pubAtlas, addParasol, addPicnicTable, addBarrel } from './pub.js';
export { church, makeBell, makeWeathervane, addStainedLancet } from './church.js';
export { fountain } from './fountain.js';
export { phoneBox, postBox, busStop, bandstand, wellHouse } from './small.js';
export { cobbleSquare, cobbleTexture, road, pavement, lowWall, picketFence, hedgeRow } from './ground.js';
export { backdrop } from './backdrop.js';
// building blocks for bespoke architecture
export { Kit, cbox, frustum, ngonFrustum, prism, extrude, lathe, sweep, resample, stats, addCollider, hsl, shade, mix } from './common.js';
export { addWindow, addWindowBox, addDoor, addChimney, addDormer, addGutter, addDrainpipe, addQuoins, addTimbers, addClimber, addHangingBasket, addBrickPatch } from './facade.js';
export { gableRoof, hipRoof, mansardRoof, ngonRoof } from './roofs.js';
export { signMaterial, labelMaterial, roundelMaterial, clockFaceMaterial, stainedGlassMaterial, numberPlate, paintedTexture, FONT } from './signs.js';
// harbour (Barnacle Bay)
export { quay, breakwater, slipway, beach, harbourLand, addBoulder, addMooringBollard, SEA_LEVEL, HARBOUR_STONE } from './harbour.js';
export { lighthouse } from './lighthouse.js';
export { harbourCottage, beachHut, kiosk, chipShop, HARBOUR_WALLS, HARBOUR_ROOFS } from './seaside.js';
export { makeWashing, makeGnome } from './house.js';
