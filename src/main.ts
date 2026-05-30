// Entry point. One mode: a live cymatic particle field whose source is any
// pattern generator. At rest the cloud IS the pattern; the gong vibrates it.
//
// Each gong sets an "excitation" impulse (=1) that decays fast: the particles
// are jolted toward the live nodal pattern, then settle to rest — they do NOT
// drift while the long gong tail rings. The next gong re-jolts. Jolt/Settle/
// Decay/Jitter are live dashboard controls. Autoplay self-strikes and reforms
// only after several gongs (∫excitation·dt) have nearly erased the pattern.

import type { PatternParams } from "./pattern/types";
import { DEFAULT_PARAMS } from "./pattern/types";
import type { PhysicsState, Particle, PhysicsConfig, ModeWeight } from "./types";
import { BG_RGB } from "./grid";
import { resolvePalette } from "./palette";
import { byId } from "./pattern/registry";
import { randomTibetan, randomCreative } from "./pattern/random";
import type { RandomPick } from "./pattern/random";
import { renderWithGuard } from "./pattern/coverage";
import { GongEngine } from "./cymatics/gong";
import { MicEngine, type MicDrive } from "./cymatics/mic";
import { DEFAULT_PRESET_ID, presetById, type ReactivityPreset } from "./ui/presets";
import { sampleParticles, step } from "./cymatics/particles";
import { GpuParticles, isGpuSupported, buildSeed } from "./cymatics/gpu";
import { registerSW } from "virtual:pwa-register";

const GPU_W = 512; // GPU field + sampling resolution
const CYMATIC_W = 400; // CPU-fallback resolution (CSS-upscaled)
const GPU_DEFAULT_COUNT = 200000;

const REFORM_MS = 3500; // manual reform ramp length
const REFORM_HOME = 0.18;
const REST_EPS = 0.002; // excitation below this = at rest (single threshold, no dead band)

// Autoplay = self-driving explode→settle show (no gong): a random mandala bursts
// 2–5× (each pop scatters the cloud → it settles onto a new cymatic figure), then
// a fresh random mandala appears, repeat.
const AP_MIN_POPS = 2;
const AP_MAX_POPS = 5;
const AP_SETTLE_MS = 2400; // dwell between pops — let the figure rest, not rushed
const AP_MANDALA_DWELL = 2600; // show the fresh intact mandala before the bursts begin
const AP_AMP = 1.2; // drive amplitude (force toward nodes) during autoplay
const AP_DIFFUSE = 0.1; // low steady diffusion → crisp settle
const AP_LIFE = 0.03; // tiny continuous skitter

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
}

