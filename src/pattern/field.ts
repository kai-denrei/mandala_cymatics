// Shared summed-sine value field — reused by kaleido-noise and flow-field.
// A small bank of sine/cosine waves gives a smooth, seedable pseudo-noise field
// without external deps. Coordinates u,v are expected in roughly [-1, 1].

import { randRange } from "./rng";

export interface Wave {
  fx: number;
  fy: number;
  ph: number;
  wt: number;
}

/** Build `k` random waves. fRange bounds the spatial frequency. */
export function makeWaves(rng: () => number, k: number, fLo = 1, fHi = 6): Wave[] {
  const waves: Wave[] = [];
  for (let i = 0; i < k; i++) {
    waves.push({
      fx: randRange(rng, fLo, fHi),
      fy: randRange(rng, fLo, fHi),
      ph: randRange(rng, 0, Math.PI * 2),
      wt: randRange(rng, 0.4, 1),
    });
  }
  return waves;
}

/** Evaluate the field at (u, v). Result is roughly in [-Σwt, Σwt]; normalize by total weight if needed. */
export function sampleField(waves: Wave[], u: number, v: number): number {
  let s = 0;
  const PI = Math.PI;
  for (let i = 0; i < waves.length; i++) {
    const w = waves[i];
    s += w.wt * Math.sin(w.fx * u * PI + w.ph) * Math.cos(w.fy * v * PI + w.ph);
  }
  return s;
}

/** Total weight, for normalizing sampleField into [-1, 1]. */
export function totalWeight(waves: Wave[]): number {
  let t = 0;
  for (const w of waves) t += w.wt;
  return t || 1;
}
