// Generator registry. Random and the engine select by id.

import type { PatternGenerator } from "./types";
import { tibetanMandala } from "./generators/tibetan-mandala";
import { spirograph } from "./generators/spirograph";
import { phyllotaxis } from "./generators/phyllotaxis";
import { sacredGeometry } from "./generators/sacred-geometry";
import { recursiveRosette } from "./generators/recursive-rosette";
import { kaleidoNoise } from "./generators/kaleido-noise";
import { voronoiShards } from "./generators/voronoi-shards";
import { flowField } from "./generators/flow-field";
import { fractalSubdivision } from "./generators/fractal-subdivision";
import { interference } from "./generators/interference";
import { glyphMandala } from "./generators/glyph-mandala";
import { fractalMandala } from "./generators/fractal-mandala";

export const GENERATORS: PatternGenerator[] = [
  tibetanMandala,
  fractalMandala,
  glyphMandala,
  spirograph,
  phyllotaxis,
  sacredGeometry,
  recursiveRosette,
  kaleidoNoise,
  voronoiShards,
  flowField,
  fractalSubdivision,
  interference,
];

const MAP = new Map(GENERATORS.map((g) => [g.id, g]));

export function byId(id: string): PatternGenerator {
  return MAP.get(id) ?? GENERATORS[0]; // fallback to tibetan-mandala
}

// The "proper Tibetan mandala" family (the ❂ randomizer); excluded from creative.
export const MANDALA_IDS = ["tibetan-mandala", "fractal-mandala", "glyph-mandala"];

export const SYMMETRIC_IDS = GENERATORS.filter((g) => g.symmetric).map((g) => g.id);
export const WILD_IDS = GENERATORS.filter((g) => !g.symmetric).map((g) => g.id);