// ---- Sparklines (HUD) ----------------------------------------------------
// A tiny rolling line/area trace on a canvas. Each holds a normalized 0..1 ring
// buffer; it auto-scales to its own recent max so the SHAPE of the signal is
// always legible (the numeric readout beside it carries the absolute value).
class Sparkline {
  private g: CanvasRenderingContext2D;
  private buf: number[] = [];
  private w = 0;
  private h = 0;
  private dpr = 1;
  constructor(private canvas: HTMLCanvasElement, private cap = 120, private color = "#c9a96e") {
    this.g = canvas.getContext("2d")!;
  }
  private fit(): void {
    const r = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  push(v: number): void {
    this.buf.push(Number.isFinite(v) ? Math.max(0, v) : 0);
    if (this.buf.length > this.cap) this.buf.shift();
  }
  draw(): void {
    this.fit();
    const { g, w, h, buf, cap } = this;
    g.clearRect(0, 0, w, h);
    if (buf.length < 2) return;
    let max = 0.04; // floor so a silent (flat-zero) trace stays pinned to the baseline
    for (const v of buf) if (v > max) max = v;
    const x = (i: number) => (i / (cap - 1)) * w;
    const y = (v: number) => h - (v / max) * (h - 1.5) - 1;
    g.beginPath();
    g.moveTo(x(0), y(buf[0]));
    for (let i = 1; i < buf.length; i++) g.lineTo(x(i), y(buf[i]));
    g.strokeStyle = this.color;
    g.lineWidth = 1;
    g.stroke();
    g.lineTo(x(buf.length - 1), h);
    g.lineTo(x(0), h);
    g.closePath();
    g.globalAlpha = 0.13;
    g.fillStyle = this.color;
    g.fill();
    g.globalAlpha = 1;
  }
}

// Signal id → (canvas id, colour). Bands tinted low→warm, high→cool.
const SPARK_DEFS: [string, string, string][] = [
  ["amp", "spk-amp", "#c9a96e"],
  ["db", "spk-db", "#9990a8"],
  ["bass", "spk-bass", "#d0875a"],
  ["mid", "spk-mid", "#c9a96e"],
  ["treble", "spk-treble", "#6fa8c0"],
  ["react", "spk-react", "#d2607a"],
  ["centroid", "spk-centroid", "#8ab06f"],
  ["flatness", "spk-flatness", "#8c7fc0"],
];
const sparks: Record<string, Sparkline> = {};
for (const [key, cid, color] of SPARK_DEFS) {
  sparks[key] = new Sparkline($<HTMLCanvasElement>(cid), 120, color);
}

// Live readout: push normalized values to the sparklines + set the numbers.
// Only called when the dashboard is open (drawing is the only real cost).
function updateHud(stateAmp: number, md: MicDrive | null): void {
  sparks.amp.push(Math.min(1, stateAmp / AMP_CLAMP));
  if (md) {
    $("sig-db").textContent = md.db.toFixed(0);
    $("sig-bass").textContent = md.bass.toFixed(2);
    $("sig-mid").textContent = md.mid.toFixed(2);
    $("sig-treble").textContent = md.treble.toFixed(2);
    $("sig-react").textContent = md.react.toFixed(2);
    $("sig-centroid").textContent = md.centroid.toFixed(2);
    $("sig-flatness").textContent = md.flatness.toFixed(2);
    sparks.db.push(Math.max(0, Math.min(1, (md.db + 80) / 80))); // −80dB..0 → 0..1
    sparks.bass.push(md.bass);
    sparks.mid.push(md.mid);
    sparks.treble.push(md.treble);
    sparks.react.push(Math.min(1, md.react));
    sparks.centroid.push(md.centroid);
    sparks.flatness.push(md.flatness);
  } else {
    // Mic off: zero the traces so they decay to the baseline (don't freeze).
    for (const k of ["db", "bass", "mid", "treble", "react", "centroid", "flatness"]) sparks[k].push(0);
  }
  for (const k in sparks) sparks[k].draw();
}

const canvas = $<HTMLCanvasElement>("canvas"); // CPU-fallback 2D surface
const glCanvas = $<HTMLCanvasElement>("glcanvas"); // WebGL surface
const ctx: CanvasRenderingContext2D = (() => {
  const c = canvas.getContext("2d");
  if (!c) throw new Error("2d context unavailable");
  return c;
})();

// ---- Pattern state -------------------------------------------------------

let params: PatternParams = { ...DEFAULT_PARAMS };
let generatorId = "tibetan-mandala";

// Always a curated named palette (hue-rotated by the slider); no generated ramps.
function activePalette(): string[] {
  return resolvePalette(params.palette, params.hue);
}

// Offscreen canvas the active pattern is rendered to, then sampled into particles.
const offCanvas = document.createElement("canvas");
const offCtx: CanvasRenderingContext2D = (() => {
  const c = offCanvas.getContext("2d", { willReadFrequently: true });
  if (!c) throw new Error("offscreen 2d context unavailable");
  return c;
})();

function renderPatternOffscreen(W: number): CanvasRenderingContext2D {
  offCanvas.width = W;
  offCanvas.height = W;
  renderWithGuard(byId(generatorId), offCtx, W, activePalette(), params);
  return offCtx;
}

// ---- Engine (GPU regl default, CPU ImageData fallback) -------------------

const gpuAvailable = isGpuSupported();
let gpu: GpuParticles | null = null;
let gpuCount = GPU_DEFAULT_COUNT;
let particles: Particle[] = [];

const cyBuffer = new Uint8ClampedArray(CYMATIC_W * CYMATIC_W * 4);
const cyEmpty = new Uint8ClampedArray(CYMATIC_W * CYMATIC_W * 4);
for (let i = 0; i < cyEmpty.length; i += 4) {
  cyEmpty[i] = BG_RGB[0];
  cyEmpty[i + 1] = BG_RGB[1];
  cyEmpty[i + 2] = BG_RGB[2];
  cyEmpty[i + 3] = 255;
}
const cyImageData = new ImageData(cyBuffer, CYMATIC_W, CYMATIC_W);
cyBuffer.set(cyEmpty); // start on the bg so the first fade has something to decay from
const CPU_TRAIL_KEEP = 0.78; // fraction of each pixel's distance-above-bg kept per frame (trails)

function paintParticles(): void {
  // Fade the previous frame toward bg (motion trails) instead of hard-clearing.
  const r0 = BG_RGB[0];
  const g0 = BG_RGB[1];
  const b0 = BG_RGB[2];
  for (let i = 0; i < cyBuffer.length; i += 4) {
    cyBuffer[i] = r0 + (cyBuffer[i] - r0) * CPU_TRAIL_KEEP;
    cyBuffer[i + 1] = g0 + (cyBuffer[i + 1] - g0) * CPU_TRAIL_KEEP;
    cyBuffer[i + 2] = b0 + (cyBuffer[i + 2] - b0) * CPU_TRAIL_KEEP;
  }
  const W = CYMATIC_W;
  for (const p of particles) {
    const px = Math.floor(p.x);
    const py = Math.floor(p.y);
    if (px < 0 || px >= W || py < 0 || py >= W) continue;
    const i = (py * W + px) * 4;
    cyBuffer[i] = p.r;
    cyBuffer[i + 1] = p.g;
    cyBuffer[i + 2] = p.b;
    cyBuffer[i + 3] = 255;
    if (px + 1 < W) {
      const i2 = (py * W + px + 1) * 4;
      cyBuffer[i2] = p.r;
      cyBuffer[i2 + 1] = p.g;
      cyBuffer[i2 + 2] = p.b;
      cyBuffer[i2 + 3] = 255;
    }
  }
  ctx.putImageData(cyImageData, 0, 0);
}

function seedGpu(): void {
  if (!gpu) return;
  const src = renderPatternOffscreen(GPU_W);
  gpu.seed(buildSeed(src, GPU_W, gpuCount));
  $("cy-count").textContent = gpu.count.toLocaleString();
}

function seedCpu(): void {
  const src = renderPatternOffscreen(CYMATIC_W);
  particles = sampleParticles(src, CYMATIC_W);
  $("cy-count").textContent = particles.length.toLocaleString();
}

/** Re-render the current pattern and snap the cloud to a fresh intact copy. */
function reseedEngine(): void {
  if (gpu) seedGpu();
  else seedCpu();
}

function fallbackToCpu(): void {
  if (gpu) {
    gpu.destroy();
    gpu = null;
  }
  glCanvas.hidden = true;
  canvas.hidden = false;
  canvas.width = CYMATIC_W;
  canvas.height = CYMATIC_W;
  canvas.classList.add("pixelated");
  seedCpu();
}

function initEngine(): void {
  if (gpuAvailable) {
    try {
      glCanvas.width = GPU_W;
      glCanvas.height = GPU_W;
      gpu = GpuParticles.init(glCanvas, GPU_W);
    } catch {
      gpu = null;
    }
  }
  if (gpu) {
    canvas.hidden = true;
    glCanvas.hidden = false;
    glCanvas.classList.remove("pixelated");
    seedGpu();
  } else {
    fallbackToCpu();
  }
}

// ---- State machine -------------------------------------------------------

const gong = new GongEngine();
const mic = new MicEngine();
// One radio of four states drives everything. `autoplay` / `micActive` are kept as
// derived flags because the engine loop reads them hot; setMode() is the only writer.
type Mode = "manual" | "autoplay" | "ohm" | "music";
let mode: Mode = "manual";
let autoplay = false; // mode === "autoplay"
let micActive = false; // mode === "ohm" || mode === "music"
let forceState: PhysicsState | null = null; // (legacy override slot — always null now)
let reformUntil = 0; // perf.now() ms when a reform ramp ends (0 = none)
let lastFrame = 0;
// Autoplay explode-cycle state.
let apPops = 0; // pops done in the current mandala's cycle
let apPopTarget = 3; // random 2..5 per cycle
let apNextPopAt = 0; // perf.now() ms of the next pop / mandala swap
let apPopFrame = false; // true on the single frame a pop fires (drives state.explode)
let apModes: ModeWeight[] = [{ m: 3, n: 5, w: 1 }]; // current simulated cymatic figure

// Pattern panel: a slider moved → re-render the live mandala. Coalesced to one
// reseed per frame (the loop consumes the flag) and throttled, so dragging a
// Pattern control morphs the CURRENTLY displayed mandala in real time without
// thrashing the GPU at high particle counts.
let patternDirty = false;
let lastReseedAt = 0;
const RESEED_MIN_MS = 45; // ≤ ~22 live reseeds/sec while dragging

// Impulse envelope: a strike sets excitation=1; it decays with settleTau so the
// jolt fades fast and particles settle. lastModes holds the most recent gong
// spectrum so a fresh strike jolts toward a real pattern, not a placeholder.
let excitation = 0;
let settleTau = 0.85; // seconds; "Decay" control
const physics: PhysicsConfig = { str: 0.55, noise: 0.3, damping: 0.86 };

// Mic-mode CONTINUOUS response (recomputed each frame in engineLoop). Pure
// cymatics: the music envelope (md.amp) drives the Chladni force toward the nodes
// AND the diffusion (jitter). With NO outward kick and NO home spring, sand just
// drifts to the nodal lines and the diffusion knocks it around — it jumps over the
// surface forming temporary equilibria, like a real plate. The spectrum drives
// state.modes so the figure follows the music. All flow through state.amp + cfg.noise
// (per-frame clone), so GPU/CPU parity + the gong path are untouched.
let noisePulse = 0; // music-driven diffusion (the "jumping"), consumed in step 3
let micLevel = 0; // gated mic input 0..1 (≈0 in silence) — drives the debug bar
let micEffect = 1.5; // React slider — master multiplier on the drive amplitude
let scatter = 0.4; // Scatter slider — music-driven diffusion strength ("jumpiness")
const AMP_GAIN = 3.0; // music envelope → vibration amplitude (drive toward nodes)
const AMP_CLAMP = 2.0;
const EXPLODE_KICK = 0.05; // pop = random-direction velocity impulse, as a fraction of W
// Brief force-dip on a pop so grains fly free before the field re-gathers them
// (the reference's "disable the gradient during the explode round").
let popDamp = 1; // multiplies the drive amp; dips on a pop, ramps back over ~0.25s
const POP_DAMP_MIN = 0.12;
const POP_DAMP_RECOVER = 0.08;
let flowGain = 0.05; // Flow slider — small continuous agitation (settled grains keep skittering)
const FLOW_MAX = 0.18; // slider 0..100 → flowGain 0..0.18 (kept low so the settle is crisp)
let lastModes: ModeWeight[] = [{ m: 3, n: 5, w: 1 }];

// Pointer "repel" (touch / long-drag): while held over the mandala, push grains
// away from the pointer. Coords are normalized [0..1] over the canvas; the engine
// scales by its own field W. Superposes with sound, so it works in any mode.
let touchActive = false;
let touchX = 0.5; // normalized [0..1]
let touchY = 0.5;
let touchStrength = 0.03; // Repel slider (fraction of W/frame); 0 = off
const TOUCH_R_FRAC = 0.13; // influence radius as a fraction of W (fingertip-ish)

function jolt(amount = 1): void {
  excitation = amount;
}

// A simulated "burst" → a new cymatic figure, biased to a random band (bass →
// low/large figures, treble → high/fine ones). 1–2 antisymmetric Chladni modes.
function randomBurstModes(): ModeWeight[] {
  const band = Math.floor(Math.random() * 3); // 0 bass · 1 mid · 2 treble
  const lo = band === 0 ? 1 : band === 1 ? 2 : 4;
  const hi = band === 0 ? 4 : band === 1 ? 6 : 9;
  const pick = (): ModeWeight => {
    const m = lo + Math.floor(Math.random() * Math.max(1, hi - lo));
    const n = Math.min(10, m + 1 + Math.floor(Math.random() * 3));
    return { m, n, w: 1 };
  };
  const a = pick();
  if (Math.random() < 0.45) return [{ ...a, w: 0.6 }, { ...pick(), w: 0.4 }];
  return [a];
}

function reformRamp(now: number): PhysicsState {
  // Ease the home spring in over the window for a gentle pull.
  const t = reformUntil ? Math.min(1, 1 - (reformUntil - now) / REFORM_MS) : 1;
  const home = REFORM_HOME * Math.min(1, t * 1.5);
  return { name: "Reforming", amp: 0, m: 3, n: 5, home, modes: [{ m: 3, n: 5, w: 1 }] };
}

// The read-only readout floats over the mandala while LISTENING (ambient
// sparklines — tap to go minimal) or while the variables panel is open. Getting
// to pure art is the idle-fade's job, not a manual dismiss.
function syncReadout(): void {
  $("readout").hidden = !(micActive || !$("panel").hidden);
}

// Reflect the active mode on the three mode buttons (radio).
function applyModeButtons(): void {
  const map: Array<[Mode, string]> = [
    ["autoplay", "autoplay"],
    ["ohm", "mode-ohm"],
    ["music", "mode-music"],
  ];
  for (const [m, id] of map) {
    const on = mode === m;
    const b = $(id);
    b.dataset.state = on ? "on" : "off";
    b.setAttribute("aria-checked", String(on));
    b.setAttribute("aria-pressed", String(on));
  }
}

// Lock rules keyed off the mode. Reform is NEVER locked (usable at any point);
// Strike belongs to manual play; Random is locked only while autoplay self-swaps.
function applyLocks(): void {
  const lock = (id: string, locked: boolean) => {
    const b = $<HTMLButtonElement>(id);
    b.disabled = locked;
    b.classList.toggle("is-locked", locked);
  };
  lock("strike", mode !== "manual");
  lock("random-mandala", mode === "autoplay");
  lock("random-creative", mode === "autoplay");
  lock("reform", false);
}

// Prime a fresh autoplay explode→settle cycle (first tick swaps in a new mandala).
function startAutoplayCycle(now: number): void {
  apPops = AP_MAX_POPS; // ≥ target → the first tick swaps in a fresh mandala
  apPopTarget = AP_MIN_POPS + Math.floor(Math.random() * (AP_MAX_POPS - AP_MIN_POPS + 1));
  apNextPopAt = now;
  apModes = randomBurstModes();
  apPopFrame = false;
}

// The single mode transition. Re-selecting the active mode returns to manual.
// Ohm/Music ARE the listening modes: they load their tuning and start the mic
// (falling back to manual if permission is denied).
async function setMode(next: Mode): Promise<void> {
  if (next === mode) next = "manual"; // click the lit mode → back to manual

  if (next === "ohm" || next === "music") {
    applyPreset(presetById(next)); // load this mode's mic tuning into the panel + engine
    if (!micActive) {
      const ok = await mic.start();
      if (!ok) {
        showToast("Microphone permission needed.", "OK", () => {});
        next = "manual";
      }
    }
  }

  // Release the mic when leaving listening for a non-listening mode.
  const leavingListen = (mode === "ohm" || mode === "music") && next !== "ohm" && next !== "music";
  if (leavingListen) mic.stop();

  mode = next;
  autoplay = next === "autoplay";
  micActive = next === "ohm" || next === "music";
  excitation = 0;
  noisePulse = 0;
  forceState = null;
  reformUntil = 0;
  $("reform").classList.remove("is-reforming");
  if (autoplay) startAutoplayCycle(performance.now());

  applyModeButtons();
  applyLocks();
  syncReadout();
}

function pulseStrike(): void {
  const b = $("strike");
  b.classList.remove("is-striking");
  void b.offsetWidth; // reflow so the animation can restart
  b.classList.add("is-striking");
}

function engineLoop(now: number): void {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;

  // 0) Live Pattern controls: re-render the on-screen mandala as the sliders
  //    move. Deterministic in params.seed, so identity is preserved — only the
  //    complexity/order/etc. of the current figure changes (and it carries to
  //    subsequent reforms too, since params persist).
  if (patternDirty && now - lastReseedAt >= RESEED_MIN_MS) {
    patternDirty = false;
    lastReseedAt = now;
    reseedEngine();
  }

  // 1) Autoplay timing — the explode→settle show. Each tick either POPS (scatter
  //    + new figure) or, once the cycle's 2–5 pops are done, swaps in a fresh
  //    random mandala and starts a new cycle.
  apPopFrame = false;

  // Reform ramp lifecycle — runs in EVERY mode so Reform works at any point. An
  // active ramp (below) takes priority over the mic/autoplay field source.
  if (reformUntil !== 0 && now >= reformUntil) {
    reformUntil = 0;
    $("reform").classList.remove("is-reforming");
  }
  const reforming = reformUntil !== 0;

  if (autoplay && !reforming) {
    if (now >= apNextPopAt) {
      if (apPops >= apPopTarget) {
        // Cycle complete → a NEW random mandala appears (fresh colours), shown
        // intact for a beat before its bursts begin.
        applyPick(Math.random() < 0.5 ? randomTibetan() : randomCreative());
        apPops = 0;
        apPopTarget = AP_MIN_POPS + Math.floor(Math.random() * (AP_MAX_POPS - AP_MIN_POPS + 1));
        apNextPopAt = now + AP_MANDALA_DWELL;
      } else {
        // A burst: pop the cloud (scatter) and switch to a new cymatic figure.
        apModes = randomBurstModes();
        apPopFrame = true;
        apPops++;
        pulseStrike();
        apNextPopAt = now + AP_SETTLE_MS;
      }
    }
  }

  // 2) Field source: reform ramp > mic (continuous) > autoplay > gong jolt > at rest.
  let state: PhysicsState;
  let micDrive: MicDrive | null = null; // live measurements for the HUD (null when mic off)
  const atRest: PhysicsState = { name: "At rest", amp: 0, m: 3, n: 5, home: 0, modes: [{ m: 3, n: 5, w: 1 }] };
  if (reforming) {
    // A one-shot reform pull, available in any mode — overrides mic/autoplay for
    // REFORM_MS, then the active mode resumes. Field stays calm during the ramp.
    state = reformRamp(now);
    noisePulse = 0;
  } else if (micActive) {
    // Mic is AUTHORITATIVE while ON: it drives the field continuously until you
    // turn it OFF — reform/gong cannot preempt it, and the mic logo stays glowing
    // the whole time. Pure cymatics: the music envelope (md.amp) drives the
    // Chladni force toward the nodes AND the diffusion; the spectrum drives the
    // modes. NO outward kick, NO home spring (memoryless: new = current + field) —
    // sand drifts to the nodal lines and the diffusion jumps it around them.
    const md = mic.read();
    micDrive = md;
    if (md) {
      micLevel = md.raw;
      // EXPLODE→SETTLE cycle: on a "pop" (md.explode) the grains get a random-
      // direction velocity kick — they fly off the CURRENT figure (from their
      // current positions, no teleport) and the freshly re-snapped field gathers
      // them into the new one. Steady diffusion + Flow stay low so the settle is
      // crisp. Every deformation continues from the previous state.
      noisePulse = md.amp * scatter * micEffect;
      popDamp = md.explode ? POP_DAMP_MIN : popDamp + (1 - popDamp) * POP_DAMP_RECOVER;
      state = {
        name: "Mic",
        amp: Math.min(AMP_CLAMP, md.amp * AMP_GAIN * micEffect) * popDamp,
        m: md.m,
        n: md.n,
        home: 0,
        modes: md.modes,
        life: flowGain, // small continuous agitation so settled grains keep skittering
        explode: md.explode ? EXPLODE_KICK : 0, // pop → random velocity impulse
      };
    } else {
      state = atRest;
      noisePulse = 0;
      micLevel = 0;
    }
  } else if (autoplay) {
    // Autoplay = simulated explode→settle. On a pop frame the grains get a random-
    // direction velocity kick (fly off the current figure, from their current
    // positions) and the field switches to apModes; between pops they settle onto
    // it with low diffusion. amp 0 during the pre-burst dwell → the fresh mandala
    // is shown INTACT; the first pop turns the drive on and kicks it apart. The
    // only reseed in the whole cycle is the mandala change (applyPick).
    noisePulse = AP_AMP * AP_DIFFUSE;
    popDamp = apPopFrame ? POP_DAMP_MIN : popDamp + (1 - popDamp) * POP_DAMP_RECOVER;
    state = {
      name: "Autoplay",
      amp: (apPops > 0 ? AP_AMP : 0) * popDamp,
      m: apModes[0].m,
      n: apModes[0].n,
      home: 0,
      modes: apModes,
      life: apPops > 0 ? AP_LIFE : 0,
      explode: apPopFrame ? EXPLODE_KICK : 0,
    };
  } else if (forceState) {
    state = forceState;
  } else {
    // Gong impulse path: read the gong once, decay the jolt so particles settle.
    const audio = gong.read();
    if (audio && audio.modes.length) lastModes = audio.modes;
    excitation *= Math.exp(-dt / settleTau);
    if (excitation < REST_EPS) excitation = 0;
    if (excitation > 0) {
      const m = audio?.m ?? lastModes[0].m;
      const n = audio?.n ?? lastModes[0].n;
      state = { name: "Gong", amp: excitation, m, n, home: 0, modes: lastModes };
    } else {
      state = atRest;
    }
  }

  // 3) Step + draw. In mic mode a live kick adds a transient noise surge via a
  //    per-frame cfg copy — the shared physics object is never mutated, so the
  //    gong path is byte-identical and there's no cross-frame accumulation.
  let cfg: PhysicsConfig = micActive || autoplay
    ? { ...physics, noise: physics.noise + noisePulse }
    : physics;
  // Pointer repel — superpose a touch/drag push in ANY mode (normalized coords).
  if (touchActive && touchStrength > 0) {
    cfg = { ...cfg, touchX, touchY, touchStr: touchStrength, touchR: TOUCH_R_FRAC };
  }
  if (gpu) {
    try {
      gpu.step(state, dt, cfg);
      gpu.draw();
    } catch (err) {
      console.warn("GPU step failed; switching to CPU fallback.", err);
      fallbackToCpu();
    }
  } else {
    step(particles, dt, state, CYMATIC_W, cfg);
    paintParticles();
  }

  // 4) Metrics.
  $("cy-phase").textContent = state.name;
  const modeCount = state.modes?.length ?? 1;
  $("cy-mode").textContent = `(${state.m.toFixed(1)}, ${state.n.toFixed(1)}) ×${modeCount}`;
  $("cy-amp").textContent = state.amp.toFixed(2);
  const barPct =
    autoplay
      ? Math.min(100, (apPops / Math.max(1, apPopTarget)) * 100)
      : micActive
        ? Math.min(100, micLevel * 100) // live gated mic input — flat in silence, spikes on sound
        : Math.min(100, state.amp * 100);
  $("cy-bar").style.width = `${barPct.toFixed(1)}%`;

  // Live readings (sparklines + numbers) — only when the readout modal is shown.
  if (!$("readout").hidden) updateHud(state.amp, micDrive);

  requestAnimationFrame(engineLoop);
}

// ---- Controls ------------------------------------------------------------

// Mode radio → the single transition. Re-clicking the lit mode returns to manual.
$("autoplay").addEventListener("click", () => void setMode("autoplay"));
$("mode-ohm").addEventListener("click", () => void setMode("ohm"));
$("mode-music").addEventListener("click", () => void setMode("music"));

// Strike intensity from WHERE you hit the gong: near the centre = a light tap,
// further out (toward the rim) = a harder strike. intensity drives both the
// gong loudness and the visual jolt.
async function doStrike(intensity: number): Promise<void> {
  if (mode !== "manual") return;
  await gong.start();
  forceState = null;
  reformUntil = 0;
  $("reform").classList.remove("is-reforming");
  gong.strikeNow(0.08 + 0.16 * intensity, intensity); // sharper mallet for harder hits
  jolt(intensity);
  pulseStrike();
}

$("strike").addEventListener("pointerdown", (e: PointerEvent) => {
  if (mode !== "manual") return;
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const dx = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
  const dy = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
  const dist = Math.min(1, Math.hypot(dx, dy)); // 0 centre .. 1 rim
  void doStrike(0.4 + 0.6 * dist); // 0.4 (light) .. 1.0 (hard)
});
// Keyboard activation (Enter/Space fire click with detail 0) → medium strike.
$("strike").addEventListener("click", (e: MouseEvent) => {
  if (e.detail === 0) void doStrike(0.8);
});

// Reform is available at ANY point (every mode). It fires a one-shot reform ramp
// that overrides the field for REFORM_MS; the active mode resumes after. While
// autoplay is driving, push its next event past the ramp so it resumes cleanly.
$("reform").addEventListener("click", () => {
  reformUntil = performance.now() + REFORM_MS;
  $("reform").classList.add("is-reforming");
  if (autoplay) apNextPopAt = reformUntil + AP_MANDALA_DWELL;
});

$("random-mandala").addEventListener("click", () => {
  if (mode === "autoplay") return;
  applyPick(randomTibetan());
});
$("random-creative").addEventListener("click", () => {
  if (mode === "autoplay") return;
  applyPick(randomCreative());
});

// ---- Pointer repel: touch / long-drag over the mandala pushes particles -------
// Pointer Events unify mouse-drag (PC) and touch (mobile). The wrapper sizes to
// the visible canvas, so its rect maps 1:1 to the field. touch-action:none on the
// canvas (CSS) stops the drag from scrolling/zooming the page on mobile.
const mandalaWrap = glCanvas.parentElement as HTMLElement;
function setTouchFromEvent(e: PointerEvent): void {
  const rect = mandalaWrap.getBoundingClientRect();
  touchX = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  touchY = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
}
mandalaWrap.addEventListener("pointerdown", (e: PointerEvent) => {
  touchActive = true;
  setTouchFromEvent(e);
  try {
    mandalaWrap.setPointerCapture(e.pointerId);
  } catch {
    /* capture unsupported — move/up still fire on the element */
  }
});
mandalaWrap.addEventListener("pointermove", (e: PointerEvent) => {
  if (touchActive) setTouchFromEvent(e);
});
const endTouch = (e: PointerEvent): void => {
  touchActive = false;
  try {
    mandalaWrap.releasePointerCapture(e.pointerId);
  } catch {
    /* nothing captured */
  }
};
mandalaWrap.addEventListener("pointerup", endTouch);
mandalaWrap.addEventListener("pointercancel", endTouch);

// Keep the mic alive across OS suspends (screen sleep / app switch). The OS
// suspends the AudioContext, which freezes the sparklines + field while the UI
// still reads "Mic on". Resume on return-to-foreground and on the next tap (some
// platforms require a user gesture).
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && micActive) void mic.resume();
});
window.addEventListener("pointerdown", () => {
  if (micActive) void mic.resume();
}, { passive: true });

