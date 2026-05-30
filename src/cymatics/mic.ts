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
import { SpectrumCoupler, type SpectrumOut } from "./coupling";

export interface MicDrive {
  amp: number; // envelope-followed vibration intensity (continuous, ~0 in silence)
  bassRise: number; // sharp attack in the bass band → radial (centre) burst
  midRise: number; // sharp attack in the mid band → horizontal (L/R) burst
  trebleRise: number; // sharp attack in the treble band → vertical (T/B) burst
  raw: number; // gated signal 0..1 for the debug bar
  modes: ModeWeight[];
  m: number;
  n: number;
  // ---- Measurement layer (HUD readout; does NOT feed the physics) ----
  // These are the raw real-time features, exposed independently so we can SEE
  // each one before deciding how it should drive the visuals.
  db: number; // overall loudness, true dBFS from the time-domain RMS (~−100 silence .. 0 max)
  bass: number; // bass-band envelope 0..1 (40–250 Hz), gated + smoothed, pre-weight
  mid: number; // mid-band envelope 0..1 (250–2000 Hz)
  treble: number; // treble-band envelope 0..1 (2–8 kHz)
  react: number; // overall onset/attack flux this frame (Σ band rises) — transient energy
  centroid: number; // spectral centroid 0..1 (brightness: where the energy sits, bass↔treble)
  flatness: number; // spectral flatness 0..1 (tonal↔noise; the measurable basis for "scatter")
  explode: number; // 1 on a "pop" frame (reseed the whole cloud to random), else 0
}

const FLOOR_WIN = 480; // ~8s @60fps — window for the quiet-baseline (running minimum)

/** One band: noise floor (windowed minimum) + envelope follower; reports the
 *  smoothed level and the positive attack (rise) this frame. */
class BandTracker {
  private ring = new Float32Array(FLOOR_WIN);
  private fi = 0;
  private filled = 0;
  private env = 0;
  private prevEnv = 0;

  reset(): void {
    this.fi = 0;
    this.filled = 0;
    this.env = 0;
    this.prevEnv = 0;
  }

  update(energy: number): { env: number; rise: number } {
    // Noise floor = MINIMUM energy over the last ~8s (a true windowed minimum, NOT
    // an EMA): it snaps to any quiet moment and forgets stale lows as they slide
    // out, so it can't creep up to the music level and kill the signal over a long
    // session (the old EMA's failure). signal = how far above the recent quiet.
    this.ring[this.fi] = energy;
    this.fi = (this.fi + 1) % FLOOR_WIN;
    if (this.filled < FLOOR_WIN) this.filled++;
    let floor = Infinity;
    for (let i = 0; i < this.filled; i++) {
      if (this.ring[i] < floor) floor = this.ring[i];
    }
    const signal = Math.max(0, energy - floor);
    this.env += (signal - this.env) * (signal > this.env ? ATTACK : RELEASE);
    const rise = Math.max(0, this.env - this.prevEnv);
    this.prevEnv = this.env;
    return { env: this.env, rise };
  }
}

const LOW_LO = 40, LOW_HI = 250; // bass / kick body
const MID_LO = 250, MID_HI = 2000; // body / vocals / melody
const HIGH_LO = 2000, HIGH_HI = 8000; // presence / hats / air
const ATTACK = 0.5; // envelope follower: fast up (pumps with the music)
const RELEASE = 0.12; // ...slower down (smooth between beats)
const COUPLER_GAIN = 8;
const MAX_DB = -25;
const SOUND_GATE = 0.012; // weight-independent presence below this = "silent room"
const REACT_GAIN = 5; // per-frame onset flux is small — scale so attacks read on the HUD
const NOISE_SUB = 16; // byte floor subtracted from each bin to de-bed centroid/flatness
const EXPLODE_REFRACTORY = 14; // min frames between pops (~0.23s) → can track a fast beat
const EXPLODE_THRESH_DEFAULT = 0.12; // summed band-rise above this = a "pop" (strong beat)
const MIC_MAX_MODES = 3; // keep the figure clean — a few dominant modes, not a mesh

