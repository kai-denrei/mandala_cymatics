// The default generator: a thin adapter over the existing mandala renderer.
// Maps universal PatternParams -> the renderer's MandalaParams.

import type { PatternGenerator, PatternParams } from "../types";
import type { MandalaParams } from "../../mandala/render";
import { renderMandala } from "../../mandala/render";
import { makeGrid } from "../../grid";

function clampEven(v: number, lo: number, hi: number): number {
  let x = Math.round(v);
  if (x % 2 !== 0) x += 1;
  return Math.max(lo, Math.min(hi, x));
}

export const tibetanMandala: PatternGenerator = {
  id: "tibetan-mandala",
  label: "Tibetan Mandala",
  symmetric: true,
  render(ctx, size, pal, params: PatternParams): void {
    const m: MandalaParams = {
      order: clampEven(params.order, 4, 32),
      rings: Math.max(1, Math.min(6, Math.round(params.depth))),
      complexity: Math.max(1, Math.min(5, Math.round(params.complexity))),
      authenticity: Math.max(0, Math.min(1, params.jitter)),
      seed: params.seed,
    };
    renderMandala(ctx, makeGrid(size), pal, m);
  },
};
