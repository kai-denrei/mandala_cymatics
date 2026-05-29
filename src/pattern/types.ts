// Locked pattern-generator interface. Ten generators build against this.

import type { PaletteName } from "../types";

/**
 * Universal pattern parameters. Each generator interprets the ones it needs.
 * Generator selection is a separate `generatorId` (registry key), not a field here.
 */
export interface PatternParams {
  order: number; // 3..24  n-fold rotational symmetry / arm / source count
  depth: number; // 1..8   recursion / ring / layer depth
  hue: number; // 0..360 hue rotation applied to the palette
  complexity: number; // 1..6   sub-motif detail / point density
  jitter: number; // 0..1   perturbation amount (0 = strict)
  palette: PaletteName; // named palette key (a generated ramp is passed via the `pal` arg)
  seed: number; // integer seed for makeRng — ALL generator randomness derives from this
}

export const DEFAULT_PARAMS: PatternParams = {
  order: 16,
  depth: 6,
  hue: 0,
  complexity: 3,
  jitter: 0,
  palette: "buddhas",
  seed: 42,
};

/**
 * A generator: metadata + a pure render fn.
 * CONTRACT: render() must (1) fill the whole size×size canvas with BG_HEX (imported
 * from ../grid — currently "#120e1a") first, (2) paint colored pixels whose squared-RGB
 * distance from BG_RGB exceeds 1500 across a good fraction of the disc/frame (a coverage
 * guard is the safety net); content should stay within radius ~0.45*size (disc-cropped),
 * (3) take ALL randomness from makeRng(params.seed) — never bare Math.random(). `pal`
 * is a resolved 5-element CSS-color ramp (pal[0] light .. pal[4] deep), cyclic via
 * pal[i % 5]; it is passed in already resolved so generated/random palettes work.
 * Treat params.palette/params.hue as already baked into `pal`.
 */
export interface PatternGenerator {
  id: string;
  label: string;
  symmetric: boolean;
  render(ctx: CanvasRenderingContext2D, size: number, pal: string[], params: PatternParams): void;
}
