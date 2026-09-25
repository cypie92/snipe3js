// Seeded random villager generator + named presets. A config fully describes a person's look and
// motion personality; geometry is cached per look (motion fields are excluded from the key).
import { Rng } from '../../core/rng.js';
import { P, CLOTHES } from '../../gfx/palette.js';
import { shade } from './rig.js';

const SKIN = P.skin;
const HAIR = P.hair; // ink, dark brown, brown, blond, light blond, grey, ginger
const WHITE_HAIR = '#f0ece4';
const BOTTOMS = ['#3d5a8a', '#3d4a6b', '#c8b27a', '#7d8595', '#8b5e3c', '#34384a', '#2f4858', '#6b8e23', '#a0522d'];
const SHOES = ['#5a3a22', '#34384a', '#8b5e3c', '#e8e1d0', '#c8503a', '#3d4a6b'];
const TOP_POOL = CLOTHES.filter((c) => c !== '#3d4a6b' && c !== '#2f4858');
const HAT_COLS = {
  flatcap: ['#8b6b4a', '#6b7a5a', '#7d8595', '#5a4a3a'], bowler: ['#34384a', '#5a3a22'], tophat: ['#2b2b3a', '#3d4a6b'],
  beanie: [P.tomato, P.teal, P.sunflower, P.cobalt, P.bubblegum, P.tangerine], sunhat: ['#f2d27a', '#fff1d6', '#ffb8c2'],
  cap: [P.tomato, P.cobalt, P.teal, P.lime, P.tangerine], bucket: ['#c8b27a', '#fff1d6', P.teal], beret: [P.tomato, '#34384a', '#3d4a6b'],
  party: [P.bubblegum, P.teal, P.sunflower],
};
export const GENERIC_HATS = ['flatcap', 'bowler', 'beanie', 'sunhat', 'cap', 'bucket', 'beret', 'tophat', 'party'];
export const GENERIC_TOPS = ['tee', 'shirt', 'jumper', 'stripes', 'hivis', 'suit', 'overalls', 'apron', 'dress', 'cardigan', 'hawaiian', 'sport'];
export const ACCESSORIES = ['bag', 'balloon', 'newspaper', 'camera', 'icecream', 'broom', 'rod', 'shopping', 'book', 'scarf'];
export const IDLE_STYLES = ['relaxed', 'hips', 'behind', 'front', 'fidget', 'look'];

/** Deep-ish merge: b over a (objects merged one level, other values replaced). */
const REPLACE_ON = { top: 'type', bottom: 'type', hat: 'type', hair: 'style' };
function over(a, b) {
  const o = { ...a };
  for (const k of Object.keys(b || {})) {
    const v = b[k];
    if (v === undefined) continue;
    const isObj = v && typeof v === 'object' && !Array.isArray(v);
    const replace = REPLACE_ON[k] && isObj && v[REPLACE_ON[k]] && a[k] && v[REPLACE_ON[k]] !== a[k][REPLACE_ON[k]];
    o[k] = isObj && !replace && a[k] && typeof a[k] === 'object' ? { ...a[k], ...v } : v;
  }
  return o;
}

function norm(opts) {
  const o = { ...opts };
  if (typeof o.hair === 'string') o.hair = { style: o.hair };
  if (typeof o.hat === 'string') o.hat = { type: o.hat };
  if (typeof o.top === 'string') o.top = { type: o.top };
  if (typeof o.bottom === 'string') o.bottom = { type: o.bottom };
  if (typeof o.skin === 'number') o.skin = SKIN[o.skin % SKIN.length];
  return o;
}

