// zoom.js — click a card to bring it to the centre, big enough to read on a
// phone; click again (or the backdrop, or Escape) to put it back.
//
// The card is re-laid out at its zoomed size (moved into a fixed layer with
// a real width and height) instead of being scaled with a transform. Everything inside a
// card is sized in cqi, so it redraws crisp at any size; a scaled card would
// be rasterised small and stretched, which looks pixelated once it tilts.
// A FLIP animation (from the old rect to the new one) makes the move smooth.

import { clock } from './clock.js';

const EASE = 'cubic-bezier(.2,.75,.2,1)';

export function setupZoom(dom, { reduced = false } = {}) {
  let open = null;   // { slot, card, btn, from, to }

  // While zoomed, the card lives in this viewport-sized layer (above the
  // backdrop), then goes back to its slot. Moving it out of the slot keeps
  // its zoomed box independent of the grid. Each card carries its own colour
  // variables, so it looks the same wherever it is in the DOM.
  const layer = document.createElement('div');
  layer.className = 'zoom-layer';
  layer.toggleAttribute('data-face-up', true);
  dom.spread.append(layer);

  dom.slots.forEach((slot) => {
    const btn = slot.querySelector('.card__hit');
    btn?.addEventListener('click', () => (open?.slot === slot ? close() : zoom(slot, btn)));
  });
  dom.backdrop.addEventListener('click', () => close());
  addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  addEventListener('resize', () => close(true));

  /** Zoomed size and position for a card of aspect `ratio` (w / h). */
  function target(ratio, h0) {
    const h = Math.min(innerHeight * .9, (innerWidth * .92) / ratio, h0 * 3.4);
    const w = h * ratio;
    return { left: (innerWidth - w) / 2, top: (innerHeight - h) / 2, w, h };
  }

  /** The transform that makes the card at `to` look like it sits at `from`. */
  const invert = (from, to) =>
    `translate(${from.left + from.width / 2 - (to.left + to.w / 2)}px, ${from.top + from.height / 2 - (to.top + to.h / 2)}px) scale(${from.width / to.w})`;

  function zoom(slot, btn) {
    if (open) close(true);
    const card = slot.querySelector('.card');
    const from = card.getBoundingClientRect();
    const to = target(from.width / from.height, from.height);

    layer.append(card);
    btn.focus({ preventScroll: true });       // moving a node drops focus: restore it
    Object.assign(card.style, {
      left: `${to.left}px`, top: `${to.top}px`,
      width: `${to.w}px`, height: `${to.h}px`,
      perspective: `${to.w * 4}px`,           // keep the tilt as subtle as in the grid
    });
    slot.classList.add('is-zoomed');
    dom.spread.classList.add('has-zoom');
    btn.setAttribute('aria-expanded', 'true');
    if (!reduced) {
      card.animate([{ transform: invert(from, to) }, { transform: 'none' }], { duration: 480, easing: EASE });
      dom.backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, fill: 'forwards' });
    } else dom.backdrop.style.opacity = 1;
    open = { slot, card, btn, from, to };
    clock.cue(clock.now, 'zoom-in');
  }

  function close(instant = false) {
    if (!open) return;
    const o = open;
    open = null;
    o.btn.setAttribute('aria-expanded', 'false');
    dom.spread.classList.remove('has-zoom');
    const cleanup = () => {
      const hadFocus = document.activeElement === o.btn;
      o.slot.querySelector('.fly').append(o.card);
      for (const k of ['left', 'top', 'width', 'height', 'perspective']) o.card.style.removeProperty(k);
      if (hadFocus) o.btn.focus({ preventScroll: true });
      o.slot.classList.remove('is-zoomed');
      dom.backdrop.getAnimations().forEach((a) => a.cancel());
      dom.backdrop.style.opacity = '';
    };
    if (instant || reduced) return cleanup();
    // The slot may have moved (it didn't, but be safe): aim at its current rect.
    const home = o.slot.getBoundingClientRect();
    const a = o.card.animate([{ transform: 'none' }, { transform: invert(home, o.to) }],
      { duration: 420, easing: 'cubic-bezier(.5,0,.2,1)', fill: 'forwards' });
    dom.backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, fill: 'forwards' });
    a.finished.then(() => { a.cancel(); cleanup(); }, () => {});
    clock.cue(clock.now, 'zoom-out');
  }
}
