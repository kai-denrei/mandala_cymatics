// Microphone-reactive driver. Routes the live mic into an AnalyserNode (NEVER
// to the audio destination — no feedback) and turns live music into a CONTINUOUS
// vibration drive. Audio is analysed locally and never recorded or sent.
//
// Approach (goal: "vibrate in sync with real music", not beat/clap detection):
//   • A weighted broadband energy (Bass/Mid/Treble sliders) is gated against an
//     auto-tracked noise floor → ~0 in silence, rises with music.
//   • An ENVELOPE FOLLOWER (fast attack / slower release) turns that into `amp`,
//     a continuous vibration intensity that pumps with the music's dynamics — so
//     it tracks a violin swell as readily as a techno kick, with no fragile
//     onset threshold.
//   • `rise` = the positive change in the envelope this frame — naturally large
//     on a sharp attack (kick), negligible on a smooth swell — drives an extra
//     punch impulse, giving beat emphasis for free.
//   • The SpectrumCoupler maps the live spectrum → Chladni modes, so the PATTERN
//     itself follows the music (different notes/sections → different mandalas).

import type { ModeWeight } from "../types";
import { SpectrumCoupler } from "./coupling";

export interface MicDrive {
  amp: number; // envelope-followed vibration intensity (continuous, ~0 in silence)
  rise: number; // positive change in amp this frame — the beat/attack punch
  raw: number; // gated signal 0..1 for the debug bar
  modes: ModeWeight[];
  m: number;
  n: number;
}

const LOW_LO = 40, LOW_HI = 250; // bass / kick body
const MID_LO = 250, MID_HI = 2000; // body / vocals / melody
const HIGH_LO = 2000, HIGH_HI = 8000; // presence / hats / air
const FLOOR_DOWN = 0.3; // noise floor tracks the quiet level down fast,
const FLOOR_UP = 0.001; // ...up very slowly (≈ a running minimum → silence gate)
const ATTACK = 0.5; // envelope follower: fast up (pumps with the music)
const RELEASE = 0.12; // ...slower down (smooth between beats)
const COUPLER_GAIN = 8;
const MAX_DB = -25;

export class MicEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private coupler = new SpectrumCoupler();
  private active = false;

  private bins: Uint8Array<ArrayBuffer> = new Uint8Array(1024);
  private floorW = 0; // auto-tracked noise floor on the weighted energy
  private ampEnv = 0; // envelope-followed vibration intensity
  private prevAmp = 0;
  private primed = false;

  // Live-tunable params (panel sliders).
  private floorDb = -80; // Floor slider → AnalyserNode.minDecibels
  private wLow = 1.0; // band weights (how much each range drives the vibration)
  private wMid = 0.7;
  private wHigh = 0.5;

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
      analyser.smoothingTimeConstant = 0.1; // a touch of FFT smoothing for stable energy
      analyser.minDecibels = this.floorDb;
      analyser.maxDecibels = MAX_DB;
      source.connect(analyser); // analyser ONLY — never to destination (no feedback)
      this.ctx = ctx;
      this.stream = stream;
      this.source = source;
      this.analyser = analyser;
      this.active = true;
      this.resetState();
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
    this.resetState();
  }

  private resetState(): void {
    this.floorW = 0;
    this.ampEnv = 0;
    this.prevAmp = 0;
    this.primed = false;
    this.coupler.reset(); // no stale modes/level across sessions
  }

  // ---- Live controls ----
  /** Floor 0..1 → minDecibels −60 (calm: ignores quiet rooms) .. −100 (hears all). */
  setFloor(t: number): number {
    this.floorDb = -60 - Math.max(0, Math.min(1, t)) * 40;
    if (this.analyser) this.analyser.minDecibels = this.floorDb;
    return this.floorDb;
  }
  /** Band weight 0..1 → 0..1.5 contribution to the vibration drive. */
  setBassW(t: number): number {
    this.wLow = Math.max(0, Math.min(1, t)) * 1.5;
    return this.wLow;
  }
  setMidW(t: number): number {
    this.wMid = Math.max(0, Math.min(1, t)) * 1.5;
    return this.wMid;
  }
  setHighW(t: number): number {
    this.wHigh = Math.max(0, Math.min(1, t)) * 1.5;
    return this.wHigh;
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

    const weighted =
      this.wLow * this.bandEnergy(LOW_LO, LOW_HI, binHz) +
      this.wMid * this.bandEnergy(MID_LO, MID_HI, binHz) +
      this.wHigh * this.bandEnergy(HIGH_LO, HIGH_HI, binHz);

    // Auto noise floor: down fast, up very slow → sits at the quiet baseline so
    // music rises above it and silence gates to ~0 (tracks iOS AGC drift too).
    if (!this.primed) {
      this.floorW = weighted;
      this.primed = true;
    } else {
      this.floorW += (weighted - this.floorW) * (weighted < this.floorW ? FLOOR_DOWN : FLOOR_UP);
    }
    const signal = Math.max(0, weighted - this.floorW);

    // Envelope follower: fast attack pumps with the music, slower release smooths.
    this.ampEnv += (signal - this.ampEnv) * (signal > this.ampEnv ? ATTACK : RELEASE);
    const rise = Math.max(0, this.ampEnv - this.prevAmp);
    this.prevAmp = this.ampEnv;

    return {
      amp: this.ampEnv,
      rise,
      raw: Math.min(1, signal * 2),
      modes: s.modes,
      m: s.m,
      n: s.n,
    };
  }
}
