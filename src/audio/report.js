// Batch measurements over every sound/track/bed (runs in the browser; see tools/audio-check.mjs).
import { renderSfx, renderMusic, renderAmbience, renderLive, renderEngine, testListener } from './offline.js';
import { LOOP_NAMES } from './loops.js';
import { analyze, sliceRms, centroid } from './analyze.js';
import { SFX, SFX_NAMES } from './sfx/index.js';
import { SONGS, MIX } from './music/index.js';
import { AMBIENCES } from './ambience/index.js';

const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const r1 = (x) => Math.round(x * 10) / 10;

export async function sfxReport({ names = SFX_NAMES, seeds = [1, 2, 3], chain = 'master', spectrum = false } = {}) {
  const rows = [];
  for (const name of names) {
    const runs = [];
    const raws = [];
    let cent = 0;
    for (const seed of seeds) {
      const { buf, declared } = await renderSfx(name, { seed, chain });
      runs.push(analyze(buf, { declared }));
      // the recipe alone (trim applied, no master dynamics): its own peak must already be <= -1 dBFS
      const raw = chain === 'raw' ? buf : (await renderSfx(name, { seed, chain: 'raw' })).buf;
      raws.push(analyze(raw));
      if (spectrum && seed === seeds[0]) cent = centroid(buf);
    }
    rows.push({
      rawPeakDb: Math.max(...raws.map((x) => x.peakDb)),
      rawLufs100: r1(avg(raws.map((x) => x.lufs100))),
      name, cat: SFX[name].cat, trim: SFX[name].gain,
      declared: Math.max(...runs.map((x) => x.declared)),
      active: Math.max(...runs.map((x) => x.active)),
      peakDb: Math.max(...runs.map((x) => x.peakDb)),
      lufsM: r1(avg(runs.map((x) => x.lufsM))),
      lufs100: r1(avg(runs.map((x) => x.lufs100))),
      target: SFX[name].target,
      lufsSpread: r1(Math.max(...runs.map((x) => x.lufs100)) - Math.min(...runs.map((x) => x.lufs100))),
      rmsDb: r1(avg(runs.map((x) => x.rmsDb))),
      crest: r1(avg(runs.map((x) => x.crest))),
      dc: Math.max(...runs.map((x) => Math.abs(x.dc))),
      startDcDb: Math.max(...runs.map((x) => x.startDcDb)),
      endDb: Math.max(...runs.map((x) => x.endDb)),
      endDropDb: Math.max(...runs.map((x) => x.endDropDb)),
      rawEndDb: Math.max(...raws.map((x) => x.endDb)),
      rawEndDropDb: Math.max(...raws.map((x) => x.endDropDb)),
      firstSample: Math.max(...runs.map((x) => x.firstSample)),
      firstStepDb: Math.max(...runs.map((x) => x.firstStepDb)),
      nonFinite: runs.reduce((s, x) => s + x.nonFinite, 0),
      clipped: runs.reduce((s, x) => s + x.clipped, 0),
      silent: runs.some((x) => x.silent),
      centroid: cent || undefined,
    });
  }
  return rows;
}

export async function musicReport({ seconds = 40, chain = 'master' } = {}) {
  const rows = [];
  for (const name of Object.keys(SONGS)) {
    const { buf, barDur, bars } = await renderMusic(name, { seconds, chain });
    const a = analyze(buf);
    rows.push({ name, bpm: SONGS[name].bpm, barDur: r1(barDur * 100) / 100, barsScheduled: bars, ...a, perBarRms: sliceRms(buf, barDur) });
  }
  return rows;
}

// long render of the level track to check its long-form levels stay steady
export async function levelLongReport({ seconds = 200 } = {}) {
  const { buf, barDur } = await renderMusic('level', { seconds });
  const a = analyze(buf);
  const per = sliceRms(buf, barDur * 8);
  return { ...a, perBlockRms: per };
}

export async function ambienceReport({ seconds = 45, chain = 'master' } = {}) {
  const rows = [];
  for (const name of Object.keys(AMBIENCES)) {
    const { buf, counts } = await renderAmbience(name, { seconds, chain });
    const a = analyze(buf);
    const per = sliceRms(buf, 3);
    rows.push({ name, ...a, rms3sMin: Math.min(...per), rms3sMax: Math.max(...per), counts });
  }
  return rows;
}

