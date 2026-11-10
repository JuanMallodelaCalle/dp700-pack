// sfx-edit.mjs — reproducible clean-up of the raw Pixabay SFX in tools/sfx/.
// Originals are never touched; edited versions go to tools/sfx/edited/ as
// 48 kHz / 24-bit WAV (lossless masters for the video mix), each level-matched
// to the same loudness so the final mix only has to set *relative* levels.
//
// Usage: node sfx-edit.mjs
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'sfx';
const OUT = join('sfx', 'edited');
const TARGET_LUFS = -20; // common reference level for every edited clip
mkdirSync(OUT, { recursive: true });

// Each edit: source file, trim window (s), and an ffmpeg filter chain.
// afade on the tail avoids clicks where a source file was cut abruptly.
const EDITS = [
  {
    out: 'tear.wav', // pack strip tearing off
    src: 'freesound_community-tearing-fabric-94608.mp3',
    trim: [0.1, 0.8],
    // cut the sub-120 Hz rumble so it reads as a crisp foil rip, not cloth
    filters: 'highpass=f=120,afade=t=in:d=0.005,afade=t=out:st=0.58:d=0.12',
  },
  {
    out: 'whoosh-soft.wav', // pack dropping away
    src: 'freesound_community-little-whoosh-2-6301.mp3',
    trim: [0.35, 2.4],
    filters: 'afade=t=in:d=0.03,afade=t=out:st=1.35:d=0.7',
  },
  {
    out: 'card.wav', // one card landing (pitch/volume varied per card at mix time)
    src: 'freesound_community-card-sounds-35956.mp3',
    trim: [0.02, 0.43],
    filters: 'highpass=f=90,afade=t=out:st=0.37:d=0.04',
  },
  {
    out: 'confetti-pop.wav', // the double pop only, no "notification" chime tail
    src: 'chrysalyn-clean-double-pop-and-magic-sparkle-alert-sound-effect-543522.mp3',
    trim: [0.0, 0.5],
    filters: 'afade=t=out:st=0.42:d=0.08',
  },
  {
    out: 'shimmer.wav', // foil light sweep / badge zoom sparkle
    src: 'koiroylers-sparkle-355937.mp3',
    trim: [0.08, 1.7],
    // tame the harshest top end a little; long natural fade
    filters: 'lowpass=f=12000,afade=t=in:d=0.01,afade=t=out:st=1.1:d=0.52',
  },
  {
    out: 'zoom-whoosh.wav', // short swoosh for the badge zoom in/out
    src: 'freesound_community-whoosh-96731.mp3',
    trim: [0.0, 0.67],
    // the original ends at its loudest point (hard cut) → add a 60 ms release
    filters: 'afade=t=in:d=0.02,afade=t=out:st=0.61:d=0.06',
  },
  {
    out: 'ui-pop.wav', // site only: speaker toggle feedback
    src: 'mikeaveloo-soft_pop-538611.mp3',
    trim: [0.0, 0.3],
    filters: 'afade=t=out:st=0.2:d=0.1',
  },
];

function integratedLufs(file, filters) {
  // apad: clips under 400 ms are below one R128 gating block and would read as -70.
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', `${filters},apad=whole_dur=1.5,ebur128=framelog=quiet`, '-f', 'null', '-'], { encoding: 'utf8' });
  return Number(r.stderr.match(/I:\s+(-?[\d.]+) LUFS/g).pop().match(/-?[\d.]+/)[0]);
}

for (const e of EDITS) {
  const src = join(SRC, e.src);
  const base = `atrim=${e.trim[0]}:${e.trim[1]},asetpts=PTS-STARTPTS,${e.filters}`;
  // Pass 1: measure the trimmed/filtered clip. Pass 2: apply a static gain to the
  // target, with a limiter so nothing exceeds -1 dBTP.
  const I = integratedLufs(src, base);
  const gain = (TARGET_LUFS - I).toFixed(2);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-af',
    `${base},volume=${gain}dB,alimiter=limit=0.89:level=false,aresample=48000`,
    '-ac', '2', '-c:a', 'pcm_s24le', join(OUT, e.out)]);
  console.log(`${e.out.padEnd(18)} ← ${e.src}  (${I} LUFS, gain ${gain} dB)`);
}

// ── Music (Pixabay, "retro-bgm" track) ──────────────────────────────────
// It starts at full energy from 0:00 (no silent intro), which suits a
// LinkedIn video where the first second matters. Video bed: the first 30 s
// (the mix ends it on a downbeat with a final hit, see record.mjs). Web: the whole track, looped in the page.
{
  const src = join(SRC, 'retro-bgm-chan-bad-boy-523655.mp3');
  const base = 'atrim=0:30,asetpts=PTS-STARTPTS';   // the mix cuts it on a downbeat
  const I = integratedLufs(src, base);
  const gain = (TARGET_LUFS - I).toFixed(2);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-af',
    `${base},volume=${gain}dB,alimiter=limit=0.89:level=false,aresample=48000`,
    '-ac', '2', '-c:a', 'pcm_s24le', join(OUT, 'music-bed.wav')]);
  console.log(`${'music-bed.wav'.padEnd(18)} ← retro-bgm (first 30 s, ${I} LUFS, gain ${gain} dB)`);
}

// ── Web versions (site/assets/sfx/) ─────────────────────────────────────
// Small AAC files for the page's Web Audio player: mono 64 kb/s for effects,
// stereo 96 kb/s for the music. Same loudness as the edited masters.
{
  const WEB = join('..', 'site', 'assets', 'sfx');
  mkdirSync(WEB, { recursive: true });
  const fx = ['tear', 'whoosh-soft', 'card', 'confetti-pop', 'shimmer'];   // the page only sounds while opening
  for (const n of fx) {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(OUT, `${n}.wav`), '-ac', '1', '-ar', '44100',
      '-c:a', 'aac', '-b:a', '64k', join(WEB, `${n}.m4a`)]);
  }
  const src = join(SRC, 'retro-bgm-chan-bad-boy-523655.mp3');
  const I = integratedLufs(src, 'anull');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-af',
    `volume=${(TARGET_LUFS - I).toFixed(2)}dB,alimiter=limit=0.89:level=false`,
    '-ac', '2', '-ar', '44100', '-c:a', 'aac', '-b:a', '96k', join(WEB, 'music.m4a')]);
  console.log(`web: ${fx.length} effects + music → site/assets/sfx/`);
}
