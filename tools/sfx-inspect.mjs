// sfx-inspect.mjs — prints a compact technical profile of each sound file so we can
// decide which moment it fits: duration, loudness (EBU R128), true peak, where the
// sound actually starts/ends, a coarse loudness envelope, and a brightness estimate.
// Also writes a waveform + spectrogram PNG per file to tools/out/sfx/ for eyeballing.
//
// Usage: node sfx-inspect.mjs [dir]   (default: ./sfx)
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const dir = process.argv[2] ?? 'sfx';
const outDir = join('out', 'sfx', basename(dir));
mkdirSync(outDir, { recursive: true });

const SR = 44100;
const BARS = ' ▁▂▃▄▅▆▇█';

function decode(file) {
  // Mono float32 PCM on stdout.
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

// EBU R128 summary (ffmpeg prints it on stderr, so use spawnSync to capture it).
function r128(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-'], { encoding: 'utf8' });
  return r.stderr;
}

const db = (x) => (x > 0 ? 20 * Math.log10(x) : -120);

for (const f of readdirSync(dir).filter((n) => /\.(mp3|wav|ogg|m4a|flac)$/i.test(n)).sort()) {
  const path = join(dir, f);
  const x = decode(path);
  const dur = x.length / SR;

  // 20 ms RMS windows → envelope in dBFS.
  const win = Math.round(SR * 0.02);
  const env = [];
  for (let i = 0; i < x.length; i += win) {
    let s = 0, n = 0;
    for (let j = i; j < Math.min(i + win, x.length); j++) { s += x[j] * x[j]; n++; }
    env.push(db(Math.sqrt(s / n)));
  }
  const maxEnv = Math.max(...env);
  const start = env.findIndex((v) => v > maxEnv - 35) * 0.02;
  const end = (env.length - [...env].reverse().findIndex((v) => v > maxEnv - 35)) * 0.02;
  const peakAt = env.indexOf(maxEnv) * 0.02;

  // Brightness proxy: zero-crossing rate in the active region (Hz-ish).
  let zc = 0;
  const a = Math.floor(start * SR), b = Math.min(x.length, Math.floor(end * SR));
  for (let i = a + 1; i < b; i++) if ((x[i - 1] < 0) !== (x[i] < 0)) zc++;
  const zcr = Math.round((zc / Math.max(1, b - a)) * SR / 2);

  // Envelope sparkline squeezed to ~60 columns.
  const cols = 60, step = Math.max(1, Math.ceil(env.length / cols));
  let spark = '';
  for (let i = 0; i < env.length; i += step) {
    const v = Math.max(...env.slice(i, i + step));
    spark += BARS[Math.max(0, Math.min(8, Math.round(((v - (maxEnv - 48)) / 48) * 8)))];
  }

  const summary = r128(path);
  const I = summary.match(/I:\s+(-?[\d.]+) LUFS/g)?.pop()?.match(/-?[\d.]+/)[0];
  const TP = summary.match(/Peak:\s+(-?[\d.]+) dBFS/g)?.pop()?.match(/-?[\d.]+/)[0];

  console.log(`\n■ ${f}`);
  console.log(`  dur ${dur.toFixed(2)}s · active ${start.toFixed(2)}–${end.toFixed(2)}s · loudest @${peakAt.toFixed(2)}s · ${I} LUFS · TP ${TP} dBFS · ZCR≈${zcr} Hz`);
  console.log(`  ${spark}  (each col ≈ ${(step * 0.02).toFixed(2)}s)`);

  const stem = join(outDir, f.replace(/\.\w+$/, ''));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path, '-lavfi',
    'showspectrumpic=s=800x240:legend=1:scale=log:fscale=log,format=rgb24', stem + '.spec.png']);
}
