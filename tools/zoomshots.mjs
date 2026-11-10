// zoomshots.mjs — opens the site, opens the pack, then zooms each card in turn
// and screenshots it (to review card text and art at a readable size).
// Usage: node zoomshots.mjs [width height]  → tools/out/zoom/<n>.png
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { serve } from './serve.mjs';

const [w, h] = [Number(process.argv[2] ?? 1080), Number(process.argv[3] ?? 1350)];
mkdirSync('out/zoom', { recursive: true });
const server = await serve(5182);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
await page.goto('http://127.0.0.1:5182/');
await page.locator('#pack').click();
await page.waitForFunction(() => !document.querySelector('#spread').inert, null, { timeout: 15000 });
await page.waitForTimeout(1500);
const hits = page.locator('.card__hit');
for (let i = 0; i < await hits.count(); i++) {
  await hits.nth(i).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `out/zoom/${w}x${h}-${i + 1}.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
}
await browser.close();
server.close();
