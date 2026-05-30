// Static mandala renderer. Ported from prototypes/mandala-generator.html.
// Draws the five-layer ring stack (outside-in) on the thigtse grid.
// Takes a 2D context, a Grid, a resolved 5-colour palette, and MandalaParams.
//
// COMPLEXITY drives self-similar sub-motif depth: the lotus rings grow
// petals-within-petals, the fire/vajra/palace gain finer subdivisions — so the
// figure becomes genuinely more intricate (fractal-ish) as it rises, while the
// canonical Tibetan structure is preserved. DEPTH 1-6 gates the six canonical
// layers; 7-10 overlay extra concentric pearl borders on the ring boundaries.

import type { Grid } from "../types";
import { BG_HEX } from "../grid";

/** Parameters the mandala renderer reads (hue/palette are baked into `pal`). */
export interface MandalaParams {
  order: number; // rotational order n (even, 4..32)
  rings: number; // ring depth 1..10 (1-6 canonical layers, 7-10 add bands)
  complexity: number; // sub-motif recursion detail 1..6
  authenticity: number; // 0..1 perturbation blend
  seed: number; // perturbation seed
}

function rng(s: number): number {
  const x = Math.sin(s) * 10000;
  return x - Math.floor(x);
}

type Ctx = CanvasRenderingContext2D;

// ---- Recursive lotus petal ----------------------------------------------
// One "leaf" bezier petal between radii r0..r1 with half-angle ha (centred on
// the local +x axis after rotate). Trace only — caller fills/strokes.
function petalPath(c: Ctx, r0: number, r1: number, ha: number): void {
  const bx = r0 * Math.cos(ha);
  const by = r0 * Math.sin(ha);
  c.beginPath();
  c.moveTo(bx, -by);
  c.bezierCurveTo(r0 + (r1 - r0) * 0.35, -by * 1.35, r1 - (r1 - r0) * 0.12, -by * 0.35, r1, 0);
  c.bezierCurveTo(r1 - (r1 - r0) * 0.12, by * 0.35, r0 + (r1 - r0) * 0.35, by * 1.35, bx, by);
  c.closePath();
}

// Filled outer petal + `levels` self-similar petals engraved inside it. Each
// nested petal sits a little further toward the tip and narrower → petals-in-
// petals. This is the main source of fractal richness as complexity rises.
function nestedPetal(
  c: Ctx,
  r0: number,
  r1: number,
  ha: number,
  pal: string[],
  idx: number,
  levels: number,
): void {
  petalPath(c, r0, r1, ha);
  c.fillStyle = pal[idx % 5];
  c.fill();
  c.strokeStyle = "#1a1438";
  c.lineWidth = 1.2;
  c.stroke();
  let nr0 = r0;
  let nr1 = r1;
  let nha = ha;
  for (let L = 1; L <= levels; L++) {
    nr0 = nr0 + (nr1 - nr0) * 0.3;
    nr1 = nr1 - (nr1 - nr0) * 0.14;
    nha = nha * 0.66;
    petalPath(c, nr0, nr1, nha);
    c.strokeStyle = pal[(idx + 1 + L) % 5];
    c.lineWidth = Math.max(0.5, 1.2 - L * 0.22);
    c.stroke();
  }
}

// A ring of small pearls on a boundary circle (depth 7-10 ornament).
function drawPearlRing(
  c: Ctx,
  g: Grid,
  pal: string[],
  radius: number,
  count: number,
  dotR: number,
  colIdx: number,
): void {
  const { cx, cy } = g;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    c.beginPath();
    c.arc(cx + radius * Math.cos(a), cy + radius * Math.sin(a), dotR, 0, Math.PI * 2);
    c.fillStyle = pal[(i + colIdx) % 5];
    c.fill();
    c.strokeStyle = "#1a1438";
    c.lineWidth = 0.6;
    c.stroke();
  }
}

function drawBg(c: Ctx, g: Grid): void {
  c.fillStyle = BG_HEX;
  c.fillRect(0, 0, g.W, g.W);
  c.beginPath();
  c.arc(g.cx, g.cy, 12.3 * g.w, 0, Math.PI * 2);
  c.fillStyle = "#1a1438";
  c.fill();
}

