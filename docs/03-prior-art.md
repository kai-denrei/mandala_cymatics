# Prior art — survey of existing work

The mandala-generation space splits cleanly into three camps. This document summarizes what exists and where this project differs.

## Academic parametric work

### Zhang, Zhang, Peng & Yu (2020) — Parametric Modeling and Generation of Mandala Thangka Patterns

The canonical reference and direct inspiration. Published in Journal of Computer Languages 58 (2020) 100968.

The paper proposes a parametric approach to modelling Nyingma-school interior mandala patterns. Three motif types are encoded: **star**, **crescent**, and **lotus flower**. Each has a closed-form geometric parameterization. Motifs are placed on a hierarchical concentric ring stack with radii determined by a uniformly-spaced reference grid (`w = W/24`) — the same thigtse grid Tibetan thangka painters use.

Key contributions cited from the paper:
- Parameterized motif models that quantify the geometric structure
- Hierarchical ring composition using a reference grid
- Interaction tool for setting parameters and arranging motifs

The math from this paper is reproduced in `docs/01-architecture.md` § "Motif math". The paper is the single most important reference for this project.

- **PDF**: http://www.cad.zju.edu.cn/home/jhyu/Papers/JoCompLang2020.pdf
- **Alt PDF**: https://personal.utdallas.edu/~kzhang/Publications/JoCompLang2020.pdf
- **ScienceDirect**: https://www.sciencedirect.com/science/article/abs/pii/S2590118420300289
- **ResearchGate**: https://www.researchgate.net/publication/341187197

What's missing from the paper for our purposes:
- It's an academic prototype — not packaged as a web tool or library
- No cymatic / animation layer
- The colour assignment logic isn't fully formalized (handled by reference to hand-drawn examples)
- Only three motifs; fire ring, vajra ring, palace, and gates aren't covered

## Generic procedural toys

### Anton Antonov's RandomMandala

Python package on PyPI. Generates mandalas through rotational symmetry of a Bezier seed segment. Multi-mandala mode overlays several radii. Available since 2021.

- **PyPI**: https://pypi.org/project/RandomMandala/
- **GitHub**: https://github.com/antononcube/Python-packages (under `RandomMandala`)
- **Mirrors a Wolfram Function Repository entry** (`RandomMandala`)

Aesthetic is generic — pleasing rotational compositions but with no anchor to Tibetan iconography. Useful as a reference implementation for the rotational-symmetry primitive.

### Priyanka Singh's Mandala-Generation (WGAN-div)

GAN-based generation. Mined ~16,000 images from Google Images and Instagram, filtered to ~6,300 clean mandala patterns, trained a Wasserstein GAN with gradient divergence. Also includes Wolfram Mathematica and Python rule-based generation modes.

- **GitHub**: https://github.com/priyanka1706/Mandala-Generation
- **Wolfram deployment**: https://www.wolframcloud.com/obj/a1eb70b1-2f4f-4270-9cf6-b93747d4b276

Learns the statistical distribution of mandala-like patterns. Output has no semantic structure — the GAN doesn't know what a lotus or a gate is. Useful only as a contrast: this is what happens when you skip the symbolic structure.

### RPH Studio's mandala generator (ProcJam 2019)

Procedural mandala generator built for itch.io's ProcJam Winter 2019. Keyboard-driven (LEFT/RIGHT for new patterns). Available for Windows/macOS/Linux.

- **itch.io**: https://rphstudio.itch.io/mandala-generator
- CC BY-NC-SA 3.0 licensed

Small, fun, narrow scope. Aesthetic is decorative, not iconographic.

### Various Processing / p5.js sketches

- **Mandala pattern generator (Richard Carter, OpenProcessing)** — simple ellipse-based patterns, mouse-controlled. https://openprocessing.org/sketch/151943/
- **Ajinkya296/Mandala** — paint-with-symmetry tool. https://github.com/Ajinkya296/Mandala
- **rafket/mandala** — small random JS generator. https://github.com/rafket/mandala
- **Plantala / Julala** — generate mandalas from digitized botanical / copperplate elements. Hackathon projects from Coding da Vinci Niedersachsen / Nieder.Rhein.Land. Beautiful, but not iconographically Tibetan. https://github.com/topics/mandala

### Modulo arithmetic visualizations

The "times table" mandala family — connecting `n` points around a circle with lines from `i` to `(k·i) mod n`. Mathematically elegant but visually abstract; no resemblance to traditional mandalas.