// worst case: a busy moment with many SFX over music + ambience through the master bus
export async function stressReport() {
  const sfx = [['shot', 0.5], ['hitMetal', 0.62], ['bell', 0.7], ['jobDone', 0.8], ['cash', 1.0], ['crowdCheer', 1.1],
    ['shot', 2.0], ['pop', 2.1], ['firework', 2.2], ['shot', 3.0], ['hitGlass', 3.1], ['badHit', 3.2], ['gasp', 3.3],
    ['fanfare', 5], ['stamp', 5.2], ['collect', 6], ['shot', 6.1], ['shot', 6.25], ['clang', 6.3], ['splash', 6.35]];
  // rendered the way the live engine runs (just-in-time scheduling + disposal), so the render
  // speed is an honest CPU proxy
  const r = await renderLive({ sfx, music: 'menu', ambience: 'harbour', seconds: 12 });
  return { ...analyze(r.buf), realtimeFactor: r.realtimeFactor, maxNodes: r.maxNodes, maxVoices: r.maxVoices };
}

// per-instrument solo renders (balance within each song)
export async function musicStems({ seconds = 40 } = {}) {
  const out = {};
  for (const name of Object.keys(SONGS)) {
    out[name] = {};
    for (const inst of Object.keys(MIX)) {
      const { buf } = await renderMusic(name, { seconds, only: inst, chain: 'raw' });
      const a = analyze(buf);
      if (!a.silent) out[name][inst] = { lufsI: a.lufsI, peakDb: a.peakDb };
    }
  }
  return out;
}

// continuous layers alone, then each event type alone (one bed at a time)
export async function ambienceParts({ name = 'village', seconds = 60 } = {}) {
  const out = {};
  const ids = ['layers', ...AMBIENCES[name].events.map((e) => e.id)];
  for (const id of ids) {
    const { buf } = await renderAmbience(name, { seconds: id === 'layers' ? 20 : seconds, only: id, chain: 'raw' });
    const a = analyze(buf);
    out[id] = a.silent ? 'silent' : { lufsI: a.lufsI, lufs100: a.lufs100, peakDb: a.peakDb };
  }
  return out;
}

// live-like CPU/node-count profile of typical game situations
export async function liveReport({ seconds = 20 } = {}) {
  const shots = [];
  for (let t = 1; t < seconds; t += 2.5) shots.push(['shot', t], ['bolt', t + 0.6], ['hitWood', t + 0.25]);
  const cases = [
    ['menu music + office', { music: 'menu', ambience: 'office', sfx: [] }],
    ['level music + village + shooting', { music: 'level', ambience: 'village', sfx: shots }],
    ['level music + harbour + shooting', { music: 'level', ambience: 'harbour', sfx: shots }],
    ['results music + park + stingers', { music: 'results', ambience: 'park', sfx: [['fanfare', 1], ['stamp', 2], ['crowdCheer', 2.5], ['cash', 4], ['tick', 4.2], ['tick', 4.3]] }],
  ];
  const out = [];
  for (const [label, o] of cases) {
    const r = await renderLive({ ...o, seconds });
    const a = analyze(r.buf);
    out.push({ label, realtimeFactor: r.realtimeFactor, cpuPct: Math.round(1000 / r.realtimeFactor) / 10, maxNodes: r.maxNodes, maxVoices: r.maxVoices, peakDb: a.peakDb, lufsI: a.lufsI });
  }
  // busiest village moment through the real engine: chatter + all tell loops + shooting
  const at = [];
  for (let t = 0.5; t < seconds; t += 0.8) at.push([t, (e) => e.sfx('babble', { position: [Math.sin(t * 7) * 40, 1.6, -20 - (t * 13) % 60], syllables: 4 + Math.round(t * 3) % 8, mood: ['happy', 'surprised', 'question'][Math.round(t * 5) % 3] })]);
  for (let t = 1; t < seconds; t += 2.5) at.push([t, (e) => { e.sfx('shot'); e.sfx('bolt', { delay: 0.3 }); e.sfx('hitWood', { position: [5, 2, -60], delay: 0.2 }); }]);
  const r = await renderEngine({ seconds, listener: testListener(), at, script: (e) => {
    e.music('level', { fade: 0.05 }); e.ambience('village', { fade: 0.05 });
    e.loop('drip', { position: [-20, 1, -45] }); e.loop('snore', { position: [15, 1, -30] });
    e.loop('signCreak', { position: [30, 4, -55] }); e.loop('iceCream', { position: [-35, 2, -70] });
  } });
  const a = analyze(r.buf);
  const rt = Math.round((seconds * 1000 / r.ms) * 10) / 10;
  out.push({ label: 'village: level music + bed + chatter + 4 loops + shooting (engine)', realtimeFactor: rt, cpuPct: Math.round(1000 / rt) / 10, maxNodes: '', maxVoices: '', peakDb: a.peakDb, lufsI: a.lufsI });
  return out;
}

