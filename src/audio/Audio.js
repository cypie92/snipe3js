// Jack of All Blasts — audio engine. 100% WebAudio synthesis: no audio files.
//
//   import { audio } from '../audio/Audio.js';
//   audio.unlock();                                    // first user gesture (also auto-installed)
//   audio.sfx('shot');                                 // 2D
//   audio.sfx('bell', { position: bellMesh });         // positional: Object3D, Vector3 or [x,y,z]
//   audio.sfx('hitWood', { position, volume: 0.8, pitch: 1.1, variance: 0.05 });
//   audio.ambience('village');  audio.music('menu');   // crossfades; null stops
//   audio.setListener(camera);  audio.update();        // update() once per frame (optional)
//   audio.setVolumes({ master: 1, sfx: 1, music: 0.6, ambience: 0.8 });
//   audio.duck(0.5, 0.4);                              // dip music by 50% for 0.4 s
//   audio.sfx('babble', { position, syllables: 6, voice: 'woman', mood: 'happy' });  // villager gibberish
//   const drip = audio.loop('drip', { position: tap });  drip.stop();              // positional loops
//   audio.holdBreath(true);  audio.holdBreath(false);  // heartbeat loop + music/ambience low-pass
//
// Every public method is safe to call at any time: when WebAudio is missing, blocked or not yet
// unlocked, calls are silently ignored (music/ambience requests are remembered until unlock).
import { createMixer, Strip } from './mixer.js';
import { Voice } from './Voice.js';
import { SFX, SFX_NAMES, SFX_CATEGORIES } from './sfx/index.js';
import { AmbiencePlayer, AMBIENCES } from './ambience/index.js';
import { SongPlayer, SONGS } from './music/index.js';
import { LoopPlayer, LOOPS, LOOP_NAMES } from './loops.js';
import { SPATIAL, spatialize, camFocus } from './spatial.js';
import { VOICE_NAMES, MOOD_NAMES } from './sfx/voices.js';
import { clamp } from './dsp.js';

export { SFX_NAMES, SFX_CATEGORIES, AMBIENCES, SONGS, LOOPS, LOOP_NAMES, VOICE_NAMES, MOOD_NAMES };
export const SONG_NAMES = Object.keys(SONGS);
export const AMBIENCE_NAMES = Object.keys(AMBIENCES);

const LOOKAHEAD = 0.35; // seconds of music/ambience scheduled ahead (1.5 s when the tab is hidden)
const TICK_MS = 50;

/** Handle returned by audio.loop(): safe to keep and call even if audio never starts. */
class LoopHandle {
  constructor(engine, name, opts) {
    this.engine = engine;
    this.name = name;
    this.opts = { ...opts };
    this.position = opts.position ?? null;
    this.player = null;
    this.stopped = false;
  }
  get playing() { return !this.stopped; }
  stop(fade = 0.3) {
    if (this.stopped) return;
    this.stopped = true;
    if (!this.player) { this.engine._dropLoop(this); return; } // never started: just forget it
    try { this.player.stop(this.engine.ctx.currentTime, fade); } catch { /* ignore */ }
  }
  setPosition(p) { this.position = p ?? null; }
  setVolume(v) {
    if (!Number.isFinite(v)) return;
    this.opts.volume = v;
    try { this.player?.setVolume(v, this.engine.ctx.currentTime); } catch { /* ignore */ }
  }
  /** Change loop parameters on the fly, e.g. { bpm: 95 } for the heartbeat, { rate: 1.5 } for drips. */
  set(o = {}) {
    Object.assign(this.opts, o);
    if (this.player) Object.assign(this.player.state, o);
    if ('volume' in o) this.setVolume(o.volume);
    if ('position' in o) this.setPosition(o.position);
  }
}

