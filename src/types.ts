// Shared types for Mandala Cymatic Vibrations.

export type PaletteName =
  | "buddhas"
  | "sunrise"
  | "ember"
  | "lagoon"
  | "twilight"
  | "saffron"
  | "meadow"
  | "blossom";

/** Geometry of the thigtse grid for a square canvas of side W. */
export interface Grid {
  W: number;
  w: number; // unit cell = W/24
  cx: number;
  cy: number;
}

/** A single cymatic particle sampled from the rendered mandala. */
export interface Particle {
  x0: number;
  y0: number; // origin (for reformation)
  x: number;
  y: number; // current position
  vx: number;
  vy: number;
  r: number;
  g: number;
  b: number; // colour from source pixel
}

/** Tunable cymatic physics, live from the dashboard. */
export interface PhysicsConfig {
  str: number; // jolt force strength
  noise: number; // jitter (thermal noise)
  damping: number; // velocity retained per frame (lower = faster settle)
  // Pointer "repel": push grains away from a touch/drag point. Applies in ANY
  // state (superposes with the sound field). touchStr 0 = no touch this frame.
  touchX?: number; // pointer position, NORMALIZED [0..1] (each backend ×W)
  touchY?: number;
  touchStr?: number; // push strength (fraction of W per frame); 0 = off
  touchR?: number; // influence radius as a fraction of W [0..1], Gaussian falloff
}

/** A single Chladni mode with a weight, for multi-mode superposition. */
export interface ModeWeight {
  m: number;
  n: number;
  w: number;
}

/** Interpolated cymatic state at a given moment in the phase cycle. */
export interface PhysicsState {
  name: string;
  amp: number;
  m: number; // representative (top-weight) mode — panel display + single-mode back-compat
  n: number;
  home: number;
  modes?: ModeWeight[]; // multi-mode field; when absent, [{m, n, w: 1}] is assumed
  kick?: number; // radial velocity impulse from centre (fraction of W) — bass bursts
  kickX?: number; // horizontal impulse toward L/R edges (fraction of W) — mid bursts
  kickY?: number; // vertical impulse toward T/B edges (fraction of W) — treble bursts
  life?: number; // continuous agitation floor (mic "Flow") — perpetual jitter so the
  //               field never settles into an absorbing equilibrium; 0 = off (gong)
  explode?: number; // pop impulse (fraction of W): a one-frame random-direction velocity
  //                   kick — grains fly off their CURRENT positions (no teleport/reseed)
}
