// sequence.js — the choreography, written as data on one clock.
//
// Every animation is a Web Animation created up front with a delay, so a whole
// sequence is "scheduled", never chained with awaits. That is what makes
// ?capture=1 deterministic: seeking time t just sets currentTime on each one.
// Moments that matter (tear, confetti, each card landing, zoom…) are also
// registered as clock cues, which drive the confetti, the sounds and the log
// the video recorder reads.

import { clock, delayUntil } from './clock.js';
import { Tilt } from './tilt.js';

/** Schedule a Web Animation on `el` from absolute clock time `at`, lasting `dur` seconds. */
export function play(el, keyframes, at, dur, { easing = 'linear', fill = 'forwards' } = {}) {
  return el.animate(keyframes, { delay: delayUntil(at), duration: dur * 1000, easing, fill });
}

/**
 * Flip a card from its back to its face, flat (no preserve-3d, which blurs
 * tilted cards in Chrome). The turn is split at 90°: ease in to edge-on,
 * swap the back for the face there, ease out to 0°.
 */
function flip(tilt, back, at, dur) {
  play(tilt, [
    { rotate: 'y 180deg', easing: 'cubic-bezier(.5,0,.9,.55)' },
    { rotate: 'y 90deg', offset: .5, easing: 'cubic-bezier(.1,.45,.5,1)' },
    { rotate: 'y 0deg' },
  ], at, dur);
  play(back, [{ opacity: 1 }, { opacity: 0 }], at + dur / 2, .001, { fill: 'both' });
}

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/**
 * Measure the final layout before anything moves. Slots sit in their final
 * grid cells all along; the deal just animates them in from the pack.
 */
export function measure(dom) {
  const pack = dom.packWrap.getBoundingClientRect();
  return {
    vw: innerWidth,
    vh: innerHeight,
    pack: { x: pack.left + pack.width / 2, y: pack.top + pack.height / 2, w: pack.width, h: pack.height, top: pack.top },
    slots: dom.slots.map((s) => {
      const r = s.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, left: r.left, top: r.top };
    }),
    spread: dom.cards.getBoundingClientRect(),
  };
}

// Deal timing (seconds after the strip comes off).
// Choreography timing (seconds after the strip comes off). Three beats:
//   burst  → the stack slides out of the pack while it falls away
//   reveal → the badge card comes to the centre, flips to face you, holds
//   deal   → it flies to its slot; the four colour cards follow, quick
export const DEAL = {
  rise: .15, riseDur: .8,         // stack slides out of the pack
  reveal: 1.15, revealDur: .85,   // badge travels to the centre, flipping
  hold: .75,                      // the "you got it" moment
  home: .8,                       // badge to its slot
  first: 3.0, stagger: .2,        // colour cards leave the stack
  flight: .6,
};

// Natural easings: decelerate like a thrown object; no bounces.
const EASE_OUT = 'cubic-bezier(.16,1,.3,1)';      // fast start, long settle
const EASE_IN_OUT = 'cubic-bezier(.65,0,.35,1)';  // travel between two rests
const EASE_RISE = 'cubic-bezier(.22,.9,.32,1)';

/**
 * Open the pack at clock time t0: strip flies off, confetti, pack drops,
 * cards rise and are dealt (badge, red, green, blue, yellow) so the 2×2
 * grid assembles in the Microsoft logo order. Returns the end time.
 */
