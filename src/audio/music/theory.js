// Tiny music-theory kit: note names, chord symbols, ukulele voicings, walking bass lines.
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'C#5' / 'Bb3' -> midi number */
export function note(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  return 12 * (Number(m[3]) + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

/** "B4/.5 D5/.5 r/1 G5/2" -> [{ pos, dur, midi }] (durations in beats; r = rest; ~ = tie/slide in) */
export function phrase(str, offset = 0) {
  const out = [];
  let pos = offset;
  for (const tok of str.trim().split(/\s+/)) {
    const [n, d] = tok.split('/');
    const dur = Number(d);
    const slide = n.startsWith('~');
    const nm = slide ? n.slice(1) : n;
    if (nm !== 'r') out.push({ pos, dur, midi: note(nm), slide });
    pos += dur;
  }
  return out;
}

const QUAL = {
  '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
  6: [0, 4, 7, 9], m6: [0, 3, 7, 9], dim7: [0, 3, 6, 9], sus4: [0, 5, 7], '7sus4': [0, 5, 7, 10],
};
/** 'E7', 'C#dim7', 'G/D', 'Bbm6' -> { root, tones:[pcs], bass, name } */
export function chord(sym) {
  const [main, slash] = sym.split('/');
  const m = /^([A-G])([#b]?)(.*)$/.exec(main);
  const root = (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  const iv = QUAL[m[3]] || QUAL[''];
  const tones = iv.map((i) => (root + i) % 12);
  let bass = root;
  if (slash) {
    const s = /^([A-G])([#b]?)$/.exec(slash);
    bass = (PC[s[1]] + (s[2] === '#' ? 1 : s[2] === 'b' ? -1 : 0) + 12) % 12;
  }
  return { root, tones, bass, name: sym, third: tones[1], seventh: tones[3] ?? tones[2] };
}

// GCEA re-entrant ukulele shapes (frets per string G, C, E, A)
const UKE_OPEN = [67, 60, 64, 69];
const UKE = {
  C: [0, 0, 0, 3], C7: [0, 0, 0, 1], C6: [0, 0, 0, 0], G: [0, 2, 3, 2], G7: [0, 2, 1, 2], E7: [1, 2, 0, 2],
  A7: [0, 1, 0, 0], A: [2, 1, 0, 0], D7: [2, 2, 2, 3], D: [2, 2, 2, 0], Am: [2, 0, 0, 0], Am7: [0, 0, 0, 0],
  Dm: [2, 2, 1, 0], Dm7: [2, 2, 1, 3], F: [2, 0, 1, 0], Bb: [3, 2, 1, 1], Bbm6: [0, 1, 1, 1], Gm7: [0, 2, 1, 1],
  'C#dim7': [0, 1, 0, 1], Em: [0, 4, 3, 2], B7: [2, 3, 2, 2], Fmaj7: [2, 4, 1, 3], Cmaj7: [0, 0, 0, 2],
  Gm: [0, 2, 3, 1], Csus4: [0, 0, 1, 3], 'C7sus4': [0, 0, 1, 1], Ebdim7: [2, 3, 2, 3],
};
export function ukeVoicing(sym) {
  const key = sym.split('/')[0];
  const shape = UKE[key];
  if (shape) return shape.map((f, i) => UKE_OPEN[i] + f);
  // fallback: nearest chord tone at or above each open string
  const c = chord(sym);
  return UKE_OPEN.map((o) => {
    for (let k = 0; k < 7; k++) if (c.tones.includes((o + k) % 12)) return o + k;
    return o;
  });
}

// pick the octave of pitch-class pc closest to `near`
export function nearest(pc, near) {
  let best = pc;
  for (let m = pc; m < 128; m += 12) if (Math.abs(m - near) < Math.abs(best - near)) best = m;
  return best;
}

/**
 * Walking bass for one bar. `chords` = [{sym, beats}] in this bar, `next` = next bar's first chord.
 * Returns [{ pos, dur, midi }]: root on the chord's first beat, chord tones in between,
 * a chromatic/diatonic approach into the next root on the last beat.
 */
export function walkBar(chords, next, rand, lo = 36) {
  const out = [];
  let pos = 0;
  chords.forEach((c, ci) => {
    const ch = chord(c.sym);
    const nxt = chord(ci + 1 < chords.length ? chords[ci + 1].sym : next);
    const root = nearest(ch.bass, lo + 6);
    const nRoot = nearest(nxt.bass, lo + 6);
    const fifth = nearest(ch.tones[2], root + 7);
    const third = nearest(ch.tones[1], root + 4);
    const approach = (from) => {
      const r = rand();
      if (r < 0.45) return nRoot + (from > nRoot ? 1 : -1);        // chromatic
      if (r < 0.75) return nearest(nxt.tones[2], nRoot - 5);        // fifth of next below
      return nRoot + (from > nRoot ? 2 : -2);                      // scale step
    };
    if (c.beats >= 4) {
      const second = rand() < 0.5 ? third : fifth;
      const thirdBeat = second === third ? fifth : nearest(ch.tones[rand() < 0.5 ? 1 : 0], root + 10);
      out.push({ pos, dur: 1, midi: root }, { pos: pos + 1, dur: 1, midi: second }, { pos: pos + 2, dur: 1, midi: thirdBeat },
        { pos: pos + 3, dur: 1, midi: approach(thirdBeat) });
    } else if (c.beats >= 2) {
      out.push({ pos, dur: 1, midi: root }, { pos: pos + 1, dur: 1, midi: approach(root) });
    } else {
      out.push({ pos, dur: c.beats, midi: root });
    }
    pos += c.beats;
  });
  const fold = (m) => { while (m > lo + 17) m -= 12; while (m < lo - 5) m += 12; return m; };
  return out.map((n) => ({ ...n, midi: fold(n.midi) }));
}
