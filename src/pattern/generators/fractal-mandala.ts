import type { PatternGenerator, PatternParams } from "../types";
import { makeRng, randRange, randInt } from "../rng";
import { BG_HEX } from "../../grid";

// Self-similar recursive mandala: a mini-mandala motif redrawn at the petal
// tips of its parent (patterns within patterns). Exact n-fold rotational
// symmetry is preserved by precomputing every random choice ONCE per recursion
// LEVEL (never inside the per-petal / per-branch loops), so all n sectors and
// all fc subtrees at a given level are byte-identical.

interface Level {
  ratio: number; // child shrink factor
  rot: number; // per-level rotation (jitter)
  petalLen: number; // petal length as fraction of R
  colOff: number; // colour-ramp offset for this level
}

const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

export const fractalMandala: PatternGenerator = {
  id: "fractal-mandala",
  label: "Fractal Mandala",
  symmetric: true,
  render(ctx: CanvasRenderingContext2D, size: number, pal: string[], params: PatternParams): void {
    // 1. background first
    ctx.fillStyle = BG_HEX;
    ctx.fillRect(0, 0, size, size);

    const rng = makeRng(params.seed);
    const cx = size / 2;
    const cy = size / 2;

    const n = clamp(Math.round(params.order), 4, 6); // fold (4-6 so fc === n → exact n-fold symmetry)
    const fractalDepth = clamp(Math.round(params.depth), 1, 3);
    const fc = n; // recurse into every petal tip → <= 6^3 minis, fully symmetric
    const complexity = clamp(Math.round(params.complexity), 1, 6);
    const jit = clamp(params.jitter, 0, 1);
    const halfAngle = (Math.PI / n) * 0.85;

    // Precompute per-LEVEL params ONCE (the recursion never touches rng).
    const levels: Level[] = [];
    for (let L = 0; L <= fractalDepth; L++) {
      levels.push({
        ratio: randRange(rng, 0.3, 0.42),
        rot: randRange(rng, -0.4, 0.4) * jit,
        petalLen: randRange(rng, 0.55, 0.8) + complexity * 0.02,
        colOff: randInt(rng, 0, 4),
      });
    }

    // Draw one filled petal pointing along angle 0, length len, from a local
    // origin. Caller sets transform (translate+rotate) so this is symmetric.
    const petal = (len: number): void => {
      const tipX = len;
      const ctrlX = len * 0.5;
      const ctrlY = Math.tan(halfAngle) * len * 0.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(ctrlX, -ctrlY, tipX, 0);
      ctx.quadraticCurveTo(ctrlX, ctrlY, 0, 0);
      ctx.closePath();
      ctx.fill();
    };

    const miniMandala = (mx: number, my: number, R: number, rot: number, level: number): void => {
      if (level > fractalDepth || R < size * 0.015) return;
      const lv = levels[level];
      const len = R * lv.petalLen;

      // Ring of n FILLED petals — identical colour & shape for every i → exact
      // rotational symmetry. Thin BG outline separates neighbouring petals.
      ctx.fillStyle = pal[(level + lv.colOff) % 5];
      ctx.strokeStyle = BG_HEX;
      ctx.lineWidth = Math.max(2, R * 0.012);
      for (let i = 0; i < n; i++) {
        const a = rot + (i / n) * Math.PI * 2;
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(a);
        petal(len);
        ctx.stroke();
        ctx.restore();
      }

      // Optional inner ring of dots (complexity), same colour for all → symmetric.
      if (complexity >= 3) {
        ctx.fillStyle = pal[(level + lv.colOff + 1) % 5];
        const dotR = Math.max(1.5, R * 0.04);
        const ringR = R * 0.5;
        for (let i = 0; i < n; i++) {
          const a = rot + ((i + 0.5) / n) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(mx + Math.cos(a) * ringR, my + Math.sin(a) * ringR, dotR, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Centre disc.
      ctx.fillStyle = pal[(level + 2) % 5];
      ctx.beginPath();
      ctx.arc(mx, my, R * 0.12, 0, Math.PI * 2);
      ctx.fill();

      // Recurse into fc identical child subtrees at the petal tips.
      const childR = R * lv.ratio;
      for (let i = 0; i < fc; i++) {
        const a = rot + (i / n) * Math.PI * 2;
        const px = mx + Math.cos(a) * R * 0.66;
        const py = my + Math.sin(a) * R * 0.66;
        miniMandala(px, py, childR, rot + lv.rot, level + 1);
      }
    };

    // Root + child-placement (0.66) chosen so the worst-case outward chain
    // (depth 3, ratio 0.42, petalLen 0.92) stays within ~0.42*size < the 0.46
    // sample disc — no off-canvas spill, no square-clip symmetry break.
    miniMandala(cx, cy, 0.36 * size, 0, 0);
  },
};