export function scheduleOpen(dom, geo, t0) {
  const { pack } = geo;
  dom.spread.classList.add('is-open');

  // 1 · The torn strip is flung off: a real projectile (initial impulse,
  //     gravity, spin), sampled into keyframes so the curve is physical
  //     rather than an easing. It flutters (scale-Y ≈ cos) like thin foil
  //     and falls out of the bottom of the screen.
  {
    const vx = pack.w * .9, vy = -pack.h * 1.05;   // px/s (up and to the right)
    const gy = pack.h * 4.2;                       // px/s²
    const spin = 210, flutter = 9;                 // deg/s, rad/s
    const T = 1.6, N = 48, frames = [];
    for (let f = 0; f <= N; f++) {
      const t = (f / N) * T;
      frames.push({
        translate: `${(vx * t).toFixed(1)}px ${(vy * t + .5 * gy * t * t).toFixed(1)}px`,
        rotate: `${(spin * t).toFixed(1)}deg`,
        scale: `1 ${Math.cos(flutter * t).toFixed(3)}`,
      });
    }
    play(dom.strip, frames, t0, T);
  }
  clock.cue(t0, 'strip');

  // The pack eases back from its lean once the strip is off: a smooth
  // settle with no overshoot and no wobble.
  play(dom.pack, [{ rotate: '2.2deg' }, { rotate: '0deg' }], t0, .45, { easing: 'cubic-bezier(.25,.8,.35,1)' });

  // 2 · Confetti bursts from the open top.
  clock.cue(t0 + .06, 'confetti', { x: pack.x, y: pack.top + pack.h * .12 });

  // 3 · Pack drops away while the cards are still rising, falling out of
  //     the bottom of the screen (like gravity: slow start, fast exit).
  const tDrop = t0 + .35, dropDur = .7;
  const drop = geo.vh - pack.top + pack.h * .15;   // fully below the frame
  play(dom.packWrap, [
    { translate: '0 0', rotate: '0deg' },
    { translate: `0 ${drop}px`, rotate: '8deg' },
  ], tDrop, dropDur, { easing: 'cubic-bezier(.5,0,.85,.4)' });
  clock.cue(tDrop, 'drop');
  // Once it is off screen, the pack goes behind the cards (z-index is
  // animatable, so this stays seekable for the recorder).
  play(dom.packWrap, [{ zIndex: 30 }, { zIndex: 0 }], tDrop + dropDur + .02, .01);

  // 4 · Cards. Each property gets its own animations per beat, so X, Y,
  //     scale and the flip can ease independently (X on the slot, the rest
  //     on its inner .fly, so X is never multiplied by the scale). The first animation of a
  //     property fills backwards; later ones only fill forwards, so a phase
  //     never overrides an earlier one before it starts.
  const stackW = pack.w * .78;
  const n = geo.slots.length;
  let end = t0;
  geo.slots.forEach((g, i) => {
    const el = dom.slots[i];                 // moves on X (and fades in)
    const fly = el.querySelector('.fly');    // moves on Y, scales, rotates
    const tilt = el.querySelector('.card__tilt');
    const faceUp = el.dataset.faceUp !== undefined;
    const k = i - (n - 1) / 2;
    const s = stackW / g.w;                               // scale to stack size
    const dx = pack.x - g.x + k * pack.w * .02;           // stack, slightly riffled
    const yIn = pack.y + pack.h * .16 - g.y;              // inside the pack
    // Slid out of the top — but never past the top margin of the screen.
    const halfH = s * g.h / 2;
    const yUpAbs = Math.max(pack.y - pack.h * (.34 + i * .012), geo.vh * .035 + halfH + i * 3);
    const yUp = yUpAbs - g.y;
    const fan = k * -2;

    // Burst: the stack slides out (a riffle: back cards slightly later).
    const tRise = t0 + DEAL.rise + (n - 1 - i) * .04;
    play(el, [{ opacity: 0 }, { opacity: 1 }], tRise, .1, { fill: 'both' });
    play(el, [{ translate: `${dx}px 0` }, { translate: `${dx}px 0` }], tRise, .01, { fill: 'both' });
    play(fly, [{ translate: `0 ${yIn}px` }, { translate: `0 ${yUp}px` }], tRise, DEAL.riseDur, { easing: EASE_RISE, fill: 'both' });
    play(fly, [{ rotate: '0deg' }, { rotate: `${fan}deg` }], tRise, DEAL.riseDur, { easing: EASE_RISE, fill: 'both' });
    play(fly, [{ scale: s }, { scale: s }], tRise, .01, { fill: 'both' });
    const back = el.querySelector('.card__back');
    if (faceUp) play(tilt, [{ rotate: 'y 180deg' }, { rotate: 'y 180deg' }], t0, .01, { fill: 'both' }); // back up

    let tLand;
    if (i === 0) {
      // Reveal: centre of the screen, big, flipping to face you.
      const rx = geo.vw / 2 - g.x;
      const ry = geo.vh * .5 - g.y;
      // As big as fits, leaving room for the flip's perspective and the hold drift.
      const rs = Math.min((geo.vh * .76) / g.h, (geo.vw * .78) / g.w);
      const tR = t0 + DEAL.reveal, tR1 = tR + DEAL.revealDur;
      const tH1 = tR1 + DEAL.hold;
      tLand = tH1 + DEAL.home;

      play(el, [{ translate: `${dx}px 0` }, { translate: `${rx}px 0` }], tR, DEAL.revealDur, { easing: EASE_IN_OUT });
      play(fly, [{ translate: `0 ${yUp}px` }, { translate: `0 ${ry}px` }], tR, DEAL.revealDur, { easing: EASE_IN_OUT });
      play(fly, [{ scale: s }, { scale: rs }], tR, DEAL.revealDur, { easing: EASE_IN_OUT });
      play(fly, [{ rotate: `${fan}deg` }, { rotate: '0deg' }], tR, DEAL.revealDur, { easing: EASE_IN_OUT });
      // The flip: back → face swap exactly when the card is edge-on (90°).
      flip(tilt, back, tR + .1, DEAL.revealDur - .05);
      // Hold: never fully still — a slow drift forward.
      play(fly, [{ scale: rs }, { scale: rs * 1.035 }], tR1, DEAL.hold, { easing: 'cubic-bezier(.3,0,.7,1)' });
      // Light: halo blooms behind, a shine sweeps across the face.
      play(el.querySelector('.reveal-glow'), [
        { opacity: 0, scale: .6 }, { opacity: 1, scale: 1, offset: .35 }, { opacity: 0, scale: 1.35 },
      ], tR1 - .25, DEAL.hold + .7, { easing: 'ease-out' });
      play(el.querySelector('.card__shine'), [{ translate: '-130% 0' }, { translate: '130% 0' }], tR1 - .05, .75, { easing: 'cubic-bezier(.4,0,.2,1)' });
      clock.cue(tR1 - .1, 'reveal');
      // Home: to its slot.
      play(el, [{ translate: `${rx}px 0` }, { translate: '0 0' }], tH1, DEAL.home, { easing: EASE_IN_OUT });
      play(fly, [{ translate: `0 ${ry}px` }, { translate: '0 0' }], tH1, DEAL.home, { easing: EASE_IN_OUT });
      play(fly, [{ scale: rs * 1.035 }, { scale: 1 }], tH1, DEAL.home, { easing: EASE_IN_OUT });
    } else {
      // Colour cards: wait in the stack, then slide out quickly to their slots.
      const tGo = t0 + DEAL.first + (i - 1) * DEAL.stagger;
      const F = DEAL.flight;
      tLand = tGo + F;
      const yHold = pack.y - pack.h * .14 - g.y;
      const tUp = tRise + DEAL.riseDur;
      play(fly, [{ translate: `0 ${yUp}px` }, { translate: `0 ${yHold}px` }], tUp, tGo - tUp, { easing: EASE_IN_OUT });
      play(el, [{ translate: `${dx}px 0` }, { translate: '0 0' }], tGo, F, { easing: EASE_OUT });
      play(fly, [{ translate: `0 ${yHold}px` }, { translate: '0 0' }], tGo, F, { easing: EASE_OUT });
      play(fly, [{ scale: s }, { scale: 1 }], tGo, F, { easing: EASE_OUT });
      play(fly, [{ rotate: `${fan}deg` }, { rotate: `${-Math.sign(g.x - pack.x) * 4}deg`, offset: .35 }, { rotate: '0deg' }], tGo, F, { easing: 'ease-out' });
      if (faceUp) flip(tilt, back, tGo + .05, F * .9);
    }
    clock.cue(tLand - .05, 'land', { card: i });
    end = Math.max(end, tLand);
  });

  // 5 · Credits fade in.
  play(dom.credits, [{ opacity: 0 }, { opacity: 1 }], end + .25, .9, { easing: 'ease-out' });
  clock.cue(end + .1, 'dealt');
  return end;
}

