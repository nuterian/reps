// The app only works offline if the service worker caches every file it
// needs. This fails when a file is added without listing it in sw.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

test('sw.js lists every file the app serves', async () => {
  const sw = await readFile(root + 'sw.js', 'utf8');
  const listed = sw.match(/const ASSETS = \[([\s\S]*?)\];/)[1].match(/'[^']+'/g).map((s) => s.slice(1, -1));
  const walk = async (dir) => (await readdir(root + dir, { recursive: true, withFileTypes: true }))
    .filter((f) => f.isFile() && !f.name.startsWith('.'))
    .map((f) => `${f.parentPath.slice(root.length)}/${f.name}`);
  const expected = ['./', 'index.html', 'manifest.webmanifest', ...(await walk('src')),
    ...(await walk('icons')).filter((f) => !f.startsWith('icons/splash/'))]; // iOS keeps launch images itself
  assert.deepEqual([...listed].sort(), expected.sort());
});

test('index.html preloads every module', async () => {
  const html = await readFile(root + 'index.html', 'utf8');
  const listed = [...html.matchAll(/rel="modulepreload" href="([^"]+)"/g)].map((m) => m[1]);
  const modules = (await readdir(root + 'src', { recursive: true })).filter((f) => f.endsWith('.js')).map((f) => `src/${f}`);
  assert.deepEqual(listed.sort(), modules.sort());
});

test('every launch image exists at the exact size its link promises', async () => {
  const html = await readFile(root + 'index.html', 'utf8');
  const links = [...html.matchAll(/startup-image" href="([^"]+)" media="\(device-width: (\d+)px\) and \(device-height: (\d+)px\) and \(-webkit-device-pixel-ratio: (\d)\).*?\(prefers-color-scheme: (light|dark)\)"/g)];
  assert.equal(links.length, 12, 'six screen sizes, light and dark');
  for (const [, file, w, h, scale, theme] of links) {
    const png = await readFile(root + file);
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [w * scale, h * scale], file);
    assert.equal(file, `icons/splash/${w}x${h}-${theme}.png`);
  }
});
