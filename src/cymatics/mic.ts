// Microphone-reactive driver. Routes the live mic into an AnalyserNode (NEVER
// to the audio destination — no feedback) and extracts beat-locked features for
// the particle field. Audio is analysed locally and never recorded or sent.
//
// Detection: per-band ENERGY-RATIO onset detection on THREE bands, OR'd — KICK
// (40–130Hz), BASS (130–500Hz), CLAP (2–7kHz). Each band compares its energy to
// an ASYMMETRIC floor-tracking baseline (follows the signal DOWN fast, UP slow),
// so the baseline settles to the quiet *between* hits: a kick spikes above it and
// fires even inside dense, continuous music, while a steady drone (energy≈
// baseline) does not. The baseline also tracks iOS AGC drift, keeping behaviour
// stable across a long session. A hard absolute floor + the user GATE make
// silence dead. The coupler supplies the Chladni modes.

import type { ModeWeight } from "../types";
import { SpectrumCoupler } from "./coupling";

export interface MicDrive {
  raw: number; // gated transient energy 0..1 (≈0 in silence) — drives the debug bar
  beat: boolean; // true on the frame an onset is detected
  onsetStrength: number; // 0.5..1.2 magnitude of this hit (0 between hits)
  modes: ModeWeight[];
  m: number;
  n: number;
}

const WARMUP = 8; // frames before detection arms (~0.13s, baseline settles)
const REFRACTORY = 9; // ~150ms min between onsets (one jolt per hit)
const ABS_FLOOR = 0.02; // hard silence guard — energy below this never fires
const DOWN_K = 0.4; // baseline tracks the floor (down) fast
const UP_K = 0.02; // ...and rises slowly, so a kick can't inflate its own baseline
const KICK_LO_HZ = 40, KICK_HI_HZ = 130; // techno kick / sub-bass
const BASS_LO_HZ = 130, BASS_HI_HZ = 500; // bassline / low body
const CLAP_LO_HZ = 2000, CLAP_HI_HZ = 7000; // clap / snare / hats
const COUPLER_GAIN = 8;
const MAX_DB = -25;

/** One band's energy-ratio onset detector against an asymmetric floor-tracking
 *  baseline. Fires when energy >> the inter-hit floor. */
class BandDetector {
  private baseline = 0;
  private frames = 0;

  reset(): void {
    this.baseline = 0;
    this.frames = 0;
  }

  /** @returns onset strength (>0 if fired) and the energy above the baseline. */
  process(energy: number, c: number, refractoryOk: boolean): { strength: number; above: number } {
    if (this.frames === 0) this.baseline = energy; // prime — no zero-fill inflation
    else this.baseline += (energy - this.baseline) * (energy < this.baseline ? DOWN_K : UP_K);
    this.frames++;

    const above = Math.max(0, energy - this.baseline);
    let strength = 0;
    if (this.frames >= WARMUP && energy >= ABS_FLOOR) {
      const ratio = energy / Math.max(this.baseline, 0.01);
      if (ratio > c && refractoryOk) strength = Math.min(1.2, 0.5 + (ratio - c) * 0.7);
    }
    return { strength, above };
  }
}

