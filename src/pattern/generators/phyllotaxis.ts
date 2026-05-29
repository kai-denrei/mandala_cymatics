// Phyllotaxis — Vogel golden-angle seed head. A dense, solid disc of dots laid
// out on the sunflower spiral, radially graded through the palette ramp.

import type { PatternGenerator, PatternParams } from "../types";
import { makeRng } from "../rng";
import { BG_HEX } from "../../grid";

export const phyllotaxis: PatternGenerator = {
  id: "phyllotaxis",
  label: "Phyllotaxis",
  symmetric: true,
  render(ctx: CanvasRenderingContext2D, size: number, pal: string[], params: PatternParams): void {
    // (a) Background first — fill the whole canvas.
    ctx.fillStyle = BG_HEX;
    ctx.fillRect(0, 0, size, size);

    // (b) Entropy: every random value comes from this seeded PRNG.
    const rng = makeRng(params.seed);

    const cx = size / 2;
    const cy = size / 2;
    const rMax = 0.46 * size;

    const N = 1500 + params.complexity * 1200;
    const GA = Math.PI * (3 - Math.sqrt(5)); // golden angle ~2.39996 rad
    const c = (0.45 * size) / Math.sqrt(N); // packing constant

    for (let i = 0; i < N; i++) {
      const r = c * Math.sqrt(i);
      if (r > rMax) break; // outer points spill past the disc — stop early

      const th = i * GA + params.jitter * (rng() - 0.5) * 0.3;
      const x = cx + r * Math.cos(th);
      const y = cy + r * Math.sin(th);

      const t = r / rMax; // 0 at center, ~1 at rim
      const col = pal[Math.floor(t * 5) % 5];

      // Dots fatten toward the center (and with depth) to keep the core solid.
      const dotR = 2 + (1 - t) * (1 + params.depth * 0.6);

      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, y, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
  },
};