$("strike").addEventListener("animationend", function (this: HTMLElement, e: AnimationEvent) {
  if (e.target === this) this.classList.remove("is-striking");
});

// ---- Pattern parameters (panel) ------------------------------------------

function syncPanelFromParams(): void {
  $<HTMLInputElement>("p-order").value = String(params.order);
  $<HTMLInputElement>("p-depth").value = String(params.depth);
  $<HTMLInputElement>("p-hue").value = String(params.hue);
  $<HTMLInputElement>("p-cplx").value = String(params.complexity);
  $<HTMLInputElement>("p-jitter").value = String(Math.round(params.jitter * 100));
  $<HTMLSelectElement>("p-pal").value = params.palette;
  updateParamLabels();
}

function updateParamLabels(): void {
  $("p-order-v").textContent = String(params.order);
  $("p-depth-v").textContent = String(params.depth);
  $("p-hue-v").textContent = `${params.hue}°`;
  $("p-cplx-v").textContent = String(params.complexity);
  $("p-jitter-v").textContent = params.jitter.toFixed(2);
}

function readParamsFromPanel(): void {
  params.order = +$<HTMLInputElement>("p-order").value;
  params.depth = +$<HTMLInputElement>("p-depth").value;
  params.hue = +$<HTMLInputElement>("p-hue").value;
  params.complexity = +$<HTMLInputElement>("p-cplx").value;
  params.jitter = +$<HTMLInputElement>("p-jitter").value / 100;
  params.palette = $<HTMLSelectElement>("p-pal").value as PatternParams["palette"];
  updateParamLabels();
}