/** Reduced motion: no flight, no confetti; a short cross-fade to the final layout. */
export function scheduleOpenReduced(dom, t0) {
  dom.spread.classList.add('is-open');
  play(dom.packWrap, [{ opacity: 1 }, { opacity: 0 }], t0, .25);
  dom.slots.forEach((el) => play(el, [{ opacity: 0 }, { opacity: 1 }], t0 + .15, .35, { fill: 'both' }));
  play(dom.credits, [{ opacity: 0 }, { opacity: 1 }], t0 + .4, .3);
  clock.cue(t0 + .55, 'dealt');
  return t0 + .55;
}

/** Zoom geometry for the card in `slot` index i: centre of the viewport, as big as fits. */
export function zoomTarget(geo, i) {
  const g = geo.slots[i];
  const s = Math.min((geo.vw * .92) / g.w, (geo.vh * .9) / g.h, 3.4);
  return { tx: geo.vw / 2 - g.x, ty: geo.vh / 2 - g.y, s };
}

// The video's music (Pixabay "retro-bgm") is 170.6 BPM and starts on a
// downbeat at 0.035 s. The tail of the sequence is laid on its bar grid:
// every cut lands on a downbeat, and the music ends right after the fast
// run in bar 19 (in the rest on its 3rd beat), before the next phrase.
const BEAT0 = .035, BEAT = 60 / 170.6, BAR = 4 * BEAT;   // 0.3517 s / 1.4068 s
export const bar = (n) => BEAT0 + n * BAR;

