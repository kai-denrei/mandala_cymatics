// Sacred Geometry — Flower-of-Life overlapping-circle hex grid with optional
// Metatron's-cube connecting lines. Symmetric by construction (hex lattice).

import type { PatternGenerator, PatternParams } from "../types";
import { makeRng } from "../rng";
import { BG_HEX } from "../../grid";

interface Pt {
  x: number;
  y: number;
}

const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

export const sacredGeometry: PatternGenerator = {
  id: "sacred-geometry",
  label: "Sacred Geometry",
  symmetric: true,
  render(ctx: CanvasRenderingContext2D, size: number, pal: string[], params: PatternParams): void {
    // (1) Background first.
    ctx.fillStyle = BG_HEX;
    ctx.fillRect(0, 0, size, size);

    const rng = makeRng(params.seed);
    const cx = size / 2;
    const cy = size / 2;
    const R = 0.085 * size;
    const rings = clamp(Math.round(params.depth), 1, 5);
    const jitter = clamp(params.jitter, 0, 1);

    // Hex axial -> pixel basis vectors at spacing R (pointy-top lattice).
    const ax = { x: R * Math.cos(0), y: R * Math.sin(0) }; // east
    const ay = { x: R * Math.cos(Math.PI / 3), y: R * Math.sin(Math.PI / 3) }; // 60deg

    const axial = (q: number, r: number): Pt => {
      const jx = jitter ? (rng() - 0.5) * R * 0.25 * jitter : 0;
      const jy = jitter ? (rng() - 0.5) * R * 0.25 * jitter : 0;
      return { x: cx + q * ax.x + r * ay.x + jx, y: cy + q * ax.y + r * ay.y + jy };
    };

    // Build hex-lattice centres: ring 0 = centre, then each ring's perimeter.
    const centres: Pt[] = [axial(0, 0)];
    // Cube/axial ring walking: 6 directions.
    const dirs: Array<[number, number]> = [
      [1, 0],
      [0, 1],
      [-1, 1],
      [-1, 0],
      [0, -1],
      [1, -1],
    ];
    const maxRad = 0.47 * size;
    for (let ring = 1; ring <= rings; ring++) {
      // Start at the corner `ring` steps in direction [−1,1]'s start (axial start).
      let q = -ring;
      let r = ring;
      for (let d = 0; d < 6; d++) {
        for (let step = 0; step < ring; step++) {
          const p = axial(q, r);
          if (Math.hypot(p.x - cx, p.y - cy) <= maxRad - R) centres.push(p);
          q += dirs[d][0];
          r += dirs[d][1];
        }
      }
    }

    const lineWidth = Math.max(2, 1.5 + params.complexity * 0.3);

    // Translucent fill of every circle: overlapping discs across the hex lattice
    // give a dense flower-of-life body (the sampler needs real coverage, not just
    // thin strokes), while staying symmetric by construction.
    ctx.save();
    ctx.globalAlpha = 0.38;
    for (let i = 0; i < centres.length; i++) {
      ctx.fillStyle = pal[i % 5];
      ctx.beginPath();
      ctx.arc(centres[i].x, centres[i].y, R, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Draw all circles.
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = "round";
    for (let i = 0; i < centres.length; i++) {
      ctx.strokeStyle = pal[i % 5];
      ctx.beginPath();
      ctx.arc(centres[i].x, centres[i].y, R, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Metatron lines: connect all pairs among the 12 outermost centres.
    if (params.complexity >= 4 && centres.length > 1) {
      const sorted = centres
        .map((p) => ({ p, d: Math.hypot(p.x - cx, p.y - cy) }))
        .sort((a, b) => b.d - a.d)
        .slice(0, 12)
        .map((e) => e.p);
      ctx.save();
      ctx.strokeStyle = pal[1];
      ctx.lineWidth = Math.max(2, lineWidth * 0.6);
      ctx.globalAlpha = 0.7;
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          ctx.beginPath();
          ctx.moveTo(sorted[i].x, sorted[i].y);
          ctx.lineTo(sorted[j].x, sorted[j].y);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  },
};
