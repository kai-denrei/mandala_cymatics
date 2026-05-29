// Spirograph — layered hypotrochoid rosettes. Each layer traces a classic
// (R, r, d) hypotrochoid; stacking several with rotational coprime ratios
// produces dense, symmetric petal/rosette interference across the disc.

import type { PatternGenerator, PatternParams } from "../types";
import { makeRng, randRange, randInt } from "../rng";
import { BG_HEX } from "../../grid";

export const spirograph: PatternGenerator = {
  id: "spirograph",
  label: "Spirograph",
  symmetric: true,
  render(ctx: CanvasRenderingContext2D, size: number, pal: string[], params: PatternParams): void {
    // (a) background first — entire canvas painted with BG_HEX.
    ctx.fillStyle = BG_HEX;
    ctx.fillRect(0, 0, size, size);

    const rng = makeRng(params.seed); // (b) sole entropy source
    const cx = size / 2;
    const cy = size / 2;

    const order = Math.max(3, Math.min(12, params.order));
    const complexity = params.complexity;
    const jitter = params.jitter;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let L = 0; L < order; L++) {
      const R = (0.3 + 0.1 * (L / order)) * size; // outer radius grows per layer
      const k = randInt(rng, 2, 9); // teeth ratio (R/r)
      const r = R / k; // rolling-circle radius
      const d = r * randRange(rng, 0.6, 1.4); // pen offset
      const ratio = (R - r) / r;

      ctx.strokeStyle = pal[L % 5];
      ctx.lineWidth = Math.max(3, 1 + complexity * 0.6);
      ctx.globalAlpha = 0.85;

      const steps = 2000 + complexity * 1500;
      ctx.beginPath();
      for (let t = 0; t <= steps; t++) {
        const th = (t / steps) * 2 * Math.PI * k; // full closed curve over k revolutions
        let x = (R - r) * Math.cos(th) + d * Math.cos(ratio * th);
        let y = (R - r) * Math.sin(th) - d * Math.sin(ratio * th);
        x += jitter * r * 0.1 * (rng() - 0.5);
        y += jitter * r * 0.1 * (rng() - 0.5);
        if (t === 0) ctx.moveTo(cx + x, cy + y);
        else ctx.lineTo(cx + x, cy + y);
      }
      ctx.stroke();
    }

    ctx.globalAlpha = 1;

    // (c) inner filled disc — solid coverage at the hub.
    ctx.fillStyle = pal[4];
    ctx.beginPath();
    ctx.arc(cx, cy, 0.08 * size, 0, 2 * Math.PI);
    ctx.fill();
  },
};
