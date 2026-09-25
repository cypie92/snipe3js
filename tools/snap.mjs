#!/usr/bin/env node
// Screenshot any page served by Vite (dev server is started automatically).
// Usage: node tools/snap.mjs <path> <out.png> [--size 1600x900] [--wait 2500]
//        [--ready "window.__ready === true"] [--eval "js to run before shot"]
// Example: node tools/snap.mjs /sandbox/kit.html review/shots/kit.png --wait 3000
import { startServer, launchBrowser, newPage } from './browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const target = args[0];
const out = args[1];
if (!target || !out) {
  console.log('Usage: node tools/snap.mjs <path> <out.png> [--size WxH] [--wait ms] [--ready expr] [--eval js]');
  process.exit(1);
}
const [width, height] = opt('size', '1600x900').split('x').map(Number);
const wait = Number(opt('wait', '2500'));
const ready = opt('ready', null);
const evalJs = opt('eval', null);

const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const { page, errors } = await newPage(browser, { width, height });
  const full = target.startsWith('http') ? target : url + target;
  await page.goto(full, { waitUntil: 'load', timeout: 120000 });
  if (ready) await page.waitForFunction(ready, null, { timeout: 180000 });
  if (evalJs) await page.evaluate(evalJs);
  await page.waitForTimeout(wait);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  await page.screenshot({ path: out });
  console.log(`saved ${out}${errors.length ? `  (${errors.length} console errors)` : ''}`);
} finally {
  await browser.close();
  await server.close();
}