for (const id of ["p-order", "p-depth", "p-hue", "p-cplx", "p-jitter", "p-pal"]) {
  $(id).addEventListener("input", () => {
    readParamsFromPanel();
    patternDirty = true; // engine loop reseeds next frame → live morph while dragging
  });
}

$("cy-particles").addEventListener("change", function (this: HTMLSelectElement) {
  gpuCount = +this.value;
  if (gpu) seedGpu();
});

function applyPick(r: RandomPick): void {
  // "Lock detail": keep the current Layering depth + Complexity through a random
  // so randomized mandalas stay as detailed as the current figure.
  if ($<HTMLInputElement>("p-lock-detail").checked) {
    r.params = { ...r.params, depth: params.depth, complexity: params.complexity };
  }
  generatorId = r.generatorId;
  params = { ...r.params };
  forceState = null;
  reformUntil = 0;
  excitation = 0; // a fresh pattern starts intact, at rest
  $("reform").classList.remove("is-reforming");
  syncPanelFromParams();
  reseedEngine();
}

// ---- Cymatics controls (live, no re-seed needed) -------------------------

function readCymatics(): void {
  const j = +$<HTMLInputElement>("c-jolt").value; // 0..100
  const s = +$<HTMLInputElement>("c-settle").value; // 0..100 (higher = snappier)
  const d = +$<HTMLInputElement>("c-decay").value; // 0..100 (higher = slower fade)
  const n = +$<HTMLInputElement>("c-jitter").value; // 0..100
  physics.str = 0.1 + (j / 100) * 1.1; // 0.10..1.20
  physics.damping = 0.95 - (s / 100) * 0.15; // 0.95 (floaty) .. 0.80 (snappy)
  settleTau = 0.3 + (d / 100) * 2.2; // 0.30..2.50 s
  physics.noise = (n / 100) * 1.0; // 0..1
  $("c-jolt-v").textContent = physics.str.toFixed(2);
  $("c-settle-v").textContent = physics.damping.toFixed(2);
  $("c-decay-v").textContent = `${settleTau.toFixed(2)}s`;
  $("c-jitter-v").textContent = physics.noise.toFixed(2);
}

