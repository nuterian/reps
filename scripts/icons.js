// Renders the app icons and the iOS launch images as PNGs.
// Run with `npm run icons` after changing the SVG or the launch image links.
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const svg = await readFile(root + 'icons/icon.svg', 'utf8');
const bars = svg.match(/<rect x=.*\/>/g).join('');
const browser = await chromium.launch();

async function render(file, width, height, scale, html) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
  await page.setContent(`<style>html,body{margin:0;height:100%}</style>${html}`);
  await page.screenshot({ path: root + file });
  await page.close();
  console.log(file);
}

for (const [name, size] of Object.entries({ 'apple-touch-icon.png': 180, 'icon-192.png': 192, 'icon-512.png': 512 })) {
  await render('icons/' + name, size, size, 1, `<style>svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
}

// The sizes come from index.html, so the links and the files cannot differ.
await mkdir(root + 'icons/splash', { recursive: true });
const html = await readFile(root + 'index.html', 'utf8');
for (const [, file, w, h, theme] of html.matchAll(/(icons\/splash\/(\d+)x(\d+)-(light|dark)\.png)/g)) {
  const dark = theme === 'dark';
  await render(file, +w, +h, 3, `<style>body{display:grid;place-items:center;background:${dark ? '#000' : '#fff'}}svg{width:112px}</style>
    <svg viewBox="96 114 320 284">${dark ? bars.replaceAll('#0c0d0f', '#ffe98f') : bars}</svg>`);
}
await browser.close();
