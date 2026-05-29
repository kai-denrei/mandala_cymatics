// Static mandala renderer. Ported from prototypes/mandala-generator.html.
// Draws the five-layer ring stack (outside-in) on the thigtse grid.
// Takes a 2D context, a Grid, a resolved 5-colour palette, and MandalaParams.

import type { Grid } from "../types";
import { BG_HEX } from "../grid";

/** Parameters the mandala renderer reads (hue/palette are baked into `pal`). */
export interface MandalaParams {
  order: number; // rotational order n (even, 4..32)
  rings: number; // ring depth 1..6
  complexity: number; // sub-motif detail 1..5
  authenticity: number; // 0..1 perturbation blend
  seed: number; // perturbation seed
}

function rng(s: number): number {
  const x = Math.sin(s) * 10000;
  return x - Math.floor(x);
}

type Ctx = CanvasRenderingContext2D;

function drawBg(c: Ctx, g: Grid): void {
  c.fillStyle = BG_HEX;
  c.fillRect(0, 0, g.W, g.W);
  c.beginPath();
  c.arc(g.cx, g.cy, 12.3 * g.w, 0, Math.PI * 2);
  c.fillStyle = "#1a1438";
  c.fill();
}

function drawFire(c: Ctx, g: Grid, pal: string[], auth: number, seed: number): void {
  const { cx, cy, w } = g;
  const r0 = 11.0 * w;
  const r1 = 12.2 * w;
  const n = 48;
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

function drawVajra(c: Ctx, g: Grid, pal: string[]): void {
  const { cx, cy, w } = g;
  const r0 = 9.5 * w;
  const r1 = 10.95 * w;
  const n = 72;
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
  for (let i = 0; i < np; i++) {
    const a = (i / np) * Math.PI * 2;
    c.save();
    c.translate(cx, cy);
    c.rotate(a);
    const bx = r0 * Math.cos(ha);
    const by = r0 * Math.sin(ha);
    c.beginPath();
    c.moveTo(bx, -by);
    c.bezierCurveTo(r0 + (r1 - r0) * 0.35, -by * 1.35, r1 - (r1 - r0) * 0.12, -by * 0.35, r1, 0);
    c.bezierCurveTo(r1 - (r1 - r0) * 0.12, by * 0.35, r0 + (r1 - r0) * 0.35, by * 1.35, bx, by);
    c.closePath();
    c.fillStyle = pal[i % 5];
    c.fill();
    c.strokeStyle = "#1a1438";
    c.lineWidth = 1.2;
    c.stroke();
    if (cplx >= 3) {
      const ir0 = r0 + (r1 - r0) * 0.25;
      const ir1 = r1 - (r1 - r0) * 0.18;
      const ihb = by * 0.55;
      c.beginPath();
      c.moveTo(ir0, -ihb);
      c.bezierCurveTo(ir0 + (ir1 - ir0) * 0.4, -ihb * 1.2, ir1 - (ir1 - ir0) * 0.15, -ihb * 0.3, ir1, 0);
      c.bezierCurveTo(ir1 - (ir1 - ir0) * 0.15, ihb * 0.3, ir0 + (ir1 - ir0) * 0.4, ihb * 1.2, ir0, ihb);
      c.closePath();
      c.strokeStyle = pal[(i + 2) % 5];
      c.lineWidth = 1;
      c.stroke();
    }
    if (cplx >= 4) {
      c.beginPath();
      c.arc(r0 + (r1 - r0) * 0.62, 0, (r1 - r0) * 0.08, 0, Math.PI * 2);
      c.fillStyle = pal[(i + 3) % 5];
      c.fill();
    }
    c.restore();
  }
  c.beginPath();
  c.arc(cx, cy, r0, 0, Math.PI * 2);
  c.strokeStyle = "#000";
  c.lineWidth = 1.5;
  c.stroke();
}

function drawPalace(c: Ctx, g: Grid, pal: string[]): void {
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
  for (let i = 0; i < 3; i++) {
    const r = (6.3 - i * 0.5) * w;
    c.strokeStyle = i === 0 ? pal[1] : pal[0];
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

function drawInnerLotus(c: Ctx, g: Grid, pal: string[], order: number): void {
  const { cx, cy, w } = g;
  const np = Math.max(8, Math.floor(order / 2));
  const r0 = 1.8 * w;
  const r1 = 4.5 * w;
  const ha = (Math.PI / np) * 0.88;
  for (let i = 0; i < np; i++) {
    const a = (i / np) * Math.PI * 2 + Math.PI / np;
    c.save();
    c.translate(cx, cy);
    c.rotate(a);
    const bx = r0 * Math.cos(ha);
    const by = r0 * Math.sin(ha);
    c.beginPath();
    c.moveTo(bx, -by);
    c.bezierCurveTo(r0 + (r1 - r0) * 0.4, -by * 1.4, r1 - (r1 - r0) * 0.1, -by * 0.3, r1, 0);
    c.bezierCurveTo(r1 - (r1 - r0) * 0.1, by * 0.3, r0 + (r1 - r0) * 0.4, by * 1.4, bx, by);
    c.closePath();
    c.fillStyle = pal[i % 5];
    c.globalAlpha = 0.92;
    c.fill();
    c.globalAlpha = 1;
    c.strokeStyle = BG_HEX;
    c.lineWidth = 1;
    c.stroke();
    c.restore();
  }
}

function drawBindu(c: Ctx, g: Grid, pal: string[]): void {
  const { cx, cy, w } = g;
  c.beginPath();
  c.arc(cx, cy, 1.5 * w, 0, Math.PI * 2);
  c.fillStyle = pal[4];
  c.fill();
  c.strokeStyle = pal[1];
  c.lineWidth = 1.5;
  c.stroke();
  c.beginPath();
  c.arc(cx, cy, 0.65 * w, 0, Math.PI * 2);
  c.fillStyle = pal[0];
  c.fill();
  c.beginPath();
  c.arc(cx, cy, 0.25 * w, 0, Math.PI * 2);
  c.fillStyle = pal[2];
  c.fill();
}

/**
 * Render the full mandala into `c`. `pal` is the 5-colour resolved palette.
 * `rings` (1..6) gates how many layers are drawn, outside-in.
 */
export function renderMandala(c: Ctx, g: Grid, pal: string[], params: MandalaParams): void {
  const { rings, order, complexity, authenticity, seed } = params;
  drawBg(c, g);
  if (rings >= 1) drawFire(c, g, pal, authenticity, seed);
  if (rings >= 2) drawVajra(c, g, pal);
  if (rings >= 3) drawLotusRing(c, g, pal, order, complexity);
  if (rings >= 4) drawPalace(c, g, pal);
  if (rings >= 5) drawInnerLotus(c, g, pal, order);
  if (rings >= 6) drawBindu(c, g, pal);
}