export class AudioEngine {
  constructor({ context = null } = {}) {
    this.ctx = null;
    this.mix = null;
    this.volumes = { master: 1, sfx: 1, music: 1, ambience: 1 };
    this.spatial = { ...SPATIAL };
    this.maxVoices = 32;
    this.listener = null;
    this._cam = { maxFov: 0 };
    this._scopeK = 0;
    this._breath = false;
    this._loops = [];
    this._beatLoop = null;
    this._placedAt = 0;
    this._strips = [];
    this._active = [];
    this._dying = [];
    this._last = new Map();
    this._amb = { name: null, player: null };
    this._music = { name: null, player: null };
    this._fading = [];
    this._want = { ambience: null, music: null };
    this._duck = { target: 1, end: 0 };
    this._failed = false;
    this._warned = new Set();
    this._timer = null;
    this.rand = Math.random; // per-play variation (tests swap in a seeded generator)
    this.offline = false;
    if (context) {
      // bound to a given (e.g. Offline) context: used by the verification tools
      this.ctx = context;
      this.mix = createMixer(context);
      this.offline = true;
      this._applyVolumes(true);
    } else if (typeof window !== 'undefined' && typeof document !== 'undefined') this._installAutoUnlock();
  }

  /** True once the AudioContext exists and is running. */
  get ready() { return !!this.ctx && (this.offline || this.ctx.state === 'running'); }
  get time() { return this.ctx ? this.ctx.currentTime : 0; }

