// Shared headless-browser + dev-server helpers for snapshots, captures and smoke tests.
// WebGL runs on SwiftShader (software) in the container, so frames are slow but accurate.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function startServer(port = 0) {
  const server = await createServer({
    root: ROOT,
    logLevel: 'error',
    cacheDir: path.join(ROOT, 'node_modules', `.vite-${process.pid}`),
    // No HMR / file watching: teammates edit files concurrently and a reload mid-capture breaks runs.
    server: { port: port || 5100 + Math.floor(Math.random() * 800), strictPort: false, host: '127.0.0.1', hmr: false, watch: null },
  });
  await server.listen();
  const url = server.resolvedUrls.local[0].replace(/\/$/, '');
  return { server, url };
}

export async function launchBrowser() {
  return chromium.launch({
    headless: true,
    args: [
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--enable-webgl',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
}

export async function newPage(browser, { width = 1600, height = 900, log = true } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (msg) => {
    const t = msg.type();
    if (t === 'error') errors.push(msg.text());
    if (log && (t === 'error' || t === 'warning' || msg.text().startsWith('[game]')))
      console.log(`[page:${t}] ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    errors.push(String(err));
    if (log) console.log(`[page:exception] ${err.stack || err}`);
  });
  return { context, page, errors };
}
