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
  beat: boolean; // true on the frame a bass-kick onset is detected
  bass: number; // raw sub-200Hz band energy 0..1 (kick strength source)
}

export class MicEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private coupler = new SpectrumCoupler();
  private active = false;
  private gain = 4; // sensitivity (RMS→amp); ambient is quieter than the synth gong
  // Bass-reactivity state (the "dance"). bassEnv is a fast-attack/quick-release
  // envelope on the sub-200Hz band that drives amplitude near-instantly; avgBass
  // + beatHold are the onset (kick) detector; bassBins is a reused FFT buffer.
  private bassEnv = 0;
  private avgBass = 0;
  private beatHold = 0;
  private bassBins: Uint8Array<ArrayBuffer> = new Uint8Array(1024);

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
      analyser.smoothingTimeConstant = 0.35; // snappier than the gong — transients matter here
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
    this.bassEnv = 0;
    this.avgBass = 0;
    this.beatHold = 0;
  }

  /** Sensitivity 0..1 → bass→amp gain ~2..100 (wide, so quiet rooms still drive). */
  setSensitivity(t: number): void {
    this.gain = 2 + Math.max(0, Math.min(1, t)) * 98;
  }

  read(): MicDrive | null {
    if (!this.active || !this.analyser || !this.ctx) return null;
    const s = this.coupler.read(this.analyser, this.ctx, this.gain); // modes + broadband amp

    // Sub-200Hz band energy — the bass that drives the dance.
    const binCount = this.analyser.frequencyBinCount;
    if (this.bassBins.length !== binCount) this.bassBins = new Uint8Array(binCount);
    this.analyser.getByteFrequencyData(this.bassBins);
    const binHz = this.ctx.sampleRate / this.analyser.fftSize;
    let sum = 0;
    let nb = 0;
    for (let i = 0; i < binCount && i * binHz < 200; i++) {
      sum += this.bassBins[i];
      nb++;
    }
    const bass = nb > 0 ? sum / (nb * 255) : 0; // 0..1 raw, this frame

    // Onset (kick): bass jumps well above its fast-running mean, refractory-gated.
    this.avgBass += (bass - this.avgBass) * 0.12; // fast-tracking mean
    let beat = false;
    if (bass > 0.14 && bass > this.avgBass * 1.45 && this.beatHold <= 0) {
      beat = true;
      this.beatHold = 4; // ~67ms refractory — keeps up with 16th notes at ~150 BPM
    }
    if (this.beatHold > 0) this.beatHold--;

    // Field pump: amplitude tracks the bass with a near-instant attack and a
    // quick release, so the cloud breathes WITH the beat instead of lagging it.
    // The c-mic gain scales sensitivity. A small broadband floor (s.amp) keeps
    // non-bass material (melody, vocals) alive.
    const target = Math.min(1.5, bass * this.gain);
    const k = target > this.bassEnv ? 0.5 : 0.22; // fast up (~50ms), quick down (~300ms)
    this.bassEnv += (target - this.bassEnv) * k;
    const amp = Math.min(1.6, this.bassEnv + s.amp * 0.25);

    // Gentle reform toward the mandala when the room is quiet — a calm breath.
    const home = Math.max(0, 0.04 * (1 - amp * 3.2));
    return { amp, modes: s.modes, home, m: s.m, n: s.n, beat, bass };
  }
}
