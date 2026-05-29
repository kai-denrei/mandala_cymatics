// mulberry32 — fast, reproducible PRNG from an integer seed. Every generator
// derives all its randomness from makeRng(params.seed) for deterministic output.

export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randRange(rng: () => number, lo: number, hi: number): number {
  return lo + (hi - lo) * rng();
}

/** Inclusive integer in [lo, hi]. */
export function randInt(rng: () => number, lo: number, hi: number): number {
  return Math.floor(lo + (hi - lo + 1) * rng());
}

export function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}
