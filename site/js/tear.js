// tear.js — tearing the strip off the pack.
//
// Drag across the pack (left → right) and the strip peels with your finger;
// let go past ~45% and it finishes on its own, otherwise it springs back.
// A simple click/tap, Enter or Space plays the tear for you.
// Progress lives in one registered CSS property, --tear (0 → 1), which the
// CSS turns into the strip's lift and the glowing tear line.

const DRAG_START = 8;      // px before a press counts as a drag
const COMMIT = .45;        // release threshold

// Optional gesture hooks (used for sound): onGrab() when a drag starts,
// onDrag(progress) while dragging, onRelease(opened) when the finger lets go
// (or the drag hits the end), onTap() when a click/Enter opens it instead.
export function setupTear(pack, { onStart, onComplete, onGrab, onDrag, onRelease, onTap, reduced = false }) {
  let press = null;        // { id, x0, y0, w, dragging }
  let done = false;
  let started = false;

  const set = (v) => pack.style.setProperty('--tear', v.toFixed(4));
  const get = () => parseFloat(pack.style.getPropertyValue('--tear')) || 0;

  const start = () => { if (!started) { started = true; onStart?.(); } };

  /** Animate --tear from its current value to `to`, then call `then`. */
  function tweenTo(to, ms, then) {
    const from = get();
    const a = pack.animate([{ '--tear': from }, { '--tear': to }], {
      duration: reduced ? 0 : ms * Math.abs(to - from),
      easing: to > from ? 'cubic-bezier(.4,0,.3,1)' : 'cubic-bezier(.3,1.4,.5,1)',
    });
    a.onfinish = () => { set(to); a.cancel(); then?.(); };
  }

  function finish() {
    if (done) return;
    done = true;
    start();
    tweenTo(1, 650, onComplete);
  }

  pack.addEventListener('pointerdown', (e) => {
    if (done || press) return;
    const r = pack.getBoundingClientRect();
    press = { id: e.pointerId, x0: e.clientX, y0: e.clientY, w: r.width, dragging: false };
    pack.setPointerCapture(e.pointerId);
  });

  pack.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.id || done) return;
    const dx = e.clientX - press.x0;
    if (!press.dragging && Math.abs(dx) > DRAG_START) { press.dragging = true; start(); onGrab?.(); }
    if (!press.dragging) return;
    const p = Math.min(1, Math.max(0, dx / (press.w * .8)));
    set(p);
    onDrag?.(p);
    if (p >= 1) { press = null; onRelease?.(true); finish(); }
  });

  const release = (e) => {
    if (!press || e.pointerId !== press.id) return;
    const wasDrag = press.dragging;
    press = null;
    if (done) return;
    if (!wasDrag) { onTap?.(); return finish(); }  // a tap opens it
    const opened = get() >= COMMIT;
    onRelease?.(opened);
    if (opened) finish();
    else tweenTo(0, 500);                          // not far enough: spring back
  };
  pack.addEventListener('pointerup', release);
  pack.addEventListener('pointercancel', (e) => {
    if (press?.id !== e.pointerId) return;
    const wasDrag = press.dragging;
    press = null;
    if (!done) { if (wasDrag) onRelease?.(false); tweenTo(0, 400); }
  });

  pack.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !done) { e.preventDefault(); onTap?.(); finish(); }
  });
}