for (const id of ["c-jolt", "c-settle", "c-decay", "c-jitter"]) {
  $(id).addEventListener("input", readCymatics);
}

// Repel: pointer push strength. 0 = touch does nothing; right = a strong shove.
function readTouch(): void {
  const t = +$<HTMLInputElement>("c-touch").value; // 0..100
  touchStrength = (t / 100) * 0.06; // 0 .. 0.06 (fraction of W per frame)
  $("c-touch-v").textContent = touchStrength.toFixed(3);
}
$("c-touch").addEventListener("input", readTouch);
readTouch();

// ---- Mic reactivity controls (all live) ----------------------------------
// Floor: noise gate. Left = ignore a quiet room (calm); right = hear quieter sound.
function readFloor(): void {
  const db = mic.setFloor(+$<HTMLInputElement>("c-floor").value / 100);
  $("c-floor-v").textContent = `${db.toFixed(0)}dB`;
}
$("c-floor").addEventListener("input", readFloor);
readFloor();

// Band weights — how much each frequency range drives the vibration.
function readBass(): void {
  const w = mic.setBassW(+$<HTMLInputElement>("c-low").value / 100);
  $("c-low-v").textContent = w.toFixed(2);
}
$("c-low").addEventListener("input", readBass);
readBass();

function readMid(): void {
  const w = mic.setMidW(+$<HTMLInputElement>("c-mid").value / 100);
  $("c-mid-v").textContent = w.toFixed(2);
}
$("c-mid").addEventListener("input", readMid);
readMid();

