// Characters: bean-folk villagers, animals and simple controllers. See README.md.
export { Person } from './Person.js';
export { Walker } from './Walker.js';
export { Crowd } from './Crowd.js';
export { PRESETS, PRESET_NAMES, randomConfig, resolveConfig } from './personConfig.js';
export { ACTION_NAMES } from './personActions.js';
export { HAIR_STYLES, HATS } from './personBuild.js';
export { PROP_TYPES } from './props.js';
export { Animal } from './animals/Animal.js';
export { Pigeon, Gull, Duck, Chicken, Pelican } from './animals/birds.js';
export { Dog, Cat, Cow, Sheep } from './animals/mammals.js';
export { PigeonFlock } from './animals/PigeonFlock.js';

import { Pigeon, Gull, Duck, Chicken, Pelican } from './animals/birds.js';
import { Dog, Cat, Cow, Sheep } from './animals/mammals.js';
/** Species registry: name -> class (same API: root, setAction, react, celebrate, lookAt, update). */
export const ANIMALS = { Pigeon, Duck, Dog, Cat, Gull, Pelican, Cow, Sheep, Chicken };
