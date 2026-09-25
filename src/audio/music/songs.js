// Songs: data (chords, melodies, form) + small arrangement helpers that turn one bar into
// note events { inst, pos (beats), dur (beats), midi | notes, vel, dir, mute, slide, straight }.
import { phrase, ukeVoicing, walkBar, chord, nearest } from './theory.js';

const bars = (arr) => arr.map((b) => (Array.isArray(b) ? b.map((sym) => ({ sym, beats: 4 / b.length })) : [{ sym: b, beats: 4 }]));
const chordAt = (chs, pos) => {
  let p = 0;
  for (const c of chs) { if (pos < p + c.beats - 1e-6) return c; p += c.beats; }
  return chs[chs.length - 1];
};
const firstSym = (chs) => chs[0].sym;

// ---------------------------------------------------------------- part helpers
function melody(str, inst, vel = 0.8, transpose = 0, legato = 0.94) {
  const ns = phrase(str || 'r/4');
  return ns.map((n, i) => {
    const prev = ns[i - 1];
    const joined = prev && Math.abs(prev.pos + prev.dur - n.pos) < 1e-6 && Math.abs(prev.midi - n.midi) <= 5;
    return {
      inst, pos: n.pos, dur: n.dur * legato, midi: n.midi + transpose,
      vel: vel * (n.pos % 1 === 0 ? 1 : 0.88),
      slide: inst === 'whistle' && joined ? 440 * Math.pow(2, (prev.midi + transpose - 69) / 12) : 0,
    };
  });
}

const STRUM_ISLAND = [[0, 1, 0.9], [1, 1, 0.62], [1.5, -1, 0.42], [2.5, -1, 0.5], [3, 1, 0.68], [3.5, -1, 0.42]];
const STRUM_CHOP = [[0, 1, 0.8], [1, 1, 0.75, true], [2, 1, 0.65], [2.5, -1, 0.35], [3, 1, 0.75, true], [3.5, -1, 0.3, true]];
const STRUM_GENTLE = [[0, 1, 0.7], [2, 1, 0.5], [2.5, -1, 0.35]];
const STRUM_RING = [[0, 1, 0.55]];

function uke(chs, pattern, vel = 1) {
  return pattern.map(([pos, dir, v, mute], i) => {
    const next = pattern[i + 1] ? pattern[i + 1][0] : 4;
    return { inst: 'uke', pos, dur: next - pos, notes: ukeVoicing(chordAt(chs, pos).sym), dir, vel: v * vel, mute: !!mute };
  });
}

function bass(chs, nextSym, rand, vel, mode = 'walk') {
  if (mode === 'walk') {
    return walkBar(chs, nextSym, rand).map((n) => ({ inst: 'bass', ...n, vel: vel * (n.pos % 2 === 0 ? 1 : 0.85) }));
  }
  const out = [];
  let pos = 0;
  for (const c of chs) {
    const ch = chord(c.sym);
    const root = nearest(ch.bass, 42);
    out.push({ inst: 'bass', pos, dur: mode === 'one' ? c.beats : Math.min(2, c.beats), midi: root, vel });
    if (mode === 'half' && c.beats >= 4) out.push({ inst: 'bass', pos: pos + 2, dur: 2, midi: nearest(ch.tones[2], root + 7), vel: vel * 0.85 });
    pos += c.beats;
  }
  return out;
}

function drums(kind, vel = 1) {
  const e = [];
  if (kind === 'brushes' || kind === 'light') {
    const k = kind === 'light' ? 0.6 : 1;
    e.push({ inst: 'brush', pos: 1, dur: 0.5, vel: 0.8 * vel * k }, { inst: 'brush', pos: 3, dur: 0.5, vel: 0.85 * vel * k });
    e.push({ inst: 'sweep', pos: 0, dur: 2, vel: vel * k }, { inst: 'sweep', pos: 2, dur: 2, vel: vel * k });
    for (const [p, v] of [[0, 0.8], [1, 0.9], [1.5, 0.55], [2, 0.8], [3, 0.9], [3.5, 0.55]]) e.push({ inst: 'ride', pos: p, dur: 0.25, vel: v * vel * k });
    if (kind === 'brushes') e.push({ inst: 'kick', pos: 0, dur: 0.5, vel: 0.55 * vel }, { inst: 'kick', pos: 2, dur: 0.5, vel: 0.45 * vel });
  } else if (kind === 'shaker') {
    for (let i = 0; i < 8; i++) e.push({ inst: 'shaker', pos: i / 2, dur: 0.25, vel: (i % 2 ? 0.55 : 0.8) * vel });
  }
  return e;
}

