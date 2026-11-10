// tilt.js — springy 3D tilt + light position for one foil surface.
//
// A Tilt owns a target (where the light/pointer is, 0–1 in both axes, plus
// how "engaged" it is) and eases towards it with a critically-damped-ish
// spring. Each frame it writes five CSS custom properties that the foil CSS
// reads: --rx/--ry (rotation), --mx/--my (light position), --hyp (intensity).

const K = 120;   // spring stiffness
const C = 18;    // damping (≈ 0.8 of critical for K=120)

export class Tilt {
  constructor(el, { maxDeg = 14 } = {}) {
    this.el = el;
    this.maxDeg = maxDeg;
    // Spring state: x, y = light position (0..1), a = engagement (0..1).
    this.s = { x: .5, y: .5, a: 0, vx: 0, vy: 0, va: 0 };
    this.target = { x: .5, y: .5, a: 0 };
    this.driver = null;   // optional (t) => target, for scripted motion
    this.dirty = true;
  }

  /** Point the light at (x, y) in 0..1 card coordinates. */
  aim(x, y, a = 1) { this.target = { x, y, a }; }
  rest() { this.target = { x: .5, y: .5, a: 0 }; }

  step(t, dt) {
    if (this.driver) this.target = this.driver(t) ?? this.target;
    const s = this.s, g = this.target;
    for (const k of ['x', 'y', 'a']) {
      const v = 'v' + k;
      s[v] += (K * (g[k] - s[k]) - C * s[v]) * dt;
      s[k] += s[v] * dt;
    }
    const moving = Math.abs(s.vx) + Math.abs(s.vy) + Math.abs(s.va) > 1e-4 ||
      Math.abs(g.x - s.x) + Math.abs(g.y - s.y) + Math.abs(g.a - s.a) > 1e-4;
    if (moving) this.dirty = true;
  }

  render() {
    if (!this.dirty) return;
    this.dirty = false;
    const { x, y, a } = this.s;
    const dx = x - .5, dy = y - .5;
    const st = this.el.style;
    // Tilt towards the light: light on the right → right edge comes forward.
    st.setProperty('--ry', (dx * 2 * this.maxDeg * a).toFixed(2) + 'deg');
    st.setProperty('--rx', (-dy * 2 * this.maxDeg * a).toFixed(2) + 'deg');
    st.setProperty('--mx', (x * 100).toFixed(2) + '%');
    st.setProperty('--my', (y * 100).toFixed(2) + '%');
    st.setProperty('--hyp', (Math.min(1, Math.hypot(dx, dy) * 2.2) * a).toFixed(3));
  }
}

/** Wire pointer input on `hitEl` to a Tilt (mouse hover, pen, or a finger while pressed). */
export function bindPointer(hitEl, tilt, refEl = hitEl) {
  const move = (e) => {
    if (e.pointerType === 'touch' && !e.buttons && e.type !== 'pointerdown') return;
    const r = refEl.getBoundingClientRect();
    tilt.aim(
      Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    );
    tilt.pointer = true;
  };
  const leave = () => { tilt.pointer = false; tilt.rest(); };
  hitEl.addEventListener('pointermove', move);
  hitEl.addEventListener('pointerdown', move);
  hitEl.addEventListener('pointerleave', leave);
  hitEl.addEventListener('pointercancel', leave);
  hitEl.addEventListener('pointerup', (e) => { if (e.pointerType === 'touch') leave(); });
}
