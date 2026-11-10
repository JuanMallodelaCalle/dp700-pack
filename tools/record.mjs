// record.mjs — renders the LinkedIn video, frame by frame, with sound.
//
//  1. Opens ?auto=1&capture=1 at 1080×1350, deviceScaleFactor 2.
//  2. Steps the page's virtual clock 1/30 s at a time (window.__seek) and
//     screenshots every frame: perfectly smooth, whatever this PC is doing.
//     Frames are piped straight into ffmpeg (no temp PNGs).
//  3. Holds the final layout for 2 s.
//  4. Reads the timeline cues the page logged (window.__events: tear,
//     confetti, each card landing, reveal, zoom…) and mixes the sound
//     effects at those exact times over the music (adelay + amix), then
//     normalises to -16 LUFS (two-pass loudnorm) as AAC 192 kb/s.
//
// Output (../video/):
//   dp700-pack.mp4          1080×1350, H.264, 30 fps — for LinkedIn
//   dp700-pack-master.mp4   2160×2700 master
//   events.json             the cue log used for the mix
//
// Usage: node record.mjs              (full render, ~15 min)
//        node record.mjs --mix-only   (re-mix the sound on the last capture)
import { chromium } from 'playwright';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from './serve.mjs';

const FPS = 30, HOLD = .25, MAX = 30;   // a breath after the last note (LinkedIn loops videos)
const MIX_ONLY = process.argv.includes('--mix-only');   // redo the sound, keep the frames
const OUT = join('..', 'video');
const TMP = join('out', 'video');
const SFX = join('sfx', 'edited');
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

// ── 1 · Capture ─────────────────────────────────────────────────────────
let total, events, musicEnd;
if (MIX_ONLY) {
  // Re-mix only: reuse the captured video and the cue log from the last run.
  ({ musicEnd, events } = JSON.parse(readFileSync(join(OUT, 'events.json'), 'utf8')));
  // Length follows the current HOLD (can only be shorter than the capture).
  const captured = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', join(TMP, 'small-silent.mp4')], { encoding: 'utf8' }));
  total = Math.min(captured, MAX, musicEnd + HOLD);
  console.log(`mix only: ${events.length} cues, ${total.toFixed(2)} s`);
} else {
const server = await serve(5199);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 });
await page.goto('http://127.0.0.1:5199/?auto=1&capture=1');
await page.waitForFunction(() => window.__ready === true);
const duration = await page.evaluate(() => window.__duration);
musicEnd = await page.evaluate(() => window.__musicEnd);
total = Math.min(MAX, musicEnd + HOLD);
const frames = Math.round(total * FPS);
console.log(`capturing ${frames} frames (${total.toFixed(2)} s) at 2160×2700…`);

// One ffmpeg encodes both files from the same frames.
const enc = spawn('ffmpeg', ['-v', 'error', '-y',
  '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
  '-filter_complex', '[0:v]split=2[m][s];[s]scale=1080:1350:flags=lanczos[small]',
  '-map', '[m]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', String(FPS), join(TMP, 'master-silent.mp4'),
  '-map', '[small]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), join(TMP, 'small-silent.mp4'),
], { stdio: ['pipe', 'inherit', 'inherit'] });
const encoded = new Promise((ok, fail) => enc.on('close', (c) => (c ? fail(new Error(`ffmpeg exited ${c}`)) : ok())));
const write = (buf) => new Promise((ok) => (enc.stdin.write(buf) ? ok() : enc.stdin.once('drain', ok)));

const t0 = Date.now();
for (let f = 0; f < frames; f++) {
  await page.evaluate((t) => window.__seek(t), Math.min(f / FPS, duration));
  await write(await page.screenshot({ type: 'png' }));
  if (f % 60 === 0) process.stdout.write(`  frame ${f}/${frames} (${((Date.now() - t0) / 1000).toFixed(0)} s)\n`);
}
enc.stdin.end();
events = await page.evaluate(() => window.__events.map((e) => ({ ...e })));
await browser.close();
server.close();
await encoded;
writeFileSync(join(OUT, 'events.json'), JSON.stringify({ musicEnd, events }, null, 2));
console.log(`frames done in ${((Date.now() - t0) / 1000).toFixed(0)} s; ${events.length} cues logged`);
}

