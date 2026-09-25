// Fail-safe facade over src/audio/Audio.js: every call is a no-op until audio has loaded,
// and a broken/missing audio module can never crash the game.
let impl = null;

export async function loadAudio() {
  try {
    // Glob import: resolves to nothing (instead of a build error) if the module is absent.
    const loader = import.meta.glob('../audio/Audio.js')['../audio/Audio.js'];
    if (!loader) return null;
    const mod = await loader();
    impl = mod.audio || mod.default || null;
  } catch (e) {
    console.warn('[game] audio module unavailable:', e?.message || e);
  }
  return impl;
}

const call = (name) => (...args) => {
  try {
    return impl?.[name]?.(...args);
  } catch (e) {
    console.warn(`[game] audio.${name} failed:`, e?.message || e);
  }
};

export const sound = {
  unlock: call('unlock'),
  sfx: call('sfx'),
  ambience: call('ambience'),
  music: call('music'),
  setListener: call('setListener'),
  setVolumes: call('setVolumes'),
  duck: call('duck'),
  update: call('update'),
  suspend: call('suspend'),
  resume: call('resume'),
};
