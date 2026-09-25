#!/usr/bin/env node
// Audio verification: renders every SFX / music track / ambience bed offline in headless Chromium
// (same WebAudio graph as the game) and prints measurement tables with pass/fail flags.
// Usage: node tools/audio-check.mjs [--sfx] [--music] [--amb] [--stress] [--cpu] [--api] [--noaudio]
//        [--names shot,bell] [--seeds 1,2,3] [--chain master|raw] [--spectrum] [--json out.json]
// No flags = everything.
import { startServer, launchBrowser, newPage } from './browser.mjs';
import fs from 'node:fs';

const args = process.argv.slice(2);
const has = (f) => args.includes(`--${f}`);
const opt = (f, d) => { const i = args.indexOf(`--${f}`); return i >= 0 ? args[i + 1] : d; };
const all = !['sfx', 'music', 'amb', 'stress', 'api', 'noaudio', 'cpu'].some(has);
const seeds = opt('seeds', '1,2,3').split(',').map(Number);
const names = opt('names', null)?.split(',');
const chain = opt('chain', 'master');


const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
function table(rows, cols) {
  const w = cols.map(([k, h]) => Math.max(h.length, ...rows.map((r) => String(r[k] ?? '').length)));
  const line = (cells) => `| ${cells.map((c, i) => (typeof c === 'number' ? lpad(c, w[i]) : pad(c, w[i]))).join(' | ')} |`;
  console.log(line(cols.map(([, h]) => h)));
  console.log(`|${w.map((x) => '-'.repeat(x + 2)).join('|')}|`);
  for (const r of rows) console.log(line(cols.map(([k]) => r[k] ?? '')));
}

