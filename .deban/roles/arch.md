---
role: arch
owner: Gerald (minikai)
status: active
last-updated: 2026-05-30
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
| 2026-05-29 | Mic/cymatics model = pure Langevin dynamics: drift toward nodes (crisp −∇\|f\|·amp) + diffusion (jitter ∝ amp, with a constant thermal floor so it never vanishes at a node) + NO outward force + NO home/origin coupling. Drive amplitude = a fast-attack envelope on band-weighted mic energy gated by a windowed-min noise floor; pattern = top-3 spectrum→Chladni modes | Operator goal crystallised as "sand on a Chladni plate, in sync with real music." This is the physically faithful model; every other coupling we tried (below) broke it | [[dev]] [[ux]] |
| 2026-05-30 | **EPISODIC explode→settle→explode** replaces the continuous-equilibrium model for the mic feel. A strong onset (threshold ~0.22, ~1.1s refractory) (a) reseeds every grain to a uniform-random disc point in-shader (`uExplode`, sqrt-radius = area-uniform, zero velocity, colour preserved) AND (b) hard-snaps the Chladni modes to a new figure; BETWEEN pops the modes are FROZEN (`lastSpec`) and Flow/Scatter are low, so the cloud settles cleanly onto ONE figure before the next pop | The continuous Langevin model (force vs. diffusion vs. Flow) only ever reaches a muddy static equilibrium — "dies into predictable fault lines." Web + reference research (luciopaiva/chladni alternates resonant/non-resonant rounds; gregorybchris step ∝ \|f\| + minWalk; Phys Rev Research L032001 space-dependent diffusion) confirms the established effect is a position RESEED on frequency change, then descend. We were missing the reseed entirely | [[dev]] [[ux]] |

