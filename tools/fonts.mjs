// fonts.mjs — subset the self-hosted Space Grotesk font to exactly the characters the site
// uses (plus printable ASCII as a safety net), and write WOFF2 into site/.
//
// Usage: node fonts.mjs   (sources in tools/fonts-src/, OFL-licensed, from google/fonts)
import subsetFont from 'subset-font';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const SITE = '../site';
const SRC = 'fonts-src';

// Every character in the site's HTML/JS/CSS text.
function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
let text = '';
for (const f of walk(SITE)) if (['.html', '.js', '.css'].includes(extname(f))) text += readFileSync(f, 'utf8');
for (let c = 0x20; c < 0x7f; c++) text += String.fromCharCode(c);
const chars = [...new Set(text)].filter((c) => c >= ' ').sort().join('');

// Only Space Grotesk is subset (its OFL has no Reserved Font Name). IBM Plex
// reserves the name "Plex", so a subset of it can't be shipped under that
// name: site/assets/fonts/ uses IBM's own official split WOFF2 files instead
// (npm @ibm/plex-mono, fonts/split/woff2, *-Latin1 and *-Pi), unmodified.
const jobs = [
  ['SpaceGrotesk[wght].ttf', 'space-grotesk.woff2'],
];
for (const [src, out] of jobs) {
  const input = readFileSync(join(SRC, src));
  const woff2 = await subsetFont(input, chars, { targetFormat: 'woff2' });
  writeFileSync(join(SITE, 'assets', 'fonts', out), woff2);
  console.log(`${out.padEnd(22)} ${(woff2.length / 1024).toFixed(1)} KB  (${chars.length} chars)`);
}
