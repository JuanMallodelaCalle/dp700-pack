// check-frame.mjs — verifies the cards never leave the frame during the auto
// sequence, tested every 1/30 s at the three target viewports (deterministic
// capture mode). The pack and the torn strip are meant to fall out of the
// bottom, and confetti flies freely, so they are not checked.
//
// Usage: node check-frame.mjs
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const VIEWPORTS = [[1440, 900], [1080, 1350], [390, 844]];
const server = await serve(5179);
const browser = await chromium.launch();
let bad = 0;
for (const [w, h] of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto('http://127.0.0.1:5179/?auto=1&capture=1');
  await page.waitForFunction(() => window.__ready);
  const dur = await page.evaluate(() => window.__duration);
  const worst = {};
  for (let t = 0; t <= dur; t += 1 / 30) {
    await page.evaluate((t) => __seek(t), t);
    const out = await page.evaluate(() => {
      const vis = (el) => {
        for (let e = el; e && e !== document.body; e = e.parentElement) {
          const cs = getComputedStyle(e);
          if (cs.visibility === 'hidden' || +cs.opacity < .05) return false;
        }
        return true;
      };
      const items = [...document.querySelectorAll('.card__tilt')].map((e, i) => [`card${i}`, e]);
      const res = {};
      for (const [name, el] of items) {
        if (!vis(el)) continue;
        const r = el.getBoundingClientRect();
        const o = Math.max(-r.top, -r.left, r.right - innerWidth, r.bottom - innerHeight);
        if (o > 1) res[name] = Math.round(o);
      }
      return res;
    });
    for (const [k, v] of Object.entries(out)) if (!worst[k] || v > worst[k].px) worst[k] = { px: v, t: +t.toFixed(2) };
  }
  const n = Object.keys(worst).length;
  bad += n;
  console.log(`${w}×${h}: ${n ? 'OUT OF FRAME ' + JSON.stringify(worst) : 'all cards stay in frame'}`);
  await page.close();
}
await browser.close();
server.close();
process.exit(bad ? 1 : 0);
