// kaleido-noise — a seeded summed-sine value field, sampled across one angular
// wedge and then mirrored into n rotational sectors. The folding gives the dense,
// cymatic kaleidoscope look while keeping the field cheap to evaluate.

import type { PatternGenerator, PatternParams } from "../types";
import { makeRng } from "../rng";
import { BG_HEX } from "../../grid";
import { makeWaves, sampleField, totalWeight } from "../field";

export const kaleidoNoise: PatternGenerator = {
  id: "kaleido-noise",
  label: "Kaleidoscope Noise",
  symmetric: true,
  render(ctx: CanvasRenderingContext2D, size: number, pal: string[], params: PatternParams): void {
    // (a) background first — whole canvas painted with BG_HEX.
    ctx.fillStyle = BG_HEX;
    ctx.fillRect(0, 0, size, size);

    const { order, complexity, jitter, seed } = params;
    const cx = size / 2;
    const cy = size / 2;
    const maxR = 0.47 * size;

    // (b) all entropy derives from the seed via makeRng.
    const rng = makeRng(seed);
    const n = Math.max(3, Math.min(12, Math.floor(order)));
    const waves = makeWaves(rng, 3 + complexity, 1, 6);
    const tw = totalWeight(waves);
    const wedge = (Math.PI * 2) / n;
    // Jitter biases the fill threshold DETERMINISTICALLY (no per-pixel rng draw),
    // so every folded sector is identical and the n-fold symmetry holds. Pulling
    // rng() into the loop would desync the sectors and break the symmetry claim.
    const thr = -0.15 + (jitter - 0.5) * 0.3;

    // One angular wedge: sample the normalized field on a polar grid and paint
    // 2x2 dots wherever the field clears the threshold.
    const drawWedge = (): void => {
      for (let r = 0; r <= maxR; r += 1.5) {
        const rn = r / size;
        for (let a = 0; a < wedge; a += 0.004) {
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          const u = rn * ca * 2;
          const v = rn * sa * 2;
          const val = sampleField(waves, u, v) / tw;
          if (val > thr) {
            let idx = Math.floor((val * 0.5 + 0.5) * 5);
            idx = Math.max(0, Math.min(4, idx));
            ctx.fillStyle = pal[idx % 5];
            ctx.fillRect(cx + r * ca - 1, cy + r * sa - 1, 2, 2);
          }
        }
      }
    };

    // (c) coverage: paint the base wedge, then fold it into the remaining sectors
    // by rotating the canvas around the center. Together they tile the full disc.
    drawWedge();
    for (let s = 1; s < n; s++) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((s * Math.PI * 2) / n);
      ctx.translate(-cx, -cy);
      drawWedge();
      ctx.restore();
    }
  },
};
