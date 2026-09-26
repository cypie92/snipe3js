// Characters: bean-folk villagers, animals and simple controllers. See README.md.
export { Person } from './Person.js';
export { setCharacterLook, setCharacterScale, characterMaterial, LOOK } from './look.js';
export { onCharacterEvent, offCharacterEvent } from './events.js';
export { TELL, ICON_ALIASES } from './icons.js';
export { Walker } from './Walker.js';
export { Crowd } from './Crowd.js';
export { PRESETS, PRESET_NAMES, THEMES, randomConfig, resolveConfig, voiceFor } from './personConfig.js';
export { ACTION_NAMES, ACTION_ICONS, BUSY_HANDS, WATER_ACTIONS, SEATED_ACTIONS, actionIcon } from './personActions.js';
export { HAIR_STYLES, HATS } from './personBuild.js';
export { PROP_TYPES } from './props.js';
export { Animal } from './animals/Animal.js';
export { Pigeon, Gull, Duck, Chicken, Pelican } from './animals/birds.js';
export { Dog, Cat, Cow, Sheep } from './animals/mammals.js';
export { PigeonFlock, GullFlock } from './animals/PigeonFlock.js';
export { Seal, Crab, SealCatch } from './animals/sea.js';
export { setWet } from './wet.js';

import { Pigeon, Gull, Duck, Chicken, Pelican } from './animals/birds.js';
import { Dog, Cat, Cow, Sheep } from './animals/mammals.js';
import { Seal, Crab } from './animals/sea.js';
/** Species registry: name -> class (same API: root, setAction, react, celebrate, lookAt, update). */
export const ANIMALS = { Pigeon, Duck, Dog, Cat, Gull, Pelican, Cow, Sheep, Chicken, Seal, Crab };