// babble matrix: every voice x mood (loudness should match across voices; durations follow syllables)
export async function babbleReport({ syllables = 6, seeds = [1, 2, 3] } = {}) {
  const { VOICE_NAMES, MOOD_NAMES } = await import('./sfx/voices.js');
  const rows = [];
  for (const voice of VOICE_NAMES) {
    for (const mood of MOOD_NAMES) {
      const runs = [];
      let cent = 0;
      for (const seed of seeds) {
        const { buf, declared } = await renderSfx('babble', { seed, chain: 'raw', opts: { voice, mood, syllables, seed: `${voice}${seed}` } });
        runs.push(analyze(buf, { declared }));
        if (seed === seeds[0]) cent = centroid(buf);
      }
      rows.push({ voice, mood, dur: r1(avg(runs.map((x) => x.declared)) * 100) / 100, lufs100: r1(avg(runs.map((x) => x.lufs100))),
        peakDb: Math.max(...runs.map((x) => x.peakDb)), centroid: cent });
    }
  }
  return rows;
}

// ---------------------------------------------------------------- round 2: voices, loops, breath

const rmsDb = (buf, a, b) => {
  const sr = buf.sampleRate, i0 = Math.round(a * sr), i1 = Math.min(buf.length, Math.round(b * sr));
  let q = 0, n = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = i0; i < i1; i++) { q += d[i] * d[i]; n++; } }
  return r1(10 * Math.log10(q / Math.max(1, n) + 1e-12));
};
// onsets: frames (10 ms) whose RMS jumps > 9 dB over the previous 30 ms
const onsets = (buf, from = 0, to = buf.duration) => {
  const sr = buf.sampleRate, fr = Math.round(0.01 * sr), d = buf.getChannelData(0), out = [];
  const lv = [];
  for (let s = Math.round(from * sr); s + fr < Math.min(d.length, to * sr); s += fr) {
    let q = 0; for (let i = s; i < s + fr; i++) q += d[i] * d[i];
    lv.push(10 * Math.log10(q / fr + 1e-12));
  }
  for (let i = 3; i < lv.length; i++) {
    const prev = Math.max(lv[i - 1], lv[i - 2], lv[i - 3]);
    if (lv[i] > -60 && lv[i] - prev > 9 && (!out.length || from + i * 0.01 - out[out.length - 1] > 0.12)) out.push(r1((from + i * 0.01) * 100) / 100);
  }
  return out;
};

