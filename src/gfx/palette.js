// Single source of truth for colours (sRGB hex). See docs/ART_BIBLE.md.
export const P = {
  grass: '#7cc653', grassDark: '#5fae44', grassLight: '#9bd86a', hedge: '#4f9a3c',
  path: '#ecdcb8', pathDark: '#d8c39a', sand: '#e8d29a', dirt: '#b98a5a',
  cobble: '#d9ccb4', cobbleDark: '#bfae92', asphalt: '#6b7280', kerb: '#d5d0c8',
  wallCream: '#fff1d6', wallPeach: '#ffc9a3', wallMint: '#bfe8cc', wallSky: '#c2e4ff',
  wallLilac: '#dccbf3', wallButter: '#ffe590', wallRose: '#ffb8c2', brick: '#d9785c',
  roofTerracotta: '#e0643c', roofBrick: '#c8503a', roofSlate: '#5b7db1', roofTeal: '#2f9e91', roofPlum: '#8a5a9e',
  wood: '#c0824a', woodLight: '#dca66b', woodDark: '#7a4a26',
  tomato: '#ff5a4e', sunflower: '#ffc93c', teal: '#2ec4b6', cobalt: '#3a6ee8',
  bubblegum: '#ff7eb6', tangerine: '#ff9f1c', lime: '#a3e635', violet: '#9b6cf0',
  metal: '#a9b4c2', metalDark: '#4a5566', gold: '#ffc83d', goldDeep: '#e39b1b',
  water: '#5fd0f5', waterDeep: '#1e88c8', foam: '#e9fbff',
  stone: '#cfc6b8', stoneDark: '#a39a8c', glass: '#9fdcf7', glassDark: '#5aa7cf',
  ink: '#2b2b3a', white: '#fff8ee', cloud: '#ffffff',
  skin: ['#ffd9bd', '#f3bd8f', '#dca070', '#b27449', '#7d4c2f'],
  hair: ['#2b2b3a', '#5a3a22', '#8a5a2b', '#d9a441', '#f2d27a', '#c8c8d0', '#e0643c'],
};

export const WALLS = [P.wallCream, P.wallPeach, P.wallMint, P.wallSky, P.wallLilac, P.wallButter, P.wallRose];
export const ROOFS = [P.roofTerracotta, P.roofBrick, P.roofSlate, P.roofTeal, P.roofPlum];
export const ACCENTS = [P.tomato, P.sunflower, P.teal, P.cobalt, P.bubblegum, P.tangerine, P.lime, P.violet];
export const CLOTHES = [P.tomato, P.sunflower, P.teal, P.cobalt, P.bubblegum, P.tangerine, P.lime, P.violet,
  '#ffffff', '#3d4a6b', '#6b8e23', '#8b5e3c', '#e8e1d0', '#2f4858'];
