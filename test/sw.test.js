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
  const expected = ['./', 'index.html', 'manifest.webmanifest', ...(await walk('src')), ...(await walk('icons'))];
  assert.deepEqual([...listed].sort(), expected.sort());
});