/**
 * ?auto=1 — the cinematic, hands-free run used for the video (≈29 s).
 * Times are absolute seconds from page start.
 */
export const AUTO = {
  intro: [.32, 1.05], // old-TV power-on: a line grows (0 → .32), then the picture opens from it
  tear: 1.8,          // ~0.8 s of idle pack after the picture is up
  tearDur: .85,
  open: 2.7,
  sweep: [7.3, 10.3], // light sweep across all cards
  cuts: 8,            // from bar 8: close-ups of the 5 cards, hard cuts every 2 bars
  spread: 18,         // bar 18: cut back to the whole spread + the address
  musicEnd: bar(19) + 2 * BEAT,   // 27.46 s: end of the run, in the rest
};
AUTO.end = AUTO.musicEnd + .2;

/**
 * Close-up of card `i` in the recording, from `zi` to `zo` (hard cuts, no
 * zoom motion). A copy of the card lives in a fixed layer laid out at its
 * real size, so it stays crisp while it tilts; the holo is already alive at
 * the first frame. All Web Animations, so the recorder can seek them.
 */
function closeUp(dom, geo, i, zi, zo, maxScale) {
  const g = geo.slots[i];
  const layer = document.createElement('div');
  layer.className = 'zoom-layer';
  layer.setAttribute('aria-hidden', 'true');
  layer.toggleAttribute('data-face-up', true);
  const copy = dom.slots[i].querySelector('.card').cloneNode(true);
  copy.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
  copy.querySelector('.card__hit')?.remove();
  copy.removeAttribute('aria-labelledby');
  layer.append(copy);
  dom.spread.append(layer);

  const R = g.w / g.h;
  const zh = Math.min(geo.vh * .9, (geo.vw * .92) / R, g.h * maxScale), zw = zh * R;
  Object.assign(copy.style, {
    left: `${(geo.vw - zw) / 2}px`, top: `${(geo.vh - zh) / 2}px`,
    width: `${zw}px`, height: `${zh}px`, perspective: `${zw * 4}px`,
  });
  play(copy, [{ visibility: 'hidden' }, { visibility: 'visible' }], zi, .001, { fill: 'both' });
  play(copy, [{ visibility: 'visible' }, { visibility: 'hidden' }], zo, .001);
  // The light drifts in a slow figure-eight so the foil plays while the text
  // stays readable. It starts mid-motion: a cut, not a wind-up.
  const zt = new Tilt(copy.querySelector('.card__tilt'));
  zt.driver = (t) => {
    if (t < zi - .05 || t > zo + .05) return { x: .5, y: .5, a: 0 };
    const u = t - zi + 1.1 + i * .7;
    return { x: .5 + .34 * Math.sin(u * 1.45), y: .46 + .2 * Math.sin(u * 2.05 + 1), a: .6 };
  };
  // Settle the spring at the cut so it doesn't swing in from rest.
  const at = zt.driver(zi);
  Object.assign(zt.s, { x: at.x, y: at.y, a: at.a });
  zt.driver = ((d) => (t) => (t < zi - .05 ? at : d(t)))(zt.driver);
  clock.add(zt);
}