/** Random look. opts can pin any field (same shape as a config). */
export function randomConfig(rng, opts = {}) {
  if (!(rng instanceof Rng)) rng = new Rng(rng ?? 1);
  const age = opts.age || (rng.chance(0.12) ? 'kid' : rng.chance(0.15) ? 'elder' : 'adult');
  const kid = age === 'kid', elder = age === 'elder';
  const skin = rng.pick(SKIN);
  const hairCol = elder ? rng.pick([WHITE_HAIR, HAIR[5], HAIR[5]]) : rng.pick(HAIR.slice(0, 5).concat([HAIR[6], HAIR[1], HAIR[0]]));
  const styles = kid ? ['pigtails', 'short', 'spiky', 'bob', 'curly', 'ponytail', 'bun']
    : elder ? ['bald', 'balding', 'bun', 'short', 'curly', 'parted', 'bob']
      : ['short', 'bob', 'bun', 'spiky', 'quiff', 'pigtails', 'curly', 'long', 'ponytail', 'bald', 'afro', 'parted', 'mohawk'];
  let style = rng.pick(styles);
  if (style === 'mohawk' && rng.chance(0.6)) style = 'spiky';
  const hair = { style, color: style === 'mohawk' && rng.chance(0.5) ? rng.pick([P.bubblegum, P.teal, P.violet]) : hairCol };
  if (style === 'pigtails' || style === 'ponytail' || style === 'bun') hair.tie = rng.pick([P.tomato, P.bubblegum, P.sunflower, P.teal]);
  hair.hidesEars = ['bob', 'long'].includes(style);

  let top = rng.pick(kid ? ['tee', 'stripes', 'jumper', 'dress', 'overalls', 'sport', 'tee'] : elder ? ['cardigan', 'jumper', 'shirt', 'suit', 'dress', 'shirt'] : GENERIC_TOPS);
  const topCol = rng.pick(TOP_POOL);
  let top2 = rng.pick(TOP_POOL.filter((c) => c !== topCol));
  const topCfg = { type: top, color: topCol, color2: top2, sleeves: rng.pick(['long', 'short', 'short']) };
  if (top === 'stripes') topCfg.color2 = rng.pick(['#fff8ee', '#3d4a6b', P.tomato].filter((c) => c !== topCol));
  if (top === 'suit') { topCfg.color = rng.pick(['#34384a', '#3d4a6b', '#6b5a4a', '#5b6b7a', '#2f4858']); topCfg.sleeves = 'long'; topCfg.tie = rng.pick([P.tomato, P.cobalt, P.sunflower, P.teal]); }
  if (top === 'hivis') { topCfg.color = rng.pick(['#d4f02a', '#ff8a1c']); topCfg.sleeveColor = rng.pick(['#fff8ee', '#3d4a6b', '#7d8595']); topCfg.sleeves = 'long'; }
  if (top === 'overalls') { topCfg.sleeves = rng.pick(['long', 'short']); }
  if (top === 'apron') topCfg.color2 = rng.pick(['#fff8ee', '#fff8ee', P.tomato, P.teal]);
  if (top === 'cardigan') { topCfg.sleeves = 'long'; topCfg.button = rng.pick(['#fff1d6', P.sunflower]); }
  if (top === 'hawaiian') { topCfg.color = rng.pick([P.teal, P.cobalt, P.tomato, P.tangerine]); topCfg.color2 = rng.pick([P.bubblegum, P.lime]); topCfg.sleeves = 'short'; }
  if (top === 'sport') { topCfg.color2 = '#fff8ee'; topCfg.sleeves = 'short'; }
  if (top === 'dress') { topCfg.sleeves = rng.pick(['short', 'none', 'long']); topCfg.hem = rng.chance(0.5) ? rng.pick(['#fff8ee', top2]) : null; }

  let bottomType = top === 'dress' ? 'skirt' : rng.pick(kid ? ['shorts', 'trousers', 'skirt', 'shorts'] : ['trousers', 'trousers', 'trousers', 'shorts', 'skirt', 'long']);
  if (elder && bottomType === 'shorts') bottomType = 'trousers';
  const bottom = { type: bottomType, color: top === 'overalls' ? rng.pick(['#3d5a8a', '#4a6fa5', '#6b8e23']) : rng.pick(BOTTOMS) };
  if (bottomType === 'skirt' || bottomType === 'long') bottom.color = rng.chance(0.5) ? rng.pick(TOP_POOL) : rng.pick(BOTTOMS);

  let hat = null;
  if (rng.chance(kid ? 0.3 : 0.42)) {
    const type = rng.pick(kid ? ['cap', 'beanie', 'sunhat', 'party', 'cap'] : elder ? ['flatcap', 'bowler', 'sunhat', 'beret', 'flatcap'] : GENERIC_HATS);
    hat = { type, color: rng.pick(HAT_COLS[type] || [P.tomato]) };
    if (type === 'beanie') hat.color2 = shade(hat.color, 0.8);
    if (type === 'sunhat') hat.band = rng.pick([P.bubblegum, P.teal, P.tomato]);
    if (type === 'cap') hat.color2 = rng.chance(0.5) ? '#fff8ee' : shade(hat.color, 0.7);
  }
  if (top === 'hivis' && rng.chance(0.5)) hat = { type: 'hardhat', color: rng.pick([P.sunflower, '#fff8ee', P.tangerine]) };

  const face = {
    eyeSize: kid ? 1.15 : rng.range(0.92, 1.1),
    eyeGap: rng.range(-1, 1),
    pupil: rng.range(0.92, 1.08),
    nose: rng.range(0.85, 1.3),
    noseShape: rng.pick(['button', 'button', 'button', 'big', 'long']),
    brows: elder ? 'bushy' : rng.pick(['normal', 'normal', 'thick', 'thin']),
    blush: kid || rng.chance(0.4),
    cheeks: rng.range(0.02, 0.1),
    mouthW: rng.range(0.85, 1.15),
    smile: rng.range(0.55, 1.0),
  };

  const facialOK = !kid && !['pigtails', 'bun', 'long', 'bob', 'ponytail'].includes(style);
  const facial = facialOK && rng.chance(elder ? 0.45 : 0.28) ? rng.pick(['moustache', 'beard', 'moustache', 'handlebar', 'stubble', 'bigbeard']) : null;
  const glasses = rng.chance(elder ? 0.6 : 0.16) ? rng.pick(['round', 'round', 'square', ...(elder ? [] : ['shades'])]) : null;

  let accessory = null;
  if (rng.chance(kid ? 0.5 : 0.3)) accessory = rng.pick(kid ? ['balloon', 'icecream', 'balloon', 'icecream'] : elder ? ['bag', 'newspaper', 'shopping', 'book'] : ['bag', 'newspaper', 'camera', 'icecream', 'shopping', 'scarf', 'balloon']);

  const build = kid
    ? { height: rng.range(0.9, 1.0), width: rng.range(0.9, 1.05), belly: rng.range(0, 0.3), head: 1.12, legs: rng.range(0.9, 1.0) }
    : { height: rng.range(0.93, 1.08), width: rng.range(0.9, 1.28), belly: rng.chance(0.35) ? rng.range(0.4, 1) : rng.range(0, 0.3), head: rng.range(0.95, 1.04), legs: rng.range(0.92, 1.08) };
  if (elder) { build.height *= 0.95; build.belly = Math.max(build.belly, rng.range(0.2, 0.8)); }

  const cfg = {
    age, kid, elder, skin, hair, hat, top: topCfg, bottom, shoes: rng.pick(SHOES), face, facial, glasses, accessory, build,
    belt: top !== 'dress' && rng.chance(0.3) ? rng.pick(['#5a3a22', '#34384a', '#8b5e3c']) : null,
    socks: bottomType === 'shorts' && rng.chance(0.4) ? rng.pick(['#fff8ee', P.tomato, P.sunflower]) : null,
    scale: kid ? rng.range(0.7, 0.78) : 1,
    balloonColor: rng.pick([P.tomato, P.cobalt, P.sunflower, P.bubblegum, P.teal, P.lime]),
    bagColor: rng.pick([P.roofPlum, P.tomato, '#8b5e3c', P.teal, '#34384a']),
    icecream: rng.int(0, 2),
    motion: {
      energy: kid ? rng.range(1.15, 1.35) : elder ? rng.range(0.6, 0.8) : rng.range(0.85, 1.15),
      tempo: kid ? rng.range(1.05, 1.2) : elder ? rng.range(0.75, 0.9) : rng.range(0.9, 1.1),
      stoop: elder ? rng.range(0.15, 0.3) : 0,
      idle: rng.pick(elder ? ['behind', 'front', 'relaxed', 'look'] : IDLE_STYLES),
      phase: rng.range(0, 100),
    },
  };
  return fill(over(cfg, norm(opts)), rng);
}

