# Mandala UX Reorganization — Design

Date: 2026-05-30
Status: approved (brainstorming → implementation)

## Goal

Four changes, one of them a genuine UX rethink:

1. Pin the mandala dead-center of the viewport — it never moves.
2. Make **Reform** usable at any point (remove the autoplay/listening lockout).
3. Reorganize controls around a clearer 2-axis model (who drives × what it hears),
   collapse the three reactivity tabs into one **Music** preset, and treat Settings
   as visually separate.
4. Show the live build token in the dashboard, on the "Cymatics" heading line.

## Mode model

Replace the old flat set (Autoplay toggle + separate Mic toggle + 3 reactivity tabs
`ohm`/`all-music`/`techno`) with **one radio of four states**:

| Mode      | Drives the field                              | Button            |
|-----------|-----------------------------------------------|-------------------|
| `manual`  | Human taps the gong (Strike)                  | none lit          |
| `autoplay`| App self-plays (simulated explode→settle)     | `#autoplay`       |
| `ohm`     | Mic, tuned for sustained voice/hum            | `#mode-ohm`       |
| `music`   | Mic, one universal preset (from `all-music`)  | `#mode-music`     |

- **Ohm / Music ARE the listening modes** — selecting one applies its tuning AND
  starts the mic; the standalone Mic button is removed. If mic permission is denied,
  fall back to `manual`.
- Clicking the already-active mode returns to `manual`.
- The `techno` preset data stays in `presets.ts` (unexposed) for easy revival.
- On boot: `manual`, with the `ohm` tuning pre-loaded into the panel sliders so the
  field has a sane tuning the instant a listening mode is chosen. No mode is restored
  from storage (a mic mode can't auto-start without a user gesture anyway).

## Lock rules (replaces `setAutoplay`/`setMicActive` button-disabling)

A single `applyLocks()` keyed off `mode`:

| Control                 | Enabled when            |
|-------------------------|-------------------------|
| Strike                  | `mode === "manual"`     |
| Random (Tibetan + Creative) | `mode !== "autoplay"` |
| **Reform**              | **always**              |
| Mode buttons, Settings  | always                  |

Strike is locked while listening because the mic, not the hand, drives the field
there (a manual strike would be a no-op in the mic path). It belongs to `manual`.

## Reform "at any point"

Reform currently can't preempt the mic/autoplay field source. Fix by giving an active
reform ramp **top priority** in the field-source chain and running its lifecycle
independently of mode:

```
// step 1 (timing): end the ramp when the window closes, regardless of mode
if (reformUntil !== 0 && now >= reformUntil) { reformUntil = 0; forceState = null; clear .is-reforming }
const reforming = reformUntil !== 0;
if (autoplay && !reforming) { ...autoplay pop/swap timing... }

// step 2 (field source):
if (reforming)      state = reformRamp(now);   // overrides mic + autoplay for REFORM_MS
else if (micActive) ...
else if (autoplay)  ...
else                ...gong/at-rest...
```

Reform handler loses its guard; if autoplay is active it also pushes `apNextPopAt`
past the ramp so autoplay resumes cleanly (shows the reformed figure, then pops).
`noisePulse` is zeroed while reforming so the field stays calm.

## Layout — fixed center + floating dock (overlay)

All chrome becomes `position: fixed` so the mandala never reflows:

```
.stage    position:fixed; inset:0; flex-center      → mandala wrapper dead-center
  .mandala-wrap  position:relative                  → sizes to canvas; anchors .readout
.gear     position:fixed; top-right; smaller         → Settings (reuses dashboard icon)
.dock     position:fixed; bottom-center; column      → .modes row + .actions row
.panel    position:fixed; bottom sheet; overlay      → opens OVER the dock, mandala stays put
```

- Dashboard opens as a bottom-sheet overlay (z above the dock); the mandala stays
  centered behind it — it is occluded, never moved.
- `body.idle` fades `.dock`, `.gear`, `.panel`, `.readout`; the canvas grows as before.
- Safe-area insets move onto `.gear` / `.dock` / `.panel` (the fixed children).
- Mobile canvas can grow (controls no longer take layout space): `min(94vmin, 72vh)`.

### Markup

```html
<div class="stage"><div class="mandala-wrap">
  <canvas id="glcanvas">…</canvas><canvas id="canvas" hidden></canvas>
  <div class="readout">…</div>
</div></div>
<button id="panel-toggle" class="gear" aria-expanded="false">…</button>
<div class="dock">
  <div class="modes"><button id="autoplay">…</button>
                     <button id="mode-ohm">…</button>
                     <button id="mode-music">…</button></div>
  <div class="actions"><button id="strike">…</button><button id="reform">…</button>
                       <button id="random-mandala">…</button>
                       <button id="random-creative">…</button></div>
</div>
<section class="panel" hidden>…</section>
```

## Icons (all existing webp; one becomes unused)

`#mode-ohm` → `ohm.webp`, `#mode-music` → `allmusic.webp`, `#autoplay` →
`autoplay.webp`/`pause.webp`, actions keep their icons, Settings keeps
`dashboard.webp`/`minus.webp`. `mic.webp` and the `#tab-*` rules are removed.

## Build token in dashboard

Wrap the first heading in a flex row and right-align a dim version stamp read at
runtime from `<meta name="cb">` (so it always matches the deployed build):

```html
<div class="panel-head"><h2 class="panel-h">Cymatics</h2>
  <span class="build-tag" id="build-tag"></span></div>
```
`$("build-tag").textContent = document.querySelector('meta[name=cb]')?.content ?? ""`.

## Out of scope

No new icon assets, no audio-engine changes, no change to the cymatics physics or
pattern generators. The `techno` preset is retained but unexposed.

## Verification

`npm run typecheck` clean; `npm run build` clean; manual smoke on desktop + the
deployed gh-pages build on mobile (mandala centered & static, reform works in every
mode, mode radio behaves, settings overlay, version stamp shows the live token).
