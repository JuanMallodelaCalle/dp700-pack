// main.js — entry point. Picks the mode and wires everything together.
//
//   (default)        interactive: drag/click/Enter to tear, then tilt & zoom.
//   ?auto=1          hands-free cinematic run for recording (no cursor/hints).
//   ?auto=1&capture=1  same run, but frozen: the recorder steps time with
//                    window.__seek(t) and reads cues from window.__events.
//   prefers-reduced-motion  no wobble, flight, confetti or tilt; a cross-fade.

import { clock, seek } from './clock.js';
import { Tilt, bindPointer } from './tilt.js';
import { Confetti } from './confetti.js';
import { measure, scheduleOpen, scheduleOpenReduced, scheduleAuto, AUTO } from './sequence.js';
import { setupTear } from './tear.js';
import { setupZoom } from './zoom.js';
import { buildStrip } from './strip.js';
import { Sound } from './sound.js';

const $ = (s, root = document) => root.querySelector(s);
const cls = document.documentElement.classList;
const mode = {
  auto: cls.contains('is-auto'),
  capture: cls.contains('is-capture'),
  reduced: cls.contains('is-reduced'),
};

const dom = {
  packWrap: $('#packWrap'),
  pack: $('#pack'),
  strip: $('.pack__strip'),
  hint: $('#hint'),
  spread: $('#spread'),
  cards: $('#cards'),
  backdrop: $('#backdrop'),
  credits: $('#credits'),
  slots: [...document.querySelectorAll('.slot')],
};

buildStrip(dom.strip);

// ── Shared systems on the clock ─────────────────────────────────────────
const confetti = new Confetti($('#confetti'));
clock.add(confetti);

const tilts = {
  pack: new Tilt($('#packTilt'), { maxDeg: 16 }),
  cards: dom.slots.map((s) => new Tilt($('.card__tilt', s))),
};
if (!mode.reduced) [tilts.pack, ...tilts.cards].forEach((t) => clock.add(t));

// Idle light on the sealed pack: a slow drift, so the foil is alive from the
// first frame (overridden while a pointer is on it).
// The sway is wide enough to show the pack's thickness (its side gussets).
tilts.pack.driver = (t) => (tilts.pack.pointer ? null : {
  x: .5 + .42 * Math.sin(t * .9 + .9),
  y: .45 + .18 * Math.sin(t * .63 + 1.1),
  a: .75,
});

// Sound only in the interactive page; the video gets its audio mixed offline.
const sound = mode.auto ? null : new Sound($('#sound'));

clock.onCue((ev) => {
  sound?.cue(ev);
  if (ev.type === 'confetti' && !mode.reduced) confetti.burst(ev.x, ev.y);
  if (ev.type === 'dealt') onDealt();
});

// ── Modes ───────────────────────────────────────────────────────────────
if (mode.auto) startAuto();
else startInteractive();

function startInteractive() {
  setupTear(dom.pack, {
    reduced: mode.reduced,
    onGrab: () => sound?.tearGrab(),
    onDrag: (p) => sound?.tearDrag(p),
    onRelease: (opened) => sound?.tearRelease(opened),
    onTap: () => sound?.tearTap(),
    onStart() {
      clock.cue(clock.now, 'tear');
      dom.hint.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' });
      enableGyro();
    },
    onComplete() {
      const geo = measure(dom);
      if (mode.reduced) scheduleOpenReduced(dom, clock.now);
      else scheduleOpen(dom, geo, clock.now);
    },
  });
  if (!mode.reduced) bindPointer(dom.pack, tilts.pack);
  clock.startLive();
}

async function startAuto() {
  await Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode().catch(() => {}))]);
  const geo = measure(dom);
  const end = scheduleAuto(dom, geo, tilts);
  if (mode.capture) {
    // Frozen: everything waits for the recorder.
    window.__seek = seek;
    window.__events = clock.events;
    window.__duration = end;
    window.__musicEnd = AUTO.musicEnd;   // the recorder ends the music on this downbeat
    seek(0);
    window.__ready = true;
  } else {
    clock.startLive();
  }
}

// After the deal: hand the stage to the user.
function onDealt() {
  const hadFocus = dom.packWrap.contains(document.activeElement);
  dom.packWrap.inert = true;
  dom.packWrap.style.visibility = 'hidden';
  dom.spread.inert = false;
  if (mode.auto) return;
  // The deal is over: drop its finished animations (they all end at the
  // cards' natural state). Their lingering transforms would otherwise make
  // each slot a containing block and break the zoom's position: fixed.
  for (const a of document.getAnimations()) {
    const t = a.effect?.target;
    if (t instanceof Element && dom.cards.contains(t)) a.cancel();
  }
  setupZoom(dom, { reduced: mode.reduced });
  if (!mode.reduced) {
    dom.slots.forEach((s, i) => bindPointer($('.card', s), tilts.cards[i]));
  }
  if (hadFocus) $('.card__hit')?.focus({ preventScroll: true });
}

// ── Gyroscope (phones): tilt follows the device. iOS asks permission, which
// must come from a user gesture, so we ask on the first tear gesture. ─────
function enableGyro() {
  const DOE = window.DeviceOrientationEvent;
  if (!DOE || mode.reduced || enableGyro.done) return;
  enableGyro.done = true;
  const listen = () => addEventListener('deviceorientation', onOrient);
  if (typeof DOE.requestPermission === 'function') {
    DOE.requestPermission().then((s) => s === 'granted' && listen()).catch(() => {});
  } else listen();
}
let base = null;
function onOrient(e) {
  if (e.beta == null || e.gamma == null) return;
  base ??= { b: e.beta, g: e.gamma };
  const c = (v) => Math.max(-1, Math.min(1, v));
  const x = .5 + c((e.gamma - base.g) / 25) * .5;
  const y = .5 + c((e.beta - base.b) / 25) * .5;
  const active = dom.spread.inert ? [tilts.pack] : tilts.cards;
  for (const t of active) if (!t.pointer) t.aim(x, y, .85);
}
