# Claude Code conventions — mandala-cymatics

Project context, conventions, and operational guidance for Claude Code sessions in this repository.

## Project in one line

Procedural Tibetan mandala generator with a cymatic destruction phase, built as a web app.

## Always read first

Before suggesting any structural change, read in this order:
1. `HANDOVER.md` — current state, next steps, open decisions
2. `docs/01-architecture.md` — system design
3. `docs/02-cymatics.md` — physics
4. Whichever prototype is relevant to the current task

## Aesthetic and accuracy principles

- **Spirit over letter** — accuracy to canonical Tibetan structure (thigtse 24-unit grid, Five Buddhas palette, ring stack, four-gate palace) matters more than perfect iconographic reproduction. We're building a tool, not a sacred object.
- **Five Buddhas palette is canonical** — `#F2EBD8` (white/east), `#E8B83D` (yellow/south), `#C73A2A` (red/west), `#2E7D5C` (green/north), `#2D4A8C` (blue/centre). All other palettes are rotations or substitutions of this 5-slot primitive.
- **Grid as substrate** — `w = W/24` is the only magic number. All radii, motif sizes, and gate dimensions are integer or half-integer multiples of `w`.
- **No PII** — never include personal names, identifiers, or specific personal details in source files, comments, or commits. Keep all output anonymous and generic.

## Tech stack

- **TypeScript** strict mode, ESM, target ES2020+
- **Vite** for dev server and build
- **Canvas2D** for v1 rendering (both static mandala and animated cymatic)
- **regl** when WebGL offload is needed (>50k particles)
- **WebAudio API** + Tone.js for audio coupling
- No external math libs — Bessel functions via precomputed lookup table

Do not introduce: lodash (use native), moment/dayjs (no dates here), styled-components or CSS-in-JS, jQuery, any animation library (rAF is enough), any UI kit unless explicitly approved.

## File layout

```
src/
├── grid.ts                    # thigtse 24-unit grid, brahma lines
├── motifs/
│   ├── star.ts                # Zhang star: (Rs, ns, d, r, m)
│   ├── crescent.ts            # Zhang crescent: (Rc, h1, w1, h2, w2)
│   ├── lotus.ts               # Zhang lotus: B-spline through 9 control points
│   ├── vajra.ts               # diamond/chevron ring
│   ├── flame.ts               # stylized flame tongue
│   └── gate.ts                # T-shaped torana
├── rings.ts                   # ring stack composition (outside-in)
├── palette.ts                 # Five Buddhas + variations
├── renderer/
│   ├── canvas2d.ts            # baseline renderer
│   ├── svg.ts                 # for print/export
│   └── webgl.ts               # particle phase (regl)
├── cymatics/
│   ├── chladni-square.ts      # f(x,y) = cos(mπx)cos(nπy) ∓ cos(nπx)cos(mπy)
│   ├── chladni-circular.ts    # Bessel-based polar version
│   ├── particles.ts           # Poisson sampling, position/velocity state
│   ├── audio.ts               # WebAudio FFT → mode coupling
│   └── stage.ts               # phase choreography
├── ui/
│   ├── controls.tsx           # sliders (React or plain HTML)
│   └── presets.ts             # saved configurations
├── types.ts                   # shared types
└── main.ts                    # entry point
```

## Conventions

- **Pure math modules** — anything in `motifs/`, `cymatics/`, `grid.ts`, `palette.ts` must be pure: input → output, no side effects, no DOM, no canvas. Rendering is a separate concern.
- **Path generation, not painting** — motif functions return `Path2D` objects (or arrays of them) plus paint metadata `{fill, stroke, lineWidth}`. The renderer decides how to paint.
- **Same module for Canvas2D and SVG** — `Path2D` plus a serializer to SVG `d` strings means one motif library serves both renderers.
- **Parameter objects, not positional args** — `lotus({ Rf, np, controls })`, not `lotus(Rf, np, controls)`. Sliders bind to typed parameter objects.
- **Numbers are tabular** — any number that hits the screen goes through `.toFixed()` or `.toLocaleString()` so float artifacts don't leak.

## Common commands

```bash
npm run dev           # vite dev server, hot reload
npm run typecheck     # tsc --noEmit
npm run build         # production build
npm run preview       # serve dist locally
```

## When uncertain

- **Math questions** — `docs/02-cymatics.md` has the equations explicitly.
- **What does ring X look like?** — open the prototype HTML in a browser, set the sliders, look.
- **What's the proportion for X?** — Zhang et al 2020 § corresponding to the motif. Tables in `docs/01-architecture.md`.
- **Should I add this feature?** — if it's not in HANDOVER.md "Next steps", ask before implementing.

## Out of scope (do not pursue without explicit ask)

- Multi-deity iconography (this is interior mandala only)
- Three-dimensional mandalas (palaces with elevation)
- Mandala recognition / classification from images
- Mobile-specific UI (desktop browser is the target)
- Multi-user collaboration features
- Server backend of any kind — this is a pure client-side app
