// Interference — moiré of off-center radial wave sources. Asymmetric, cymatic,
// dense concentric bands. All randomness derives from makeRng(params.seed).

import type { PatternGenerator, PatternParams } from "../types";
import { makeRng, randRange } from "../rng";
import { BG_HEX } from "../../grid";

interface Source {
  x: number;
  y: number;
  freq: number;
}

export const interference: PatternGenerator = {
  id: "interference",
  label: "Interference",
  symmetric: false,
  render(ctx: CanvasRenderingContext2D, size: number, pal: string[], params: PatternParams): void {
    // (1) Background first.
    ctx.fillStyle = BG_HEX;
    ctx.fillRect(0, 0, size, size);

    const rng = makeRng(params.seed);

    const cx = size / 2;
    const cy = size / 2;
    const maxR = 0.47 * size;
    const maxR2 = maxR * maxR;

    // Off-center radial wave sources — asymmetric moiré.
    const nSources = 2 + (params.order % 4); // 2..5
    const srcs: Source[] = [];
    for (let k = 0; k < nSources; k++) {
      srcs.push({
        x: randRange(rng, 0.2, 0.8) * size,
        y: randRange(rng, 0.2, 0.8) * size,
        freq: randRange(rng, 0.04, 0.12),
      });
    }

    const step = 3; // >=2-3px cells so the sampler registers them
    const jitter = params.jitter;

    for (let py = 0; py < size; py += step) {
      for (let px = 0; px < size; px += step) {
        // Stay inside the disc.
        const cellDx = px + step / 2 - cx;
        const cellDy = py + step / 2 - cy;
        if (cellDx * cellDx + cellDy * cellDy > maxR2) continue;

        // Summed radial sines from each source -> interference value.
        let v = 0;
        for (let k = 0; k < nSources; k++) {
          const s = srcs[k];
          const d = Math.hypot(px - s.x, py - s.y);
          v += Math.sin(d * s.freq + jitter * rng());
        }

        // Normalize to [0,1] band, map to palette ramp.
        const band = (v / nSources) * 0.5 + 0.5;
        let idx = Math.floor(band * 5);
        idx = Math.max(0, Math.min(4, idx));

        if (band > 0.12) {
          ctx.fillStyle = pal[idx % 5];
          ctx.fillRect(px, py, step, step);
        }
      }
    }
  },
};