const { server, url } = await startServer();
const browser = await launchBrowser();
const out = {};
let failures = 0;
try {
  const { page, errors } = await newPage(browser, { width: 900, height: 700, log: true });
  await page.goto(`${url}/sandbox/audio.html`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction('window.__audioLab && window.__audioLab.ready', null, { timeout: 60000 });
  const lab = async (fn, arg) => page.evaluate(([f, a]) => window.__audioLab.report[f](a), [fn, arg]);

  if (all || has('sfx')) {
    const t = Date.now();
    const rows = await lab('sfxReport', { names: names || undefined, seeds, chain, spectrum: has('spectrum') });
    for (const r of rows) {
      const flags = [];
      if (r.peakDb > -1 || r.rawPeakDb > -1) flags.push('PEAK');
      if (r.nonFinite) flags.push('NaN');
      if (r.silent) flags.push('SILENT');
      // abrupt end = still loud in the last 2 ms AND not fading (checked on the dry recipe too)
      const cut = (e, d) => e > -50 && d > -12;
      if (cut(r.endDb, r.endDropDb) || cut(r.rawEndDb, r.rawEndDropDb)) flags.push('CUT');
      if (r.dc > 0.002) flags.push('DC');
      if (r.firstStepDb > -12) flags.push('STEP');
      if (r.firstSample > 1e-4) flags.push('START');
      // trims are calibrated on the linear raw render: reach the loudness target unless that would
      // push the sound's own peak above -1.5 dBFS (peaky transients then sit a little lower)
      r.dev = Math.round((r.lufs100 - r.target) * 10) / 10;
      const rawDev = r.rawLufs100 - r.target;
      const capped = r.rawPeakDb - rawDev > -1.5;
      r.suggest = Math.round(r.trim * Math.min(10 ** (-rawDev / 20), 10 ** ((-1.5 - r.rawPeakDb) / 20)) * 100) / 100;
      r.note = capped ? 'peak-capped' : '';
      if (chain === 'master' && Math.abs(r.dev) > 1.5 && !capped) flags.push('LEVEL');
      r.flags = flags.join(' ') || 'ok';
      if (flags.some((f) => f !== 'LEVEL')) failures++;
    }
    console.log(`\n## SFX (${rows.length} sounds, ${seeds.length} seeds each, chain=${chain}, ${((Date.now() - t) / 1000).toFixed(1)} s)\n`);
    table(rows, [['name', 'sound'], ['cat', 'cat'], ['declared', 'dur s'], ['active', 'active s'], ['rawPeakDb', 'raw peak'], ['peakDb', 'out peak'],
      ['lufsM', 'LUFS-M'], ['lufs100', 'LUFS-100ms'], ['target', 'target'], ['dev', 'dev'], ['lufsSpread', 'seed var'],
      ['crest', 'crest'], ['rawEndDb', 'end dB'], ['rawEndDropDb', 'end drop'], ['firstStepDb', '1st step'], ['dc', 'DC'], ['trim', 'trim'], ['suggest', 'sugg.'],
      ...(has('spectrum') ? [['centroid', 'centroid Hz']] : []), ['note', 'note'], ['flags', 'flags']]);
    out.sfx = rows;
  }

  if (all || has('music')) {
    const rows = await lab('musicReport', { seconds: Number(opt('seconds', 40)), chain });
    console.log('\n## Music (first 40 s of each track)\n');
    for (const r of rows) {
      r.flags = [r.peakDb > -1 && 'PEAK', r.nonFinite && 'NaN', r.silent && 'SILENT'].filter(Boolean).join(' ') || 'ok';
      if (r.flags !== 'ok') failures++;
    }
    table(rows, [['name', 'track'], ['bpm', 'bpm'], ['barDur', 'bar s'], ['barsScheduled', 'bars'], ['peakDb', 'peak dBFS'],
      ['lufsI', 'LUFS-I'], ['lufsM', 'LUFS-M max'], ['rmsDb', 'RMS dB'], ['crest', 'crest'], ['dc', 'DC'], ['flags', 'flags']]);
    for (const r of rows) console.log(`  ${r.name} per-bar RMS dB: ${r.perBarRms.join(' ')}`);
    out.music = rows;
    if (all || has('long') || has('music')) {
      const lr = await lab('levelLongReport', { seconds: 200 });
      console.log(`  level 200 s: LUFS-I ${lr.lufsI}, peak ${lr.peakDb} dBFS, per-8-bar-block RMS: ${lr.perBlockRms.join(' ')}`);
      out.levelLong = lr;
    }
  }

  if (all || has('amb')) {
    const rows = await lab('ambienceReport', { seconds: 45, chain });
    for (const r of rows) {
      r.flags = [r.peakDb > -1 && 'PEAK', r.nonFinite && 'NaN', r.silent && 'SILENT'].filter(Boolean).join(' ') || 'ok';
      r.events = Object.entries(r.counts).map(([k, v]) => `${k}:${v}`).join(' ');
      if (r.flags !== 'ok') failures++;
    }
    console.log('\n## Ambience (45 s renders)\n');
    table(rows, [['name', 'bed'], ['peakDb', 'peak dBFS'], ['lufsI', 'LUFS-I'], ['lufsM', 'LUFS-M max'], ['rmsDb', 'RMS dB'],
      ['rms3sMin', '3s RMS min'], ['rms3sMax', '3s RMS max'], ['dc', 'DC'], ['flags', 'flags'], ['events', 'events fired']]);
    out.ambience = rows;
  }

  if (all || has('stress')) {
    const r = await lab('stressReport');
    console.log(`\n## Stress mix (20 SFX incl. 5 shots over menu music + harbour bed): peak ${r.peakDb} dBFS, ` +
      `LUFS-M max ${r.lufsM}, clipped samples ${r.clipped}, NaN ${r.nonFinite}; ${r.realtimeFactor}x realtime ` +
      `(~${Math.round(1000 / r.realtimeFactor) / 10}% of one core), max ${r.maxNodes} nodes / ${r.maxVoices} voices alive`);
    if (r.peakDb > -1 || r.nonFinite) failures++;
    out.stress = r;
  }

  if (all || has('cpu')) {
    const rows = await lab('liveReport', { seconds: 20 });
    console.log('\n## Live-like CPU profile (20 s scenes, just-in-time scheduling + disposal as in the game)\n');
    table(rows, [['label', 'scene'], ['realtimeFactor', 'x realtime'], ['cpuPct', '% of 1 core'], ['maxNodes', 'max nodes'],
      ['maxVoices', 'max voices'], ['peakDb', 'peak dBFS'], ['lufsI', 'LUFS-I']]);
    out.cpu = rows;
  }

  if (all || has('api')) {
    const res = await page.evaluate(() => window.__audioLab.apiSmoke());
    console.log(`\n## Realtime API smoke test: ${JSON.stringify(res)}`);
    if (!res.ok) failures++;
    out.api = res;
  }
  if (errors.length) { console.log(`\nConsole errors: ${errors.length}`); failures++; }
  await page.context().close();

  if (all || has('noaudio')) {
    const { context, page: p2, errors: e2 } = await newPage(browser, { width: 600, height: 400, log: true });
    await p2.addInitScript(() => { delete window.AudioContext; delete window.webkitAudioContext; delete window.OfflineAudioContext; });
    await p2.goto(`${url}/sandbox/audio.html`, { waitUntil: 'load', timeout: 120000 });
    await p2.waitForFunction('window.__audioLab', null, { timeout: 60000 });
    const res = await p2.evaluate(() => window.__audioLab.apiSmoke({ expectAudio: false }));
    console.log(`\n## No-WebAudio test (AudioContext deleted): ${JSON.stringify(res)}; page errors: ${e2.length}`);
    if (!res.ok || e2.length) failures++;
    out.noaudio = res;
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
if (opt('json', null)) fs.writeFileSync(opt('json'), JSON.stringify(out, null, 1));
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