function readHigh(): void {
  const w = mic.setHighW(+$<HTMLInputElement>("c-high").value / 100);
  $("c-high-v").textContent = w.toFixed(2);
}
$("c-high").addEventListener("input", readHigh);
readHigh();

// React: master effect amplitude (0..100 → 0.2..4.0×).
function readReact(): void {
  micEffect = 0.2 + (+$<HTMLInputElement>("c-react").value / 100) * 3.8;
  $("c-react-v").textContent = micEffect.toFixed(1) + "×";
}
$("c-react").addEventListener("input", readReact);
readReact();

// Scatter: music-driven diffusion — how much the sand jumps around the nodes (0..1).
function readScatter(): void {
  scatter = (+$<HTMLInputElement>("c-punch").value / 100) * 1.0;
  $("c-punch-v").textContent = scatter.toFixed(2);
}
$("c-punch").addEventListener("input", readScatter);
readScatter();

// Explode: how easily a beat triggers a "pop" (full reseed). Higher = more often.
function readExplode(): void {
  const thresh = mic.setExplodeSens(+$<HTMLInputElement>("c-fling").value / 100);
  $("c-fling-v").textContent = thresh.toFixed(2);
}
$("c-fling").addEventListener("input", readExplode);
readExplode();

// Flow: continuous agitation that keeps the field alive (0..FLOW_MAX).
function readFlow(): void {
  flowGain = (+$<HTMLInputElement>("c-flow").value / 100) * FLOW_MAX;
  $("c-flow-v").textContent = flowGain.toFixed(2);
}
$("c-flow").addEventListener("input", readFlow);
readFlow();