// sorted chord tones around a centre pitch (for arpeggios / pads / counter lines)
function voicing(sym, center = 62, n = 4) {
  const ch = chord(sym);
  return ch.tones.slice(0, n).map((pc) => nearest(pc, center)).sort((a, b) => a - b);
}

function arp(chs, pattern, vel, center = 62, inst = 'pizz') {
  return pattern.map((idx, k) => {
    const pos = k / 2;
    const tones = voicing(chordAt(chs, pos).sym, center, 3);
    return { inst, pos, dur: 0.5, midi: tones[idx % tones.length] + (idx >= tones.length ? 12 : 0), vel: vel * (k % 2 ? 0.8 : 1) };
  });
}

// long guide-tone notes (3rds / 7ths) under the tune
function guide(chs, inst, vel, center = 64) {
  let pos = 0;
  return chs.map((c, i) => {
    const ch = chord(c.sym);
    const pc = (i % 2 === 0 ? ch.third : ch.seventh);
    const e = { inst, pos, dur: c.beats * 0.96, midi: nearest(pc, center), vel };
    pos += c.beats;
    return e;
  });
}

// ---------------------------------------------------------------- MENU: jaunty music-hall shuffle in G, 100 bpm
const MENU_A = [
  'B4/.5 D5/.5 G5/1 F#5/.5 G5/.5 E5/.5 D5/.5', 'G#4/.5 B4/.5 E5/1 D5/1.5 r/.5',
  'A4/.5 C#5/.5 E5/1 D5/.5 E5/.5 G5/.5 E5/.5', 'F#5/1.5 E5/.5 D5/1 r/1',
  'B4/.5 D5/.5 G5/1 F#5/.5 G5/.5 A5/.5 B5/.5', 'G#5/1 E5/.5 D5/.5 B4/.5 D5/1 r/.5',
];
const MENU = {
  form: ['A1', 'A2', 'B', 'A3'],
  chords: {
    A1: bars(['G', 'E7', 'A7', 'D7', 'G', 'E7', ['A7', 'D7'], 'G']),
    A2: bars(['G', 'E7', 'A7', 'D7', 'G', 'E7', ['Am7', 'D7'], ['G', 'G7']]),
    B: bars(['C', 'C#dim7', 'G/D', 'E7', 'A7', 'A7', 'D7', 'D7']),
    A3: bars(['G', 'E7', 'A7', 'D7', 'G', 'E7', ['A7', 'D7'], 'G']),
  },
  mel: {
    A1: [...MENU_A, 'E5/.5 G5/.5 C#5/.5 E5/.5 D5/.5 F#5/.5 A5/.5 C5/.5', 'B4/1 G4/1 r/2'],
    A2: [...MENU_A, 'A5/.5 G5/.5 E5/.5 C5/.5 D5/.5 E5/.5 F#5/.5 A5/.5', 'G5/1 r/.5 G4/.5 A4/.5 B4/.5 D5/.5 F5/.5'],
    B: ['E5/1.5 D5/.5 C5/.5 D5/.5 E5/.5 G5/.5', 'G5/1 E5/.5 C#5/.5 E5/.5 G5/.5 A#5/1',
      'B5/1.5 A5/.5 G5/.5 D5/.5 B4/.5 D5/.5', 'G#5/1.5 F#5/.5 E5/.5 D5/.5 B4/.5 G#4/.5',
      'A4/.5 C#5/.5 E5/.5 G5/.5 A5/1 G5/.5 E5/.5', 'C#5/1.5 r/.5 E5/.5 F#5/.5 E5/.5 C#5/.5',
      'D5/.5 F#5/.5 A5/.5 C6/.5 B5/.5 A5/.5 F#5/.5 D5/.5', 'C6/1 A5/.5 F#5/.5 E5/.5 D5/.5 C5/.5 A4/.5'],
    A3: [...MENU_A, 'E5/.5 G5/.5 C#5/.5 E5/.5 D5/.5 F#5/.5 A5/.5 C5/.5', 'G4/1 D5/.5 G5/1 r/1.5'],
  },
};