// ── 2 · Sound mix ───────────────────────────────────────────────────────
// cue → [file, gain dB, impact offset in the file (s), rates per card].
// Same balance as the web page (js/sound.js), in dB: 20·log10(web gain).
// Only the opening has sound; nothing after the cards are dealt.
const MIX = {
  'tear':     ['tear', -14, 0],          // web: quiet tear (0.2)
  'confetti': ['confetti-pop', -10.5, 0],// web 0.30
  'drop':     ['whoosh-soft', -9, 0],    // web 0.35
  'land':     ['card', -15, .26, [1, 1.05, .96, 1.08, 1.01]],   // web 0.18
  'reveal':   ['shimmer', -8.5, 0],      // web 0.38
};
const LAND_DB = [0, -1.4, -.7, -1.9, -.4];   // so five identical sounds don't feel robotic
const MUSIC_DB = -10;                        // web music bus 0.32

const inputs = ['-i', join(SFX, 'music-bed.wav')];
// Music: plays in time and ends at musicEnd, which sits in the natural rest
// right after the fast run of bar 19 — the track's own phrase ending, so no
// fade and no added hit (20 ms de-click only).
const chains = [
  `[0:a]atrim=0:${musicEnd.toFixed(4)},asetpts=PTS-STARTPTS,afade=t=out:st=${(musicEnd - .02).toFixed(4)}:d=0.02,volume=${MUSIC_DB}dB,apad,atrim=0:${total.toFixed(3)}[bed]`,
];
const labels = ['[bed]'];
for (const ev of events) {
  const m = MIX[ev.type];
  if (!m) continue;
  const [file, db, impact, rates] = m;
  let gain = db;
  let rate = 1;
  if (ev.type === 'land') { rate = rates[ev.card % rates.length]; gain += LAND_DB[ev.card % LAND_DB.length]; }
  // land cues fire ~0.05 s before touchdown; line the impact up with it.
  const at = Math.max(0, ev.t + (ev.type === 'land' ? .05 : 0) - impact / rate);
  const i = inputs.length / 2;
  inputs.push('-i', join(SFX, `${file}.wav`));
  const pitch = rate === 1 ? '' : `asetrate=${48000 * rate},aresample=48000,`;
  const ms = Math.round(at * 1000);
  chains.push(`[${i}:a]${pitch}volume=${gain}dB,adelay=${ms}|${ms}[s${i}]`);
  labels.push(`[s${i}]`);
}
const mixGraph = `${chains.join(';')};${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=first[mix]`;

// Two-pass loudnorm to -16 LUFS, true peak -1.5 dBTP.
const premix = join(TMP, 'premix.wav');
execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', mixGraph, '-map', '[mix]', '-c:a', 'pcm_s24le', premix]);
const pass1 = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', premix, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], { encoding: 'utf8' });
// loudnorm prints its JSON after a "[Parsed_loudnorm…]" line; take that block only.
const st = JSON.parse(pass1.stderr.slice(pass1.stderr.lastIndexOf('[Parsed_loudnorm')).match(/\{[\s\S]*?\}/)[0]);
const norm = `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${st.input_i}:measured_TP=${st.input_tp}:measured_LRA=${st.input_lra}:measured_thresh=${st.input_thresh}:offset=${st.target_offset}:linear=true`;
const audio = join(TMP, 'mix.m4a');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', premix, '-af', `${norm},aresample=48000`, '-c:a', 'aac', '-b:a', '192k', audio]);
console.log(`mix: premix ${st.input_i} LUFS / ${st.input_tp} dBTP → -16 LUFS`);

// ── 3 · Mux ─────────────────────────────────────────────────────────────
for (const [v, name] of [['small-silent.mp4', 'dp700-pack.mp4'], ['master-silent.mp4', 'dp700-pack-master.mp4']]) {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(TMP, v), '-i', audio,
    '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'copy', '-t', total.toFixed(3), '-movflags', '+faststart', join(OUT, name)]);
}
const check = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', join(OUT, 'dp700-pack.mp4'), '-af', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
console.log(`done → video/dp700-pack.mp4 (${check.match(/I:\s+(-?[\d.]+) LUFS/g).pop()}), video/dp700-pack-master.mp4`);
