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
import { sampleParticles, step } from "./cymatics/particles";
import { GpuParticles, isGpuSupported, buildSeed } from "./cymatics/gpu";
import { registerSW } from "virtual:pwa-register";

const GPU_W = 512; // GPU field + sampling resolution
const CYMATIC_W = 400; // CPU-fallback resolution (CSS-upscaled)
const GPU_DEFAULT_COUNT = 200000;

// Autoplay tuning.
const REFORM_AFTER_MIN = 4; // self-strikes before auto-reform (4-6, randomized per cycle)
const REFORM_AFTER_JITTER = 3; // count is decoupled from the Decay/Jolt sliders
const REFORM_MS = 3500;
const REFORM_HOME = 0.18;
const AUTO_STRIKE_MIN_MS = 6000;
const AUTO_STRIKE_JITTER_MS = 6000; // → 6-12s between self-strikes
const FIRST_STRIKE_LEAD_MS = 2000;
const MAX_DESTROY_MS = 90000; // safety: reform even if strikes stall
const REST_EPS = 0.002; // excitation below this = at rest (single threshold, no dead band)
const AUTO_TRANSIENT_GAIN = 0.08; // soft "sung" mallet for self-strikes

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
let autoplay = false;
let micActive = false; // mic-reactive mode (mutually exclusive with autoplay)
let forceState: PhysicsState | null = null; // transport override (reform ramp)
let strikesThisCycle = 0; // self-strikes since the last reform (autoplay)
let reformAfter = 5; // randomized 4-6 each destroy cycle
let apPhase: "destroy" | "reform" = "destroy";
let nextStrikeAt = 0; // perf.now() ms of next self-strike (0 = none pending)
let reformUntil = 0; // perf.now() ms when a reform ramp ends (0 = none)
let destroyStartedAt = 0;
let lastFrame = 0;

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
let lastModes: ModeWeight[] = [{ m: 3, n: 5, w: 1 }];

function jolt(amount = 1): void {
  excitation = amount;
}

function scheduleNextAutoStrike(): void {
  nextStrikeAt = performance.now() + AUTO_STRIKE_MIN_MS + Math.random() * AUTO_STRIKE_JITTER_MS;
}

function reformRamp(now: number): PhysicsState {
  // Ease the home spring in over the window for a gentle pull.
  const t = reformUntil ? Math.min(1, 1 - (reformUntil - now) / REFORM_MS) : 1;
  const home = REFORM_HOME * Math.min(1, t * 1.5);
  return { name: "Reforming", amp: 0, m: 3, n: 5, home, modes: [{ m: 3, n: 5, w: 1 }] };
}

function setAutoplay(on: boolean): void {
  autoplay = on;
  const btn = $("autoplay");
  btn.dataset.state = on ? "on" : "off";
  btn.setAttribute("aria-pressed", String(on));
  for (const id of ["strike", "reform", "random-mandala", "random-creative", "mic"]) {
    const b = $<HTMLButtonElement>(id);
    b.disabled = on;
    b.classList.toggle("is-locked", on);
  }
}

