// Offline (faster-than-realtime) renders of any SFX / music / ambience through the same graph
// the game uses. For verification tools and the sandbox; not needed by the game itself.
import { createMixer, Strip } from './mixer.js';
import { Voice } from './Voice.js';
import { SFX } from './sfx/index.js';
import { AmbiencePlayer } from './ambience/index.js';
import { SongPlayer, SONGS } from './music/index.js';
import { mulberry32 } from '../core/rng.js';

// sounds start at T0 so the master compressor is primed (as it is in the running game)
const T0 = 0.1;
function makeCtx(seconds, sr) {
  return new OfflineAudioContext(2, Math.ceil((seconds + T0) * sr), sr);
}

/**
 * chain: 'raw'    -> recipe (with its trim) straight to the output
 *        'master' -> voice strip + reverb send + full master bus (what the player hears)
 */
export async function renderSfx(name, { seed = 1, sr = 48000, seconds = 8, chain = 'master', pitch = 1, volume = 1, opts = {} } = {}) {
  const def = SFX[name];
  if (!def) throw new Error(`unknown sfx ${name}`);
  const ctx = makeCtx(seconds, sr);
  let dest;
  if (chain === 'raw') {
    dest = ctx.createGain();
    dest.gain.value = def.gain * volume * Math.SQRT1_2; // same level as a centred StereoPanner
    dest.connect(ctx.destination);
  } else {
    const mix = createMixer(ctx);
    const strip = new Strip(ctx, mix.sfx, mix.reverbIn);
    strip.setup(0, { gain: def.gain * volume, send: def.send });
    dest = strip.input;
  }
  const v = new Voice(ctx, dest, T0, { pitch, rand: mulberry32(seed) });
  def.fn(v, opts);
  const buf = await ctx.startRendering();
  return { buf, declared: v.finish - T0 };
}

export async function renderMusic(name, { seconds = 20, sr = 48000, chain = 'master', seed = 7, fromBar = 0, only = null } = {}) {
  const ctx = makeCtx(seconds, sr);
  const dest = chain === 'raw' ? ctx.destination : createMixer(ctx).music;
  const p = new SongPlayer(ctx, dest, name, { t0: T0, fadeIn: 0, seed, only });
  if (fromBar) { p.bar = fromBar; }
  p.scheduleUntil(seconds + T0);
  const buf = await ctx.startRendering();
  return { buf, barDur: p.barDur, bars: p.bar, song: SONGS[name] };
}

export async function renderAmbience(name, { seconds = 30, sr = 48000, chain = 'master', seed = 3, only } = {}) {
  const ctx = makeCtx(seconds, sr);
  const dest = chain === 'raw' ? ctx.destination : createMixer(ctx).amb;
  const p = new AmbiencePlayer(ctx, dest, name, { t0: T0, fadeIn: 0.05, rand: mulberry32(seed), only });
  p.scheduleUntil(seconds + T0);
  const buf = await ctx.startRendering();
  return { buf, counts: p.stats().counts };
}

/** Everything at once through one master bus (worst-case stacking test). */
export async function renderMix({ sfx = [], music = 'level', ambience = 'village', seconds = 12, sr = 48000 } = {}) {
  const ctx = makeCtx(seconds, sr);
  const mix = createMixer(ctx);
  if (music) new SongPlayer(ctx, mix.music, music, { t0: T0, fadeIn: 0 }).scheduleUntil(seconds);
  if (ambience) new AmbiencePlayer(ctx, mix.amb, ambience, { t0: T0, fadeIn: 0.05, rand: mulberry32(5) }).scheduleUntil(seconds);
  const rand = mulberry32(11);
  for (const [name, t] of sfx) {
    const def = SFX[name];
    const strip = new Strip(ctx, mix.sfx, mix.reverbIn);
    strip.setup(0, { gain: def.gain, send: def.send });
    def.fn(new Voice(ctx, strip.input, T0 + t, { rand }), {});
  }
  return { buf: await ctx.startRendering() };
}