function menuBar(i, rand) {
  const si = Math.floor(i / 8) % 4;
  const sec = MENU.form[si];
  const b = i % 8;
  const loop = Math.floor(i / 32);
  const chs = MENU.chords[sec][b];
  const nextSym = firstSym(MENU.chords[MENU.form[Math.floor((i + 1) / 8) % 4]][(i + 1) % 8]);
  const mel = MENU.mel[sec][b];
  const ev = [];
  if (sec === 'B') {
    ev.push(...melody(mel, 'pizz', 0.95, 0, 0.9), ...melody(mel, 'glock', 0.35, 12));
    ev.push(...chs.map((c, k) => ({ inst: 'accordion', pos: k * c.beats, dur: c.beats * 0.95, notes: voicing(c.sym, 60), vel: 0.8 })));
    ev.push(...uke(chs, STRUM_CHOP, 0.9));
  } else {
    const whistleLead = !(sec === 'A1' && loop % 2 === 1);
    if (whistleLead) ev.push(...melody(mel, 'whistle', 0.85, 12));
    else ev.push(...melody(mel, 'pizz', 0.95, 0, 0.9), ...melody(mel, 'glock', 0.4, 12));
    if (sec === 'A2') ev.push(...guide(chs, 'clarinet', 0.7, 62));
    if (sec === 'A3') ev.push(...melody(mel, 'pizz', 0.5, -12, 0.9));
    ev.push(...uke(chs, STRUM_ISLAND, 1));
    if (b === 7 && sec !== 'A2') {
      // little glockenspiel pick-up into the next phrase
      ev.push(...[[2, 79], [2.5, 83], [3, 86], [3.5, 91]].map(([pos, m]) => ({ inst: 'glock', pos, dur: 0.5, midi: m, vel: 0.7 })));
    }
  }
  ev.push(...bass(chs, nextSym, rand, 0.9, 'walk'));
  ev.push(...drums('brushes', sec === 'B' ? 0.85 : 1));
  return ev;
}

// ---------------------------------------------------------------- LEVEL: light, sparse, long-form in F, 84 bpm
const LV_H = {
  H1: bars(['F', 'Dm7', 'Gm7', 'C7', 'F', 'Dm7', ['Gm7', 'C7'], 'F']),
  H2: bars(['Bb', 'Bbm6', 'F/A', 'D7', 'Gm7', 'C7', 'F', 'C7']),
  H3: bars(['Dm', 'Am', 'Bb', 'F', 'Gm7', 'A7', 'Dm', 'C7']),
};
const LV_M = {
  m1: ['C5/1.5 A4/.5 F4/1 r/1', 'D5/1 C5/.5 A4/.5 F4/2', 'Bb4/1.5 A4/.5 G4/1 Bb4/1', 'A4/.5 G4/.5 E4/1 C4/1 r/1'],
  m2: ['F5/.5 E5/.5 D5/.5 C5/.5 A4/2', 'r/1 D5/.5 C5/.5 A4/1 F4/1', 'G4/1 A4/.5 Bb4/.5 C5/.5 D5/.5 E5/1', 'F5/2 r/2'],
  m3: ['D5/1 F5/1 D5/1 Bb4/1', 'Db5/2 Bb4/1 G4/1', 'A4/1.5 C5/.5 F5/2', 'F#5/1 E5/.5 D5/.5 C5/1 A4/1'],
  m4: ['G4/.5 Bb4/.5 D5/1 C5/.5 Bb4/.5 G4/1', 'C5/1 E5/1 G5/1.5 r/.5', 'A5/1 G5/.5 F5/.5 E5/1 C5/1', 'E5/2 C5/1 r/1'],
  m5: ['A4/1 D5/1 F5/1 E5/.5 D5/.5', 'C5/1.5 A4/.5 E4/2', 'F4/.5 G4/.5 A4/.5 Bb4/.5 D5/1 C5/1', 'A4/3 r/1'],
  m6: ['Bb4/1 D5/1 G5/1.5 F5/.5', 'E5/1 C#5/1 A4/1 G4/1', 'F4/.5 A4/.5 D5/1 F5/1 E5/.5 D5/.5', 'C5/2 E4/1 r/1'],
};
const LV_BLOCKS = [
  { h: 'H1', tex: 'pad' },
  { h: 'H1', tex: 'pizz' },
  { h: 'H1', tex: 'pizz', mel: ['m1', 'm2'], lead: 0 },
  { h: 'H2', tex: 'uke', mel: ['m3', 'm4'], lead: 1 },
  { h: 'H3', tex: 'pad', mel: ['m5', null], lead: 2 },
  { h: 'H3', tex: 'uke', mel: [null, 'm6'], lead: 0 },
  { h: 'H1', tex: 'pizz' },
  { h: 'H2', tex: 'sparse' },
];
const LV_LEADS = [['clarinet', 0, 1], ['whistle', 12, 0.5], ['celesta', 12, 0.8]];
const ARPS = [[0, 2, 1, 2, 0, 2, 1, 2], [0, 1, 2, 3, 2, 1, 0, 1], [0, 2, 3, 2, 1, 2, 3, 2]];