  // ------------------------------------------------------------------ lifecycle
  unlock() {
    if (this._failed) return false;
    try {
      if (!this.ctx) {
        const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
        if (!AC) { this._failed = true; this._loops.length = 0; return false; }
        this.ctx = new AC({ latencyHint: 'interactive' });
        this.mix = createMixer(this.ctx);
        this._applyVolumes(true);
        this._timer = setInterval(() => this._tick(), TICK_MS);
      }
      if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') {
        const p = this.ctx.resume();
        if (p && p.catch) p.catch(() => {});
      }
      if (this._want.ambience !== this._amb.name) this.ambience(this._want.ambience);
      if (this._want.music !== this._music.name) this.music(this._want.music);
      return true;
    } catch (e) {
      this._warn('unlock', e);
      this._failed = true;
      this.ctx = null;
      this.mix = null;
      this._loops.length = 0;
      return false;
    }
  }

  _installAutoUnlock() {
    const evs = ['pointerdown', 'mousedown', 'keydown', 'touchend'];
    const handler = () => {
      this.unlock();
      if (this.ready || this._failed) evs.forEach((e) => window.removeEventListener(e, handler, true));
    };
    try { evs.forEach((e) => window.addEventListener(e, handler, true)); } catch { /* no DOM */ }
  }

  /** Pause/resume all audio (e.g. pause menu, tab hidden). */
  suspend() { try { this.ctx?.suspend(); } catch { /* ignore */ } }
  resume() { try { if (this.ctx && this.ctx.state !== 'closed') this.ctx.resume().catch(() => {}); } catch { /* ignore */ } }

  // ------------------------------------------------------------------ SFX
  /**
   * Play a one-shot sound. Returns a handle { name, duration, stop(fade) } or null.
   * opts: position (Object3D | Vector3 | [x,y,z]), volume (linear, default 1),
   *       pitch (multiplier, default 1), variance (random pitch spread, default per sound),
   *       reverb (send multiplier), delay (seconds from now)
   */
  sfx(name, opts) {
    try {
      if (!this.ready) return null;
      opts = opts || {};
      const def = SFX[name];
      if (!def) { this._warn(`unknown sfx "${name}"`); return null; }
      const now = this.ctx.currentTime;
      const last = this._last.get(name);
      const guard = def.guard ?? 0.012;
      if (guard && last !== undefined && now - last < guard && !opts.delay) return null; // same-frame spam
      this._last.set(name, now);
      const same = this._active.filter((a) => a.name === name);
      // voices: simultaneous lines start a beat apart, and each extra talker sits a little lower
      const burst = def.stagger ? same.filter((a) => a.t0 > now - 0.02).length : 0;
      const crowd = def.crowd ? 1 / (1 + 0.5 * Math.min(same.length, def.poly - 1)) : 1;
      if (same.length >= def.poly) this._steal(same[0]);
      if (this._active.length >= this.maxVoices) this._steal(this._active[0]);
      const num = (x, d) => (Number.isFinite(x) ? x : d);
      const variance = clamp(num(opts.variance, def.vary), 0, 0.5);
      const rnd = this.rand;
      const pitch = clamp(num(opts.pitch, 1), 0.05, 8) * (1 + (rnd() * 2 - 1) * variance);
      const vol = clamp(num(opts.volume, 1), 0, 4) * def.gain * crowd * (1 + (rnd() * 2 - 1) * Math.min(0.25, variance * 1.5));
      const sp = this._spatial(opts.position);
      const t0 = now + 0.01 + clamp(num(opts.delay, 0), 0, 30) + burst * (0.05 + 0.09 * rnd());
      const strip = this._getStrip(now);
      strip.setup(now, { gain: vol, pan: sp.pan, lowpass: sp.lowpass, dist: sp.gain, send: def.send * (opts.reverb ?? 1) * (0.7 + 0.6 * (1 - sp.gain)) });
      const voice = new Voice(this.ctx, strip.input, t0, { pitch, rand: rnd });
      try { def.fn(voice, opts); } catch (e) { voice.dispose(); strip.busy = false; throw e; }
      const entry = { name, voice, strip, t0, end: voice.finish + 0.05 };
      this._active.push(entry);
      if (def.duck) this.duck(def.duck[0], def.duck[1], t0 - now);
      return {
        name,
        duration: entry.end - t0,
        stop: (fade = 0.05) => { if (this._active.includes(entry)) this._steal(entry, fade); },
      };
    } catch (e) {
      this._warn(`sfx ${name}`, e);
      return null;
    }
  }

  _getStrip(now) {
    let s = this._strips.find((x) => !x.busy && x.freeAt <= now);
    if (!s) {
      s = new Strip(this.ctx, this.mix.sfx, this.mix.reverbIn);
      this._strips.push(s);
    }
    s.busy = true;
    return s;
  }

  _steal(entry, fade = 0.02) {
    const i = this._active.indexOf(entry);
    if (i < 0) return;
    const now = this.ctx.currentTime;
    entry.strip.fadeOut(now, fade);
    entry.end = now + fade + 0.02;
    this._active.splice(i, 1);
    this._dying.push(entry);
  }

  _release(entry) {
    entry.voice.dispose();
    const s = entry.strip;
    s.busy = false;
    s.freeAt = 0;
    // a burst of steals can grow the pool past the cap: shrink it back
    if (this._strips.length > this.maxVoices + 4) {
      s.dispose();
      this._strips.splice(this._strips.indexOf(s), 1);
    }
  }

  // ------------------------------------------------------------------ positional
  /** Camera used for positional SFX (pan + distance attenuation + air absorption). */
  setListener(camera) { this.listener = camera || null; this._cam = { maxFov: camera?.fov || 0 }; }

  _spatial(pos) { return spatialize(pos, this.listener, this._cam, this.spatial); }

  /** Per-frame call (recommended): pumps schedulers, re-pans loops, applies the scope "focus". */
  update() {
    if (!this.ready) return;
    this._tick();
    const now = this.ctx.currentTime;
    if (now - this._placedAt > 0.04) {
      this._placedAt = now;
      for (const h of this._loops) if (h.player && !h.stopped && h.position) h.player.place(this._spatial(h.position), now);
    }
    const cam = this.listener;
    if (!cam || !cam.fov) return;
    const k = clamp(Math.log2(camFocus(cam, this._cam)) / 3, 0, 1); // 1x..8x -> 0..1
    if (Math.abs(k - this._scopeK) < 0.02) return;
    this._scopeK = k;
    this._applyFocus();
  }

  // scope zoom + hold-breath both "tunnel" the background: ambience (and music when holding breath)
  _applyFocus() {
    if (!this.mix) return;
    const t = this.ctx.currentTime;
    const k = this._scopeK;
    const b = this._breath;
    this.mix.ambFocus.frequency.setTargetAtTime(Math.min(20000 * Math.pow(0.3, k), b ? 1400 : 20000), t, 0.1);
    this.mix.ambDuck.gain.setTargetAtTime((1 - 0.3 * k) * (b ? 0.55 : 1), t, 0.1);
    this.mix.musicFocus.frequency.setTargetAtTime(b ? 1100 : 20000, t, 0.12);
    this.mix.musicDip.gain.setTargetAtTime(b ? 0.6 : 1, t, 0.12);
  }

  // ------------------------------------------------------------------ loops
  /**
   * Start a positional loop: 'heartbeat' | 'drip' | 'snore' | 'signCreak' | 'iceCream'.
   * opts: position, volume, pitch, fadeIn, plus per-loop options (heartbeat: bpm; drip: rate;
   * snore: voice; signCreak: swing seconds; iceCream: tune, beats, step, root, gap).
   * Returns a handle { playing, stop(fade), setPosition(p), setVolume(v), set(opts) } (null for an
   * unknown name). Loops asked for before unlock start when audio does.
   */
  loop(name, opts) {
    try {
      if (!LOOPS[name]) { this._warn(`unknown loop "${name}"`); return null; }
      const h = new LoopHandle(this, name, opts || {});
      if (!this._failed) this._loops.push(h);
      if (this.ready) this._startLoop(h);
      return h;
    } catch (e) {
      this._warn(`loop ${name}`, e);
      return null;
    }
  }

  _dropLoop(h) {
    const i = this._loops.indexOf(h);
    if (i >= 0) this._loops.splice(i, 1);
    if (this._beatLoop === h) this._beatLoop = null;
  }

  _startLoop(h) {
    const now = this.ctx.currentTime;
    h.player = new LoopPlayer(this.ctx, this.mix, h.name, { t0: now + 0.02, opts: h.opts, rand: this.rand, sp: this._spatial(h.position) });
    h.player.scheduleUntil(now + LOOKAHEAD);
  }

  /** Stop every loop (e.g. when leaving a level). */
  stopLoops(fade = 0.3) {
    for (const h of this._loops) h.stop(fade);
    this._beatLoop = null;
  }

  /**
   * Hold-breath "tunnel": low-passes and dips music + ambience (SFX stay crisp) and, unless
   * { heartbeat: false }, runs the heartbeat loop. Call holdBreath(false) to release.
   */
  holdBreath(on, { heartbeat = true, bpm } = {}) {
    try {
      this._breath = !!on;
      if (on && heartbeat && !this._beatLoop) this._beatLoop = this.loop('heartbeat', { bpm, fadeIn: 0.2 });
      if (on && this._beatLoop && bpm) this._beatLoop.set({ bpm });
      if (!on && this._beatLoop) { this._beatLoop.stop(0.35); this._beatLoop = null; }
      if (this.ready) this._applyFocus();
    } catch (e) { this._warn('holdBreath', e); }
  }

  // ------------------------------------------------------------------ beds & music
  /**
   * Crossfade to an ambience bed ('village'|'harbour'|'farm'|'park'|'office') or null.
   * exclude: event ids to leave out, e.g. ['dog'] when the level has its own visible dogs.
   */
  ambience(name, { fade = 2.5, exclude } = {}) {
    name = name || null;
    this._want.ambience = name;
    if (!this.ctx || this._amb.name === name) return;
    try {
      if (name && !AMBIENCES[name]) { this._warn(`unknown ambience "${name}"`); return; }
      const now = this.ctx.currentTime;
      if (this._amb.player) { this._amb.player.stop(now, fade); this._fading.push(this._amb.player); }
      const player = name ? new AmbiencePlayer(this.ctx, this.mix.amb, name, { t0: now + 0.02, fadeIn: fade, exclude }) : null;
      this._amb = { name, player };
      player?.scheduleUntil(now + LOOKAHEAD);
    } catch (e) { this._warn('ambience', e); }
  }

  /** Crossfade to a music track ('menu'|'level'|'results') or null. restart: replay even if already playing. */
  music(name, { fade, restart = false } = {}) {
    name = name || null;
    this._want.music = name;
    if (!this.ctx || (this._music.name === name && !(restart && name))) return;
    try {
      if (name && !SONGS[name]) { this._warn(`unknown music "${name}"`); return; }
      const now = this.ctx.currentTime;
      const out = fade ?? 1.2;
      if (this._music.player) { this._music.player.stop(now, out); this._fading.push(this._music.player); }
      const player = name ? new SongPlayer(this.ctx, this.mix.music, name, { t0: now + 0.05, fadeIn: fade }) : null;
      this._music = { name, player };
      player?.scheduleUntil(now + LOOKAHEAD);
    } catch (e) { this._warn('music', e); }
  }

  /** Current music position { name, bar, beat, section } (for UI/debug). */
  musicInfo() { return this._music.player?.info?.() || null; }

  // ------------------------------------------------------------------ mix
  setVolumes(v = {}) {
    for (const k of ['master', 'sfx', 'music', 'ambience']) {
      if (Number.isFinite(v[k])) this.volumes[k] = clamp(v[k], 0, 2);
    }
    this._applyVolumes();
    return { ...this.volumes };
  }

  _applyVolumes(immediate = false) {
    if (!this.mix) return;
    const t = this.ctx.currentTime;
    const set = (p, val) => (immediate ? p.setValueAtTime(val, t) : p.setTargetAtTime(val, t, 0.03));
    set(this.mix.master.gain, this.volumes.master);
    set(this.mix.sfx.gain, this.volumes.sfx);
    set(this.mix.music.gain, this.volumes.music);
    set(this.mix.amb.gain, this.volumes.ambience);
  }

  /** Temporarily lower the music by `amount` (0..1) for `seconds`, then recover smoothly. */
  duck(amount = 0.5, seconds = 0.5, delay = 0) {
    try {
      if (!this.ready) return;
      const now = this.ctx.currentTime + Math.max(0, delay);
      const target = 1 - clamp(amount, 0, 1);
      const active = now < this._duck.end;
      const tgt = active ? Math.min(target, this._duck.target) : target;
      const end = Math.max(active ? this._duck.end : 0, now + seconds);
      this._duck = { target: tgt, end };
      const p = this.mix.musicDuck.gain;
      p.cancelScheduledValues(now);
      p.setValueAtTime(p.value, now);
      p.setTargetAtTime(tgt, now, 0.015);
      p.setTargetAtTime(1, end, 0.12);
    } catch (e) { this._warn('duck', e); }
  }

  // ------------------------------------------------------------------ housekeeping
  _tick() {
    if (!this.ctx || this.ctx.state === 'closed') return;
    try {
      const now = this.ctx.currentTime;
      const ahead = typeof document !== 'undefined' && document.hidden ? 1.5 : LOOKAHEAD;
      this._amb.player?.scheduleUntil(now + ahead);
      this._music.player?.scheduleUntil(now + ahead);
      for (let i = this._fading.length - 1; i >= 0; i--) {
        const p = this._fading[i];
        if (p.finished(now)) { p.dispose(); this._fading.splice(i, 1); }
        else p.scheduleUntil(now + ahead);
      }
      for (let i = this._loops.length - 1; i >= 0; i--) {
        const h = this._loops[i];
        if (!h.player) {
          if (h.stopped) { this._loops.splice(i, 1); continue; }
          this._startLoop(h);
        }
        if (h.stopped && h.player.finished(now)) { h.player.dispose(); this._loops.splice(i, 1); continue; }
        h.player.scheduleUntil(now + ahead);
      }
      for (let i = this._active.length - 1; i >= 0; i--) {
        if (this._active[i].end < now) this._release(this._active.splice(i, 1)[0]);
      }
      for (let i = this._dying.length - 1; i >= 0; i--) {
        if (this._dying[i].end < now) this._release(this._dying.splice(i, 1)[0]);
      }
    } catch (e) { this._warn('tick', e); }
  }

  /** Debug stats. */
  stats() {
    return {
      state: this.ctx?.state || 'none', voices: this._active.length, dying: this._dying.length,
      strips: this._strips.length, ambience: this._amb.name, music: this._music.name,
      fading: this._fading.length, loops: this._loops.map((h) => h.name + (h.stopped ? '(stopping)' : '')),
      breath: this._breath, beds: this._amb.player?.stats?.(), song: this.musicInfo(),
    };
  }

  _warn(what, err) {
    if (this._warned.has(what)) return;
    this._warned.add(what);
    try { console.warn(`[audio] ${what}`, err?.message || err || ''); } catch { /* ignore */ }
  }
}

export const audio = new AudioEngine();
export default audio;
