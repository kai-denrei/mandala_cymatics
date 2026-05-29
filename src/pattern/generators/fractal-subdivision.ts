// Fractal Subdivision — recursive rectangular split (Mondrian / Kandinsky).
// Asymmetric, full-frame dense partitioning of the whole canvas, with optional
// circle accents in cells when complexity is high. All entropy from makeRng(seed).

import type { PatternGenerator, PatternParams } from "../types";
import { makeRng, randRange, randInt } from "../rng";
import { BG_HEX } from "../../grid";

export const fractalSubdivision: PatternGenerator = {
  id: "fractal-subdivision",
  label: "Fractal Subdivision",
  symmetric: false,
  render(ctx: CanvasRenderingContext2D, size: number, pal: string[], params: PatternParams): void {
    // (a) Background first.
    ctx.fillStyle = BG_HEX;
    ctx.fillRect(0, 0, size, size);

    const rng = makeRng(params.seed);
    const { depth, complexity, jitter } = params;
    const minCell = size * 0.06;

    // Recursively split a rect, painting a solid colored leaf when the recursion
    // bottoms out. Every leaf is filled, so coverage is the entire frame.
    const split = (x: number, y: number, w: number, h: number, level: number): void => {
      if (level >= depth + 2 || w < minCell || h < minCell || rng() < 0.15) {
        // Leaf: solid color block (>=2px since minCell >> 2 for any sane size).
        ctx.fillStyle = pal[randInt(rng, 0, 4)];
        ctx.fillRect(x, y, w, h);

        // High-complexity accent: a concentric disc in a fraction of the cells.
        if (complexity >= 4 && rng() < 0.4) {
          ctx.fillStyle = pal[randInt(rng, 0, 4)];
          ctx.beginPath();
          ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.3, 0, Math.PI * 2);
          ctx.fill();
        }
        return;
      }

      // Bias the split axis toward the longer dimension for Mondrian-ish balance,
      // but keep it stochastic so the layout stays asymmetric.
      const vertical = w > h ? rng() > 0.3 : rng() < 0.3;
      // Split ratio in [0.3, 0.7], nudged by jitter.
      const t = randRange(rng, 0.3, 0.7) + jitter * (rng() - 0.5) * 0.2;

      if (vertical) {
        const sw = w * t;
        split(x, y, sw, h, level + 1);
        split(x + sw, y, w - sw, h, level + 1);
      } else {
        const sh = h * t;
        split(x, y, w, sh, level + 1);
        split(x, y + sh, w, h - sh, level + 1);
      }
    };

    split(0, 0, size, size, 0);
  },
};
