// Positional loops: a one-shot recipe re-triggered on a (slightly irregular) schedule through its
// own voice strip, so there is never a loop seam, the timing breathes, and the strip can follow
// a moving source / turning listener. Driven by the engine tick like music and ambience.
import { Voice } from './Voice.js';
import { Strip } from './mixer.js';
import { SFX } from './sfx/index.js';
import tells, { jingleLength } from './sfx/tells.js';
import rifle from './sfx/rifle.js';

// sfx: the calibrated one-shot this loop repeats (its trim/send are reused)
// period(state, r, i): seconds until the next trigger
export const LOOPS = {
  heartbeat: { sfx: 'heartbeat', fn: rifle.heartbeat, period: (s) => 60 / (s.bpm || 77), vary: 0.01 },
  drip: { sfx: 'drip', fn: tells.drip, period: (s, r) => (r() < 0.12 ? 0.15 : 0.5 + r() * 0.65) / (s.rate || 1), vary: 0.06 },
  snore: { sfx: 'snore', fn: (v, s) => tells.snore(v, s), period: (s, r) => (3.3 + r() * 0.8) / (s.rate || 1), vary: 0.03 },
  signCreak: { sfx: 'signCreak', fn: (v, s, i) => tells.signCreak(v, { up: i % 2 === 0 }), period: (s, r) => (s.swing || 1.15) * (0.9 + 0.2 * r()), vary: 0.04 },
  iceCream: { sfx: 'iceCream', fn: (v, s) => tells.iceCream(v, s), period: (s) => jingleLength(s) + (s.gap ?? 3.5), vary: 0 },
};
export const LOOP_NAMES = Object.keys(LOOPS);

export class LoopPlayer {
  constructor(ctx, mix, name, { t0 = ctx.currentTime, opts = {}, rand = Math.random, sp = { gain: 1, pan: 0, lowpass: 20000 } } = {}) {
    this.ctx = ctx;
    this.name = name;
    this.def = LOOPS[name];
    this.base = SFX[this.def.sfx];
    this.state = { ...opts };
    this.rand = rand;
    this.strip = new Strip(ctx, mix.sfx, mix.reverbIn);
    this.volume = opts.volume ?? 1;
    this.sp = sp; // start at the real position (no audible glide in from the centre)
    this.strip.setup(t0, { gain: 0, pan: sp.pan, lowpass: sp.lowpass, dist: sp.gain, send: this.base.send * (0.7 + 0.6 * (1 - sp.gain)) });
    this.strip.input.gain.linearRampToValueAtTime(this._gain(), t0 + Math.max(0.02, opts.fadeIn ?? 0.05));
    this.next = t0 + (opts.offset ?? 0);
    this.i = 0;
    this.voices = [];
    this.stopAt = Infinity;
  }

  _gain() { return this.base.gain * this.volume; }

  scheduleUntil(until) {
    const end = Math.min(until, this.stopAt);
    while (this.next < end) {
      const vary = this.def.vary;
      const v = new Voice(this.ctx, this.strip.input, this.next, { pitch: (this.state.pitch ?? 1) * (1 + (this.rand() * 2 - 1) * vary), rand: this.rand });
      this.def.fn(v, this.state, this.i);
      this.voices.push({ v, end: v.finish + 0.05 });
      this.i++;
      this.next += Math.max(0.05, this.def.period(this.state, this.rand, this.i));
    }
    const now = this.ctx.currentTime;
    for (let k = this.voices.length - 1; k >= 0; k--) {
      if (this.voices[k].end < now) { this.voices[k].v.dispose(); this.voices.splice(k, 1); }
    }
  }

  /** Smoothly follow a new spatial result { gain, pan, lowpass }. */
  place(sp, t) {
    this.sp = sp;
    this.strip.glide(t, { pan: sp.pan, lowpass: sp.lowpass, dist: sp.gain, send: this.base.send * (0.7 + 0.6 * (1 - sp.gain)) });
  }

  setVolume(vol, t, time = 0.15) {
    this.volume = Math.max(0, vol);
    const g = this.strip.input.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(this._gain(), t + time);
  }

  stop(t, fade = 0.3) {
    if (this.stopAt !== Infinity) return;
    this.strip.fadeOut(t, Math.max(0.02, fade));
    this.stopAt = t + fade;
  }
  finished(now) { return now > this.stopAt + 0.05; } // the strip is silent after its fade-out

  dispose() {
    for (const { v } of this.voices) v.dispose();
    this.voices.length = 0;
    this.strip.dispose();
  }
}