export function scheduleAuto(dom, geo, tilts) {
  // Power-on, like an old TV or an arcade cabinet: a bright line grows across
  // the middle of the black screen, then the picture opens up and down from
  // it ("split, horizontal out"), slightly overexposed and scan-lined at first.
  const crt = document.querySelector('.crt');
  if (crt) {
    const [a, b] = AUTO.intro;
    const q = (sel) => crt.querySelector(sel);
    play(q('.crt__line'), [{ scale: '0 1', opacity: 1 }, { scale: '1 1', opacity: 1 }], 0, a,
      { easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' });
    play(q('.crt__line'), [{ opacity: 1 }, { opacity: 0 }], a, .25);
    const open = { easing: 'cubic-bezier(.55,0,.2,1)', fill: 'both' };
    play(q('.crt__top'), [{ translate: '0 0' }, { translate: '0 -118%' }], a, b - a, open);
    play(q('.crt__bot'), [{ translate: '0 0' }, { translate: '0 118%' }], a, b - a, open);
    play(q('.crt__flash'), [{ opacity: .7 }, { opacity: 0 }], a, .9, { easing: 'ease-out', fill: 'both' });
    play(q('.crt__scan'), [{ opacity: .5 }, { opacity: .5, offset: .3 }, { opacity: 0 }], 0, b + .5, { fill: 'both' });
  }

  // Tear: tween the registered --tear property, as a drag would.
  play(dom.pack, [{ '--tear': 0 }, { '--tear': 1 }], AUTO.tear, AUTO.tearDur, { easing: 'cubic-bezier(.45,.05,.35,1)' });
  clock.cue(AUTO.tear, 'tear');

  scheduleOpen(dom, geo, AUTO.open);

  // Light sweep: a virtual light glides across the spread, left to right.
  const [s0, s1] = AUTO.sweep;
  const sp = geo.spread;
  tilts.cards.forEach((tilt, i) => {
    const g = geo.slots[i];
    tilt.driver = (t) => {
      if (t < s0 - .3 || t > s1 + .6) return { x: .5, y: .5, a: 0 };
      const p = smooth((t - s0) / (s1 - s0));
      const lx = sp.left - sp.width * .25 + p * sp.width * 1.5;
      const ly = sp.top + sp.height * (.25 + .5 * p);
      const x = Math.min(1, Math.max(0, (lx - g.left) / g.w));
      const y = Math.min(1, Math.max(0, (ly - g.top) / g.h));
      const near = Math.max(0, 1 - Math.abs(lx - g.x) / (sp.width * .55));
      return { x, y, a: .9 * smooth(near) };
    };
  });
  clock.cue(s0 + .1, 'shimmer');

  // Close-ups: badge, red, green, blue, yellow; a hard cut every 2 bars,
  // over a dimmed spread. Then a hard cut back to the whole spread.
  const c0 = bar(AUTO.cuts), c1 = bar(AUTO.spread);
  for (let k = 0; k < 5; k++) {
    const zi = bar(AUTO.cuts + 2 * k), zo = bar(AUTO.cuts + 2 * k + 2);
    closeUp(dom, geo, k, zi, zo, k === 0 ? 3.4 : 4.6);
    clock.cue(zi, 'cut', { card: k });
  }
  play(dom.backdrop, [{ opacity: 1 }, { opacity: 1 }], c0, c1 - c0, { fill: 'none' });

  // End card: the address, for people who only watch the video.
  const end = document.querySelector('.endcard');
  if (end) {
    play(end, [{ opacity: 0, translate: '0 18px' }, { opacity: 1, translate: '0 0' }], c1 + .1, .5,
      { easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });
    // The holo sheen keeps sliding across the address until the very end.
    const url = end.querySelector('.endcard__url');
    url.animate([{ backgroundPosition: '0% 50%' }, { backgroundPosition: '-300% 50%' }],
      { delay: delayUntil(c1), duration: (AUTO.musicEnd + 3 - c1) * 1000, fill: 'both' });
    // "▶" blinks on the beat, like an arcade attract screen.
    end.querySelector('.endcard__play').animate(
      [{ opacity: 1 }, { opacity: 1, offset: .5 }, { opacity: .15, offset: .5 }, { opacity: .15 }],
      { delay: delayUntil(c1), duration: 2 * BEAT * 1000, iterations: 12, fill: 'both' });
    // A small pulse on the downbeat where the last run starts.
    play(url, [{ scale: 1 }, { scale: 1.05, offset: .25 }, { scale: 1 }], bar(19), .5, { easing: 'ease-out' });
  }
  play(dom.credits, [{ opacity: 1 }, { opacity: 0 }], c1, .3);
  clock.cue(AUTO.musicEnd, 'end');
  return AUTO.end;
}
