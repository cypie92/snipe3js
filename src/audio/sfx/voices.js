// Villager voice types and moods shared by babble and the short vocal reactions.
// f0: base pitch (Hz), scale: formant scale (smaller heads = higher formants), rate: talking speed,
// breath: aspiration amount, vib: vibrato (old folk), swing: intonation width, vowels: favourite vowels.
export const VOICES = {
  kid: { f0: 330, scale: 1.28, rate: 1.2, breath: 0.07, swing: 1.2, level: 0.66, vowels: ['i', 'e', 'a', 'ae', 'u'] },
  woman: { f0: 232, scale: 1.14, rate: 1.05, breath: 0.09, swing: 1.1, level: 1, vowels: ['e', 'a', 'i', 'o', 'ae'] },
  man: { f0: 132, scale: 1.0, rate: 1.0, breath: 0.08, swing: 1.0, level: 1.16, vowels: ['a', 'o', 'er', 'e', 'u'] },
  old: { f0: 165, scale: 1.04, rate: 0.84, breath: 0.16, swing: 0.9, level: 0.92, vib: { rate: 5.5, depth: 0.03 }, vowels: ['o', 'a', 'er', 'e', 'u'] },
  posh: { f0: 178, scale: 1.02, rate: 0.9, breath: 0.05, swing: 1.6, level: 0.98, vowels: ['o', 'a', 'o', 'er', 'e'] },
};
export const VOICE_NAMES = Object.keys(VOICES);

// Intonation per mood: base offset (semitones), start/end contour, per-syllable step size,
// speaking-rate multiplier, vowel brightness bias and a loudness trim (voices/moods level-matched).
export const MOODS = {
  neutral: { base: 0, from: 1, to: -2, step: 2, rate: 1, bright: 0, level: 1 },
  happy: { base: 2, from: 2, to: 0, step: 3, rate: 1.1, bright: 1, bounce: true, level: 1 },
  grumpy: { base: -3, from: 0, to: -4, step: 1.5, rate: 0.84, bright: -1, growl: true, level: 1.35 },
  // used for most "!" lines, so lively rather than shrieky
  surprised: { base: 3, from: 5, to: -1, step: 2.5, rate: 1.15, bright: 1, jump: true, level: 0.95 },
  question: { base: 0, from: 0, to: 0, step: 2, rate: 1, bright: 0, rise: true, level: 1 },
};
export const MOOD_NAMES = Object.keys(MOODS);

/** Resolve the voice for a call: opts.voice (or a random adult) with a little per-call jitter. */
export function vox(v, o = {}) {
  const base = VOICES[o.voice] || VOICES[v.pick(['man', 'woman'])];
  return { ...base, f0: base.f0 * v.rr(0.95, 1.05) };
}

// major pentatonic around the speaker's base pitch: babble "sings" a little instead of wandering
const PENTA = [-12, -10, -8, -5, -3, 0, 2, 4, 7, 9, 12];
export function quantize(st) {
  let best = PENTA[0];
  for (const p of PENTA) if (Math.abs(p - st) < Math.abs(best - st)) best = p;
  return best;
}
