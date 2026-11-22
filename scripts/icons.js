// Renders icons/icon.svg to the PNG sizes the manifest and iOS need.
// Run with `npm run icons` after changing the SVG.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const dir = fileURLToPath(new URL('../icons/', import.meta.url));
const svg = await readFile(dir + 'icon.svg', 'utf8');
const sizes = { 'apple-touch-icon.png': 180, 'icon-192.png': 192, 'icon-512.png': 512 };

const browser = await chromium.launch();
for (const [name, size] of Object.entries(sizes)) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: dir + name });
  await page.close();
  console.log(`${name} ${size}x${size}`);
}
await browser.close();
