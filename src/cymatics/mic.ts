// Microphone-reactive driver. Routes the live mic into an AnalyserNode (NEVER
// to the audio destination — no feedback) and extracts beat-locked features for
// the particle field. Audio is analysed locally and never recorded or sent.
//
// Detection (the fix for "moving but not in sync"): band-limited, half-wave-
// rectified SPECTRAL FLUX over the kick band (~47–117 Hz). Flux measures the
// frame-to-frame RATE OF CHANGE, so a sustained bassline (no change) yields ~0
// while a kick transient spikes — exactly what energy/level following missed.
// A flat ~1 s ring buffer gives an adaptive threshold (μ + K·σ over the PAST
// frames, so a spike never inflates its own threshold), gated by a refractory.
// smoothingTimeConstant = 0 so the AnalyserNode doesn't pre-average the very
// transients we're measuring. The coupler still supplies the Chladni modes.

import type { ModeWeight } from "../types";
import { SpectrumCoupler } from "./coupling";

export interface MicDrive {
  bassLevel: number; // sub-200Hz average 0..1 — the calm ambient floor (NOT the beat)
  beat: boolean; // true on the frame a kick onset is detected
  onsetStrength: number; // 0.5..1.5 magnitude of this kick (0 between beats)
  modes: ModeWeight[];
  m: number;
  n: number;
}

const RING_N = 56; // ~0.93 s history at 60fps — slow baseline so transients stand out
const REFRACTORY = 9; // ~150 ms min between kicks (caps ~6.6/s; no double-triggers)
const FLOOR = 6; // absolute flux floor (byte-units) — kills silence false-fires
const KICK_LO_HZ = 47;
const KICK_HI_HZ = 117;
const COUPLER_GAIN = 8; // fixed gain for the mode coupler (its own smoothing handles it)

export class MicEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private coupler = new SpectrumCoupler();
  private active = false;

  // Spectral-flux onset detector state.
  private specBins: Uint8Array<ArrayBuffer> = new Uint8Array(1024); // this frame
  private prevBins: Uint8Array<ArrayBuffer> = new Uint8Array(1024); // last frame
  private ring = new Float32Array(RING_N); // flux history
  private head = 0;
  private prevFlux = 0;
  private beatHold = 0;
  private frames = 0;
  private beatK = 2.0; // σ multiplier — the beat-sensitivity knob (lower = more beats)

  get isActive(): boolean {
    return this.active;
  }

  /** Request the mic and wire it to an analyser. Must be from a user gesture.
   *  Returns false if permission is denied / unavailable. */
  async start(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const ctx = this.ctx ?? new AudioContext();
      await ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0; // raw frames — don't pre-average transients
      source.connect(analyser); // analyser ONLY — never to destination (no feedback)
      this.ctx = ctx;
      this.stream = stream;
      this.source = source;
      this.analyser = analyser;
      this.active = true;
      this.resetDetector();
      return true;
    } catch {
      this.active = false;
      return false;
    }
  }

  /** Stop the mic: disconnect, release the track (mic indicator turns off). */
  stop(): void {
    this.active = false;
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.source = null;
    this.stream = null;
    this.analyser = null;
    this.resetDetector();
  }

  private resetDetector(): void {
    this.ring.fill(0);
    this.prevBins.fill(0);
    this.head = 0;
    this.prevFlux = 0;
    this.beatHold = 0;
    this.frames = 0;
  }

  /** Beat sensitivity 0..1 → σ threshold K 3.0 (strict) .. 1.3 (very sensitive). */
  setBeatSens(t: number): void {
    this.beatK = 3.0 - Math.max(0, Math.min(1, t)) * 1.7;
  }

  read(): MicDrive | null {
    if (!this.active || !this.analyser || !this.ctx) return null;
    const s = this.coupler.read(this.analyser, this.ctx, COUPLER_GAIN); // Chladni modes

    const binCount = this.analyser.frequencyBinCount;
    if (this.specBins.length !== binCount) {
      this.specBins = new Uint8Array(binCount);
      this.prevBins = new Uint8Array(binCount);
    }
    this.analyser.getByteFrequencyData(this.specBins);
    const spec = this.specBins;
    const prev = this.prevBins;
    const binHz = this.ctx.sampleRate / this.analyser.fftSize;

    // Sub-200Hz average — the calm ambient floor (a LEVEL, used only for baseline).
    let bsum = 0;
    let bn = 0;
    for (let i = 0; i < binCount && i * binHz < 200; i++) {
      bsum += spec[i];
      bn++;
    }
    const bassLevel = bn > 0 ? bsum / (bn * 255) : 0;

    // Half-wave-rectified spectral flux over the kick band (the transient signal).
    const loBin = Math.max(1, Math.round(KICK_LO_HZ / binHz));
    const hiBin = Math.max(loBin, Math.round(KICK_HI_HZ / binHz));
    let flux = 0;
    for (let i = loBin; i <= hiBin && i < binCount; i++) {
      const d = spec[i] - prev[i];
      if (d > 0) flux += d;
    }
    prev.set(spec); // current becomes previous for the next frame's diff

    // Adaptive threshold = μ + K·σ over the PAST RING_N frames (excludes this one,
    // since we read the ring before writing the new flux into it).
    let sum = 0;
    let sumSq = 0;
    for (let j = 0; j < RING_N; j++) {
      sum += this.ring[j];
      sumSq += this.ring[j] * this.ring[j];
    }
    const mu = sum / RING_N;
    const sigma = Math.sqrt(Math.max(0, sumSq / RING_N - mu * mu));
    const thresh = mu + this.beatK * sigma;

    // Peak-pick: flux above its adaptive threshold + absolute floor, still rising,
    // outside the refractory window, and past the ring warm-up.
    let beat = false;
    let onsetStrength = 0;
    if (
      this.frames >= RING_N &&
      flux > thresh &&
      flux > FLOOR &&
      flux >= this.prevFlux &&
      this.beatHold <= 0
    ) {
      beat = true;
      this.beatHold = REFRACTORY;
      // How far the flux juts above its own threshold → 0.5..1.5 (self-normalizing,
      // so a hard kick pops bigger than a soft one regardless of room volume).
      onsetStrength = 0.5 + Math.min(1, (flux - thresh) / Math.max(thresh, 1));
    }
    if (this.beatHold > 0) this.beatHold--;
    this.prevFlux = flux;
    this.ring[this.head] = flux;
    this.head = (this.head + 1) % RING_N;
    this.frames++;

    return { bassLevel, beat, onsetStrength, modes: s.modes, m: s.m, n: s.n };
  }
}
