---
role: qa
owner: Gerald (minikai)
status: active
last-updated: 2026-05-29
---

# QA

## Scope
Acceptance criteria and verification. Owns the definition of "V1 works" and the
evidence required before claiming it.

## Decisions
| Date | Decision | Rationale | Linked roles |
|---|---|---|---|
| 2026-05-29 | Verification = evidence, not assertion: `tsc --noEmit` output, `vite build` output, and an actual page load on `vite preview` | Avoid claiming success without the artifact | [[dev]] [[devops]] |

## Dead Ends
<!-- APPEND ONLY. Never delete. -->
| Date | What was tried | Why it failed / was rejected |
|---|---|---|

## Lessons

## Open Questions
- [ ] Headless verification of the canvas animation is hard. Is "build green + page serves + DOM nodes present" sufficient, or does the operator want a screenshot? — owner: qa — since: 2026-05-29

## Assumptions
- Visual correctness will be confirmed by the operator looking at localhost; automated checks cover build/typecheck/DOM presence only — status: untested — since: 2026-05-29

## V1 acceptance checklist
- [x] `npm run typecheck` exits 0
- [x] `npm run build` exits 0
- [x] `npm run preview` serves the page (HTTP 200, title "Mandala Cymatic Vibrations") — verified via `vite` dev server: `/`, `/src/main.ts`, `/styles.css`, `/cb-shapes/07.svg`, `/cb-badge.js`, all cymatics modules → 200; title tag present
- [ ] Generator mode: mandala draws; order/ring-depth/hue/complexity/authenticity/palette sliders all respond; PNG download works  <!-- visual, operator -->
- [ ] Vibrations mode: 6-phase loop animates; ▶/⏸ toggles; ↻ restarts; ✦/❉ force explode/reform  <!-- visual/animation, operator -->
- [ ] `+` reveals the dashboard (metrics in vibrations, sliders in generator); collapsed by default  <!-- visual, operator -->
- [ ] 3-shape version badge + shape favicon render and reflect the build token  <!-- visual, operator; build fingerprinted v=9c19e2b9 -->
- [ ] No console errors on load  <!-- runtime, operator -->
- [ ] GPU backend: vibrations mode shows particles on `#glcanvas` (WebGL); `#cy-count` ~200k; runs smoothly (target 60fps)  <!-- GPU/visual, operator only — cannot verify headlessly -->
- [ ] GPU backend: the self-playing gong (🔔/🔊) and scripted phase loop still drive the particles (amp/m/n/home react); ⏸/↻/✦/❉ work  <!-- GPU/visual, operator -->
- [ ] Particle-count select (50k–200k) re-seeds without errors  <!-- GPU/visual, operator -->
- [ ] CPU fallback still works (force-disable WebGL): vibrations shows particles on `#canvas` at 400px  <!-- fallback, operator -->
- [ ] Generator mode unchanged (pixel-identical to before)  <!-- visual, operator -->

## Dependencies
Blocked by: [[dev]]
Feeds into: [[pm]] sign-off

## Session Log
- 2026-05-29 — Verified GPU-backend build: `npm run typecheck` exit 0, `npm run build` exit 0 (fingerprinted v=5add66fe). Dev server serves /, /src/main.ts, /src/cymatics/gpu.ts, /styles.css all 200; title present; `#glcanvas` + `#cy-particles` present in served HTML; gpu.ts transforms cleanly through Vite. UNVERIFIED HEADLESSLY (no GPU/display in this shell): live WebGL render, 60fps at 200k, that the gong actually drives the GPU particles, CPU-fallback visual, generator-mode parity. All flagged for operator eyeball. CPU fallback path preserved unchanged + guarded by try/catch so a GPU failure can never blank the canvas.
- 2026-05-29 — Verified cymatic engine build: `npm run typecheck` exit 0, `npm run build` exit 0 (fingerprinted v=9c19e2b9). Dev server serves all asset paths 200 (/, /src/main.ts, /styles.css, /cb-shapes/07.svg, /cb-badge.js, /src/cymatics/*.ts) and title tag present. Animation/visual + console-error checks left for operator (headless canvas can't be screenshotted here).
- 2026-05-29 — Init. Authored V1 acceptance checklist.