// ---- Reactivity presets ("ears") -----------------------------------------
// Each listening mode (Ohm / Music) loads a fixed mic + cymatics tuning into the
// sliders and re-reads it live. Pattern/renderer untouched. Tweaks after selecting
// a mode are live but not saved.

function applyPreset(p: ReactivityPreset): void {
  const set = (id: string, v: number) => ($<HTMLInputElement>(id).value = String(v));
  set("c-floor", p.mic.floor);
  set("c-low", p.mic.bass);
  set("c-mid", p.mic.mid);
  set("c-high", p.mic.treble);
  set("c-react", p.mic.react);
  set("c-punch", p.mic.scatter);
  set("c-fling", p.mic.fling);
  set("c-flow", p.mic.flow);
  set("c-jolt", p.cymatics.jolt);
  set("c-settle", p.cymatics.settle);
  set("c-decay", p.cymatics.decay);
  set("c-jitter", p.cymatics.jitter);
  // Push every value into the engine + labels via the existing readers.
  readFloor();
  readBass();
  readMid();
  readHigh();
  readReact();
  readScatter();
  readExplode();
  readFlow();
  readCymatics();
}

// ---- Dashboard (gear) toggle ---------------------------------------------

$("panel-toggle").addEventListener("click", function (this: HTMLButtonElement) {
  const panel = $("panel");
  const open = panel.hidden;
  panel.hidden = !open;
  this.setAttribute("aria-expanded", String(open)); // CSS swaps the dashboard/minus icon
  syncReadout(); // readings show while the dashboard is open
});

