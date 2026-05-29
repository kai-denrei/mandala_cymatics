---
role: dev
owner: Gerald (minikai)
status: active
last-updated: 2026-05-29
---

# Development

## Scope
Implementation: porting the two prototypes into typed modules, wiring the dual-mode
UI, and getting typecheck + build green.

## Decisions
| Date | Decision | Rationale | Linked roles |
|---|---|---|---|
| 2026-05-29 | Port `mandala-generator.html` draw fns verbatim into `mandala/render.ts`, typed via `MandalaParams` | Proven output; mechanical port reduces risk | [[arch]] |
| 2026-05-29 | Port `cymatic-explosion.html` physics into `cymatics/chladni.ts` + `particles.ts` + `stage.ts` (6-phase choreography) | Keeps pure physics separate from the rAF/render loop | [[arch]] |
| 2026-05-29 | Unicode transport glyphs: ▶ play · ⏸ pause · ↻ restart · ✦ force-explode · ❉ force-reform · + expand | Operator asked for unicode over words | [[ux]] |
| 2026-05-29 | Reforming phase uses `home1:0.12` (prototype value), not 0 as the docs table implies; docs table is illustrative, prototype is canonical | Brief says "values EXACTLY as in the prototype" → prototype wins | [[qa]] |
| 2026-05-29 | Offscreen sampling canvas uses `willReadFrequently:true`; sample on every `enterVibrate` using current generator params/hue/palette | Avoids getImageData perf warning; switching modes re-samples live (resolves the open question toward "re-sample on switch") | [[qa]] |
| 2026-05-29 | Added a WebGL (regl) GPU particle backend (`cymatics/gpu.ts`) as the DEFAULT for vibrations (~200k pts); CPU ImageData path kept as fallback, unchanged | docs/02-cymatics.md "Performance notes" plan; 50k CPU ceiling vs 200k target. Additive — never replaces the field-state driver | [[qa]] [[arch]] |
| 2026-05-29 | Two-canvas DOM: `#canvas` (2D, generator) + `#glcanvas` (WebGL, vibrations); toggle `hidden` per mode | A single canvas cannot hold both a 2D and a WebGL context. Generator stays pixel-identical on its own 2D canvas | [[arch]] |
| 2026-05-29 | Gong = bowl-leaning Tibetan timbre (6 inharmonic partials incl. bell-tierce, abs-Hz beating, no glide, sub-octave boom, dark 8s convolver reverb), NOT the 24-partial temple/tam-tam recipe | Temple recipe reads as orchestral wash + ~38 osc/strike stacks dangerously in the ambient loop; bowl is authentic, pleasant, cheap. The 5% glide + sub-100Hz fundamental were the "synth" tells — removed/raised | [[ux]] |
| 2026-05-29 | Cymatics now a multi-mode Chladni superposition: `read()` peak-picks live FFT partials → maps each by frequency-ratio to a mode (√(m²+n²)) → weighted sum (Σw=1) drives field f & ∇f in BOTH GLSL and CPU | Makes the pattern reflect the actual spectrum and simplify as the tail decays. Σw=1 keeps force ~single-mode so STR=0.45 stays valid; scripted loop is the K=1 case (back-compat) | [[arch]] [[qa]] |
| 2026-05-29 | Colorless glyphs: ✷ strike · ●/○ self-play toggle · ⚄ random · ▶/⏸ hardened with VS15 (U+FE0E) | Operator: remove colorful emoji. Chosen glyphs have no emoji presentation; ●/✷ distinct from generator ◉ | [[ux]] |
| 2026-05-29 | Post-review fixes: tanh WaveShaper soft-clip ceiling + hard-knee/fast limiter + lower bus gain (no onset hard-clip); `gong.suspend()` on audio-off (context hygiene); mallet tc 0.012→0.006; deleted dead `chladni.ts` | Adversarial review (workflow) confirmed these 4; coupling-math/glyph/build dimensions passed 0 issues | [[qa]] |
| 2026-05-29 | Particle state packed as ONE RGBA float texture `[pos.x,pos.y,vel.x,vel.y]`, ping-ponged; origin + color in static float textures | Avoids needing WEBGL_draw_buffers / MRT to update pos+vel in one pass; one physics pass, one texel per particle (texSize=ceil√count) | [[arch]] |
| 2026-05-29 | Feature-detect = build a real 4×4 float framebuffer and check FRAMEBUFFER_COMPLETE on a throwaway canvas (WebGL2+EXT_color_buffer_float, or WebGL1+OES_texture_float+WEBGL_color_buffer_float/half-float) | Drivers advertise float extensions but fail the actual render; probing the framebuffer is the only honest test. Throwaway canvas because a context is permanent once acquired | [[qa]] |
| 2026-05-29 | Importance sampling reaches the requested count: gather pixels with dist>1500, then sample WITH REPLACEMENT + sub-pixel jitter (origin stays exact) to fill up to N when bright pixels < N | GPU wants a fixed large population; duplicating with jitter avoids a visible grid while keeping crisp reformation | [[qa]] |
| 2026-05-29 | GPU init/seed and the per-frame step/draw are wrapped in try/catch that destroys the GPU instance and drops to the CPU path | "Never leave a blank canvas" — a probe can pass yet a later command throw on a quirky driver | [[qa]] |
| 2026-05-29 | Particle-count select (50k/100k/150k/200k, default 200k) added to the vibrations `+` panel; re-seeds the GPU on change; no-op on CPU (count is sampling-fixed) | Operator control over GPU load without touching the field driver | [[ux]] |

