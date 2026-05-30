---
role: devops
owner: Gerald (minikai)
status: active
last-updated: 2026-05-30
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
| 2026-05-30 | `registerType: "prompt"` + a "new version → Refresh" toast as the PWA update path | The toast never fired inside an installed iOS standalone PWA → the home-screen app stayed pinned to a stale build through any number of reloads. Switched to `autoUpdate` (skipWaiting + clientsClaim) + reg.update() polling on visibility |

## Lessons
- iOS standalone PWAs are stubborn about SW updates: even `autoUpdate` only takes once the OS fetches the new `sw.js`, and a force-refresh inside the installed app often won't trigger it. Escaping a stale build reliably needs a one-time manual reset (remove + re-add to Home Screen) or a normal Safari tab; deploy = gh-pages branch, NOT `main` (`npm run deploy`). — from the recurring stale-PWA dead end on 2026-05-30

## Open Questions
- [ ] Operator's installed iOS PWA repeatedly serves stale builds (force-refresh doesn't take) despite the autoUpdate SW. Document/automate the one-time remove-and-re-add reset, or add an in-app "build hash" badge + manual update button so staleness is visible and fixable without leaving the app? — owner: devops — since: 2026-05-30
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
