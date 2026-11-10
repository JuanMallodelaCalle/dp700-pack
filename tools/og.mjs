// og.mjs — renders the share images from the real page:
//   site/assets/og.png     1200×630  link preview (Open Graph / Twitter card):
//                          all five cards, side by side, flat and at rest
//   video/thumbnail.png    1080×1350 cover image to upload with the video:
//                          the ultra-rare badge card alone, in its close-up
//
// Usage: node og.mjs
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from './serve.mjs';

const SPREAD = `
  :root { --foot: 0px !important; --air: .97 !important; --pad: 34px !important; }
  .credits, .endcard, .crt { display: none !important; }
  /* Cards flat and at rest: no tilt, light centred, no extra holo. */
  .card__tilt { --rx: 0deg !important; --ry: 0deg !important; --mx: 50% !important; --my: 50% !important; --hyp: 0 !important; }`;
const BADGE = `
  .cards, .backdrop, .credits, .endcard, .crt, .confetti { visibility: hidden !important; }
  .zoom-layer { visibility: visible; }`;
const SHOTS = [
  { w: 1200, h: 630, t: 9.8, css: SPREAD, out: join('..', 'site', 'assets', 'og.png') },
  { w: 1080, h: 1350, t: 12.3, css: BADGE, out: join('..', 'video', 'thumbnail.png') },
];
mkdirSync('out', { recursive: true });
mkdirSync(join('..', 'video'), { recursive: true });

const server = await serve(5201);
const browser = await chromium.launch();
for (const { w, h, t, css, out } of SHOTS) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await page.goto('http://127.0.0.1:5201/?auto=1&capture=1');
  await page.waitForFunction(() => window.__ready === true);
  await page.addStyleTag({ content: css });
  await page.evaluate((t) => window.__seek(t), t);
  await page.waitForTimeout(300);
  const raw = join('out', `share-${w}x${h}@2x.png`);
  await page.screenshot({ path: raw });
  await page.close();
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-vf', `scale=${w}:${h}:flags=lanczos`, out]);
  console.log(`${out} (${w}×${h})`);
}
await browser.close();
server.close();