export class MicEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private coupler = new SpectrumCoupler();
  private active = false;

  private bins: Uint8Array<ArrayBuffer> = new Uint8Array(1024);
  private timeBuf = new Float32Array(2048); // time-domain samples for true RMS → dBFS
  private framesSinceExplode = EXPLODE_REFRACTORY; // explode refractory counter
  private explodeThresh = EXPLODE_THRESH_DEFAULT; // onset threshold for a pop (Explode slider)
  private lastSpec: SpectrumOut | null = null; // modes are frozen between pops (clean settle)
  private lowT = new BandTracker();
  private midT = new BandTracker();
  private highT = new BandTracker();

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

  /** Re-run the AudioContext if the OS suspended it (screen sleep / app
   *  backgrounding). Without this the mic silently stops feeding data while the
   *  UI still shows "listening" — sparklines freeze, the field stops reacting.
   *  Safe to call often: a no-op unless suspended. Resuming may need a user
   *  gesture, so the caller also retries on the next tap. */
  async resume(): Promise<void> {
    if (this.ctx && this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* gesture required — caller retries on next pointerdown */
      }
    }
  }

  /** True when listening but the context is suspended (frozen) — UI can hint. */
  get isSuspended(): boolean {
    return this.active && this.ctx?.state === "suspended";
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
    this.lowT.reset();
    this.midT.reset();
    this.highT.reset();
    this.coupler.reset(); // no stale modes/level across sessions
    this.framesSinceExplode = EXPLODE_REFRACTORY;
    this.lastSpec = null;
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
  /** Explode 0..1 → onset threshold (higher = more sensitive = pops more often). */
  setExplodeSens(t: number): number {
    this.explodeThresh = 0.2 - Math.max(0, Math.min(1, t)) * 0.17; // 0.20 (rare) .. 0.03 (every beat)
    return this.explodeThresh;
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

    const binCount = this.analyser.frequencyBinCount;
    if (this.bins.length !== binCount) this.bins = new Uint8Array(binCount);
    this.analyser.getByteFrequencyData(this.bins);
    const binHz = this.ctx.sampleRate / this.analyser.fftSize;

    // Per-band: gate against an auto floor (silence→0, tracks AGC drift) and
    // envelope-follow. Each band reports its smoothed level + its attack (rise).
    const lo = this.lowT.update(this.bandEnergy(LOW_LO, LOW_HI, binHz));
    const mi = this.midT.update(this.bandEnergy(MID_LO, MID_HI, binHz));
    const hi = this.highT.update(this.bandEnergy(HIGH_LO, HIGH_HI, binHz));

    // EXPLODE → reseed + reshape. A STRONG onset (refractory ~1.1s so there's time
    // to settle between) fires a "pop": main.ts scatters every grain to a random
    // disc point, and we hard-snap the modes to a NEW figure. BETWEEN pops the
    // modes are FROZEN (lastSpec) so the grains settle cleanly onto ONE pattern
    // instead of constantly morphing — the explode→settle→explode cycle.
    const onset = lo.rise + mi.rise + hi.rise;
    this.framesSinceExplode++;
    const explode = onset > this.explodeThresh && this.framesSinceExplode >= EXPLODE_REFRACTORY;
    if (explode) this.framesSinceExplode = 0;
    if (explode || !this.lastSpec) {
      this.lastSpec = this.coupler.read(this.analyser, this.ctx, COUPLER_GAIN, true);
    }
    const s = this.lastSpec; // frozen Chladni modes between pops

    // Continuous vibration intensity = weighted sum of the band envelopes.
    const amp = this.wLow * lo.env + this.wMid * mi.env + this.wHigh * hi.env;

    // ---- Measurement layer (HUD only) ----
    // True loudness: RMS of the raw time-domain signal → dBFS. (The byte spectrum
    // is already log-mapped between min/maxDecibels, so it's not a clean level —
    // the time domain is.) −100 dBFS in silence, 0 at full scale.
    if (this.timeBuf.length !== this.analyser.fftSize) this.timeBuf = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(this.timeBuf);
    let sq = 0;
    for (let i = 0; i < this.timeBuf.length; i++) sq += this.timeBuf[i] * this.timeBuf[i];
    const rms = Math.sqrt(sq / this.timeBuf.length);
    const db = rms > 1e-6 ? Math.max(-100, 20 * Math.log10(rms)) : -100;

    // Spectral centroid (brightness) + flatness (tonal↔noise). These are SHAPE
    // descriptors — they're defined for any spectrum, so without a gate they'd
    // report a value even on the room's noise floor. Gate them on a weight-
    // independent "is something actually playing" envelope so they read ~0 in
    // silence and only describe real sound. A small fixed floor subtraction (per
    // bin) strips the noise bed between partials so a clean tone reads genuinely
    // low flatness instead of being inflated by hiss in the gaps.
    const presence = lo.env + mi.env + hi.env;
    let centroid = 0, flatness = 0;
    if (presence > SOUND_GATE) {
      const loBin = Math.max(1, Math.round(40 / binHz));
      const hiBin = Math.min(this.bins.length - 1, Math.round(8000 / binHz));
      let magSum = 0, freqMagSum = 0, logSum = 0, count = 0;
      const EPS = 1e-4;
      for (let i = loBin; i <= hiBin; i++) {
        const v = Math.max(0, this.bins[i] - NOISE_SUB) / 255; // floor-subtracted, 0..1
        magSum += v;
        freqMagSum += v * (i * binHz);
        logSum += Math.log(v + EPS); // empty/gap bins → log(EPS): a tone stays spiky → low flatness
        count++;
      }
      if (magSum > 0 && count > 0) {
        centroid = Math.min(1, freqMagSum / magSum / 8000); // normalize to the band top
        const arith = magSum / count;
        const geo = Math.exp(logSum / count);
        flatness = arith > EPS ? Math.min(1, geo / arith) : 0;
      }
    }
    const react = Math.min(1, (lo.rise + mi.rise + hi.rise) * REACT_GAIN); // scaled onset flux

    // Keep only the dominant few modes (renormalized) so the nodal figure stays
    // CLEAN — like a Chladni plate driven near one resonance, not a muddy mesh.
    let modes = s.modes;
    if (modes.length > MIC_MAX_MODES) {
      const top = modes.slice(0, MIC_MAX_MODES);
      let tot = 0;
      for (const mm of top) tot += mm.w;
      modes = tot > 0 ? top.map((mm) => ({ m: mm.m, n: mm.n, w: mm.w / tot })) : top;
    }

    return {
      amp,
      bassRise: lo.rise * this.wLow, // → radial (centre) burst
      midRise: mi.rise * this.wMid, // → horizontal (L/R) burst
      trebleRise: hi.rise * this.wHigh, // → vertical (T/B) burst
      raw: Math.min(1, amp),
      modes,
      m: s.m,
      n: s.n,
      db,
      bass: lo.env,
      mid: mi.env,
      treble: hi.env,
      react,
      centroid,
      flatness,
      explode: explode ? 1 : 0,
    };
  }
}
