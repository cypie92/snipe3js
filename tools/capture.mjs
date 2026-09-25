#!/usr/bin/env node
// Scripted review captures of the real game (title, office, overview, every job through the scope,
// feedback moments, results). Also prints render stats.
// Usage: node tools/capture.mjs [--level village] [--out review/shots/latest] [--size 1600x900]
//        [--quality high] [--only overview,jobs,results]
import { startServer, launchBrowser, newPage } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const level = opt('level', 'village');
const out = opt('out', `review/shots/${level}`);
const [W, H] = opt('size', '1600x900').split('x').map(Number);
const quality = opt('quality', 'high');
const only = opt('only', 'title,office,intro,overview,jobs,feedback,badhit,results').split(',');
fs.mkdirSync(out, { recursive: true });

const { server, url } = await startServer();
const browser = await launchBrowser();
const log = (...a) => console.log('[capture]', ...a);
const frames = (page, n = 2) => page.evaluate((n) => new Promise((r) => {
  let k = 0;
  const f = () => (++k >= n ? r() : requestAnimationFrame(f));
  requestAnimationFrame(f);
}), n);
const shot = async (page, name) => {
  const file = path.join(out, `${name}.png`);
  await page.screenshot({ path: file, timeout: 120000 });
  log('saved', file);
};
const open = async (query) => {
  const { page, errors } = await newPage(browser, { width: W, height: H });
  await page.goto(`${url}/?${query}&quality=${quality}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction('window.__game && window.__game.ready', null, { timeout: 240000 });
  await frames(page, 3);
  return { page, errors };
};

try {
  if (only.includes('title')) {
    const { page } = await open('screen=title');
    await page.waitForTimeout(1200);
    await shot(page, '00-title');
    await page.close();
  }
  if (only.includes('office')) {
    const { page } = await open('screen=office&dev=1');
    await page.waitForTimeout(800);
    await shot(page, '01-office');
    await page.close();
  }
  if (only.includes('intro')) {
    const { page } = await open(`level=${level}`);
    await page.waitForTimeout(500);
    await shot(page, '02-intro');
    await page.close();
  }

  const { page, errors } = await open(`level=${level}&skipIntro=1`);
  await page.evaluate(() => window.__game.freeze(true));
  const stats = [];

  if (only.includes('overview')) {
    for (const [name, yaw, pitch] of [['03-overview', null, null], ['04-overview-left', 38, -10], ['05-overview-right', -38, -10], ['06-overview-far', 0, -4]]) {
      if (yaw !== null) await page.evaluate(([y, p]) => window.__game.look(y, p), [yaw, pitch]);
      await frames(page, 2);
      stats.push({ name, ...(await page.evaluate(() => window.__game.stats())) });
      await shot(page, name);
    }
  }

  const jobs = await page.evaluate(() => window.__game.jobs());
  log('jobs:', jobs.map((j) => j.id).join(', '));
  if (only.includes('jobs')) {
    let i = 0;
    for (const j of jobs) {
      await page.evaluate((id) => {
        window.__game.aimAt(id);
        window.__game.scope(true, 1);
      }, j.id);
      await frames(page, 2);
      await shot(page, `10-job-${String(++i).padStart(2, '0')}-${j.id}-4x`);
    }
    await page.evaluate(() => window.__game.scope(false));
  }

  if (only.includes('feedback') && jobs.length) {
    const first = jobs.find((j) => !j.bonus) || jobs[0];
    await page.evaluate(() => window.__game.freeze(false));
    await page.evaluate((id) => { window.__game.aimAt(id); window.__game.scope(true, 1); window.__game.shootJob(id); }, first.id);
    await page.evaluate(() => window.__game.step(0.5));
    await frames(page, 2);
    await shot(page, '20-feedback-jobdone');
    await page.evaluate(() => window.__game.step(1.5));
    await frames(page, 2);
    await shot(page, '21-feedback-after');
    await page.evaluate(() => { window.__game.scope(false); window.__game.freeze(true); });
  }

  if (only.includes('badhit')) {
    const hit = await page.evaluate(() => {
      const g = window.__game.game;
      const b = g.level.ctx.bystanders[0];
      if (!b) return false;
      const p = b.getWorldPosition(new g.camera.position.constructor());
      p.y += 0.9;
      g.rig.lookAtPoint(p);
      window.__game.scope(true, 1);
      g.rig.swayMul = 0;
      g.rig.update(0.0001);
      g.frozen = false;
      g.skipBulletCam = true;
      return g.shooting.fire();
    });
    if (hit) {
      await page.evaluate(() => window.__game.step(0.35));
      await frames(page, 2);
      await shot(page, '30-badhit');
    }
    await page.evaluate(() => { window.__game.scope(false); window.__game.game.applyUpgrades(); });
  }

  if (only.includes('results')) {
    await page.evaluate(() => { window.__game.freeze(false); window.__game.completeAll(); window.__game.step(2.5); });
    await page.waitForTimeout(6500);
    await shot(page, '40-results');
  }

  fs.writeFileSync(path.join(out, 'stats.json'), JSON.stringify({ stats, errors }, null, 2));
  log('stats', JSON.stringify(stats));
  if (errors.length) log(`${errors.length} console errors:`, errors.slice(0, 5));
} finally {
  await browser.close();
  await server.close();
}
