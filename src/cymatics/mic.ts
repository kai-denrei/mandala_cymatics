// Microphone-reactive driver. Routes the live mic into an AnalyserNode (NEVER
// to the audio destination — no feedback) and extracts beat-locked features for
// the particle field. Audio is analysed locally and never recorded or sent.
//
// Detection: ENERGY-RATIO onset detection (the classic beat-detection algorithm)
// on THREE independently-tunable bands, OR'd — KICK (40–130Hz), BASS (130–500Hz),
// CLAP (2–7kHz). Each fires when its energy exceeds C× its own ~0.5s running
// average (so a pulse stands out inside dense, continuous music — which spectral
// *flux* could not detect). A GATE (the AnalyserNode dB floor) keeps a quiet room
// reading as ~0 so silence stays still. Every parameter is a live slider — the
// room and the music can only be calibrated on the device, by the operator.

import type { ModeWeight } from "../types";
import { SpectrumCoupler } from "./coupling";

export interface MicDrive {
  raw: number; // loudest band energy 0..1 — drives the debug bar (set the Gate by it)
  beat: boolean; // true on the frame an onset is detected
  onsetStrength: number; // 0.5..1.2 magnitude of this hit (0 between hits)
  modes: ModeWeight[];
  m: number;
  n: number;
}

const RING_N = 30; // ~0.5s running-average window for the ratio test
const WARMUP = 10; // frames before detection arms (~0.17s)
const REFRACTORY = 9; // ~150ms min between onsets (one jolt per hit)
const E_EPS = 0.012; // tiny absolute floor (with the Gate raised, silence reads ~0)
const KICK_LO_HZ = 40, KICK_HI_HZ = 130; // techno kick / sub-bass
const BASS_LO_HZ = 130, BASS_HI_HZ = 500; // bassline / low body
const CLAP_LO_HZ = 2000, CLAP_HI_HZ = 7000; // clap / snare / hats
const COUPLER_GAIN = 8;
const MAX_DB = -25; // upper end of the dB→byte window

/** One band's energy-ratio onset detector: fires when energy >> its own running
 *  average. Threshold C is supplied per frame (live slider). */
class BandDetector {
  private ring = new Float32Array(RING_N);
  private head = 0;
  private frames = 0;

  reset(): void {
    this.ring.fill(0);
    this.head = 0;
    this.frames = 0;
  }

  /** @returns onset strength (>0 if it fired this frame). */
  process(energy: number, c: number, refractoryOk: boolean): number {
    let sum = 0;
    for (let i = 0; i < RING_N; i++) sum += this.ring[i];
    const avg = sum / RING_N; // past window (current not yet written)
    const ratio = energy / Math.max(avg, 0.01);
    let strength = 0;
    if (this.frames >= WARMUP && energy > E_EPS && ratio > c && refractoryOk) {
      strength = Math.min(1.2, 0.5 + (ratio - c) * 0.7);
    }
    this.ring[this.head] = energy;
    this.head = (this.head + 1) % RING_N;
    this.frames++;
    return strength;
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
  private floorDb = -90; // GATE: AnalyserNode.minDecibels — higher rejects more quiet
  private cKick = 1.24; // per-band energy-ratio thresholds (lower = more sensitive)
  private cBass = 1.3;
  private cClap = 1.3;

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
      this.kick.reset();
      this.bass.reset();
      this.clap.reset();
      this.beatHold = 0;
      return true;
    } catch {
      this.active = false;
      return false;
    }
  }

  stop(): void {
    this.active = false;
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.source = null;
    this.stream = null;
    this.analyser = null;
    this.kick.reset();
    this.bass.reset();
    this.clap.reset();
    this.beatHold = 0;
  }

  // ---- Live controls ----
  /** Gate 0..1 → minDecibels −100 (hears everything) .. −60 (rejects quiet). */
  setGate(t: number): number {
    this.floorDb = -100 + Math.max(0, Math.min(1, t)) * 40;
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
    const strength = Math.max(
      this.kick.process(kickE, this.cKick, refractoryOk),
      this.bass.process(bassE, this.cBass, refractoryOk),
      this.clap.process(clapE, this.cClap, refractoryOk),
    );

    let beat = false;
    let onsetStrength = 0;
    if (strength > 0) {
      beat = true;
      onsetStrength = strength;
      this.beatHold = REFRACTORY;
    }
    if (this.beatHold > 0) this.beatHold--;

    return {
      raw: Math.min(1, Math.max(kickE, bassE, clapE)),
      beat,
      onsetStrength,
      modes: s.modes,
      m: s.m,
      n: s.n,
    };
  }
}
