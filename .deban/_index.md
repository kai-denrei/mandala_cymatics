---
project: Mandala Cymatic Vibrations
created: 2026-05-29
status: active
mode: solo
stale_threshold_days: 30
---

# Mandala Cymatic Vibrations — Index

## Brief
A local web app (Vite + TypeScript strict, Canvas2D) that renders a procedural
Tibetan-style mandala on the canonical thigtse 24-unit grid with Five Buddhas
colour, and a cymatic "vibrations" pass that disassembles the mandala into
~15k particles flowing between the mandala form and square-plate Chladni nodal
patterns. V1 ships **dual-mode**: a static parametric *generator* and the
animated *vibrations*, switchable on one page. Large mandala art is the main
piece; the dashboard is minimalistic (unicode transport glyphs), with metrics
and parametric sliders tucked behind a `+`. Cache management + build versioning
via the cache-busting toolkit, including its 3-shape visual version badge.

## Active Roles
- [[dev]] — owner: Gerald (minikai)
- [[arch]] — owner: Gerald (minikai)
- [[pm]] — owner: Gerald (minikai)
- [[ux]] — owner: Gerald (minikai)
- [[qa]] — owner: Gerald (minikai)
- [[devops]] — owner: Gerald (minikai)

## Key Decisions
<!-- Cross-role summary, maintained by COMPACT -->
- 2026-05-29 — Stack: Vite + TS strict, Canvas2D, plain HTML, no extra libs for V1. See [[arch]].
- 2026-05-29 — V1 = dual-mode (generator + vibrations) on one page, not animation-only. See [[pm]], [[ux]].
- 2026-05-29 — Port the **prototype** render/physics (proven baseline), not the full Zhang motif library — that is deferred past V1. See [[dev]], [[arch]].
- 2026-05-29 — Cache-busting toolkit installed for build versioning + 3-shape badge; server-side Cache-Control layer is moot for a local-only app. See [[devops]].
- 2026-05-29 — Renamed "Cymatic Mandala Explosion" → "Mandala Cymatic Vibrations". See [[ux]].

## Open Questions (cross-role)
- [ ] Does the dual-mode scope delay the "look at it" goal vs. animation-first? — owner: pm — since: 2026-05-29
- [ ] What is the explicit acceptance bar for "V1 finished"? — owner: pm/qa — since: 2026-05-29
