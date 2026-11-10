// shoot.mjs — screenshots for review at the three target viewports.
//
// Uses the deterministic capture mode (?auto=1&capture=1) to freeze key
// moments of the sequence, then also runs the real interactive mode (click to
// open) to check it ends in the same layout with no console errors.
//
// Usage: node shoot.mjs [times...]   → tools/out/shots/<viewport>-<t>.png
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from './serve.mjs';

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
  { name: 'video', width: 1080, height: 1350, deviceScaleFactor: 1 },
  { name: 'phone', width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
];
const TIMES = process.argv.slice(2).map(Number).sort((a, b) => a - b); // capture time only moves forward
const times = TIMES.length ? TIMES : [0.6, 1.55, 2.2, 3.6, 5.2, 8.0, 12.0, 15.7];
const OUT = join('out', 'shots');
mkdirSync(OUT, { recursive: true });

const server = await serve(5174);
const base = 'http://127.0.0.1:5174/';
const browser = await chromium.launch();
let problems = 0;

for (const vp of VIEWPORTS) {
  const { name, ...opts } = vp;
  const ctx = await browser.newContext({ viewport: { width: opts.width, height: opts.height }, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));

  // 1 · Frozen moments from the auto sequence.
  await page.goto(base + '?auto=1&capture=1');
  await page.waitForFunction(() => window.__ready === true);
  for (const t of times) {
    await page.evaluate((t) => window.__seek(t), t);
    await page.screenshot({ path: join(OUT, `${name}-${String(t).padStart(5, '0')}.png`) });
  }

  // 2 · The real interactive path: tap the pack, wait for the deal, zoom the badge.
  await page.goto(base);
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, `${name}-live-sealed.png`) });
  await page.locator('#pack').click();
  await page.waitForFunction(() => !document.querySelector('#spread').inert, null, { timeout: 10000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(OUT, `${name}-live-final.png`) });
  await page.locator('.card__hit').first().click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(OUT, `${name}-live-zoom.png`) });

  if (errors.length) { problems++; console.log(`✗ ${name}:`, errors); }
  else console.log(`✓ ${name}: ${times.length + 3} shots, no console errors`);
  await ctx.close();
}

await browser.close();
server.close();
process.exit(problems ? 1 : 0);
