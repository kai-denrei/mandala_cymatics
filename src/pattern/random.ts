// Two randomizers: one for proper Tibetan mandalas (always the mandala
// generator, symmetric, varied), one for the creative library (everything
// else — symmetric-creative leaning, with occasional wild ones).

import { makeRng, randRange, randInt, pick } from "./rng";
import { SYMMETRIC_IDS, WILD_IDS, MANDALA_IDS } from "./registry";
import { randomPaletteName } from "./palette-gen";
import type { PatternParams } from "./types";

export interface RandomPick {
  generatorId: string;
  params: PatternParams;
}

// Symmetric generators that are NOT mandalas = the "creative symmetric" set.
const CREATIVE_SYMMETRIC = SYMMETRIC_IDS.filter((id) => !MANDALA_IDS.includes(id));

function entropy(seed: number | undefined): number {
  return (seed ?? Math.floor(Math.random() * 2 ** 31)) >>> 0;
}

/**
 * Proper Tibetan mandala with variety — always symmetric. Picks among the
 * mandala family: the base ring-stack (~50%), the recursive fractal mandala
 * (~25%, patterns within patterns), and the Tibetan-glyph mandala (~25%).
 */
export function randomTibetan(seed?: number): RandomPick {
  const rng = makeRng(entropy(seed));
  const roll = rng();
  // Roll order/depth in each generator's NATIVE range so the values actually
  // vary (a shared 6-24 / 4-6 range would clamp-saturate to a single point in
  // the fractal/glyph generators).
  let generatorId: string;
  let order: number;
  let depth: number;
  if (roll < 0.5) {
    generatorId = "tibetan-mandala";
    order = randInt(rng, 8, 24); // rich high-order ring stacks
    depth = randInt(rng, 4, 6);
  } else if (roll < 0.75) {
    generatorId = "fractal-mandala";
    order = randInt(rng, 4, 6); // fold (kept ≤6 for symmetric, bounded recursion)
    depth = randInt(rng, 1, 3); // recursion depth
  } else {
    generatorId = "glyph-mandala";
    order = randInt(rng, 5, 12); // glyphs per ring
    depth = randInt(rng, 2, 5); // ring count
  }
  const params: PatternParams = {
    order,
    depth,
    hue: 0, // exact curated palette — no rotation for the mandala randomizer
    complexity: randInt(rng, 3, 6),
    jitter: randRange(rng, 0, 0.35), // mostly authentic proportions
    palette: randomPaletteName(rng),
    seed: randInt(rng, 1, 2 ** 30),
  };
  return { generatorId, params };
}

/** Creative library: ~60% symmetric-creative, ~40% wild/asymmetric. */
export function randomCreative(seed?: number): RandomPick {
  const rng = makeRng(entropy(seed));
  const symmetric = rng() < 0.6 && CREATIVE_SYMMETRIC.length > 0;
  const generatorId = symmetric ? pick(rng, CREATIVE_SYMMETRIC) : pick(rng, WILD_IDS);
  const params: PatternParams = {
    order: randInt(rng, 3, 24),
    depth: randInt(rng, symmetric ? 2 : 1, symmetric ? 6 : 8),
    hue: randInt(rng, 0, 359),
    complexity: randInt(rng, 2, 6),
    jitter: symmetric ? randRange(rng, 0, 0.5) : randRange(rng, 0.2, 1.0),
    palette: randomPaletteName(rng),
    seed: randInt(rng, 1, 2 ** 30),
  };
  return { generatorId, params };
}
