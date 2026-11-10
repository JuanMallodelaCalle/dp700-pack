// clock.js — the single source of time for everything driven by JS
// (tilt springs, confetti physics, scripted light sweeps, timeline events).
//
// Two modes:
//  • live     requestAnimationFrame advances the clock in real time.
//  • capture  nothing moves on its own; the recorder calls window.__seek(t)
//             for each video frame. Physics advances in the same fixed steps
//             either way, so a capture run is fully reproducible.
//
// Subscribers implement `step(t, dt)` (pure state, called at a fixed 240 Hz)
// and optionally `render(t)` (writes to the DOM/canvas once per frame).

const STEP = 1 / 240;
const subscribers = new Set();
const events = [];          // { t, type, ...data } — timeline cues, sorted on insert
let now = 0;                // seconds since the clock started
let nextEvent = 0;          // index of the first event not yet fired
let listeners = [];         // (event) => void, for sound and logging
let liveOrigin = 0;

export const clock = {
  get now() { return now; },
  get events() { return events; },
  capture: false,

  add(sub) { subscribers.add(sub); return () => subscribers.delete(sub); },

  /** Schedule a cue at absolute clock time `t` (seconds). */
  cue(t, type, data = {}) {
    const ev = { t: Math.round(t * 1000) / 1000, type, ...data };
    let i = events.length;
    while (i > nextEvent && events[i - 1].t > ev.t) i--;
    events.splice(i, 0, ev);
    return ev;
  },

  onCue(fn) { listeners.push(fn); },

  /** Start the real-time loop. */
  startLive() {
    liveOrigin = performance.now();
    const frame = () => {
      advanceTo((performance.now() - liveOrigin) / 1000);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  },
};

/** Integrate all subscribers up to time `t`, firing cues on the way, then render once. */
function advanceTo(t) {
  while (now + STEP <= t + 1e-9) {
    now += STEP;
    while (nextEvent < events.length && events[nextEvent].t <= now + 1e-9) {
      const ev = events[nextEvent++];
      for (const fn of listeners) fn(ev);
    }
    for (const s of subscribers) s.step?.(now, STEP);
  }
  for (const s of subscribers) s.render?.(now);
}

/**
 * Capture mode: freeze every animation on the page (CSS keyframes included,
 * via document.getAnimations()) and move it, and the JS clock, to time t.
 * All Web Animations are created at t = 0 with delays, so currentTime = t.
 */
export function seek(t) {
  if (t < now - 1e-6) throw new Error(`seek must move forward (now=${now}, t=${t})`);
  for (const a of document.getAnimations()) {
    a.pause();
    a.currentTime = t * 1000;
  }
  advanceTo(t);
}

/** Milliseconds from "now" until absolute clock time t (for animation delays). */
export const delayUntil = (t) => (t - now) * 1000;
