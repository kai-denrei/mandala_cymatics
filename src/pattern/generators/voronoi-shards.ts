// Voronoi Shards — asymmetric jagged cells flooded with palette colors.
// A scatter of random sites partitions the canvas; each step-cell takes the
// color of its nearest site, giving near-100% dense, crystalline coverage.

import type { PatternGenerator, PatternParams } from "../types";
import { makeRng, randInt, randRange } from "../rng";
import { BG_HEX } from "../../grid";

interface Site {
  x: number;
  y: number;
  col: string;
}

export const voronoiShards: PatternGenerator = {
  id: "voronoi-shards",
  label: "Voronoi Shards",
  symmetric: false,
  render(ctx: CanvasRenderingContext2D, size: number, pal: string[], params: PatternParams): void {
    // 1) Background first — entire canvas painted with BG_HEX.
    ctx.fillStyle = BG_HEX;
    ctx.fillRect(0, 0, size, size);

    // 3) All entropy from the seeded PRNG.
    const rng = makeRng(params.seed);

    const cx = size / 2;
    const cy = size / 2;
    const maxR = 0.47 * size; // 4) keep content within the disc

    // Scatter Voronoi sites. complexity drives density; jitter nudges them.
    const nSites = 12 + params.complexity * 8;
    const jit = params.jitter * size * 0.18;
    const sites: Site[] = [];
    for (let k = 0; k < nSites; k++) {
      // Bias placement toward the disc so the central region stays full.
      const ang = randRange(rng, 0, Math.PI * 2);
      const rad = Math.sqrt(rng()) * maxR;
      let sx = cx + Math.cos(ang) * rad;
      let sy = cy + Math.sin(ang) * rad;
      sx += randRange(rng, -jit, jit);
      sy += randRange(rng, -jit, jit);
      sites.push({ x: sx, y: sy, col: pal[randInt(rng, 0, 4)] });
    }

    // A handful of accent "seam" sites pinned to the palette extremes give
    // crisp light/deep shards without breaking the asymmetry.
    const seamCol = pal[0];
    const coreCol = pal[4];

    // 2) Flood: every step×step cell adopts its nearest site's color.
    const step = 3;
    const r2 = maxR * maxR;
    for (let py = 0; py < size; py += step) {
      const sampleY = py + step * 0.5;
      const dy0 = sampleY - cy;
      for (let px = 0; px < size; px += step) {
        const sampleX = px + step * 0.5;
        const dx0 = sampleX - cx;

        // Restrict the painted region to the disc for a clean mandala frame.
        if (dx0 * dx0 + dy0 * dy0 > r2) continue;

        let best = Infinity;
        let secondBest = Infinity;
        let col = sites[0].col;
        for (let s = 0; s < sites.length; s++) {
          const dx = sampleX - sites[s].x;
          const dy = sampleY - sites[s].y;
          const d2 = dx * dx + dy * dy;
          if (d2 < best) {
            secondBest = best;
            best = d2;
            col = sites[s].col;
          } else if (d2 < secondBest) {
            secondBest = d2;
          }
        }

        // Edge detection: where two sites compete, the cell border lands.
        // Draw thin seams in the palette extremes for shard definition.
        const edge = Math.sqrt(secondBest) - Math.sqrt(best);
        if (edge < step * 0.9) {
          ctx.fillStyle = edge < step * 0.45 ? coreCol : seamCol;
        } else {
          ctx.fillStyle = col;
        }
        ctx.fillRect(px, py, step, step);
      }
    }
  },
};
