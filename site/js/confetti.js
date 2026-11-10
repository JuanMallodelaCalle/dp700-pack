// confetti.js — a tiny, deterministic canvas confetti system.
//
// Palette: Fabric Forge teals and greens with a touch of Fabric mint; pale
// lime is used sparingly. Shapes: fluttering strips, small squares and a few
// flame-like drops (our own simple teardrop, a nod to Fabric Forge).
//
// Determinism: a seeded PRNG plus the fixed-step clock means a given burst
// looks identical on every capture run.

const PALETTE = [
  ['#19776E', 18], // deep teal
  ['#51BCAB', 22], // teal
  ['#69D7C6', 22], // aqua
  ['#0F4D44', 12], // dark forest
  ['#74EAC2', 20], // Fabric mint
  ['#A6E89A', 6],  // pale lime (sparingly)
];
const SHAPES = [['strip', 55], ['square', 33], ['drop', 12]];

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rnd, table) => {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of table) if ((r -= w) < 0) return v;
  return table[0][0];
};

export class Confetti {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.parts = [];
    this.wasDrawing = false;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.w = innerWidth; this.h = innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    // Particle size scales gently with the viewport.
    this.unit = Math.min(1.5, Math.max(.75, Math.min(this.w, this.h) / 760));
  }

  /** Fire a burst from (x, y) in CSS pixels, aimed upwards. */
  burst(x, y, { count = 170, seed = 700, spread = 1 } = {}) {
    const rnd = mulberry32(seed);
    const u = this.unit;
    const n = Math.round(count * (this.w < 600 ? .7 : 1));
    for (let i = 0; i < n; i++) {
      const angle = -Math.PI / 2 + (rnd() - .5) * 2.3 * spread;
      const speed = (520 + rnd() * 900) * u;
      const shape = pick(rnd, SHAPES);
      this.parts.push({
        x: x + (rnd() - .5) * 60 * u, y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        rot: rnd() * Math.PI * 2, vr: (rnd() - .5) * 14,
        flip: rnd() * Math.PI * 2, vf: 6 + rnd() * 10,        // 3D flutter phase
        sway: rnd() * Math.PI * 2,
        w: (shape === 'strip' ? 5 : shape === 'drop' ? 8 : 8) * u * (.8 + rnd() * .5),
        h: (shape === 'strip' ? 15 : shape === 'drop' ? 12 : 8) * u * (.8 + rnd() * .5),
        color: pick(rnd, PALETTE),
        shape,
        drag: shape === 'strip' ? 1.6 : 1.1,
      });
    }
  }

  step(t, dt) {
    if (!this.parts.length) return;
    const g = 1500 * this.unit;
    for (const p of this.parts) {
      const k = Math.exp(-p.drag * dt);      // air drag
      p.vx *= k; p.vy = p.vy * k + g * dt;
      // Terminal velocity, so light pieces float down instead of dropping.
      const vmax = (p.shape === 'strip' ? 260 : 380) * this.unit;
      if (p.vy > vmax) p.vy += (vmax - p.vy) * Math.min(1, 6 * dt);
      p.sway += dt * 3;
      p.x += (p.vx + Math.sin(p.sway) * 40 * this.unit) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.flip += p.vf * dt;
    }
    this.parts = this.parts.filter((p) => p.y < this.h + 60);
  }

  render() {
    const { ctx, dpr } = this;
    if (!this.parts.length && !this.wasDrawing) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.wasDrawing = this.parts.length > 0;
    for (const p of this.parts) {
      ctx.setTransform(dpr, 0, 0, dpr, p.x * dpr, p.y * dpr);
      ctx.rotate(p.rot);
      ctx.scale(1, Math.cos(p.flip));          // flutter: the piece turns in 3D
      ctx.fillStyle = p.color;
      if (p.shape === 'drop') {
        // Our own flame-like teardrop: pointed tip up, round belly down.
        const w = p.w / 2, h = p.h / 2;
        ctx.beginPath();
        ctx.moveTo(0, -h);
        ctx.bezierCurveTo(w * .9, -h * .2, w, h * .55, 0, h);
        ctx.bezierCurveTo(-w, h * .55, -w * .9, -h * .2, 0, -h);
        ctx.fill();
      } else {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
    }
  }
}
