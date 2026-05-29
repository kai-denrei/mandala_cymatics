---
role: pm
owner: Gerald (minikai)
status: active
last-updated: 2026-05-29
---

# PM

## Scope
Goal definition, scope control, and the acceptance bar for "V1 finished". Owns the
mandate handed to the dispatched builder agent and the decision of when to stop.

## Decisions
| Date | Decision | Rationale | Linked roles |
|---|---|---|---|
| 2026-05-29 | V1 = dual-mode (static generator + cymatic vibrations) switchable on one page | Operator chose this over animation-only when asked | [[ux]] [[dev]] |
| 2026-05-29 | Port the proven prototype code, defer the full Zhang motif library | Prototypes are the validated baseline; "basic V1, look at it" favours working output over iconographic exactness | [[arch]] [[dev]] |
| 2026-05-29 | Dispatch one thorough builder agent rather than a parallel fan-out | Build is sequential (scaffold → port → UI → verify); singular per operator phrasing | [[dev]] |

## Dead Ends
<!-- APPEND ONLY. Never delete. -->
| Date | What was tried | Why it failed / was rejected |
|---|---|---|

## Lessons
<!-- Distilled principles from Dead Ends. Written to be read cold. -->

## Open Questions
- [ ] Dual-mode doubles the UI surface vs. the HANDOVER's "basic V1" framing. Is the static generator actually load-bearing for the art piece, or scope that delays the thing the operator wants to look at? — owner: pm — since: 2026-05-29
- [ ] "Until V1 finished" defines no human checkpoint between dispatch and done. Acceptance bar must be explicit or the agent cannot know when to stop. Proposed bar: typecheck clean + `vite build` clean + `vite preview` serves a page where (a) generator mode draws the mandala and all sliders respond, (b) vibrations mode runs the 6-phase loop with ▶/⏸/↻ working, (c) `+` reveals metrics/sliders, (d) the 3-shape version badge renders. — owner: pm/qa — since: 2026-05-29
- [ ] No git repository exists (`git status` failed). "Versioning control" was requested via cache-busting (build/asset tokens), which is distinct from source VCS. Should we `git init` so the work is recoverable? — owner: pm/devops — since: 2026-05-29

## Assumptions
- The operator's "versioning control … (3 shapes visuals)" means the cache-busting **visual version badge** (3 shape tiles + shape favicon keyed to the build token), not CDN cache headers — status: untested — since: 2026-05-29
- "Working V1 in localhost to look at" is satisfied by `vite dev`/`preview` on this Mac Mini; no deploy target exists, so server-side Cache-Control is out of scope — status: untested — since: 2026-05-29
- 15k particles at the prototype's W=400 internal resolution remain ~60fps when CSS-upscaled to a large hero canvas — status: untested — since: 2026-05-29

## Dependencies
Blocked by: builder agent completing the port
Feeds into: [[qa]] acceptance, [[devops]] versioning

## Session Log
- 2026-05-29 — Init. Challenged brief: dual-mode scope creep, undefined acceptance bar, missing git, badge-vs-headers ambiguity. Set proposed acceptance bar.
