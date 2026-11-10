// strip.js — builds the tear strip as a flexible chain of segments.
//
// A single rigid strip looks like a plank. Real foil curls as it peels, so
// the strip is N slices nested right-to-left: each slice is a child of the
// one on its right and pivots on their shared edge. As the tear point
// (--tear, 0 → 1) passes a joint, that joint bends a few degrees; the bends
// add up along the chain, so the free end curls more than the root.
// All of it is CSS driven by --tear — no per-frame JS.

export const SEGMENTS = 10;

export function buildStrip(strip) {
  strip.style.setProperty('--n', SEGMENTS);
  let parent = strip;
  // Root = rightmost slice (still attached the longest); children go left.
  for (let i = SEGMENTS - 1; i >= 0; i--) {
    const seg = document.createElement('div');
    seg.className = 'seg' + (i === SEGMENTS - 1 ? ' seg--root' : '');
    seg.style.setProperty('--i', i);
    seg.innerHTML = '<div class="seg__skin pack__crimp"></div>' +
      (i === 0 ? '<div class="pack__notch"></div>' : '');
    parent.appendChild(seg);
    parent = seg;
  }
}
