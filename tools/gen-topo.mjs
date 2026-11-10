// gen-topo.mjs — generates site/assets/topo.svg: topographic contour lines of
// an imaginary lake ("OneLake"), used as a holographic foil mask on the pack
// and the card backs.
//
// How: a smooth height field (a few Gaussian basins + seeded value noise) is
// sampled on a grid, then marching squares extracts iso-lines at evenly spaced
// levels. Segments are chained into polylines and written as compact SVG paths.
//
// Usage: node gen-topo.mjs
import { writeFileSync } from 'node:fs';

const W = 100, H = 141;          // viewBox (≈ pack body / card aspect)
const NX = 90, NY = 127;         // grid resolution
const LEVELS = 22;

// ── Seeded value noise ──────────────────────────────────────────────────
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(2026);
const G = 16, lattice = Array.from({ length: (G + 1) * (G + 1) }, rnd);
const fade = (t) => t * t * (3 - 2 * t);
function vnoise(x, y) {            // x, y in lattice units
  const xi = Math.floor(x), yi = Math.floor(y), xf = fade(x - xi), yf = fade(y - yi);
  const v = (i, j) => lattice[((j % G + G) % G) * (G + 1) + ((i % G + G) % G)];
  const a = v(xi, yi), b = v(xi + 1, yi), c = v(xi, yi + 1), d = v(xi + 1, yi + 1);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

// Basins: (x, y, radius, depth). The deepest one sits upper-right.
const basins = [[70, 38, 30, 1.0], [24, 98, 26, .7], [82, 118, 18, .45], [18, 26, 14, .35]];
function height(x, y) {
  let h = 0;
  for (const [bx, by, r, d] of basins) h -= d * Math.exp(-((x - bx) ** 2 + (y - by) ** 2) / (2 * r * r));
  h += .32 * vnoise(x / 18, y / 18) + .12 * vnoise(x / 7 + 5, y / 7 + 3);
  return h;
}

// ── Sample ──────────────────────────────────────────────────────────────
const f = [];
let lo = Infinity, hi = -Infinity;
for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
  const v = height((i / NX) * W, (j / NY) * H);
  f.push(v); lo = Math.min(lo, v); hi = Math.max(hi, v);
}
const at = (i, j) => f[j * (NX + 1) + i];

// ── Marching squares ────────────────────────────────────────────────────
// Corner bits: tl=8 tr=4 br=2 bl=1. Edges: 0 top, 1 right, 2 bottom, 3 left.
const CASES = {
  1: [[3, 2]], 2: [[2, 1]], 3: [[3, 1]], 4: [[0, 1]], 5: [[3, 0], [2, 1]], 6: [[0, 2]], 7: [[3, 0]],
  8: [[3, 0]], 9: [[0, 2]], 10: [[0, 1], [3, 2]], 11: [[0, 1]], 12: [[3, 1]], 13: [[2, 1]], 14: [[3, 2]],
};
const paths = [];
for (let k = 1; k <= LEVELS; k++) {
  const L = lo + ((hi - lo) * k) / (LEVELS + 1);
  const pts = new Map();   // edge key → [x, y]
  const adj = new Map();   // edge key → [neighbour keys]
  const point = (i, j, e) => {
    // A global key per grid edge, so neighbouring cells share points exactly.
    const key = e === 0 ? `h${i},${j}` : e === 2 ? `h${i},${j + 1}` : e === 3 ? `v${i},${j}` : `v${i + 1},${j}`;
    if (!pts.has(key)) {
      const [i0, j0, i1, j1] = e === 0 ? [i, j, i + 1, j] : e === 2 ? [i, j + 1, i + 1, j + 1] : e === 3 ? [i, j, i, j + 1] : [i + 1, j, i + 1, j + 1];
      const a = at(i0, j0), b = at(i1, j1), t = (L - a) / (b - a);
      pts.set(key, [((i0 + (i1 - i0) * t) / NX) * W, ((j0 + (j1 - j0) * t) / NY) * H]);
    }
    return key;
  };
  const link = (a, b) => { (adj.get(a) ?? adj.set(a, []).get(a)).push(b); (adj.get(b) ?? adj.set(b, []).get(b)).push(a); };
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const c = (at(i, j) > L) * 8 | (at(i + 1, j) > L) * 4 | (at(i + 1, j + 1) > L) * 2 | (at(i, j + 1) > L) * 1;
    for (const [e0, e1] of CASES[c] ?? []) link(point(i, j, e0), point(i, j, e1));
  }
  // Chain segments into polylines.
  const seen = new Set();
  const starts = [...adj.keys()].sort((a, b) => adj.get(a).length - adj.get(b).length); // open ends first
  for (const s of starts) {
    if (seen.has(s)) continue;
    const line = [s]; seen.add(s);
    let cur = s;
    for (;;) {
      const next = adj.get(cur).find((n) => !seen.has(n));
      if (!next) break;
      line.push(next); seen.add(next); cur = next;
    }
    if (line.length < 4) continue;
    const closed = adj.get(cur).includes(s) && line.length > 2;
    const p = line.map((key) => pts.get(key));
    // Light simplification: drop points closer than 1.7 units to the previous kept one.
    const kept = [p[0]];
    for (const q of p.slice(1)) { const l = kept.at(-1); if (Math.hypot(q[0] - l[0], q[1] - l[1]) > 1.7) kept.push(q); }
    // Smooth with quadratic curves through midpoints: each kept point becomes a
    // control point, so curves are smooth without adding any points.
    const r = (v) => Math.round(v * 10) / 10;
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const P = closed ? [...kept, kept[0], kept[1]] : kept;
    let d = closed ? `M${r(mid(P[0], P[1])[0])} ${r(mid(P[0], P[1])[1])}` : `M${r(P[0][0])} ${r(P[0][1])}`;
    for (let n = 1; n < P.length - 1; n++) {
      const m = mid(P[n], P[n + 1]);
      d += `Q${r(P[n][0])} ${r(P[n][1])} ${r(m[0])} ${r(m[1])}`;
    }
    if (!closed) d += `L${r(P.at(-1)[0])} ${r(P.at(-1)[1])}`;
    paths.push(d);
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><path fill="none" stroke="#fff" stroke-width=".32" stroke-linejoin="round" d="${paths.join('')}"/></svg>\n`;
writeFileSync('../site/assets/topo.svg', svg);
console.log(`topo.svg: ${paths.length} lines, ${(svg.length / 1024).toFixed(1)} KB`);