## Dead Ends
<!-- APPEND ONLY. Never delete. -->
| Date | What was tried | Why it failed / was rejected |
|---|---|---|
| 2026-05-29 | ONSET/beat detection (spectral flux on kick/clap bands, adaptive μ+Kσ threshold) as the mic→visual driver | Only fires on sharp transients → sustained music (violin) and kicks buried in dense mixes never trigger. "React to music" ≠ beat detection. Replaced by a continuous envelope follower |
| 2026-05-29 | HOME SPRING pulling particles to their mandala-seed origin during cymatic vibration | Unphysical — cymatics is memoryless about start position (new = current + field). The pull fights the migration to nodes and "snaps back to the picture." Removed in mic mode; reform stays an explicit ❉ action only |
| 2026-05-29 | Radial velocity KICK (outward impulse from centre on each beat/attack) | Once the home spring was removed there was nothing to counter the outward push → all sand piled at the disc boundary into a thin ring ("eclipse"). Real cymatics has NO outward driver |
| 2026-05-29 | ∇(f²) = −2f∇f Chladni force | Magnitude vanishes at the nodes (∝ f) → sand drifts in and settles fuzzily, never reaching sharp lines. Replaced by crisp −∇\|f\| = −sign(f)·∇f (constant pull right up to the line) |
| 2026-05-29 | Position-dependent jitter only (∝ \|f\|, zero at the nodes) | Made the nodal lines mathematically perfect/deterministic — a grain that reached a line stopped being perturbed. Real sand is stochastic (Langevin); added a constant thermal floor so diffusion never switches off |
| 2026-05-30 | Onset "Fling": a transient diffusion burst (per-band rises × gain) added to the noise on each onset, to "throw grains off the lines so they re-organise" | Too weak to read as an explosion, and the continuous force immediately re-converges the same grains onto the SAME lines → a morph/shimmer, not a burst. A diffusion *nudge* cannot substitute for a position reseed |
| 2026-05-30 | Mode "snap" on every beat (~0.2s refractory): coupler jumps to the current spectrum's modes each beat | Changes the target figure but particles only DRIFT toward it (no explosion), and snapping every 0.2s = continuous morph with no time to settle into a clean figure. Distinct figures need the mode change to coincide with a reseed AND be spaced far enough apart to settle (≈1s) |
| 2026-05-30 | Continuous "Flow" (`uLife`): an amp-independent jitter floor added every frame in mic mode, as anti-absorbing "temperature" so grains never fully settle | Backwards — continuous agitation MUDDIES the settle (a clean figure never forms; the field reads as a fuzzy permanent haze). Adding more agitation makes it dirtier, never more alive. Kept only as a small skitter floor; the liveness must come from the explode→settle CADENCE, not the noise level |
| 2026-05-30 | `uExplode` = TELEPORT every grain to a uniform-random disc point on a pop (the reference's position-reseed, research-recommended as "the canonical explode") | Operator: "no magical restoration in between" — a position reseed is non-physical. Real cymatics deforms FROM the previous state (grains on a plate kicked by a vibration, then settling); only a MANDALA CHANGE may reseed positions. Replaced with a one-frame random-direction VELOCITY impulse (grains fly off their current positions, then the new field gathers them) |

## Lessons
- Cymatic sand = Langevin: drift toward nodes (constant-magnitude −∇|f|) + diffusion that does NOT vanish at the attractor, with NO outward force and NO origin/home coupling. An outward push *or* a home spring, present without the other to balance it, drives particles to the boundary or freezes them onto a perfect curve. — from the edge-piling + perfect-line dead ends on 2026-05-29
- "React to music" is continuous, not event-based. Onset detection misses sustained tones and dense-mix kicks; an envelope follower on band energy reacts to both. — from the onset-detection dead end on 2026-05-29
- A *living* particle field is an EPISODIC limit cycle (reseed/explode → clean settle → reseed), not a tuned continuous force-vs-noise equilibrium. A continuous balance always lands on a static state; the liveness is the CADENCE. Adding agitation to "keep it alive" only muddies the settle. — from the Flow/Fling/snap dead ends on 2026-05-30
- The canonical Chladni-sand model is a stochastic random walk (step ∝ local |displacement|, with a minWalk floor) plus a periodic global RESEED on frequency change — not a deterministic force sim. When a long iteration "almost works but feels muddy," check whether you're missing an established episodic mechanism rather than re-tuning the continuous one. — from the same dead ends on 2026-05-30
- The product's physical metaphor outranks the reference technique. The canonical sims reseed positions on a beat, but "particles on a metal sheet" forbids teleport-restoration — every deformation must continue from the previous state, only a mandala change reseeds. Adapt the technique to the metaphor (reseed → velocity impulse), don't import it wholesale. — from the teleport-reseed dead end on 2026-05-30

## Open Questions
- [x] **RESOLVED 2026-05-30** The cymatic feel is "getting closer but not there yet" (operator, 2026-05-29). What MIX of variables yields a natural sand-on-plate feel? → It was never a variable-mix problem within the continuous model — the model itself was wrong. Research settled it: the natural feel is the EPISODIC explode→settle→explode cycle (reseed positions on a strong beat, then descend), not a tuned force/diffusion balance. See the 2026-05-30 Decision and the Flow/Fling/snap Dead Ends. (Candidates we cycled — drift, Scatter, Jitter, Flow, mode count, trail fade, AMP_GAIN — are now secondary tuning on top of the cycle.) Awaiting operator confirmation that the implemented cycle reads right on-device.
- [ ] Do we keep the full `motifs/{star,crescent,lotus,vajra,flame,gate}.ts` split now, or collapse into `mandala/render.ts` for V1 and split when the Zhang formulas land? — owner: arch — since: 2026-05-29

## Assumptions
- The prototype's simplified bezier motifs (not Zhang's closed-form equations) are acceptable visual fidelity for V1 — status: untested — since: 2026-05-29

## Dependencies
Blocked by: none
Feeds into: [[dev]]

## Session Log
- 2026-05-30 — Reframed the mic dynamics from continuous → EPISODIC. After more failed continuous tweaks (Fling, per-beat snap, continuous Flow — all muddy equilibrium, see Dead Ends), dispatched a research workflow; web + reference (luciopaiva/chladni, gregorybchris, Phys Rev Research) confirmed the canonical reseed-then-settle model. Implemented explode→settle→explode (`uExplode` disc reseed + frozen modes between pops + low Flow/Scatter). Closed the 2026-05-29 "variable mix" open question — it was a wrong-model problem. Awaiting on-device confirmation.
- 2026-05-29 — Cymatics physics model converged toward authentic Langevin sand-on-plate (drift −∇\|f\| + diffusion, memoryless, no outward force) across a long iterative session with the operator. Many couplings rejected (onset detection, home spring, outward kick, ∇(f²), ∝\|f\|-only jitter, EMA floor) — see Dead Ends. Feel still not fully natural; tomorrow: study other projects to settle the variable mix (Open Questions).
- 2026-05-29 — Init. Locked stack and module layout from CLAUDE.md; chose single-canvas + mode-manager pattern.