// ---- Readout: tap to toggle the bare/minimal sparkline view ----------------
const MINIMAL_KEY = "mc.readoutMinimal";
function setReadoutMinimal(on: boolean): void {
  $("readout").classList.toggle("minimal", on);
  try {
    localStorage.setItem(MINIMAL_KEY, on ? "1" : "0");
  } catch {
    /* storage disabled */
  }
}
$("readout").addEventListener("click", () => {
  setReadoutMinimal(!$("readout").classList.contains("minimal"));
});
setReadoutMinimal(
  (() => {
    try {
      return localStorage.getItem(MINIMAL_KEY) === "1";
    } catch {
      return false;
    }
  })(),
);

// ---- Idle: after 5s with no touch/click, fade everything but the art -------
let idleTimer = 0;
const IDLE_MS = 5000;
function wake(): void {
  document.body.classList.remove("idle");
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => document.body.classList.add("idle"), IDLE_MS);
}
for (const ev of ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"]) {
  window.addEventListener(ev, wake, { passive: true });
}
wake();

// ---- Small non-blocking toast (mic-permission notice, etc.) ----------------

function showToast(message: string, action: string, onAction: () => void): void {
  const toast = document.createElement("div");
  toast.className = "toast";
  const span = document.createElement("span");
  span.textContent = message;
  const btn = document.createElement("button");
  btn.className = "toast-btn";
  btn.textContent = action;
  btn.addEventListener("click", () => {
    toast.remove();
    onAction();
  });
  toast.append(span, btn);
  document.body.appendChild(toast);
}

// Update UX: HTML is served NetworkFirst (vite.config) so a plain reload already
// pulls the latest build. On top of that, when a new build's service worker is
// detected we surface a non-blocking "Refresh for new version" toast; tapping it
// activates the waiting SW (SKIP_WAITING) and reloads onto the fresh precache.
// We keep polling for a new SW every minute and on return-to-foreground so a
// long-lived or reopened (standalone) session notices new deploys promptly.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    showToast("New version available.", "Refresh", () => void updateSW(true));
  },
  onRegisteredSW(_swUrl, reg) {
    if (!reg) return;
    const check = () => {
      if (navigator.onLine) void reg.update().catch(() => {});
    };
    setInterval(check, 60_000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") check();
    });
  },
});

// ---- Boot -----------------------------------------------------------------

// On phones/tablets a 200k–1M cloud is too heavy; default to a lighter count.
const isHandheld =
  window.matchMedia("(pointer: coarse)").matches ||
  Math.min(window.innerWidth, window.innerHeight) < 600;
if (isHandheld) {
  gpuCount = 100000;
  $<HTMLSelectElement>("cy-particles").value = "100000";
}

// Compact [−][value][+] steppers over every range control. The range stays in
// the DOM (hidden via CSS) so all the existing input handlers + presets work
// unchanged — the ± buttons just nudge it by a sensible step and fire 'input'.
function buildSteppers(): void {
  const ranges = document.querySelectorAll<HTMLInputElement>(".panel .ctrl-row input[type='range']");
  ranges.forEach((inp) => {
    const row = inp.parentElement;
    if (!row) return;
    const val = row.querySelector(".val");
    const min = +inp.min;
    const max = +inp.max;
    const step = Math.max(1, Math.round((max - min) / 20));
    const mkBtn = (txt: string, dir: number): HTMLButtonElement => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "stepbtn";
      b.textContent = txt;
      b.setAttribute("aria-label", `${dir < 0 ? "decrease" : "increase"} ${inp.id}`);
      b.addEventListener("click", () => {
        const next = Math.max(min, Math.min(max, +inp.value + dir * step));
        if (next !== +inp.value) {
          inp.value = String(next);
          inp.dispatchEvent(new Event("input", { bubbles: true }));
        }
      });
      return b;
    };
    row.insertBefore(mkBtn("−", -1), val ?? null);
    row.appendChild(mkBtn("+", 1));
  });
}
buildSteppers();

syncPanelFromParams();
// Boot in MANUAL with a sane mic tuning pre-loaded, so the instant a listening
// mode is picked the field already has good ears. Mic modes can't auto-start
// (they need a user gesture for permission), so we never restore one from storage.
applyPreset(presetById(DEFAULT_PRESET_ID));
applyModeButtons();
applyLocks();
// The build version (glyphs + token) is rendered into #build-tag by cb-badge.js,
// which now mounts inline in the dashboard instead of a fixed corner badge.
initEngine();
lastFrame = performance.now();
requestAnimationFrame(engineLoop);
