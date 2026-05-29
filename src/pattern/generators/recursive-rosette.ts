// Recursive Rosette — Cn nested FILLED petal recursion.
// Each level draws an n-fold ring of solid petals, then recurses on a rotated,
// shrunken copy so the disc fills with dense, layered, symmetric rosettes.

import type { PatternGenerator, PatternParams } from "../types";
import { makeRng, randRange } from "../rng";
import { BG_HEX } from "../../grid";

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export const recursiveRosette: PatternGenerator = {
  id: "recursive-rosette",
  label: "Recursive Rosette",
  symmetric: true,
  render(ctx: CanvasRenderingContext2D, size: number, pal: string[], params: PatternParams): void {
    // (a) background first — entire canvas painted with BG_HEX.
    ctx.fillStyle = BG_HEX;
    ctx.fillRect(0, 0, size, size);

    // (b/c) all entropy from the seeded PRNG.
    const rng = makeRng(params.seed);

    const cx = size / 2;
    const cy = size / 2;
    const n = clamp(Math.floor(params.order), 3, 16);
    const maxDepth = clamp(Math.floor(params.depth), 1, 8);
    const jitter = clamp(params.jitter, 0, 1);
    const minRadius = 0.03 * size;

    ctx.lineJoin = "round";

    function petalLayer(radius: number, level: number, colIdx: number): void {
      if (level > maxDepth || radius < minRadius) return;

      // Petal half-angle: ~0.9 of the wedge, lightly perturbed by jitter.
      const halfAngle = (Math.PI / n) * 0.9 * (1 + jitter * (rng() - 0.5));
      const tip = radius * 1.05;

      ctx.fillStyle = pal[colIdx % 5];
      ctx.strokeStyle = "#1a1438";
      ctx.lineWidth = 1;

      for (let i = 0; i < n; i++) {
        const a = (i / n) * 2 * Math.PI;
        const x0 = cx + Math.cos(a - halfAngle) * radius;
        const y0 = cy + Math.sin(a - halfAngle) * radius;
        const xc = cx + Math.cos(a) * tip;
        const yc = cy + Math.sin(a) * tip;
        const x1 = cx + Math.cos(a + halfAngle) * radius;
        const y1 = cy + Math.sin(a + halfAngle) * radius;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(x0, y0);
        ctx.quadraticCurveTo(xc, yc, x1, y1);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Rotate by half a wedge and recurse on a shrunken copy.
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.PI / n);
      ctx.translate(-cx, -cy);
      petalLayer(radius * randRange(rng, 0.6, 0.72), level + 1, colIdx + 1);
      ctx.restore();
    }

    petalLayer(0.46 * size, 0, 0);
  },
};
