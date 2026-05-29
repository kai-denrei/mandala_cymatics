// Density guard: ensure a rendered pattern gives the particle sampler enough
// colored pixels. If coverage is too low, re-render once with a density boost.

import type { PatternGenerator, PatternParams } from "./types";
import { BG_RGB } from "../grid";

/** Fraction of a 64×64 grid whose pixels differ from the background. */
export function coverage(ctx: CanvasRenderingContext2D, size: number): number {
  const img = ctx.getImageData(0, 0, size, size).data;
  const step = Math.max(1, Math.floor(size / 64));
  let hit = 0;
  let total = 0;
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      const i = (y * size + x) * 4;
      const dr = img[i] - BG_RGB[0];
      const dg = img[i + 1] - BG_RGB[1];
      const db = img[i + 2] - BG_RGB[2];
      if (dr * dr + dg * dg + db * db > 1500) hit++;
      total++;
    }
  }
  return total ? hit / total : 0;
}

/** Render a generator, re-rendering once with more detail if too sparse. */
export function renderWithGuard(
  gen: PatternGenerator,
  ctx: CanvasRenderingContext2D,
  size: number,
  pal: string[],
  params: PatternParams,
): void {
  gen.render(ctx, size, pal, params);
  if (coverage(ctx, size) < 0.35) {
    gen.render(ctx, size, pal, {
      ...params,
      complexity: Math.min(6, params.complexity + 2),
      jitter: Math.max(params.jitter, 0.3),
    });
  }
}