// Fill in derived defaults & sanity after overrides.
function fill(cfg, rng) {
  cfg.kid = cfg.age === 'kid' || !!cfg.kid;
  if (cfg.kid) { cfg.build = { ...cfg.build, head: Math.max(cfg.build.head, 1.1) }; }
  if (!cfg.hair.color) cfg.hair.color = rng.pick(HAIR);
  cfg.hair.hidesEars = ['bob', 'long'].includes(cfg.hair.style);
  if (cfg.hat && !cfg.hat.color) cfg.hat.color = rng.pick(HAT_COLS[cfg.hat.type] || [P.tomato]);
  if (!cfg.top.color) cfg.top.color = rng.pick(TOP_POOL);
  if (!cfg.top.sleeves) cfg.top.sleeves = 'long';
  if (!cfg.bottom.color) cfg.bottom.color = rng.pick(BOTTOMS);
  return cfg;
}

// ------------------------------------------------------------------------------ presets
// Each preset is a partial config (layered on a seeded random base) + a default action.
export const PRESETS = {
  postman: {
    top: { type: 'postman', color: '#9cc9f0', sleeves: 'short', trim: P.tomato },
    bottom: { type: 'shorts', color: '#2f3f6b' }, socks: '#2f3f6b', shoes: '#2b2b3a',
    hat: { type: 'postman', color: '#2f3f6b', band: P.tomato }, accessory: 'postbag', bagColor: P.tomato, age: 'adult',
    action: 'walk',
  },
  chef: {
    top: { type: 'chef', color: '#fbf7f0', sleeves: 'long', scarf: P.tomato }, bottom: { type: 'trousers', color: '#5a6378' },
    hat: { type: 'chef', color: '#fbf7f0' }, facial: 'handlebar', build: { belly: 0.9, width: 1.22 }, shoes: '#2b2b3a', age: 'adult', glasses: null,
    action: 'talk',
  },
  vicar: {
    top: { type: 'vicar', color: '#2b2b3a', sleeves: 'long' }, bottom: { type: 'trousers', color: '#2b2b3a' }, shoes: '#2b2b3a',
    hair: { style: 'balding', color: '#c8c8d0' }, hat: null, glasses: 'round', facial: null, accessory: 'book', age: 'elder',
    face: { brows: 'bushy', blush: true }, action: 'idle', motion: { idle: 'front' },
  },
  bride: {
    top: { type: 'wedding', color: '#fbf7f0', sleeves: 'none', sash: '#ffd1dc' }, bottom: { type: 'long', color: '#fbf7f0' },
    hair: { style: 'bun', color: HAIR[3] }, hat: { type: 'veil', color: '#fbf7f0' }, accessory: 'bouquet', facial: null, glasses: null,
    face: { blush: true, eyeSize: 1.08 }, age: 'adult', shoes: '#fbf7f0', build: { width: 0.95, belly: 0.1 }, action: 'idle', motion: { idle: 'front' },
  },
  groom: {
    top: { type: 'suit', color: '#2b2b3a', sleeves: 'long', tie: '#2b2b3a', bow: true, flower: '#fbf7f0', shirt: '#fbf7f0' },
    bottom: { type: 'trousers', color: '#2b2b3a' }, shoes: '#2b2b3a', hat: { type: 'tophat', color: '#2b2b3a', band: '#4a5566' },
    hair: { style: 'short' }, facial: null, glasses: null, accessory: null, age: 'adult', action: 'idle', motion: { idle: 'behind' },
  },
  kid: {
    age: 'kid', top: { type: 'stripes', color: P.tomato, color2: '#fff8ee', sleeves: 'short' }, bottom: { type: 'shorts', color: '#3d5a8a' },
    hair: { style: 'pigtails', color: HAIR[6], tie: P.sunflower }, hat: null, accessory: 'balloon', balloonColor: P.cobalt,
    face: { blush: true, eyeSize: 1.18 }, action: 'cheer',
  },
  fisherman: {
    top: { type: 'raincoat', color: P.sunflower, sleeves: 'long' }, bottom: { type: 'trousers', color: '#2f3f6b' }, boots: '#34384a',
    hat: { type: 'fisherman', color: P.sunflower }, facial: 'bigbeard', hair: { style: 'short', color: '#e8e4dc' }, facialColor: '#eeeae2',
    age: 'elder', glasses: null, accessory: 'rod', action: 'fish', motion: { stoop: 0.1 },
  },
  farmer: {
    top: { type: 'overalls', color: '#d8433a', color2: '#b8332a', sleeves: 'short', button: P.sunflower }, bottom: { type: 'trousers', color: '#4a6fa5' },
    boots: '#4f9a3c', hat: { type: 'straw', color: '#f2d27a', band: P.tomato }, straw: true, facial: 'stubble', glasses: null,
    age: 'adult', build: { belly: 0.6, width: 1.15 }, accessory: null, action: 'idle', motion: { idle: 'hips' },
  },
  police: {
    top: { type: 'police', color: '#243056', sleeves: 'long' }, bottom: { type: 'trousers', color: '#243056' }, belt: '#2b2b3a', shoes: '#2b2b3a',
    hat: { type: 'police', color: '#243056' }, facial: 'moustache', glasses: null, accessory: null, age: 'adult',
    build: { width: 1.12, belly: 0.5 }, action: 'idle', motion: { idle: 'behind' },
  },
  tourist: {
    top: { type: 'hawaiian', color: P.teal, color2: P.bubblegum, sleeves: 'short' }, bottom: { type: 'shorts', color: '#c8b27a' },
    socks: '#fbf7f0', shoes: '#8b5e3c', hat: { type: 'bucket', color: '#fff1d6', color2: '#e8d7b0' }, glasses: 'shades', skin: '#ffc9b0',
    accessory: 'camera', facial: null, age: 'adult', action: 'photo', face: { blush: true },
  },
  oldLady: {
    age: 'elder', top: { type: 'cardigan', color: '#b89adb', sleeves: 'long', button: '#fff1d6' }, bottom: { type: 'long', color: '#8a5a9e' },
    hair: { style: 'bun', color: WHITE_HAIR }, hat: null, glasses: 'round', accessory: 'handbag', bagColor: '#c8503a', facial: null,
    face: { blush: true, brows: 'thin' }, shoes: '#5a3a22', action: 'walk', motion: { stoop: 0.3, energy: 0.6, tempo: 0.8, idle: 'front' },
  },
  builder: {
    top: { type: 'hivis', color: '#ff8a1c', sleeveColor: '#fbf7f0', sleeves: 'short' }, bottom: { type: 'trousers', color: '#3d5a8a' },
    boots: '#8b5e3c', hat: { type: 'hardhat', color: P.sunflower }, facial: 'moustache', glasses: null, accessory: null,
    age: 'adult', build: { belly: 0.8, width: 1.25 }, action: 'idle', motion: { idle: 'hips' },
  },
  trader: {
    top: { type: 'apron', color: '#fbf7f0', color2: '#fbf7f0', apronStripe: '#3a6ee8', sleeves: 'short' }, bottom: { type: 'trousers', color: '#34384a' },
    hat: { type: 'flatcap', color: '#6b5a4a' }, facial: 'moustache', glasses: null, accessory: null, age: 'adult', action: 'talk',
  },
  jogger: {
    top: { type: 'sport', color: P.bubblegum, color2: '#fbf7f0', sleeves: 'short' }, bottom: { type: 'shorts', color: '#34384a' },
    shoes: '#fbf7f0', socks: '#fbf7f0', hat: { type: 'headband', color: P.sunflower }, hair: { style: 'ponytail', color: HAIR[1], tie: P.sunflower },
    facial: null, glasses: null, accessory: null, age: 'adult', build: { width: 0.9, belly: 0 }, action: 'run',
  },
  painter: {
    top: { type: 'smock', color: '#fff1d6', sleeves: 'long' }, bottom: { type: 'trousers', color: '#34384a' },
    hat: { type: 'beret', color: P.tomato }, facial: 'handlebar', hair: { style: 'short', color: HAIR[0] }, glasses: null,
    accessory: 'palette', age: 'adult', action: 'paint',
  },
};
export const PRESET_NAMES = Object.keys(PRESETS);

/** Resolve a (possibly partial) person options object into a full config. */
export function resolveConfig(opts = {}) {
  const seed = opts.seed ?? 1;
  const rng = new Rng(typeof seed === 'string' ? seed : (seed >>> 0) || 1);
  let o = norm(opts);
  if (o.preset) {
    const pre = PRESETS[o.preset];
    if (!pre) throw new Error(`Unknown person preset: ${o.preset}`);
    const { action, ...look } = norm(pre);
    o = over(look, o);
    o.defaultAction = o.defaultAction || action;
  }
  const cfg = randomConfig(rng, o);
  if (cfg.facial && !cfg.facialColor && cfg.hair.style === 'bald') cfg.facialColor = cfg.hair.color;
  return cfg;
}

/** Cache key for geometry (look only). */
export function lookKey(cfg) {
  const { motion, seed, defaultAction, preset, name, scale, ...look } = cfg;
  return JSON.stringify(look);
}