function levelBar(i, rand) {
  const bi = Math.floor(i / 8);
  const cycle = Math.floor(bi / LV_BLOCKS.length);
  const blk = LV_BLOCKS[bi % LV_BLOCKS.length];
  const b = i % 8;
  const chs = LV_H[blk.h][b];
  const nblk = LV_BLOCKS[(bi + (b === 7 ? 1 : 0)) % LV_BLOCKS.length];
  const nextSym = firstSym(LV_H[nblk.h][(b + 1) % 8]);
  const ev = [];
  // melody fragment (lead instrument rotates every cycle)
  const mid = blk.mel?.[b < 4 ? 0 : 1];
  if (mid) {
    const [inst, tr, vel] = LV_LEADS[(blk.lead + cycle) % LV_LEADS.length];
    ev.push(...melody(LV_M[mid][b % 4], inst, vel, tr));
  }
  const alt = (bi + cycle) % 3;
  switch (blk.tex) {
    case 'pad':
      ev.push(...chs.map((c, k) => ({ inst: 'pad', pos: k * c.beats, dur: c.beats, notes: voicing(c.sym, 60), vel: 0.8 })));
      ev.push(...bass(chs, nextSym, rand, 0.5, 'half'));
      ev.push(...drums('shaker', 0.45));
      if (rand() < 0.4) {
        const tones = voicing(chordAt(chs, 0).sym, 79, 3);
        ev.push({ inst: 'glock', pos: Math.floor(rand() * 8) / 2, dur: 0.5, midi: tones[Math.floor(rand() * 3)], vel: 0.45 });
      }
      break;
    case 'pizz':
      if (!(b === 3 && cycle % 2 === 1)) ev.push(...arp(chs, ARPS[alt], 0.28, 62));
      ev.push(...bass(chs, nextSym, rand, 0.55, b % 4 === 3 ? 'walk' : 'half'));
      ev.push(...drums('light', 1));
      break;
    case 'uke':
      ev.push(...uke(chs, STRUM_GENTLE, 0.6));
      ev.push(...bass(chs, nextSym, rand, 0.5, 'half'));
      ev.push({ inst: 'sweep', pos: 0, dur: 2, vel: 0.6 }, { inst: 'sweep', pos: 2, dur: 2, vel: 0.6 });
      ev.push({ inst: 'kick', pos: 0, dur: 0.5, vel: 0.35 });
      break;
    default: {
      // sparse: a single ringing strum and a couple of glockenspiel notes
      ev.push(...uke(chs, STRUM_RING, 0.6));
      ev.push(...bass(chs, nextSym, rand, 0.45, 'one'));
      const tones = voicing(chordAt(chs, 0).sym, 79, 3);
      for (let k = 0; k < 2; k++) ev.push({ inst: 'glock', pos: 1 + k * 1.5 + (rand() < 0.5 ? 0.5 : 0), dur: 0.5, midi: tones[Math.floor(rand() * 3)], vel: 0.45 });
    }
  }
  return ev;
}