function drawFire(c: Ctx, g: Grid, pal: string[], auth: number, seed: number, cplx: number): void {
  const { cx, cy, w } = g;
  const r0 = 11.0 * w;
  const r1 = 12.2 * w;
  const n = 30 + cplx * 6; // complexity → finer flame fringe (default cplx3 = 48, the original)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const a2 = ((i + 1) / n) * Math.PI * 2;
    const mid = (a + a2) / 2;
    const dev = auth * 0.2 * (rng(seed + i) - 0.5);
    c.beginPath();
    c.moveTo(cx + r0 * Math.cos(a), cy + r0 * Math.sin(a));
    c.bezierCurveTo(
      cx + ((r0 + r1) / 2) * Math.cos(mid - (a2 - a) * 0.4 + dev),
      cy + ((r0 + r1) / 2) * Math.sin(mid - (a2 - a) * 0.4 + dev),
      cx + r1 * 0.92 * Math.cos(mid - (a2 - a) * 0.15),
      cy + r1 * 0.92 * Math.sin(mid - (a2 - a) * 0.15),
      cx + r1 * Math.cos(mid),
      cy + r1 * Math.sin(mid),
    );
    c.bezierCurveTo(
      cx + r1 * 0.92 * Math.cos(mid + (a2 - a) * 0.15),
      cy + r1 * 0.92 * Math.sin(mid + (a2 - a) * 0.15),
      cx + ((r0 + r1) / 2) * Math.cos(mid + (a2 - a) * 0.4 - dev),
      cy + ((r0 + r1) / 2) * Math.sin(mid + (a2 - a) * 0.4 - dev),
      cx + r0 * Math.cos(a2),
      cy + r0 * Math.sin(a2),
    );
    c.closePath();
    c.fillStyle = pal[i % 5];
    c.fill();
  }
  c.beginPath();
  c.arc(cx, cy, r0, 0, Math.PI * 2);
  c.strokeStyle = "#000";
  c.lineWidth = 1.5;
  c.stroke();
}

function drawVajra(c: Ctx, g: Grid, pal: string[], cplx: number): void {
  const { cx, cy, w } = g;
  const r0 = 9.5 * w;
  const r1 = 10.95 * w;
  const n = 60 + cplx * 4; // complexity → finer chevron teeth (default cplx3 = 72, the original)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const a2 = ((i + 1) / n) * Math.PI * 2;
    const mid = (a + a2) / 2;
    const isUp = i % 2 === 0;
    c.beginPath();
    c.moveTo(cx + r0 * Math.cos(a), cy + r0 * Math.sin(a));
    c.lineTo(cx + (isUp ? r1 : r0) * Math.cos(mid), cy + (isUp ? r1 : r0) * Math.sin(mid));
    c.lineTo(cx + r0 * Math.cos(a2), cy + r0 * Math.sin(a2));
    c.closePath();
    c.fillStyle = isUp ? pal[0] : "#3a2c5c";
    c.fill();
    c.strokeStyle = BG_HEX;
    c.lineWidth = 0.5;
    c.stroke();
  }
  c.beginPath();
  c.arc(cx, cy, r0, 0, Math.PI * 2);
  c.strokeStyle = pal[1];
  c.lineWidth = 1.5;
  c.stroke();
}

function drawLotusRing(c: Ctx, g: Grid, pal: string[], order: number, cplx: number): void {
  const { cx, cy, w } = g;
  const np = order;
  const r0 = 7.3 * w;
  const r1 = 9.4 * w;
  const ha = (Math.PI / np) * 0.92;
  const levels = Math.max(0, cplx - 2); // cplx 3→1 nested, 6→4 nested
  for (let i = 0; i < np; i++) {
    const a = (i / np) * Math.PI * 2;
    c.save();
    c.translate(cx, cy);
    c.rotate(a);
    nestedPetal(c, r0, r1, ha, pal, i, levels);
    c.restore();
  }
  c.beginPath();
  c.arc(cx, cy, r0, 0, Math.PI * 2);
  c.strokeStyle = "#000";
  c.lineWidth = 1.5;
  c.stroke();
}

