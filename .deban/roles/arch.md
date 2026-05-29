---
role: arch
owner: Gerald (minikai)
status: active
last-updated: 2026-05-29
---

# Architecture

## Scope
System design, module boundaries, and the stack. Owns the `src/` layout and the
rule that math/draw modules stay pure and renderer-agnostic where practical.

## Decisions
| Date | Decision | Rationale | Linked roles |
|---|---|---|---|
| 2026-05-29 | Vite + TS strict, ESM, ES2020+, Canvas2D, plain HTML controls, zero runtime deps for V1 | Mandated by CLAUDE.md; "basic, local" reinforces minimum bundle | [[dev]] [[devops]] |
| 2026-05-29 | Module layout: `palette.ts`, `grid.ts`, `mandala/render.ts` (static draw), `cymatics/{chladni,particles,stage}.ts`, `ui/`, `types.ts`, `main.ts` | Mirrors CLAUDE.md file layout; separates pure math/draw from DOM/UI | [[dev]] |
| 2026-05-29 | Cymatic physics renders at internal W=400 (ImageData), CSS-upscaled to the large hero; static generator draws at full hero resolution | Matches prototype perf envelope; ImageData blit is the bottleneck | [[dev]] [[qa]] |
| 2026-05-29 | One canvas element reused across both modes; a mode manager owns the rAF loop | Avoids two live canvases competing for frames | [[ux]] [[dev]] |

## Dead Ends
<!-- APPEND ONLY. Never delete. -->
| Date | What was tried | Why it failed / was rejected |
|---|---|---|

## Lessons

## Open Questions
- [ ] Do we keep the full `motifs/{star,crescent,lotus,vajra,flame,gate}.ts` split now, or collapse into `mandala/render.ts` for V1 and split when the Zhang formulas land? — owner: arch — since: 2026-05-29

## Assumptions
- The prototype's simplified bezier motifs (not Zhang's closed-form equations) are acceptable visual fidelity for V1 — status: untested — since: 2026-05-29

## Dependencies
Blocked by: none
Feeds into: [[dev]]

## Session Log
- 2026-05-29 — Init. Locked stack and module layout from CLAUDE.md; chose single-canvas + mode-manager pattern.
