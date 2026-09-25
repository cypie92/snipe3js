// Mix graph (works on realtime and offline contexts):
//   voice strips ─> sfx bus ──────────────────────┐
//   music ─> music bus ─> duck ───────────────────┤
//   ambience ─> amb bus ─> focus LPF ─> duck ─────┼─> master ─> DC block ─> comp/limiter ─> soft clip ─> out
//   strips/music sends ─> reverb (convolver) ─────┘
// One look-ahead compressor/limiter (Chrome adds 6 ms pre-delay per compressor, so we use one)
// followed by a tanh soft clipper whose ceiling (-1 dBFS) makes overs impossible.
// DynamicsCompressorNode adds automatic make-up gain; with knee 0 it is exactly
// 0.6 * |threshold| * (1 - 1/ratio) dB, so we undo it and the chain is unity below threshold.
// Its detector also starts "fully compressed" and releases open over ~release time, which would
// swallow the first sound after unlock: release is held at 0 for the first 50 ms to prime it.
import { softClipCurve, reverbIR, dbToGain } from './dsp.js';

function compressor(ctx, { threshold, ratio, attack, release }) {
  const c = ctx.createDynamicsCompressor();
  c.threshold.value = threshold;
  c.knee.value = 0;
  c.ratio.value = ratio;
  c.attack.value = attack;
  c.release.value = release;
  c.release.setValueAtTime(0, ctx.currentTime);
  c.release.setValueAtTime(release, ctx.currentTime + 0.05);
  const post = ctx.createGain();
  post.gain.value = dbToGain(-0.6 * Math.abs(threshold) * (1 - 1 / ratio));
  c.connect(post);
  return { input: c, output: post, node: c };
}

export class Strip {
  constructor(ctx, dest, reverbIn) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 20000;
    this.lp.Q.value = 0.5;
    this.dry = ctx.createGain();
    this.panner = ctx.createStereoPanner();
    this.send = ctx.createGain();
    this.input.connect(this.lp);
    this.lp.connect(this.dry).connect(this.panner).connect(dest);
    this.lp.connect(this.send).connect(reverbIn);
    this.busy = false;
    this.freeAt = 0;
  }
  setup(t, { gain = 1, pan = 0, lowpass = 20000, send = 0.1, dist = 1 }) {
    for (const [p, v] of [[this.input.gain, gain], [this.dry.gain, dist], [this.panner.pan, pan],
      [this.lp.frequency, Math.min(lowpass, this.ctx.sampleRate * 0.45)], [this.send.gain, send]]) {
      p.cancelScheduledValues(0);
      p.setValueAtTime(v, t);
    }
  }
  dispose() {
    for (const n of [this.input, this.lp, this.dry, this.panner, this.send]) n.disconnect();
  }
  // quick fade used when a voice is stolen
  fadeOut(t, time = 0.02) {
    this.input.gain.cancelScheduledValues(t);
    this.input.gain.setValueAtTime(this.input.gain.value, t);
    this.input.gain.linearRampToValueAtTime(0, t + time);
  }
}

export function createMixer(ctx, { destination = ctx.destination } = {}) {
  const m = {};
  m.master = ctx.createGain();
  m.sfx = ctx.createGain();
  m.music = ctx.createGain();
  m.musicDuck = ctx.createGain();
  m.amb = ctx.createGain();
  m.ambFocus = ctx.createBiquadFilter();
  m.ambFocus.type = 'lowpass';
  m.ambFocus.frequency.value = 20000;
  m.ambFocus.Q.value = 0.5;
  m.ambDuck = ctx.createGain();

  m.reverbIn = ctx.createGain();
  m.reverb = ctx.createConvolver();
  m.reverb.normalize = false;
  m.reverb.buffer = reverbIR(ctx);
  m.reverbOut = ctx.createGain();
  m.reverbOut.gain.value = 1;
  m.reverbIn.connect(m.reverb).connect(m.reverbOut).connect(m.master);

  m.sfx.connect(m.master);
  m.music.connect(m.musicDuck).connect(m.master);
  m.musicSend = ctx.createGain();
  m.musicSend.gain.value = 0.12;
  m.musicDuck.connect(m.musicSend).connect(m.reverbIn);
  m.amb.connect(m.ambFocus).connect(m.ambDuck).connect(m.master);

  m.limiter = compressor(ctx, { threshold: -3.5, ratio: 8, attack: 0.002, release: 0.15 });
  m.pre = ctx.createGain();
  m.pre.gain.value = 0.5; // soft-clip curve spans +-2.0
  m.clip = ctx.createWaveShaper();
  m.clip.curve = softClipCurve(ctx);
  m.clip.oversample = 'none'; // oversampling filters overshoot the curve; 'none' guarantees the ceiling
  m.dcBlock = ctx.createBiquadFilter();
  m.dcBlock.type = 'highpass';
  m.dcBlock.frequency.value = 18;
  m.dcBlock.Q.value = 0.6;
  m.master.connect(m.dcBlock).connect(m.limiter.input);
  m.limiter.output.connect(m.pre).connect(m.clip);
  m.output = m.clip;
  m.clip.connect(destination);
  return m;
}