## Dead Ends
<!-- APPEND ONLY. Never delete. -->
| Date | What was tried | Why it failed / was rejected |
|---|---|---|

## Lessons

## Open Questions
- [ ] Should generator-mode parameter changes re-sample the particle set live when switching to vibrations, or only on explicit re-sample? — owner: dev — since: 2026-05-29

## Assumptions
- `vite build` + `tsc --noEmit` both pass with strict mode on the ported code — status: untested — since: 2026-05-29

## Dependencies
Blocked by: [[arch]] module layout (done)
Feeds into: [[qa]]

## Session Log
- 2026-05-29 — Deep-Tibetan-gong + audio-reactive cymatics + colorless glyphs (ultracode, workflow-driven). Research/design workflow → spec; implemented as single writer: rewrote `gong.ts` (bowl/bell synth + multi-mode FFT `read()`), generalized the field to a weighted multi-mode superposition in `gpu.ts` GLSL (uM/uN/uW[8]+uModeCount) and `particles.ts` CPU loop, plumbed `modes` through `stage.ts`/`types.ts`/`main.ts`, swapped glyphs (✷ ●/○ ⚄, VS15 on ▶/⏸). Adversarial review workflow (27 agents) → 4 confirmed issues, all fixed (tanh soft-clip ceiling, ctx suspend, mallet tc, removed dead `chladni.ts`); coupling-math/glyph/build dimensions 0 issues. typecheck+build green (15 modules); localhost serves; no colored emoji. GPU render + gong timbre pending operator ears/eyes.
- 2026-05-29 — GPU particle backend added. New `cymatics/gpu.ts` (regl): `GpuParticles` class with init/seed/step/draw/destroy + `isGpuSupported()` float-framebuffer probe + `buildSeed()` importance sampler. GLSL ports chladni()/gradChladni() + the EXACT CPU physics (STR=0.45, NOISE=0.6, damping 0.91, *dt*60, boundary -0.3, home spring); state = one ping-ponged RGBA float texture [pos,vel], origin/color static. Two-canvas DOM (`#canvas` 2D / `#glcanvas` WebGL) toggled per mode; generator untouched. Wired into main.ts: GPU is the default when supported, CPU ImageData path is the fallback — SAME `state` (scripted getState OR gong.read()) drives both. Added a 50k/100k/150k/200k particle select to the vibrations panel. typecheck + build green; dev server serves /, /src/main.ts, /src/cymatics/gpu.ts, /styles.css = 200. NOTE: live GPU render + 60fps NOT verifiable headlessly — operator must eyeball in a real browser. `npm install regl` (^2.1.1).
- 2026-05-29 — Gong audio + rename: new `cymatics/gong.ts` (WebAudio additive synth — inharmonic partials 1..12×, 5% glide, beating, low boom; lowpass + compressor/limiter for "pleasant"; AnalyserNode FFT → field state per docs/02-cymatics.md, with a quiet-time home pull so the mandala reforms between strikes; self-playing ambient re-strike every 6–12s on a pentatonic set). Wired into main.ts as a third state driver (`audioMode`): 🔔 strike + 🔊/🔇 toggle; AudioContext started inside the click handlers (autoplay policy). Renamed ✦ "Force explode" → "Vibrate". typecheck + build green.
- 2026-05-29 — Cymatic engine implemented: created `cymatics/{chladni,stage,particles}.ts` (pure), replaced the vibrations STUB in `main.ts` with a real offscreen-sample + rAF loop (reused ImageData buffer, willReadFrequently offscreen ctx) and live transport (⏸/▶, ↻, ✦, ❉). Ported verbatim from `cymatic-explosion.html`. typecheck + build green; localhost serves all assets 200.
- 2026-05-29 — Init. Foundation scaffolded (config, index.html shell, palette/grid/render port). Vibrations mode + dual-mode wiring delegated to builder agent.
