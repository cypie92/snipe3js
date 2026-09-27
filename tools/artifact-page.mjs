// Turns the Vite build into an Artifact page: the Artifact publish skeleton supplies doctype/head/body,
// so the page keeps only the title, the loading-card style, the stylesheet, the markup and the module
// script, with every dist/assets file published alongside it.
//   npx vite build && node tools/artifact-page.mjs [out.html]
// Writes the page (default dist/artifact.html) and <out>.files.json, the Artifact `files` map.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.resolve(process.argv[2] || path.join(root, 'dist/artifact.html'));
const html = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
const pick = (re) => {
  const m = html.match(re);
  if (!m) throw new Error(`dist/index.html: missing ${re}`);
  return m[1] ?? m[0];
};
const page = [
  pick(/<title>[^<]*<\/title>/),
  pick(/<style>[\s\S]*?<\/style>/),
  `<link rel="stylesheet" href="${pick(/href="\.\/(assets\/index-[^"]+\.css)"/)}">`,
  pick(/<body>([\s\S]*?)<\/body>/).trim(),
  `<script type="module" src="${pick(/src="\.\/(assets\/index-[^"]+\.js)"/)}"></script>`,
  '',
].join('\n');
fs.writeFileSync(out, page);
const files = Object.fromEntries(fs.readdirSync(path.join(root, 'dist/assets')).map((f) => [`assets/${f}`, `dist/assets/${f}`]));
fs.writeFileSync(out.replace(/\.html$/, '.files.json'), JSON.stringify(files, null, 1));
console.log(`${path.relative(root, out)} + ${Object.keys(files).length} asset files`);
