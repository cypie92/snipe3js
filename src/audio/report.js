// Batch measurements over every sound/track/bed (runs in the browser; see tools/audio-check.mjs).
import { renderSfx, renderMusic, renderAmbience, renderLive } from './offline.js';
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
  return out;
}
