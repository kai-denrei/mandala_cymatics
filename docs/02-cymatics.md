# Cymatics — physics and integration

The cymatic phase disassembles the rendered mandala into particles and lets them flow under a Chladni-pattern force field. Each particle retains the colour of the mandala pixel it was sampled from, so the Five Buddhas palette persists through the transformation.

## Chladni equations

### Square plate

For a square plate of side `L` clamped at the boundary, the standing-wave modes are products of cosines. The classical Chladni equation expresses the displacement amplitude at point `(x, y)` for mode `(m, n)`:

```
f(x, y) = cos(mπx/L) · cos(nπy/L)  ±  cos(nπx/L) · cos(mπy/L)
```

For normalized coordinates `u = x/L, v = y/L`, with `u, v ∈ [0, 1]`:

```
f(u, v) = cos(mπu) · cos(nπv)  −  cos(nπu) · cos(mπv)
```

The sign `−` vs `+` gives different symmetry families. Use `−` for an antisymmetric mode (most "Chladni-figure-like" patterns); `+` for symmetric.

Powder accumulates where `f ≈ 0` (nodal lines) and is thrown clear of regions where `|f|` is large (antinodes).

Gradients (needed for the force field):

```
∂f/∂u = −mπ · sin(mπu) · cos(nπv)  +  nπ · sin(nπu) · cos(mπv)
∂f/∂v = −nπ · cos(mπu) · sin(nπv)  +  mπ · cos(nπu) · sin(mπv)
```

### Circular plate (Bessel modes) — recommended for v2

A circular plate's modes are Bessel functions of the first kind. In polar `(r, θ)`:

```
f(r, θ) = J_n(k_{nm} · r) · cos(n · θ)
```

Where `J_n` is the Bessel function of order `n` and `k_{nm}` is the `m`-th zero of `J_n` (or its derivative, depending on boundary condition).

This is the right physics for a circular plate, and the nodal patterns are themselves radially symmetric: concentric circles plus radial spokes. They resonate visually with the mandala's structure — much better match than square modes.

Implementation: Bessel via lookup table, computed once at startup:

```typescript
import { besselJ } from './bessel-table';

export function chladniCircular(
  r: number, theta: number,
  n: number, m: number,
): number {
  const k = besselZero(n, m);
  return besselJ(n, k * r) * Math.cos(n * theta);
}
```

Source for Bessel zeros: tabulated to 10+ digits in Abramowitz & Stegun § 9.5 or computed via `scipy.special.jn_zeros` and committed as a constant array.

## Particle bridge

Workflow:

1. Render the mandala once to an offscreen canvas at the target resolution.
2. Walk the offscreen pixel data. For each pixel whose colour differs from the background by more than a threshold, with probability `p`, emit a particle:

```typescript
interface Particle {
  x0: number; y0: number;            // origin (for reformation)
  x:  number; y:  number;            // current position
  vx: number; vy: number;            // velocity
  r:  number; g:  number; b:  number; // colour from source
}
```

3. Per frame, for each particle:
   - Compute Chladni field `f` and gradient `(∂f/∂u, ∂f/∂v)` at the particle's position.
   - Apply force `F = −2 · f · ∇f · amplitude`. This is the gradient of `f²`, pushing particles toward zeroes (nodes).
   - Add thermal noise proportional to `|f|` — particles in active regions jitter more.
   - Apply damping (`v *= 0.91`).
   - If reforming, add a Hookean spring force toward `(x0, y0)` scaled by `home` parameter.
   - Integrate position.

4. Render: clear the buffer, plot each particle as a 1×1 or 2×1 pixel on the canvas's `ImageData`, `putImageData`.

```typescript
function step(p: Particle, dt: number, state: PhysicsState) {
  if (state.amp > 0.001) {
    const u = p.x / W, v = p.y / W;
    const f = chladni(u, v, state.m, state.n);
    const [du, dv] = gradChladni(u, v, state.m, state.n);
    
    const Fx = -2 * f * du * STRENGTH * state.amp;
    const Fy = -2 * f * dv * STRENGTH * state.amp;
    
    p.vx += Fx * dt;
    p.vy += Fy * dt;
    
    const noiseMag = Math.abs(f) * state.amp * NOISE_STR;
    p.vx += (Math.random() - 0.5) * noiseMag;
    p.vy += (Math.random() - 0.5) * noiseMag;
  }
  
  if (state.home > 0) {
    p.vx += (p.x0 - p.x) * state.home;
    p.vy += (p.y0 - p.y) * state.home;
  }
  
  p.vx *= 0.91;
  p.vy *= 0.91;
  p.x += p.vx * dt * 60;
  p.y += p.vy * dt * 60;
}
```

Constants worth tuning (current prototype values):

- `STRENGTH = 0.45` — force scaling
- `NOISE_STR = 0.6` — thermal jitter scaling
- damping coefficient `0.91`
- sampling probability `0.35` for pixels above colour-distance threshold of `1500` (squared RGB distance)

These work well at `W = 400` with ~15,000 particles.

## Phase choreography

The prototype uses a 6-phase cycle that loops. Each phase smoothly interpolates between start and end states (smoothstep easing). Total cycle: ~16 seconds.