// ---------------------------------------------------------------- RESULTS: jingle, then a gentle loop in C, 96 bpm
const RES_H = bars(['C', 'Am', 'F', 'G7', 'C', 'Am', ['Dm7', 'G7'], 'C']);
const RES_M = ['E5/1 G5/1 C6/1.5 B5/.5', 'A5/2 E5/2', 'F5/1 A5/1 C6/1 A5/1', 'G5/3 r/1',
  'E5/1 G5/1 C6/1.5 D6/.5', 'E6/2 C6/2', 'D6/1 C6/1 B5/1 G5/1', 'C6/2 r/2'];

function resultsBar(i, rand) {
  const ev = [];
  if (i === 0) {
    const lead = [[0, 1 / 3, 67], [1 / 3, 1 / 3, 72], [2 / 3, 1 / 3, 76], [1, 1.5, 79], [2.5, 0.5, 76], [3, 1, 79]];
    for (const [pos, dur, m] of lead) {
      ev.push({ inst: 'brass', pos, dur: dur * 0.92, midi: m, vel: 1, straight: true });
      ev.push({ inst: 'glock', pos, dur, midi: m + 12, vel: 0.5, straight: true });
    }
    ev.push({ inst: 'brass', pos: 1, dur: 2.9, midi: 64, vel: 0.6, straight: true }, { inst: 'brass', pos: 1, dur: 2.9, midi: 67, vel: 0.6, straight: true });
    for (const p of [1, 2, 2.5, 3, 3.5]) ev.push({ inst: 'timpani', pos: p, dur: 0.5, midi: p === 1 ? 43 : 48, vel: 0.5 + p * 0.1, straight: true });
    return ev;
  }
  if (i === 1) {
    ev.push({ inst: 'brass', pos: 0, dur: 3, midi: 84, vel: 1 });
    for (const m of [72, 76, 79]) ev.push({ inst: 'brass', pos: 0, dur: 3, midi: m, vel: 0.65 });
    ev.push({ inst: 'timpani', pos: 0, dur: 1, midi: 36, vel: 1 }, { inst: 'cymbal', pos: 0, dur: 2, vel: 1 });
    ev.push({ inst: 'bass', pos: 0, dur: 3, midi: 36, vel: 0.9 });
    [96, 91, 88, 84, 79].forEach((m, k) => ev.push({ inst: 'glock', pos: 0.25 + k * 0.25, dur: 0.25, midi: m, vel: 0.5, straight: true }));
    return ev;
  }
  const j = i - 2;
  const b = j % 8;
  const loop = Math.floor(j / 8);
  const chs = RES_H[b];
  const nextSym = firstSym(RES_H[(b + 1) % 8]);
  ev.push(...(loop % 2 ? melody(RES_M[b], 'whistle', 0.5) : melody(RES_M[b], 'celesta', 1)));
  ev.push(...uke(chs, STRUM_ISLAND, 0.65));
  ev.push(...bass(chs, nextSym, rand, 0.7, 'half'));
  ev.push(...drums('light', 0.7));
  return ev;
}

export const SONGS = {
  menu: { bpm: 100, swing: 0.62, beats: 4, level: 0.37, fadeIn: 0.6, bar: menuBar, section: (i) => MENU.form[Math.floor(i / 8) % 4] },
  level: { bpm: 84, swing: 0.58, beats: 4, level: 0.49, fadeIn: 2, bar: levelBar, section: (i) => `${LV_BLOCKS[Math.floor(i / 8) % LV_BLOCKS.length].h}:${LV_BLOCKS[Math.floor(i / 8) % LV_BLOCKS.length].tex}` },
  results: { bpm: 96, swing: 0.56, beats: 4, level: 0.66, fadeIn: 0, bar: resultsBar, section: (i) => (i < 2 ? 'jingle' : 'loop') },
};
