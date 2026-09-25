// SongPlayer: bar-by-bar lookahead scheduler. scheduleUntil(t) is pumped by the engine tick
// (every 50 ms, ~0.35 s ahead) or called once up front for offline renders. Swing is applied to
// off-beat 8ths; notes get a few ms of seeded "humanising". Instruments render into per-instrument
// buses (for balance) that feed the song output (for crossfades).
import { Voice } from '../Voice.js';
import { mtof } from '../dsp.js';
import { mulberry32 } from '../../core/rng.js';
import { INST } from './instruments.js';
import { SONGS } from './songs.js';

export { SONGS };

// per-instrument balance (linear), shared by all songs
export const MIX = {
  whistle: 1, clarinet: 1, celesta: 1.33, glock: 1.45, pizz: 2, uke: 1.9, bass: 0.83, accordion: 2, pad: 1.3,
  brush: 2, sweep: 1.85, ride: 2.7, kick: 2.1, shaker: 3, tuba: 1, brass: 1.4, timpani: 1, cymbal: 1,
};

const BUS_FX = {
  uke: ['peaking', 280, 1.2, 3], bass: ['lowpass', 750, 0.8], pizz: ['lowpass', 2600, 0.7], clarinet: ['lowpass', 2000, 0.6],
};

export class SongPlayer {
  constructor(ctx, dest, name, { t0 = ctx.currentTime, fadeIn, seed = 7, only = null } = {}) {
    this.only = only; // debug: render a single instrument
    this.ctx = ctx;
    this.name = name;
    this.song = SONGS[name];
    this.rand = mulberry32(seed);
    this.beat = 60 / this.song.bpm;
    this.barDur = this.song.beats * this.beat;
    this.t0 = t0;
    this.bar = 0;
    this.nextBar = t0;
    this.voices = [];
    this.buses = {};
    this.stopAt = Infinity;
    this.out = ctx.createGain();
    const lvl = this.song.level ?? 1;
    const fi = fadeIn ?? this.song.fadeIn ?? 0.6;
    this.out.gain.setValueAtTime(fi > 0.02 ? 0 : lvl, t0);
    if (fi > 0.02) this.out.gain.linearRampToValueAtTime(lvl, t0 + fi);
    this.out.connect(dest);
  }

  bus(inst) {
    let b = this.buses[inst];
    if (!b) {
      b = this.buses[inst] = this.ctx.createGain();
      b.gain.value = MIX[inst] ?? 1;
      let head = this.out;
      // shared per-instrument tone shaping (one filter per bus instead of one per note)
      const fx = BUS_FX[inst];
      if (fx) {
        const f = this.ctx.createBiquadFilter();
        f.type = fx[0]; f.frequency.value = fx[1]; f.Q.value = fx[2]; f.gain.value = fx[3] || 0;
        f.connect(this.out);
        head = f;
        b.fx = f;
      }
      b.connect(head);
    }
    return b;
  }

  _swing(pos, straight) {
    if (straight) return pos;
    const b = Math.floor(pos + 1e-9);
    const f = pos - b;
    const s = this.song.swing;
    return b + (f < 0.5 ? (f / 0.5) * s : s + ((f - 0.5) / 0.5) * (1 - s));
  }

  scheduleUntil(t) {
    const until = Math.min(t, this.stopAt);
    while (this.nextBar < until) {
      const events = this.song.bar(this.bar, this.rand);
      for (const e of events) this._note(e, this.nextBar);
      this.bar++;
      this.nextBar += this.barDur;
    }
    const now = this.ctx.currentTime;
    for (let i = this.voices.length - 1; i >= 0; i--) {
      if (this.voices[i].end < now) { this.voices[i].v.dispose(); this.voices.splice(i, 1); }
    }
  }

  _note(e, barStart) {
    const fn = INST[e.inst];
    if (!fn || (this.only && e.inst !== this.only)) return;
    const human = e.inst === 'ride' || e.inst === 'brush' ? 0.004 : 0.008;
    const start = Math.max(this.t0, barStart + this._swing(e.pos, e.straight) * this.beat + (this.rand() - 0.5) * human);
    const end = barStart + this._swing(e.pos + e.dur, e.straight) * this.beat;
    const v = new Voice(this.ctx, this.bus(e.inst), start, { pitch: 1, rand: this.rand });
    fn(v, { ...e, f: e.midi ? mtof(e.midi) : 0, dur: Math.max(0.04, end - start), vel: e.vel ?? 0.8, slide: e.slide || 0 });
    this.voices.push({ v, end: v.finish + 0.05 });
  }

  info() {
    const now = this.ctx.currentTime;
    const pos = Math.max(0, (now - this.t0) / this.beat);
    const bar = Math.floor(pos / this.song.beats);
    return { name: this.name, bar, beat: Math.floor(pos % this.song.beats), section: this.song.section?.(bar) ?? '' };
  }

  stop(t, fade = 1.2) {
    const g = this.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + Math.max(0.02, fade));
    this.stopAt = t + fade;
  }
  finished(now) { return now > this.stopAt + 0.2; }

  dispose() {
    for (const { v } of this.voices) v.dispose();
    this.voices.length = 0;
    for (const b of Object.values(this.buses)) { try { b.disconnect(); b.fx?.disconnect(); } catch { /* ignore */ } }
    try { this.out.disconnect(); } catch { /* ignore */ }
  }
}