| Phase       | Duration | Amplitude    | Mode (m, n)     | Notes                              |
|-------------|----------|--------------|-----------------|------------------------------------|
| Mandala     | 2.2s     | 0 → 0        | (3, 5)          | quiescent state                    |
| Vibrating   | 2.6s     | 0 → 0.6      | (3,5) → (4,7)   | force ramps up gently              |
| Dispersing  | 3.0s     | 0.6 → 1.0    | (4,7) → (6,3)   | particles leap free                |
| Mode shift  | 2.6s    | 1.0 → 1.0    | (6,3) → (5,8)   | nodal pattern morphs               |
| Settled     | 2.4s     | 1.0 → 0.85   | (5, 8) held     | particles converge to nodes        |
| Reforming   | 3.4s     | 0.85 → 0     | (5, 8)          | home force ramps up, amp drops     |

The smooth interpolation between modes (e.g. `m` sliding from `3` to `4` as a float, not a step) gives the "swirling" quality. With discrete mode steps you'd get a more abrupt freeze/unfreeze rhythm — both are aesthetically valid, smooth is more visually continuous.

## Audio coupling

The interesting version of this drives `(m, n)` from real audio input.

```typescript
const audioCtx = new AudioContext();
const analyser = audioCtx.createAnalyser();
analyser.fftSize = 1024;
const bins = new Uint8Array(analyser.frequencyBinCount); // 512

function audioStep() {
  analyser.getByteFrequencyData(bins);
  
  // RMS energy → amplitude
  const rms = Math.sqrt(bins.reduce((s, v) => s + v * v, 0) / bins.length) / 255;
  state.amp = smooth(state.amp, rms, 0.1);
  
  // Spectral centroid → mode order
  let num = 0, den = 0;
  for (let i = 0; i < bins.length; i++) {
    num += i * bins[i];
    den += bins[i];
  }
  const centroid = den > 0 ? num / den : 0;
  const modeSum = 4 + Math.floor(centroid / 32);   // 4 to ~20
  
  // Low-frequency energy → ratio between m and n
  const lowEnergy = bins.slice(0, 64).reduce((s, v) => s + v, 0) / 64 / 255;
  state.m = modeSum * (0.3 + 0.4 * lowEnergy);
  state.n = modeSum - state.m;
}
```

Canonical test inputs:

- **Tibetan throat singing (rgyud-skad)** — the gyuto/gyume monks. Low fundamental with rich harmonic stack. Maps to low `m+n` with strong overtones in spectral centroid.
- **Singing bowls** — sustained pure tones, several harmonics. Excellent for steady-state mode locking.
- **Bells / gongs** — transient attack, slow decay. Good for showing the explosion → settle phase.
- **Wind chimes / chimes** — chaotic, multi-tonal. Continuous mode-shifting.

WebAudio reads from `<input type="file">`, `MediaStreamTrack` (mic), or `OscillatorNode` (synthesized).

## Performance notes

The current Canvas2D + ImageData approach scales to ~50k particles at 60fps on a modern machine. Bottleneck is the `putImageData` blit per frame plus the per-particle physics.

To go higher (target: 200k particles), move to WebGL:

1. Store particle state in two RGBA float textures (position + velocity), ping-ponged.
2. Physics step: a fragment shader sampling current state, computing new state, writing to the other texture.
3. Render: vertex shader reads positions, fragment shader paints points.

`regl` is the lightest abstraction. `twgl` and raw WebGL also work. Roughly half a day's work to port.

For mode evolution + audio coupling, keep those in JS — they're negligible cost compared to particle physics.

## Reverse coupling

The really compelling demo runs the other direction: start from a pure Chladni pattern (random particles distributed across nodal lines of mode `(m, n)`), then animate them assembling *into* a mandala.

Same physics, swap source and target:
- Source: random distribution constrained to nodal lines
- Target: positions sampled from the rendered mandala
- During animation, `home` parameter increases while Chladni `amp` decreases

Conceptually this is the more interesting statement — "the mandala precipitates out of resonance." The visual is just the previous animation played in reverse, but it reads as different and arguably more profound.

## Integration with existing cymatic sim

If there's already a Chladni / cymatic simulator on hand, the integration point is the **field function**:

```typescript
type ChladniField = (u: number, v: number, t: number) => {
  amplitude: number;            // scalar at this point
  gradient: [number, number];   // ∂f/∂u, ∂f/∂v
};
```

The external sim becomes a `ChladniField` provider. The particle bridge consumes it without knowing whether the field comes from analytical equations, an FDM simulation, FFT of an audio signal, or anything else. The interface is the only contract.

```typescript
function attachCymaticField(field: ChladniField, particles: Particle[]) {
  // step each particle against the field's gradient
}
```

This means the external simulator can be developed independently and snapped in. If the field changes over time (e.g. driven by audio), `field(u, v, t)` reads the current state.

## Known caveats

- **Boundary behaviour** — particles can drift off-canvas. Current prototype reflects them with damping. A "torus wrap" mode (particles re-emerge on the opposite edge) is also defensible.
- **Particle loss** — during long animations, some particles get stuck in low-energy regions and never participate again. A periodic "wake-up" jitter pulse can revive them.
- **Reformation imperfection** — the home spring is linear, so particles overshoot and oscillate. For a crisp snap-back, lerp position directly toward home in the final frames: `p.x = lerp(p.x, p.x0, easing(t))`.
- **Mode discontinuity** — when interpolating `(m, n)` as floats, sharp transitions occur at half-integer values where nodal lines reconnect. This is physically interesting but visually jarring. Constraining to integer `(m, n)` with smooth crossfade between two simultaneously-active fields is an alternative.