function drawPalace(c: Ctx, g: Grid, pal: string[], cplx: number): void {
  const { cx, cy, w } = g;
  const half = 6.5 * w;
  const gw = 2.0 * w;
  const gd = 0.9 * w;
  const gr = 0.45 * w;
  const grw = 2.8 * w;
  c.fillStyle = pal[2];
  const arms: [number, number][] = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];
  arms.forEach(([dx, dy]) => {
    c.save();
    c.translate(cx, cy);
    c.rotate(Math.atan2(dy, dx) + Math.PI / 2);
    c.fillRect(-half, -half, (2 * half - gw) / 2, 0.55 * w);
    c.fillRect(gw / 2, -half, (2 * half - gw) / 2, 0.55 * w);
    c.fillRect(-gw / 2, -half - gd, gw, gd);
    c.fillRect(-grw / 2, -half - gd - gr, grw, gr);
    c.restore();
  });
  // Concentric palace walls — complexity nests more of them inward (default cplx3 = 3).
  const nSq = 3 + Math.max(0, cplx - 3);
  for (let i = 0; i < nSq; i++) {
    const r = (6.3 - i * 0.5) * w;
    c.strokeStyle = i === 0 ? pal[1] : pal[i % 2 === 0 ? 0 : 4];
    c.lineWidth = i === 0 ? 2 : 0.8;
    c.strokeRect(cx - r, cy - r, 2 * r, 2 * r);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    c.beginPath();
    c.moveTo(cx + 5.5 * w * Math.cos(a), cy + 5.5 * w * Math.sin(a));
    c.lineTo(cx + 6.3 * w * Math.cos(a), cy + 6.3 * w * Math.sin(a));
    c.strokeStyle = pal[1];
    c.lineWidth = 1.5;
    c.stroke();
  }
}

function drawInnerLotus(c: Ctx, g: Grid, pal: string[], order: number, cplx: number): void {
  const { cx, cy, w } = g;
  const np = Math.max(8, Math.floor(order / 2));
  const r0 = 1.8 * w;
  const r1 = 4.5 * w;
  const ha = (Math.PI / np) * 0.88;
  const levels = Math.max(0, Math.min(2, cplx - 3)); // gentler nesting (petals are small)
  for (let i = 0; i < np; i++) {
    const a = (i / np) * Math.PI * 2 + Math.PI / np;
    c.save();
    c.translate(cx, cy);
    c.rotate(a);
    c.globalAlpha = 0.92;
    nestedPetal(c, r0, r1, ha, pal, i, levels);
    c.globalAlpha = 1;
    c.restore();
  }
}

function drawBindu(c: Ctx, g: Grid, pal: string[], cplx: number): void {
  const { cx, cy, w } = g;
  // Complexity adds more concentric rings to the seed-syllable centre.
  const radii = [1.5, 0.65, 0.25];
  if (cplx >= 4) radii.splice(1, 0, 1.05);
  if (cplx >= 6) radii.splice(3, 0, 0.45);
  c.beginPath();
  c.arc(cx, cy, radii[0] * w, 0, Math.PI * 2);
  c.fillStyle = pal[4];
  c.fill();
  c.strokeStyle = pal[1];
  c.lineWidth = 1.5;
  c.stroke();
  for (let i = 1; i < radii.length; i++) {
    c.beginPath();
    c.arc(cx, cy, radii[i] * w, 0, Math.PI * 2);
    c.fillStyle = pal[(i + 1) % 5];
    c.fill();
  }
}

/**
 * Render the full mandala into `c`. `pal` is the 5-colour resolved palette.
 * `rings` (1..10) gates the six canonical layers (1-6) plus concentric pearl
 * borders (7-10). `complexity` (1..6) drives recursive sub-motif depth.
 */
export function renderMandala(c: Ctx, g: Grid, pal: string[], params: MandalaParams): void {
  const { rings, order, complexity, authenticity, seed } = params;
  const w = g.w;
  drawBg(c, g);
  if (rings >= 1) drawFire(c, g, pal, authenticity, seed, complexity);
  if (rings >= 2) drawVajra(c, g, pal, complexity);
  if (rings >= 3) drawLotusRing(c, g, pal, order, complexity);
  if (rings >= 4) drawPalace(c, g, pal, complexity);
  if (rings >= 5) drawInnerLotus(c, g, pal, order, complexity);
  if (rings >= 6) drawBindu(c, g, pal, complexity);
  // Depth 7-10: extra concentric pearl borders overlaid on ring boundaries.
  if (rings >= 7) drawPearlRing(c, g, pal, 7.3 * w, order, 0.16 * w, 0); // lotus base
  if (rings >= 8) drawPearlRing(c, g, pal, 9.5 * w, order, 0.14 * w, 2); // vajra base
  if (rings >= 9) drawPearlRing(c, g, pal, 4.5 * w, Math.max(8, Math.floor(order / 2)), 0.15 * w, 1); // inner-lotus base
  if (rings >= 10) drawPearlRing(c, g, pal, 11.0 * w, Math.max(12, order), 0.13 * w, 3); // fire base
}
