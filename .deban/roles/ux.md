---
role: ux
owner: Gerald (minikai)
status: active
last-updated: 2026-05-29
---

# UX

## Scope
The minimalistic dashboard, mode switching, and the "art-first" composition. Owns
the rule that the mandala dominates and chrome stays out of the way.

## Decisions
| Date | Decision | Rationale | Linked roles |
|---|---|---|---|
| 2026-05-29 | Title is "Mandala Cymatic Vibrations" (renamed from "Cymatic Mandala Explosion") | Operator instruction | [[pm]] |
| 2026-05-29 | Large mandala is the hero (`min(72vmin, 720px)`); chrome is a thin top bar (title + mode toggle) and a thin bottom transport bar | Art-first; "dashboard minimalistic" | [[arch]] |
| 2026-05-29 | Metrics (phase, mode m,n, amplitude, particle count, progress) AND parametric sliders live behind a single `+` toggle, collapsed by default | Operator: "dashboard metrics hidden behind +" | [[dev]] |
| 2026-05-29 | Transport uses unicode glyphs, not words: ▶ ⏸ ↻ ✦ ❉ + | Operator: "use unicode where available rather than words" | [[dev]] |
| 2026-05-29 | Mode toggle labelled with glyphs too: ◉ generator · ∿ vibrations | Consistency with the unicode rule | [[dev]] |
| 2026-05-29 | Renamed the ✦ trigger "Force explode" → "Vibrate" (forceState name "Forced" → "Vibrating") | Operator: replace "Explode" with "vibrate"; aligns with the away-from-"explosion" naming | [[dev]] |
| 2026-05-29 | Added gong controls to vibrations transport: 🔔 strike, 🔊/🔇 self-playing toggle (emoji are unicode, glyph-consistent) | Operator wants a self-playing ambient gong driving the deformation | [[dev]] |

## Dead Ends
<!-- APPEND ONLY. Never delete. -->
| Date | What was tried | Why it failed / was rejected |
|---|---|---|

## Lessons

## Open Questions
- [ ] Should the `+` panel content differ per mode (sliders in generator, metrics in vibrations) or show a unified panel? Current plan: per-mode. — owner: ux — since: 2026-05-29

## Assumptions
- Glyph-only controls are legible enough without tooltips; add `title`/`aria-label` for accessibility — status: untested — since: 2026-05-29

## Dependencies
Blocked by: none
Feeds into: [[dev]]

## Session Log
- 2026-05-29 — Iteration: renamed ✦ Explode→Vibrate; added 🔔 strike + 🔊/🔇 self-playing gong toggle; particle-count select in the vibrations `+` panel (from the WebGL work).
- 2026-05-29 — Init. Set art-first composition, unicode transport, `+`-collapsed dashboard, title rename.
