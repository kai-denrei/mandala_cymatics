# Mandala / cymatics handover

## In one paragraph

A procedural generator for Tibetan-style mandalas that respects the canonical thigtse grid construction and Five Buddhas iconography, plus a cymatic "explosion" pass that disassembles the mandala into ~15k particles and lets them flow between the mandala form and Chladni nodal patterns. The mandala stays recognizable through colour even as its geometry transforms — each particle remembers which ring it came from.

## Why this project

Existing tools split into two camps: academic parametric work (Zhang et al. 2020 — exact but not packaged as a usable tool) and generic art toys (RandomMandala, p5.js sketches, modulo arithmetic) that aren't iconographically accurate. Nobody combines authentic Tibetan structure, live tweakable parameters, and the cymatic destruction layer. See `docs/03-prior-art.md` for the survey.

The output should be:
1. Pleasant and beautiful at default settings
2. Accurate to the spirit of the symbols (thigtse grid, Five Buddhas, four-gate palace, lotus/vajra/fire rings)
3. Fully parametric (sliders for everything)
4. Compatible with a cymatic simulator for the explosion phase

## Status

Two working web prototypes in `prototypes/`:

- `mandala-generator.html` — 5-layer procedural mandala with sliders for rotational order, ring depth, hue rotation, complexity, authenticity ↔ abstraction blend, and palette selection.
- `cymatic-explosion.html` — particle-bridge cymatic simulation. Mandala renders to offscreen canvas, samples ~15k particles, applies Chladni force field with smooth `(m,n)` mode evolution through a 6-phase cycle (Mandala → Vibrating → Dispersing → Mode shift → Settled → Reforming).

Both run standalone — drop into a browser, no build step required.

Architecture and physics fully documented:
- `docs/01-architecture.md` — system design, motif math, parameter space, proposed file layout
- `docs/02-cymatics.md` — Chladni equations, particle bridge, mode evolution, audio coupling
- `docs/03-prior-art.md` — survey of existing mandala generators and cymatic sims
- `docs/04-references.md` — citations, links, primary sources

## File map

```
mandala-cymatics/
├── HANDOVER.md                      # this file
├── CLAUDE.md                        # Claude Code project conventions
├── docs/
│   ├── 01-architecture.md           # mandala system design
│   ├── 02-cymatics.md               # physics, particle bridge, audio
│   ├── 03-prior-art.md              # survey of existing work
│   └── 04-references.md             # citations and links
└── prototypes/
    ├── mandala-generator.html       # parametric mandala (standalone)
    └── cymatic-explosion.html       # particle simulation (standalone)
```

## How to continue with Claude Code

Open this directory in a Claude Code session. Recommended boot sequence:

```bash
cd mandala-cymatics
claude
# inside Claude Code:
> Read HANDOVER.md, CLAUDE.md, and all files under docs/. Then summarize the project and tell me what you'd scaffold first.
```

The prototypes already prove the approach works end-to-end. Claude Code's first job is to scaffold a proper TypeScript project around them and start the recommended next steps below.

## Next steps (priority order)

1. **Scaffold** — Vite + TS + Canvas2D. React optional (only if the slider UI needs it). Proposed `src/` layout in `docs/01-architecture.md` § "File layout".

2. **Port motif library** — translate the prototype's inline drawing functions into `src/motifs/*.ts` modules. One file per motif (star, crescent, lotus, vajra, flame, gate). Each exports a function that returns a `Path2D` plus paint metadata, so the same module can be used for both Canvas2D and SVG export. Math reference: Zhang et al. 2020 §§ 3-5 (formulas reproduced in `docs/01-architecture.md`).

3. **Bessel circular-plate Chladni modes** — replace the square-plate equation in the cymatic prototype with the circular-plate version `Jₙ(kₙₘ·r) · cos(nθ)`. This is the highest-impact upgrade. The nodal patterns become radially symmetric and resonate with the mandala's own structure. Detail in `docs/02-cymatics.md` § "Polar Chladni modes".

4. **WebAudio FFT coupling** — `AnalyserNode` → 1024-bin FFT → drive `(m,n)` mode and amplitude in real time. Low-frequency energy → low modes; spectral centroid → mode ratio; RMS → amplitude. Tibetan chant / singing bowls / bells as canonical test inputs.

5. **WebGL particle offload** — regl-based position-texture-update pass. Target 200k particles at 60fps. Canvas2D ImageData approach starts dropping frames around 50k.

6. **Reverse coupling** — particles assemble *into* a mandala from a Chladni starting state. Same physics, swap source and target. Conceptually the more interesting statement.

## Open decisions

- **Canvas2D first or straight to WebGL?** Canvas2D until 50k particles; WebGL after. The prototype's ImageData approach is the right baseline.
- **React vs plain HTML?** React for ergonomics if the UI grows; plain HTML for minimum bundle size. The prototypes use plain HTML and that's plenty.
- **Audio input** — file upload, live mic, or synthesized chant? Probably all three, with file upload first.
- **Bessel approximation** — precomputed lookup table (faster, sufficient for visual purposes) or runtime polynomial (more accurate, slower). Lookup table is recommended.
- **Export targets** — SVG (for print/Illustrator/Procreate) plus Canvas (animation), or Canvas only?
- **Charnel grounds ring** — include or skip in v1? Symbolically important but visually complex (eight semi-figurative scenes around the perimeter).
- **Iconographic restriction** — the crescent motif is specific to dakini mandalas (Vajrayoginī etc.). Should the system enforce these restrictions, or allow mixing freely?

## Recommended stack

- **Build**: Vite + TypeScript strict mode
- **Render**: Canvas2D for v1; regl for WebGL phase
- **UI**: Plain HTML controls initially, React only if needed
- **Audio**: WebAudio API + Tone.js for any synthesis needs
- **Math**: pure TS modules, no external numerics lib needed (Bessel via lookup table)
- **Format**: ESM, modern JS, no transpilation targets below ES2020

## Conversation context

This handover crystallizes a research conversation that covered:
1. Tibetan mandala geometry — rings (fire / vajra / lotus / charnel), square palace with 4 T-gates, central bindu, Five Buddhas colour system anchored to four directions
2. Survey of existing procedural mandala work (academic + hobbyist)
3. Architecture for an authentic-but-tweakable parametric system using Zhang et al's motif formulas on a 24-unit thigtse grid
4. Cymatic explosion phase via particle bridge with Chladni eigenfunction force field
5. Open extension paths (Bessel modes, audio coupling, GPU offload, reverse direction)

Both prototypes in `prototypes/` are direct outputs of that conversation — proven to work, ready to port into a proper codebase.
