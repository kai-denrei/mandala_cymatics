// Microphone-reactive driver. Routes the live mic into an AnalyserNode (NEVER
// to the audio destination — no feedback) and extracts beat-locked features for
// the particle field. Audio is analysed locally and never recorded or sent.
//
// Detection: ENERGY-RATIO onset detection (the classic beat-detection algorithm),
// run on TWO bands and OR'd — a KICK band (40–130Hz) for techno/electronic and a
// PERCUSSION band (1.5–6.5kHz) for claps/snares/hats. Each band fires when its
// instantaneous energy exceeds C× its own ~0.5s running average (so a kick pulse
// stands out even inside dense, continuous music — which frame-to-frame *flux*
// could not detect), AND exceeds an auto-calibrated noise floor (so SILENCE stays
// still on any device, incl. iOS's pumped AGC floor). The coupler supplies modes.

import type { ModeWeight } from "../types";
import { SpectrumCoupler } from "./coupling";

export interface MicDrive {
  raw: number; // raw broadband mic level 0..1 (the floor + sound) — debug bar
  signal: number; // gated energy above the learned floor (≈0 in silence)
  beat: boolean; // true on the frame an onset (clap/kick) is detected
  onsetStrength: number; // 0.5..1.2 magnitude of this hit (0 between hits)
  modes: ModeWeight[];
  m: number;
  n: number;
}

const RING_N = 30; // ~0.5s running-average window for the ratio test
const WARMUP = 10; // frames before detection arms (~0.17s) — fast onset on mobile
const REFRACTORY = 9; // ~150ms min between onsets (one jolt per hit)
const MARGIN = 0.012; // energy must exceed the learned noise floor by this to count
const KICK_LO_HZ = 40;
const KICK_HI_HZ = 130; // techno kick / sub-bass body
const PERC_LO_HZ = 1500;
const PERC_HI_HZ = 6500; // clap / snare / hats
const RAW_LO_HZ = 60;
const RAW_HI_HZ = 7000; // broadband level for the debug bar
const COUPLER_GAIN = 8; // fixed gain for the mode coupler (its own smoothing handles it)
const MIN_DB = -100; // dB→byte window: spec defaults (a narrower window can zero a quiet mic)
const MAX_DB = -30;

/** One band's energy-ratio onset detector: fires when energy >> its own running
 *  average AND clears an auto-calibrated noise floor. */
class BandDetector {
  private ring = new Float32Array(RING_N);
  private head = 0;
  private floor = 0;
  private frames = 0;

  reset(): void {
    this.ring.fill(0);
    this.head = 0;
    this.floor = 0;
    this.frames = 0;
  }

  /** @returns onset strength (>0 if fired this frame), and the gated energy. */
  process(energy: number, c: number, refractoryOk: boolean): { strength: number; above: number } {
    let sum = 0;
    for (let i = 0; i < RING_N; i++) sum += this.ring[i];
    const avg = sum / RING_N; // over the PAST window (current not yet written)

    // Auto-calibrated floor: follows the quiet level down fast, up very slow.
    if (this.frames === 0) this.floor = energy;
    else this.floor += (energy - this.floor) * (energy < this.floor ? 0.3 : 0.0005);
    const above = Math.max(0, energy - this.floor);

    const ratio = energy / Math.max(avg, 0.01);
    let strength = 0;
    if (this.frames >= WARMUP && above > MARGIN && ratio > c && refractoryOk) {
      strength = Math.min(1.2, 0.5 + (ratio - c) * 0.7);
    }

    this.ring[this.head] = energy;
    this.head = (this.head + 1) % RING_N;
    this.frames++;
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
  private perc = new BandDetector();
  private beatHold = 0;
  private ratioC = 1.25; // energy/avg threshold — the beat-sensitivity knob

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
      analyser.smoothingTimeConstant = 0;
      analyser.minDecibels = MIN_DB;
      analyser.maxDecibels = MAX_DB;
      source.connect(analyser); // analyser ONLY — never to destination (no feedback)
      this.ctx = ctx;
      this.stream = stream;
      this.source = source;
      this.analyser = analyser;
      this.active = true;
      this.kick.reset();
      this.perc.reset();
      this.beatHold = 0;
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
    this.kick.reset();
    this.perc.reset();
    this.beatHold = 0;
  }

  /** Beat sensitivity 0..1 → energy ratio threshold C 1.5 (strict) .. 1.1 (sensitive). */
  setBeatSens(t: number): void {
    this.ratioC = 1.5 - Math.max(0, Math.min(1, t)) * 0.4;
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
    const percE = this.bandEnergy(PERC_LO_HZ, PERC_HI_HZ, binHz);
    const rawE = this.bandEnergy(RAW_LO_HZ, RAW_HI_HZ, binHz);

    const refractoryOk = this.beatHold <= 0;
    const k = this.kick.process(kickE, this.ratioC, refractoryOk);
    const p = this.perc.process(percE, this.ratioC, refractoryOk);

    let beat = false;
    let onsetStrength = 0;
    const strength = Math.max(k.strength, p.strength);
    if (strength > 0) {
      beat = true;
      onsetStrength = strength;
      this.beatHold = REFRACTORY;
    }
    if (this.beatHold > 0) this.beatHold--;

    return {
      raw: Math.min(1, rawE),
      signal: Math.min(1, Math.max(k.above, p.above) * 2.5),
      beat,
      onsetStrength,
      modes: s.modes,
      m: s.m,
      n: s.n,
    };
  }
}
