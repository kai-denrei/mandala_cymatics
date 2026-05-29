// Microphone-reactive driver. Routes the live mic into an AnalyserNode (NEVER
// to the audio destination — no feedback) and feeds the same FFT→Chladni-mode
// coupler the gong uses, but CONTINUOUSLY: amplitude tracks the room's loudness
// and the modes track its live spectrum. When quiet, a gentle home pull lets the
// mandala breathe back toward its resting form. Audio is analysed locally and
// never recorded or sent anywhere; the track is stopped when the mic is off.

import type { ModeWeight } from "../types";
import { SpectrumCoupler } from "./coupling";

export interface MicDrive {
  amp: number;
  modes: ModeWeight[];
  home: number;
  m: number;
  n: number;
}

export class MicEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private coupler = new SpectrumCoupler();
  private active = false;
  private gain = 4; // sensitivity (RMS→amp); ambient is quieter than the synth gong

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
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser); // analyser ONLY — never to destination (no feedback)
      this.ctx = ctx;
      this.stream = stream;
      this.source = source;
      this.analyser = analyser;
      this.active = true;
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
  }

  /** Sensitivity 0..1 → RMS gain ~1.5..9. */
  setSensitivity(t: number): void {
    this.gain = 1.5 + Math.max(0, Math.min(1, t)) * 7.5;
  }

  read(): MicDrive | null {
    if (!this.active || !this.analyser || !this.ctx) return null;
    const s = this.coupler.read(this.analyser, this.ctx, this.gain);
    // Gentle reform toward the mandala when the room is quiet — a calm breath.
    const home = Math.max(0, 0.04 * (1 - s.amp * 3.2));
    return { amp: s.amp, modes: s.modes, home, m: s.m, n: s.n };
  }
}