/**
 * Live-like render: music/ambience are scheduled 0.35 s ahead and finished voices disposed every
 * 50 ms (OfflineAudioContext.suspend), exactly like the realtime engine tick. Gives honest
 * node counts and a CPU proxy (render speed) for the running game.
 */
export async function renderLive({ sfx = [], music = 'menu', ambience = 'village', seconds = 20, sr = 48000 } = {}) {
  const ctx = makeCtx(seconds, sr);
  const mix = createMixer(ctx);
  const song = music ? new SongPlayer(ctx, mix.music, music, { t0: T0, fadeIn: 0 }) : null;
  const bed = ambience ? new AmbiencePlayer(ctx, mix.amb, ambience, { t0: T0, fadeIn: 0.05, rand: mulberry32(5) }) : null;
  const rand = mulberry32(11);
  const pending = sfx.map(([name, t]) => ({ name, t: T0 + t })).sort((a, b) => a.t - b.t);
  const live = [];
  let maxNodes = 0, maxVoices = 0;
  const step = 0.05;
  const tick = () => {
    const now = ctx.currentTime;
    song?.scheduleUntil(now + 0.35);
    bed?.scheduleUntil(now + 0.35);
    while (pending.length && pending[0].t < now + step) {
      const { name, t } = pending.shift();
      const def = SFX[name];
      const strip = new Strip(ctx, mix.sfx, mix.reverbIn);
      strip.setup(now, { gain: def.gain, send: def.send });
      const v = new Voice(ctx, strip.input, Math.max(t, now + 0.005), { rand });
      def.fn(v, {});
      live.push({ v, strip, end: v.finish + 0.05 });
    }
    for (let i = live.length - 1; i >= 0; i--) {
      if (live[i].end < now) { live[i].v.dispose(); live[i].strip.dispose(); live.splice(i, 1); }
    }
    const nodes = (song?.voices.reduce((s, x) => s + x.v.nodes.length, 0) || 0) + (bed?.events.reduce((s, x) => s + x.v.nodes.length, 0) || 0)
      + (bed?.nodes.length || 0) + live.reduce((s, x) => s + x.v.nodes.length + 5, 0);
    maxNodes = Math.max(maxNodes, nodes);
    maxVoices = Math.max(maxVoices, (song?.voices.length || 0) + (bed?.events.length || 0) + live.length);
  };
  for (let t = step; t < seconds; t += step) {
    ctx.suspend(t).then(() => { tick(); ctx.resume(); });
  }
  tick();
  const t0 = performance.now();
  const buf = await ctx.startRendering();
  const ms = performance.now() - t0;
  return { buf, ms, realtimeFactor: Math.round((seconds * 1000 / ms) * 10) / 10, maxNodes, maxVoices };
}

/**
 * Render through a real AudioEngine bound to an OfflineAudioContext. `script(eng)` runs at t = 0;
 * `at` = [[seconds, fn(eng)], ...] runs timed actions; update()/_tick() are pumped every 50 ms
 * like the game loop. Exercises the production code path (voice caps, stagger, loops, focus...).
 */
export async function renderEngine({ seconds = 10, sr = 48000, script, at = [], listener = null, seed = 1 } = {}) {
  const { AudioEngine } = await import('./Audio.js');
  const ctx = makeCtx(seconds, sr);
  const eng = new AudioEngine({ context: ctx });
  eng.rand = mulberry32(seed);
  if (listener) eng.setListener(listener);
  const actions = [...at].sort((a, b) => a[0] - b[0]);
  script?.(eng);
  const step = 0.05;
  for (let t = step; t < seconds; t += step) {
    ctx.suspend(t).then(() => {
      while (actions.length && actions[0][0] <= ctx.currentTime + 1e-6) actions.shift()[1](eng);
      eng.update();
      eng._tick();
      ctx.resume();
    });
  }
  const t0 = performance.now();
  const buf = await ctx.startRendering();
  return { buf, ms: performance.now() - t0, eng };
}

/** Fake three.js camera at the origin looking down -Z (for positional tests). */
export const testListener = (fov = 50) => ({ fov, zoom: 1, matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1.6, 0, 1] } });