// 1 vs 3 vs 5 villagers talking at once, spread around the square (engine stagger + crowd trim)
export async function crowdReport() {
  const spots = [[-12, 1.6, -30], [18, 1.6, -42], [-30, 1.6, -60], [8, 1.6, -22], [32, 1.6, -75]];
  const moods = ['surprised', 'happy', 'question', 'surprised', 'happy'];
  const rows = [];
  for (const n of [1, 3, 5]) {
    const { buf, eng } = await renderEngine({ seconds: 4, listener: testListener(), at: [[0.5, (e) => {
      for (let i = 0; i < n; i++) e.sfx('babble', { position: spots[i], syllables: 8, mood: moods[i] });
    }]] });
    const a = analyze(buf);
    rows.push({ talkers: n, peakDb: a.peakDb, lufsM: a.lufsM, lufs100: a.lufs100, starts: onsets(buf, 0.4, 1.2).slice(0, 6).join(' '), voicesCapped: eng.stats().voices });
  }
  // a busy bad-hit moment: shot, bonk + "oi", three bubbles
  const { buf } = await renderEngine({ seconds: 4, listener: testListener(), at: [[0.3, (e) => {
    e.sfx('shot'); e.sfx('badHit', { position: [4, 1.6, -40], delay: 0.2 }); e.sfx('oi', { position: [4, 1.6, -40], delay: 0.2 });
    for (let i = 0; i < 3; i++) e.sfx('babble', { position: spots[i], syllables: 6, mood: 'surprised', delay: 0.5 });
  }]] });
  const b = analyze(buf);
  rows.push({ talkers: 'shot+badHit+oi+3', peakDb: b.peakDb, lufsM: b.lufsM, lufs100: b.lufs100, starts: '', voicesCapped: '' });
  return rows;
}

// each loop for 8 s, stopped at 6 s: level, trigger timing, and silence after the stop fade
export async function loopReport() {
  const rows = [];
  for (const name of LOOP_NAMES) {
    let h;
    const { buf } = await renderEngine({ seconds: 8, listener: testListener(), at: [
      [0.2, (e) => { h = e.loop(name, { position: [6, 1.2, -18] }); }], [6.2, () => h.stop(0.3)]] });
    const a = analyze(buf);
    const on = onsets(buf, 0.2, 6.2);
    const gaps = on.slice(1).map((t, i) => t - on[i]);
    rows.push({ loop: name, peakDb: a.peakDb, lufsI: a.lufsI, lufsM: a.lufsM, triggers: on.length,
      meanGap: gaps.length ? r1(avg(gaps) * 100) / 100 : 0, afterStopDb: rmsDb(buf, 6.8, 8.05) });
  }
  return rows;
}

// the lead's hold-breath wiring: sfx('heartbeat') every 0.78 s -> even spacing, steady level, clean tails
export async function heartbeatCallsReport() {
  const at = [];
  for (let k = 0; k < 10; k++) at.push([0.3 + k * 0.78, (e) => e.sfx('heartbeat')]);
  const { buf } = await renderEngine({ seconds: 9, at });
  const on = onsets(buf, 0.2, 8.5);
  const lubs = on.filter((t, i) => i === 0 || t - on[i - 1] > 0.4);
  const gaps = lubs.slice(1).map((t, i) => r1((t - lubs[i]) * 100) / 100);
  const beatDb = lubs.map((t) => rmsDb(buf, t, t + 0.12));
  const a = analyze(buf);
  return { beats: lubs.length, gaps: gaps.join(' '), beatLevelSpreadDb: r1(Math.max(...beatDb) - Math.min(...beatDb)), peakDb: a.peakDb, lufsI: a.lufsI, nonFinite: a.nonFinite };
}

// holdBreath(true) at 3 s, (false) at 6 s over level music + village: how much the bed/music dips
export async function holdBreathReport() {
  const { buf } = await renderEngine({ seconds: 9, script: (e) => { e.music('menu', { fade: 0.05 }); e.ambience('village', { fade: 0.05 }); },
    at: [[3, (e) => e.holdBreath(true)], [6, (e) => e.holdBreath(false)]] });
  const hf = (a, b) => { // energy above ~2 kHz via first difference (a cheap high-pass)
    const sr = buf.sampleRate, d = buf.getChannelData(0); let q = 0, n = 0;
    for (let i = Math.round(a * sr) + 1; i < Math.round(b * sr); i++) { const x = d[i] - d[i - 1]; q += x * x; n++; }
    return r1(10 * Math.log10(q / n + 1e-12));
  };
  return { before: rmsDb(buf, 1.5, 3), holding: rmsDb(buf, 3.6, 6), after: rmsDb(buf, 7.2, 8.8),
    hfBefore: hf(1.5, 3), hfHolding: hf(3.6, 6), hfAfter: hf(7.2, 8.8), heartbeats: onsets(buf, 3, 6.2).length };
}
