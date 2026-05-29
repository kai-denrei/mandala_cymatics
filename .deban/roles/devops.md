---
role: devops
owner: Gerald (minikai)
status: active
last-updated: 2026-05-29
---

# DevOps

## Scope
Build tooling, dev/preview servers, and cache/version management. Owns the
cache-busting integration and the `npm` script surface.

## Decisions
| Date | Decision | Rationale | Linked roles |
|---|---|---|---|
| 2026-05-29 | Scripts: `dev`, `build`, `preview`, `typecheck` (per CLAUDE.md) | Conventional Vite surface | [[dev]] |
| 2026-05-29 | cache-busting installed via skill `install.sh`; badge SVG-only | `cairosvg`/libcairo and `fswatch` absent on host — SVG badge + polling watch are sufficient | [[pm]] |
| 2026-05-29 | `vite.config.ts` runs `scripts/bust.sh` on production `buildStart` only (dev keeps a stable token) | Per cache-busting Vite integration recipe | [[arch]] |
| 2026-05-29 | Server-side Cache-Control layer skipped | Local-only app, no CDN/deploy target — the real value here is the version token + 3-shape badge | [[pm]] |

## Dead Ends
<!-- APPEND ONLY. Never delete. -->
| Date | What was tried | Why it failed / was rejected |
|---|---|---|

## Lessons

## Open Questions
- [ ] Wire `bust.sh` into a git post-commit hook once git is initialized? Depends on the open git decision in [[pm]]. — owner: devops — since: 2026-05-29

## Assumptions
- The badge's `?v=` fingerprinting on `public/styles.css` is the visible proof-of-bust for this local app — status: untested — since: 2026-05-29

## cache-busting install record
- installed: 2026-05-29 (skill `install.sh --no-webp`, badge SVG-only)
- runner: `scripts/bust.sh`
- fingerprinter: `scripts/fingerprint-urls.py`
- badge: `public/cb-badge.js`; shape cells: `public/cb-shapes/`
- on resume: if `scripts/bust.sh` is missing, re-run install.sh (idempotent)

## Dependencies
Blocked by: none
Feeds into: [[qa]]

## Session Log
- 2026-05-29 — Init. Recorded cache-busting integration plan and npm script surface.
