// Particle bridge: sample particles from a rendered mandala, and step them
// under the Chladni force field. Ported verbatim from
// prototypes/cymatic-explosion.html. Pure module — no DOM, no rAF.
// (Reads ImageData from a passed-in context; uses Math.random for noise/sampling.)

import type { Particle, PhysicsState, PhysicsConfig } from "../types";
import { BG_RGB, SAMPLE_R_FRAC, CONTAIN_R_FRAC } from "../grid";

/**
 * Walk the source context's pixels (W×W) and emit a particle wherever the
 * squared RGB distance from the background exceeds 1500, with probability 0.35.
 * Each particle keeps the colour of its source pixel.
 */
export function sampleParticles(srcCtx: CanvasRenderingContext2D, W: number): Particle[] {
  const img = srcCtx.getImageData(0, 0, W, W);
  const d = img.data;
  const particles: Particle[] = [];
  const cx = W / 2;
  const cy = W / 2;
  const rc2 = (SAMPLE_R_FRAC * W) * (SAMPLE_R_FRAC * W);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const ddx = x - cx;
      const ddy = y - cy;
      if (ddx * ddx + ddy * ddy > rc2) continue; // crop to the disc
      const i = (y * W + x) * 4;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const dr = r - BG_RGB[0];
      const dg = g - BG_RGB[1];
      const db = b - BG_RGB[2];
      const dist = dr * dr + dg * dg + db * db;
      if (dist > 1500 && Math.random() < 0.35) {
        particles.push({ x0: x, y0: y, x, y, vx: 0, vy: 0, r, g, b });
      }
    }
  }
  return particles;
}

/**
 * Advance all particles by dt seconds under the given physics state.
 * Force F = −2·f·∇f·STR·amp pushes toward nodes; noise ∝ |f|; Hookean home
 * spring when reforming; damping 0.91; boundary reflect with −0.3.
 */
export function step(
  particles: Particle[],
  dt: number,
  state: PhysicsState,
  W: number,
  cfg: PhysicsConfig,
): void {
  // Resolve the active modes once (multi-mode superposition; single-mode fallback).
  const modes =
    state.modes && state.modes.length ? state.modes : [{ m: state.m, n: state.n, w: 1 }];
  const PI = Math.PI;
  for (const p of particles) {
    if (state.amp > 0.001 && modes.length > 0) {
      const u = p.x / W;
      const v = p.y / W;
      const pu = PI * u;
      const pv = PI * v;
      // Summed Chladni field f and gradient over the weighted modes.
      let f = 0;
      let du = 0;
      let dv = 0;
      for (let k = 0; k < modes.length; k++) {
        const m = modes[k].m;
        const n = modes[k].n;
        const w = modes[k].w;
        const cmu = Math.cos(m * pu);
        const cnu = Math.cos(n * pu);
        const cmv = Math.cos(m * pv);
        const cnv = Math.cos(n * pv);
        const smu = Math.sin(m * pu);
        const snu = Math.sin(n * pu);
        const smv = Math.sin(m * pv);
        const snv = Math.sin(n * pv);
        f += w * (cmu * cnv - cnu * cmv);
        du += w * (-m * PI * smu * cnv + n * PI * snu * cmv);
        dv += w * (-n * PI * cmu * snv + m * PI * cnu * smv);
      }
      // CRISP Chladni force: −∇|f| = −sign(f)·∇f (constant pull to the nodal line,
      // so sand piles onto sharp lines) — parity with the GLSL path.
      const fs = f >= 0 ? 1 : -1;
      const fx = -fs * du * cfg.str * state.amp;
      const fy = -fs * dv * cfg.str * state.amp;
      p.vx += fx * dt;
      p.vy += fy * dt;
      // Langevin diffusion: constant thermal floor (0.35) so grains keep getting
      // bumped even on a node + |f| antinode bounce → grainy, imperfect lines.
      const nz = (0.35 + Math.abs(f)) * state.amp * cfg.noise;
      p.vx += (Math.random() - 0.5) * nz;
      p.vy += (Math.random() - 0.5) * nz;
    }
    // Directional attack impulses — bass radial, mid L/R, treble T/B (parity w/ GLSL).
    const kr = state.kick ?? 0;
    const kx = state.kickX ?? 0;
    const ky = state.kickY ?? 0;
    if (kr > 0 || kx > 0 || ky > 0) {
      const cx = W / 2;
      const cy = W / 2;
      const dkx = p.x - cx;
      const dky = p.y - cy;
      const rk = Math.max(1, Math.sqrt(dkx * dkx + dky * dky));
      if (kr > 0) {
        const imp = kr * W;
        p.vx += (dkx / rk) * imp + (Math.random() - 0.5) * imp * 0.6;
        p.vy += (dky / rk) * imp + (Math.random() - 0.5) * imp * 0.6;
      }
      if (kx > 0) {
        const imp = kx * W;
        p.vx += Math.sign(dkx) * imp;
        p.vy += (Math.random() - 0.5) * imp * 0.4;
      }
      if (ky > 0) {
        const imp = ky * W;
        p.vy += Math.sign(dky) * imp;
        p.vx += (Math.random() - 0.5) * imp * 0.4;
      }
    }
    if (state.home > 0) {
      p.vx += (p.x0 - p.x) * state.home;
      p.vy += (p.y0 - p.y) * state.home;
    }
    p.vx *= cfg.damping;
    p.vy *= cfg.damping;
    p.x += p.vx * dt * 60;
    p.y += p.vy * dt * 60;
    // Circular containment: reflect at a disc so nothing reaches the canvas edge.
    const cx = W / 2;
    const cy = W / 2;
    const rmax = CONTAIN_R_FRAC * W;
    const rx = p.x - cx;
    const ry = p.y - cy;
    const d2 = rx * rx + ry * ry;
    if (d2 > rmax * rmax) {
      const dd = Math.sqrt(d2) || 1;
      const nx = rx / dd;
      const ny = ry / dd;
      p.x = cx + nx * rmax;
      p.y = cy + ny * rmax;
      const vn = p.vx * nx + p.vy * ny;
      if (vn > 0) {
        p.vx -= 1.3 * vn * nx; // reflect outward component with -0.3 restitution
        p.vy -= 1.3 * vn * ny;
      }
    }
  }
}
