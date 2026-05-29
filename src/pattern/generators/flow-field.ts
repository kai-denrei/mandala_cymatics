// Flow Field — streamlines advected through the shared summed-sine field.
// Asymmetric, organic ribboning. All randomness derives from makeRng(params.seed).

import type { PatternGenerator, PatternParams } from "../types";
import { makeRng, pick } from "../rng";
import { BG_HEX } from "../../grid";
import { makeWaves, sampleField, totalWeight } from "../field";

export const flowField: PatternGenerator = {
  id: "flow-field",
  label: "Flow Field",
  symmetric: false,
  render(ctx: CanvasRenderingContext2D, size: number, pal: string[], params: PatternParams): void {
    // (1) Background first.
    ctx.fillStyle = BG_HEX;
    ctx.fillRect(0, 0, size, size);

    const rng = makeRng(params.seed);
    const waves = makeWaves(rng, 4, 1, 5);
    const tw = totalWeight(waves);

    const cx = size / 2;
    const cy = size / 2;
    const maxR = 0.47 * size;
    const maxR2 = maxR * maxR;

    const nLines = 300 + params.complexity * 150;
    const stepLen = 2;
    const maxSteps = 200 + params.depth * 100;
    const turn = Math.PI * (1.5 + params.jitter);

    // Local flow angle from the normalized field value at (x, y).
    const angle = (x: number, y: number): number =>
      (sampleField(waves, (x / size) * 2 - 1, (y / size) * 2 - 1) / tw) * turn;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = 0.6;

    for (let i = 0; i < nLines; i++) {
      // Seed inside the disc (uniform by area) so every streamline does work.
      const ang = rng() * Math.PI * 2;
      const rad = Math.sqrt(rng()) * maxR;
      let x = cx + Math.cos(ang) * rad;
      let y = cy + Math.sin(ang) * rad;
      ctx.strokeStyle = pick(rng, pal);
      ctx.lineWidth = 2 + rng() * 2.5; // >=2px so the sampler registers it
      ctx.beginPath();
      ctx.moveTo(x, y);

      for (let s = 0; s < maxSteps; s++) {
        const a = angle(x, y);
        x += Math.cos(a) * stepLen;
        y += Math.sin(a) * stepLen;
        if (x < 0 || x >= size || y >= size || y < 0) break;
        // Keep streamlines inside the disc; clip the tail outside the radius.
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy > maxR2) break;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  },
};