export class MicEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private coupler = new SpectrumCoupler();
  private active = false;

  private bins: Uint8Array<ArrayBuffer> = new Uint8Array(1024);
  private kick = new BandDetector();
  private bass = new BandDetector();
  private clap = new BandDetector();
  private beatHold = 0;

  // Live-tunable params (set by the panel sliders).
  private floorDb = -76; // GATE: AnalyserNode.minDecibels (higher slider = hears more)
  private cKick = 1.18; // per-band ratio thresholds (lower = more sensitive)
  private cBass = 1.3;
  private cClap = 1.27;

  get isActive(): boolean {
    return this.active;
  }

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
      analyser.smoothingTimeConstant = 0;
      analyser.minDecibels = this.floorDb;
      analyser.maxDecibels = MAX_DB;
      source.connect(analyser); // analyser ONLY — never to destination (no feedback)
      this.ctx = ctx;
      this.stream = stream;
      this.source = source;
      this.analyser = analyser;
      this.active = true;
      this.resetDetectors();
      return true;
    } catch {
      this.active = false;
      return false;
    }
  }

  stop(): void {
    this.active = false;
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.source = null;
    this.stream = null;
    this.analyser = null;
    this.resetDetectors();
  }

  /** Clear ALL per-session state so a re-enable starts clean (no carry-over). */
  private resetDetectors(): void {
    this.kick.reset();
    this.bass.reset();
    this.clap.reset();
    this.coupler.reset(); // stale modes/level must not replay across sessions
    this.beatHold = 0;
  }

  // ---- Live controls ----
  /** Gate 0..1 → minDecibels −60 (calm: ignores quiet rooms) .. −100 (hears all).
   *  Higher slider = hears more, consistent with the sensitivity sliders. */
  setGate(t: number): number {
    this.floorDb = -60 - Math.max(0, Math.min(1, t)) * 40;
    if (this.analyser) this.analyser.minDecibels = this.floorDb;
    return this.floorDb;
  }
  /** Per-band sensitivity 0..1 → ratio threshold C 1.6 (strict) .. 1.0 (sensitive). */
  setKickSens(t: number): number {
    this.cKick = 1.6 - Math.max(0, Math.min(1, t)) * 0.6;
    return this.cKick;
  }
  setBassSens(t: number): number {
    this.cBass = 1.6 - Math.max(0, Math.min(1, t)) * 0.6;
    return this.cBass;
  }
  setClapSens(t: number): number {
    this.cClap = 1.6 - Math.max(0, Math.min(1, t)) * 0.6;
    return this.cClap;
  }

  private bandEnergy(lo: number, hi: number, binHz: number): number {
    const loBin = Math.max(1, Math.round(lo / binHz));
    const hiBin = Math.min(this.bins.length - 1, Math.round(hi / binHz));
    let sum = 0;
    let n = 0;
    for (let i = loBin; i <= hiBin; i++) {
      sum += this.bins[i];
      n++;
    }
    return n > 0 ? sum / (n * 255) : 0; // 0..1 mean energy
  }

  read(): MicDrive | null {
    if (!this.active || !this.analyser || !this.ctx) return null;
    const s = this.coupler.read(this.analyser, this.ctx, COUPLER_GAIN); // Chladni modes

    const binCount = this.analyser.frequencyBinCount;
    if (this.bins.length !== binCount) this.bins = new Uint8Array(binCount);
    this.analyser.getByteFrequencyData(this.bins);
    const binHz = this.ctx.sampleRate / this.analyser.fftSize;

    const kickE = this.bandEnergy(KICK_LO_HZ, KICK_HI_HZ, binHz);
    const bassE = this.bandEnergy(BASS_LO_HZ, BASS_HI_HZ, binHz);
    const clapE = this.bandEnergy(CLAP_LO_HZ, CLAP_HI_HZ, binHz);

    const refractoryOk = this.beatHold <= 0;
    const k = this.kick.process(kickE, this.cKick, refractoryOk);
    const b = this.bass.process(bassE, this.cBass, refractoryOk);
    const c = this.clap.process(clapE, this.cClap, refractoryOk);

    let beat = false;
    let onsetStrength = 0;
    const strength = Math.max(k.strength, b.strength, c.strength);
    if (strength > 0) {
      beat = true;
      onsetStrength = strength;
      this.beatHold = REFRACTORY;
    }
    if (this.beatHold > 0) this.beatHold--;

    // raw = transient energy above the baseline (the gated signal): ≈0 in silence,
    // spikes on a hit. This is what the debug bar shows.
    return {
      raw: Math.min(1, Math.max(k.above, b.above, c.above) * 3),
      beat,
      onsetStrength,
      modes: s.modes,
      m: s.m,
      n: s.n,
    };
  }
}