Multiple GitHub repos under the `mandala-sketches` and `modulo-arithmetics` tags.

## Cymatic / Chladni simulators

### Schroffl's chladni-simulation (WebGL)

Particle mesh with spring connections, displaced by audio. Acknowledges that the results aren't recognizable Chladni figures — closer to a generic audio-reactive cloth. Useful as a WebGL particle-simulation baseline.

- **GitHub**: https://github.com/schroffl/chladni-simulation

### Cortexelus's 4D-Chladni (Max/MSP)

Simulation of Chladni patterns in 4D (cube-cross-sections of a tesseract). Music Tech Fest Cymatics Challenge winner.

- **GitHub**: https://github.com/Cortexelus/4D-Chladni

### PettaBoy's Cymatics-Simulator-Chladni

Web-based Chladni plate simulator.

- **GitHub**: https://github.com/PettaBoy/Cymatics-Simulator-Chladni
- **Live**: https://pettaboy.github.io/cymaticssimulator_chladni

### flutomax's ChladniPlate2

Native simulator. Models Chladni figures from waveforms (amplitude, frequency ratio, phase). Renders to level maps with colorisable output.

- **GitHub**: https://github.com/flutomax/ChladniPlate2

### Shadertoy: Chladni plate simulation

GLSL fragment shader doing dynamic simulation / modal analysis directly on the GPU.

- **Shadertoy**: https://www.shadertoy.com/view/3sjfzz

### Kai Stale's Python Chladni simulator

Physics-based simulation of a clamped plate. Frequency response analysis.

- **Blog**: https://blog.kaistale.com/?p=1295
- **GitHub**: https://github.com/kai5z/Chladni-patterns

### Mark Serena's Unreal Engine Chladni material

Recreates Chladni patterns as a UE shader material based on Junichiro Horikawa's Houdini approach.

- **Blog post**: https://www.markserena.com/post/ue_chladni_material/

## The gap

Nobody combines:

1. **Authentic Tibetan structure** — most procedural generators don't even try; Zhang et al. is the only one
2. **Live tweakable parameters** — Zhang's tool is academic; mass-market tools are too generic
3. **Cymatic destruction phase** — every cymatic simulator stands alone; nothing destroys a mandala into one

This is the unclaimed corner. The two prototypes in `prototypes/` are the first attempt at filling it.

## Comparative table

| Project                | Tibetan-accurate | Tweakable | Cymatic phase | Web-ready |
|------------------------|------------------|-----------|---------------|-----------|
| Zhang et al. 2020      | Yes (Nyingma)    | Yes       | No            | No        |
| RandomMandala (PyPI)   | No               | Yes       | No            | No        |
| Priyanka WGAN-div      | Statistical only | Latent z  | No            | No        |
| RPH Studio             | No               | Minimal   | No            | Native    |
| OpenProcessing sketch  | No               | Mouse     | No            | Yes       |
| Modulo arithmetic      | No               | Math      | No            | Varies    |
| Schroffl chladni-sim   | N/A              | Audio     | Sim only      | Yes       |
| PettaBoy Chladni       | N/A              | Yes       | Sim only      | Yes       |
| **This project**       | Yes              | Yes       | Yes           | Yes       |

## Books and reference sources

Worth having on hand for iconographic accuracy:

- **Carmen Mensink's site** (Tibetan Buddhist Mandalas) — practical thangka-painter perspective on grid construction and proportion. https://www.mandala-painting.com/painted-mandalas/
- **Robert Beer, *The Encyclopedia of Tibetan Symbols and Motifs*** — comprehensive iconographic reference
- **Martin Brauen, *The Mandala: Sacred Circle in Tibetan Buddhism*** — academic overview of structure and meaning
- **Ngor Thartse Khenpo Sonam Gyatso & Tashi Tsering, *Tibetan Sacred Dance: A Journey into the Religious and Folk Traditions*** — context on associated cymatic / audio practices

Texts on the canonical proportional systems (the Indian iconometric tradition the thigtse grid descends from):

- *Pratimālakṣaṇa* — Sanskrit iconometric treatise
- *Citralakṣaṇa* — proportion canon attributed to Nagnajit

These aren't strictly necessary for v1 — Zhang et al's empirical proportions are sufficient. But if you ever want to deviate or extend, the canonical texts are where the proportions ultimately come from.