// Mic mode is mutually exclusive with the synth gong: while listening, the
// field is driven continuously by the room, so autoplay + strike are locked.
// Reform / random stay live so you can reseed or breathe the mandala back.
function setMicActive(on: boolean): void {
  micActive = on;
  noisePulse = 0; // clear on either transition (no carry-over)
  const btn = $("mic");
  btn.dataset.state = on ? "on" : "off";
  btn.setAttribute("aria-pressed", String(on));
  for (const id of ["autoplay", "strike"]) {
    const b = $<HTMLButtonElement>(id);
    b.disabled = on;
    b.classList.toggle("is-locked", on);
  }
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

  // 1) Autoplay timing — may schedule strikes / set the reform ramp.
  if (autoplay) {
    if (apPhase === "destroy") {
      if (reformUntil === 0 && nextStrikeAt !== 0 && now >= nextStrikeAt) {
        const ai = 0.6 + Math.random() * 0.35; // varied self-strike intensity
        gong.strikeNow(AUTO_TRANSIENT_GAIN, ai);
        jolt(ai);
        strikesThisCycle++;
        pulseStrike();
        scheduleNextAutoStrike();
      }
      // Reform only after several gongs have nearly erased the pattern.
      if (strikesThisCycle >= reformAfter || now - destroyStartedAt >= MAX_DESTROY_MS) {
        apPhase = "reform";
        reformUntil = now + REFORM_MS;
        nextStrikeAt = 0;
        forceState = reformRamp(now); // begin the ramp this same frame
      }
    } else if (now >= reformUntil) {
      forceState = null;
      reformUntil = 0;
      strikesThisCycle = 0;
      reformAfter = REFORM_AFTER_MIN + Math.floor(Math.random() * REFORM_AFTER_JITTER);
      apPhase = "destroy";
      destroyStartedAt = now;
      nextStrikeAt = now + FIRST_STRIKE_LEAD_MS;
    } else {
      forceState = reformRamp(now);
    }
  } else if (reformUntil !== 0) {
    // Manual reform ramp.
    if (now >= reformUntil) {
      forceState = null;
      reformUntil = 0;
      $("reform").classList.remove("is-reforming");
    } else {
      forceState = reformRamp(now);
    }
  }

  // 2) Field source: reform ramp > mic (continuous) > gong jolt (impulse) > at rest.
  let state: PhysicsState;
  let micDrive: MicDrive | null = null; // live measurements for the HUD (null when mic off)
  const atRest: PhysicsState = { name: "At rest", amp: 0, m: 3, n: 5, home: 0, modes: [{ m: 3, n: 5, w: 1 }] };
  if (forceState) {
    state = forceState;
  } else if (micActive) {
    // Mic mode = pure cymatics. The music envelope (md.amp) drives the Chladni
    // force toward the nodes AND the diffusion; the spectrum drives the modes.
    // NO outward kick (it drove everything to the disc edge with no home spring to
    // counter it) and NO home spring (memoryless: new = current + field). Sand
    // drifts to the nodal lines and the diffusion makes it jump around them —
    // temporary equilibria, like a real plate.
    const md = mic.read();
    micDrive = md;
    if (md) {
      micLevel = md.raw;
      noisePulse = md.amp * scatter * micEffect; // music-driven diffusion (the jumping)
      state = {
        name: "Mic",
        amp: Math.min(AMP_CLAMP, md.amp * AMP_GAIN * micEffect),
        m: md.m,
        n: md.n,
        home: 0,
        modes: md.modes,
      };
    } else {
      state = atRest;
      noisePulse = 0;
      micLevel = 0;
    }
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
  const cfg: PhysicsConfig = micActive
    ? { ...physics, noise: physics.noise + noisePulse }
    : physics;
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
    autoplay && apPhase === "destroy"
      ? Math.min(100, (strikesThisCycle / reformAfter) * 100)
      : micActive
        ? Math.min(100, micLevel * 100) // live gated mic input — flat in silence, spikes on sound
        : Math.min(100, state.amp * 100);
  $("cy-bar").style.width = `${barPct.toFixed(1)}%`;

  // Live signal HUD (sparklines + numbers) — only when the dashboard is open.
  if (!$("panel").hidden) updateHud(state.amp, micDrive);

  requestAnimationFrame(engineLoop);
}

// ---- Controls ------------------------------------------------------------

$("autoplay").addEventListener("click", async () => {
  if (!autoplay) {
    await gong.start();
    forceState = null;
    strikesThisCycle = 0;
    reformAfter = REFORM_AFTER_MIN + Math.floor(Math.random() * REFORM_AFTER_JITTER);
    apPhase = "destroy";
    const now = performance.now();
    destroyStartedAt = now;
    nextStrikeAt = now + FIRST_STRIKE_LEAD_MS;
    reformUntil = 0;
    setAutoplay(true);
  } else {
    // Stop scheduling; the gong tail decays and the cloud freezes (impermanence).
    nextStrikeAt = 0;
    reformUntil = 0;
    apPhase = "destroy";
    forceState = null;
    $("reform").classList.remove("is-reforming");
    setAutoplay(false);
  }
});

// Strike intensity from WHERE you hit the gong: near the centre = a light tap,
// further out (toward the rim) = a harder strike. intensity drives both the
// gong loudness and the visual jolt.
async function doStrike(intensity: number): Promise<void> {
  if (autoplay) return;
  await gong.start();
  forceState = null;
  reformUntil = 0;
  $("reform").classList.remove("is-reforming");
  gong.strikeNow(0.08 + 0.16 * intensity, intensity); // sharper mallet for harder hits
  jolt(intensity);
  pulseStrike();
}

$("strike").addEventListener("pointerdown", (e: PointerEvent) => {
  if (autoplay) return;
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

$("reform").addEventListener("click", () => {
  if (autoplay) return;
  reformUntil = performance.now() + REFORM_MS;
  $("reform").classList.add("is-reforming");
});

$("random-mandala").addEventListener("click", () => {
  if (autoplay) return;
  applyPick(randomTibetan());
});
$("random-creative").addEventListener("click", () => {
  if (autoplay) return;
  applyPick(randomCreative());
});

// Microphone toggle. Mutually exclusive with autoplay (guarded by the lock).
// On enable: request the mic, clear any reform ramp, and hand the field to the
// live spectrum. On disable: release the track and freeze the current cloud.
$("mic").addEventListener("click", async () => {
  if (autoplay) return;
  if (!micActive) {
    const ok = await mic.start();
    if (!ok) {
      showToast("Microphone permission needed.", "OK", () => {});
      return;
    }
    forceState = null;
    reformUntil = 0;
    excitation = 0;
    $("reform").classList.remove("is-reforming");
    setMicActive(true);
  } else {
    mic.stop();
    excitation = 0;
    setMicActive(false);
  }
});

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

// ---- Dashboard ("+") toggle ----------------------------------------------

$("panel-toggle").addEventListener("click", function (this: HTMLButtonElement) {
  const panel = $("panel");
  const open = panel.hidden;
  panel.hidden = !open;
  this.setAttribute("aria-expanded", String(open)); // CSS swaps the dashboard/minus icon
});

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

// Auto-update: a new deploy's service worker activates immediately (skipWaiting
// + clientsClaim) and the page reloads on takeover. The old "prompt + Refresh
// toast" flow never fired reliably inside an iOS standalone PWA, which left the
// home-screen app pinned to a stale build. We also poll for a new SW every
// minute and whenever the app returns to the foreground, so a long-lived or
// reopened session pulls the latest without a manual hard-reload.
registerSW({
  immediate: true,
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

syncPanelFromParams();
readCymatics();
initEngine();
lastFrame = performance.now();
requestAnimationFrame(engineLoop);
