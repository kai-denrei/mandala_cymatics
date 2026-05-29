# Mandala Cymatic Vibrations

A procedural Tibetan-mandala generator with a cymatic "vibrations" engine. A
mandala (or one of several generative patterns) is sampled into a particle
field; a synthesized deep gong jolts the particles toward the live Chladni
nodal pattern of its own sound, then they settle. Strike repeatedly and the
form dissolves; reform it, or roll a new one.

**Live demo:** https://kai-denrei.github.io/mandala_cymatics/

## Controls

- **▶ / ⏸ Autoplay** — self-plays: the gong strikes, the mandala dissolves over
  several gongs, then reforms, and loops.
- **Strike gong** — hit it; *further from the centre = a harder strike*.
- **Reform** — pull the particles back into the intact pattern.
- **Random Tibetan mandala** — a proper mandala (base ring-stack, recursive
  fractal, or Tibetan-glyph), from a curated palette.
- **Random creative pattern** — the wider generative library (spirograph,
  phyllotaxis, sacred geometry, voronoi, flow fields, …).
- **+** — dashboard: live metrics + Cymatics (Jolt / Settle / Decay / Jitter)
  and Pattern (symmetry, depth, hue, complexity, palette, particle count up to 1M).

## Tech

Vite + TypeScript (strict), Canvas2D + a WebGL (regl) GPU particle backend
(~200k–1M particles, with a CPU fallback), WebAudio additive gong synthesis
with a multi-mode FFT → Chladni coupling. No backend — pure client-side.

```bash
npm install
npm run dev        # local dev server
npm run build      # production build to dist/
```

See `docs/` for the architecture and cymatics notes, and `.deban/` for the
decision log.
