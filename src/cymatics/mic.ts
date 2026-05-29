// Microphone-reactive driver. Routes the live mic into an AnalyserNode (NEVER
// to the audio destination — no feedback) and extracts beat-locked features for
// the particle field. Audio is analysed locally and never recorded or sent.
//
// Silence handling (the fix for "reacts to sound that isn't there"): two layers.
// (1) AnalyserNode.minDecibels/maxDecibels set the dB→byte window — the default
// −100/−30 maps a −80 dB quiet room to byte ~73 (~0.28), so "silence" reads as a
// big signal; we narrow the window so quiet maps to ~0. (2) An auto-calibrated
// NOISE GATE tracks the residual floor (iOS AGC pumps it up regardless of the
// autoGainControl:false hint) and subtracts it, so nothing reacts until real
// sound exceeds the floor.
//
// Detection: half-wave-rectified SPECTRAL FLUX over a WIDE band (~60Hz–7kHz, so
// it catches a hand CLAP (broadband ~1–5kHz) as well as a kick), normalized
// per-bin, peak-picked against a flat ~1s ring-buffer adaptive threshold (μ+K·σ),
// gated by the noise gate + a refractory. The coupler still supplies the modes.

import type { ModeWeight } from "../types";
import { SpectrumCoupler } from "./coupling";

export interface MicDrive {
  level: number; // gated broadband signal 0..1 (≈0 in silence) — onset energy + debug
  beat: boolean; // true on the frame an onset (clap/kick) is detected
  onsetStrength: number; // 0.5..1.5 magnitude of this hit (0 between hits)
  modes: ModeWeight[];
  m: number;
  n: number;
}

const RING_N = 56; // ~0.93s history at 60fps — slow baseline so transients stand out
const REFRACTORY = 9; // ~150ms min between onsets (one jolt per hit, no retrigger trains)
const FLOOR = 3; // absolute normalized-flux floor (mean byte-change/bin)
const GATE_MARGIN = 0.02; // signal must exceed the learned noise floor by this to count
const BAND_LO_HZ = 60; // wide band catches kick body + clap/snare; above DC rumble
const BAND_HI_HZ = 7000;
const COUPLER_GAIN = 8; // fixed gain for the mode coupler (its own smoothing handles it)
const MIN_DB = -80; // dB→byte window: quiet room (~−80dB) maps to ~0
const MAX_DB = -20;

export class MicEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private coupler = new SpectrumCoupler();
  private active = false;

  // Spectral-flux onset detector + noise-gate state.
  private specBins: Uint8Array<ArrayBuffer> = new Uint8Array(1024); // this frame
  private prevBins: Uint8Array<ArrayBuffer> = new Uint8Array(1024); // last frame
  private ring = new Float32Array(RING_N); // normalized-flux history
  private head = 0;
  private prevFlux = 0;
  private beatHold = 0;
  private frames = 0;
  private noiseFloor = 0; // auto-calibrated quiet-room level (tracks down fast, up slow)
  private beatK = 2.0; // σ multiplier — the beat-sensitivity knob (lower = more onsets)

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
      analyser.minDecibels = MIN_DB; // narrow dB window so a quiet room maps to ~0
      analyser.maxDecibels = MAX_DB;
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
    this.noiseFloor = 0;
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

    // Wide-band flux + level (catches clap AND kick). Normalize per-bin so the
    // thresholds are independent of band width / fftSize.
    const loBin = Math.max(1, Math.round(BAND_LO_HZ / binHz));
    const hiBin = Math.min(binCount - 1, Math.round(BAND_HI_HZ / binHz));
    let fluxSum = 0;
    let levelSum = 0;
    let nb = 0;
    for (let i = loBin; i <= hiBin; i++) {
      const d = spec[i] - prev[i];
      if (d > 0) fluxSum += d; // half-wave rectified
      levelSum += spec[i];
      nb++;
    }
    prev.set(spec);
    const flux = nb > 0 ? fluxSum / nb : 0; // mean positive change per bin
    const bandLevel = nb > 0 ? levelSum / (nb * 255) : 0; // 0..1 mean energy

    // Auto-calibrated noise gate: noiseFloor follows the quiet level down fast and
    // up very slowly, so it settles to the room/AGC floor (incl. iOS's) while
    // transients and music sit above it. Init to the first reading so there's no
    // multi-second warm-up where the gate sits wide open. signal is the energy
    // above that floor — ~0 in silence on any device.
    if (this.frames === 0) this.noiseFloor = bandLevel;
    else this.noiseFloor += (bandLevel - this.noiseFloor) * (bandLevel < this.noiseFloor ? 0.3 : 0.0005);
    const signal = Math.max(0, bandLevel - this.noiseFloor);
    const soundPresent = signal > GATE_MARGIN;

    // Adaptive threshold μ + K·σ over the PAST RING_N frames (current excluded).
    let sum = 0;
    let sumSq = 0;
    for (let j = 0; j < RING_N; j++) {
      sum += this.ring[j];
      sumSq += this.ring[j] * this.ring[j];
    }
    const mu = sum / RING_N;
    const sigma = Math.sqrt(Math.max(0, sumSq / RING_N - mu * mu));
    const thresh = mu + this.beatK * sigma;

    // Onset: real sound present AND a flux peak above threshold + absolute floor,
    // still rising, outside the refractory, past warm-up. One jolt per hit.
    let beat = false;
    let onsetStrength = 0;
    if (
      soundPresent &&
      this.frames >= RING_N &&
      flux > thresh &&
      flux > FLOOR &&
      flux >= this.prevFlux &&
      this.beatHold <= 0
    ) {
      beat = true;
      this.beatHold = REFRACTORY;
      onsetStrength = 0.5 + Math.min(1, (flux - thresh) / Math.max(thresh, 1));
    }
    if (this.beatHold > 0) this.beatHold--;
    this.prevFlux = flux;
    this.ring[this.head] = flux;
    this.head = (this.head + 1) % RING_N;
    this.frames++;

    // level (scaled for the debug bar): ~0 in silence, spikes on any real sound.
    return { level: Math.min(1, signal * 2.5), beat, onsetStrength, modes: s.modes, m: s.m, n: s.n };
  }
}
