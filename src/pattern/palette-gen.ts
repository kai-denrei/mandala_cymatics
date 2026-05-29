// Palette selection for the randomizers. We stick to the curated fixed
// palettes (no procedurally-generated ramps), so every random pattern uses a
// known, hand-picked colour set.

import type { PaletteName } from "../types";
import { PALETTES } from "../palette";
import { pick } from "./rng";

const NAMES = Object.keys(PALETTES) as PaletteName[];

export function randomPaletteName(rng: () => number): PaletteName {
  return pick(rng, NAMES);
}
