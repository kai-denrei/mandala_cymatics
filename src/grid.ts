// Thigtse 24-unit grid. The only magic number is w = W/24; every radius and
// motif size is a multiple of w. Pure module.

import type { Grid } from "./types";

// Background matches the site --bg so the canvas melts into the page.
export const BG_HEX = "#120e1a";
export const BG_RGB: readonly [number, number, number] = [0x12, 0x0e, 0x1a];

// Patterns are sampled within this disc, and particles are reflected at a
// slightly larger disc, so the full mandala stays inside the canvas (no edge
// spikes / off-screen particles). Fractions of the canvas side W.
export const SAMPLE_R_FRAC = 0.46;
export const CONTAIN_R_FRAC = 0.49;

export function makeGrid(W: number): Grid {
  return { W, w: W / 24, cx: W / 2, cy: W / 2 };
}
