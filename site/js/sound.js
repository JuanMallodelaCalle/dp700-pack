// sound.js — sound effects and background music with the Web Audio API.
//
// Muted by default (browsers block autoplaying audio anyway). The speaker
// button turns it on; the choice is remembered, and if it was on, the first
// tap/drag/key on the page turns it back on (audio must start from a gesture).
// Effects are tiny (≈60 KB in total) and decoded after the first gesture;
// the music (≈1 MB) only loads once sound is actually on.
//
// The same timeline cues that drive the animation trigger the sounds, so
// web and video play the same sound design.

const DIR = 'assets/sfx/';
const FX = ['tear', 'whoosh-soft', 'card', 'confetti-pop', 'shimmer'];
const KEY = 'dp700-sound';

// The tear is not a cue: it follows the gesture itself (see tearGrab…).
const TEAR_MAX = .22;       // quiet: the rip should be felt more than heard

// cue type → [effect, gain, playback rate(s), start offset in the file (s)].
// Only the opening has sound: once the cards are dealt the page is silent
// (apart from the music) — no sounds on selecting or zooming cards.
const MAP = {
  'confetti': ['confetti-pop', .3],
  'drop':     ['whoosh-soft', .35],
  'reveal':   ['shimmer', .38],
  // One card sound for all five, nudged in pitch/level so it isn't robotic.
  // The file's impact is at 0.26 s; the cue fires ~0.05 s before landing.
  'land':     ['card', .18, [1, 1.05, .96, 1.08, 1.01], .2],
};
const LAND_GAIN = [1, .85, .92, .8, .95];

export class Sound {
  constructor(button) {
    this.button = button;
    this.ctx = null;
    this.buffers = new Map();
    this.on = false;
    this.music = null;
    this.dealt = false;     // after the deal, cues make no sound
    this.tear = null;       // { src, gain, lastP, lastT } while dragging
    let wanted = false;
    try { wanted = localStorage.getItem(KEY) === 'on'; } catch {}

    button.hidden = false;
    button.addEventListener('click', () => this.set(!this.on));

    // First gesture anywhere: prepare audio, and resume sound if it was on.
    const first = (e) => {
      if (e.target.closest?.('.sound')) return;   // the button handles itself
      removeEventListener('pointerdown', first, true);
      removeEventListener('keydown', first, true);
      this.prepare();
      if (wanted) this.set(true, { quiet: true });
    };
    addEventListener('pointerdown', first, true);
    addEventListener('keydown', first, true);
  }

  /** Create the audio graph and decode the effects (once, after a gesture). */
  prepare() {
    if (this.ctx) return this.ready;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return Promise.resolve();
    this.ctx = new AC();
    this.out = this.ctx.createGain();
    this.out.gain.value = 0;              // muted until switched on
    this.out.connect(this.ctx.destination);
    this.fxBus = this.ctx.createGain();
    this.fxBus.connect(this.out);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = .32;       // music sits well under the effects
    this.musicBus.connect(this.out);
    this.ready = Promise.all(FX.map((n) => this.load(n)));
    return this.ready;
  }

  async load(name) {
    try {
      const res = await fetch(`${DIR}${name}.m4a`);
      this.buffers.set(name, await this.ctx.decodeAudioData(await res.arrayBuffer()));
    } catch { /* a missing sound must never break the page */ }
  }

  /** Switch sound on or off (fades, never clicks). */
  async set(on, { quiet = false } = {}) {
    this.on = on;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch {}
    this.button.setAttribute('aria-pressed', String(on));
    this.button.setAttribute('aria-label', on ? 'Mute sound' : 'Turn sound on');
    await this.prepare();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    const g = this.out.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(on ? 1 : 0, t + (on ? .4 : .25));
    if (on) this.startMusic();
  }

  async startMusic() {
    if (this.music) return;
    this.music = 'loading';
    await this.load('music');
    const buf = this.buffers.get('music');
    if (!buf) { this.music = null; return; }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const fade = this.ctx.createGain();
    fade.gain.setValueAtTime(0, this.ctx.currentTime);
    fade.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 1.5);
    src.connect(fade).connect(this.musicBus);
    src.start();
    this.music = src;
  }

  play(name, gain = 1, rate = 1, offset = 0) {
    if (!this.on || !this.ctx) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.fxBus);
    src.start(0, offset);
  }

  // ── Tear: a looping rip whose level follows the drag speed ──────────
  tearGrab() {
    if (!this.on || !this.ctx || this.tear) return;
    const buf = this.buffers.get('tear');
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain).connect(this.fxBus);
    src.start(0, Math.random() * buf.duration * .6);   // vary the start: no two rips alike
    this.tear = { src, gain, lastP: 0, lastT: performance.now() };
  }

  tearDrag(p) {
    const t = this.tear;
    if (!t) return;
    const now = performance.now();
    const speed = Math.abs(p - t.lastP) / Math.max(1, now - t.lastT) * 1000;   // progress per second
    t.lastP = p; t.lastT = now;
    const level = TEAR_MAX * Math.min(1, speed / 1.6);
    const at = this.ctx.currentTime;
    t.gain.gain.setTargetAtTime(level, at, .03);         // follows the finger…
    t.gain.gain.setTargetAtTime(0, at + .08, .06);       // …and dies away if it stops
    t.src.playbackRate.setTargetAtTime(.9 + Math.min(.25, speed * .12), at, .05);
  }

  /** Finger lifted: if it opened, let the rip finish briefly; else cut it. */
  tearRelease(opened) {
    const t = this.tear;
    if (!t) return;
    this.tear = null;
    const at = this.ctx.currentTime, g = t.gain.gain;
    g.cancelScheduledValues(at);
    g.setValueAtTime(g.value, at);
    if (opened) { g.linearRampToValueAtTime(TEAR_MAX * .8, at + .05); g.setTargetAtTime(0, at + .3, .08); }
    else g.setTargetAtTime(0, at, .03);
    t.src.stop(at + (opened ? .8 : .2));
  }

  /** Opened with a click or Enter: one short, quiet rip. */
  tearTap() { this.play('tear', TEAR_MAX * .9); }

  /** Play the sound for a timeline cue (see MAP). */
  cue(ev) {
    if (ev.type === 'dealt') this.dealt = true;
    if (this.dealt) return;
    const m = MAP[ev.type];
    if (!m) return;
    const [name, gain, rates, offset = 0] = m;
    const i = ev.card ?? 0;
    const rate = rates ? rates[i % rates.length] : 1;
    this.play(name, gain * (ev.type === 'land' ? LAND_GAIN[i] : 1), rate, offset);
  }
}
