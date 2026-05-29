// Gong synthesis + multi-mode FFT coupling.
//
// Synthesis: a deep Tibetan singing-bowl / standing-bell voice via additive
// sine partials with bowl-characteristic inharmonic ratios (~1, 2.66, 2.79
// bell-tierce, 5.06, 8.05, 11.6), slow absolute-Hz beating on the low partials
// (the elliptical-bowl shimmer), a soft mallet transient, NO pitch glide, a
// kept sub-octave boom, and a dark procedural temple reverb. No samples.
//
// Coupling: an AnalyserNode peak-picks the dominant partials of the live output
// and maps each (by frequency ratio) to a square-plate Chladni mode (natural
// freq ∝ √(m²+n²)). read() returns a WEIGHTED SUPERPOSITION of modes, so the
// nodal pattern the particles settle into IS the sound's spectral structure and
// simplifies toward low modes as the tail decays (highs die first).

import type { ModeWeight } from "../types";

/** Field-driving state derived from the live gong spectrum. */
export interface AudioDrive {
  amp: number;
  modes: ModeWeight[]; // normalized (Σw = 1) superposition of Chladni modes
  home: number;
  m: number; // representative top-weight mode (panel display / back-compat)
  n: number;
}

// Deep low-pentatonic fundamentals (Hz): G2, A2, C3, D3, E3, G3 — the bowl
// sweet spot. The kept sub-octave boom (0.5×) lands at 49–98 Hz: felt, deep.
const SCALE = [98.0, 110.0, 130.81, 146.83, 164.81, 196.0];

// Bowl/bell partials relative to the fundamental. amp = relative gain,
// tau = −60 dB decay time (s), beat = absolute Hz split for the detuned pair
// (0 = single oscillator). The 2.79 entry is the bell tierce (minor-3rd colour).
interface Partial {
  ratio: number;
  amp: number;
  tau: number;
  beat: number;
}
const PARTIALS: Partial[] = [
  { ratio: 1.0, amp: 1.0, tau: 22, beat: 1.2 },
  { ratio: 2.66, amp: 0.55, tau: 14, beat: 2.8 },
  { ratio: 2.79, amp: 0.22, tau: 12, beat: 0 },
  { ratio: 5.06, amp: 0.28, tau: 8, beat: 4.5 },
  { ratio: 8.05, amp: 0.13, tau: 4.5, beat: 0 },
  { ratio: 11.6, amp: 0.06, tau: 2.5, beat: 0 },
];

// Square-plate antisymmetric Chladni modes (m < n), sorted by λ = √(m²+n²).
// The coupling maps each detected partial's frequency ratio to one of these.
interface Mode {
  m: number;
  n: number;
  fp: number;
}
const MODES: Mode[] = [
  { m: 1, n: 2, fp: 2.236 }, { m: 1, n: 3, fp: 3.162 }, { m: 2, n: 3, fp: 3.606 },
  { m: 1, n: 4, fp: 4.123 }, { m: 2, n: 4, fp: 4.472 }, { m: 3, n: 4, fp: 5.0 },
  { m: 1, n: 5, fp: 5.099 }, { m: 2, n: 5, fp: 5.385 }, { m: 3, n: 5, fp: 5.831 },
  { m: 1, n: 6, fp: 6.083 }, { m: 2, n: 6, fp: 6.325 }, { m: 4, n: 5, fp: 6.403 },
  { m: 3, n: 6, fp: 6.708 }, { m: 1, n: 7, fp: 7.071 }, { m: 4, n: 6, fp: 7.211 },
  { m: 2, n: 7, fp: 7.28 }, { m: 3, n: 7, fp: 7.616 }, { m: 5, n: 6, fp: 7.81 },
  { m: 1, n: 8, fp: 8.062 }, { m: 4, n: 7, fp: 8.062 }, { m: 2, n: 8, fp: 8.246 },
  { m: 3, n: 8, fp: 8.544 }, { m: 5, n: 7, fp: 8.602 }, { m: 4, n: 8, fp: 8.944 },
  { m: 6, n: 7, fp: 9.22 }, { m: 5, n: 8, fp: 9.434 }, { m: 6, n: 8, fp: 10.0 },
  { m: 7, n: 8, fp: 10.63 },
];

export class GongEngine {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null; // strikes/boom/transient route here
  private analyser: AnalyserNode | null = null;
  private bins: Uint8Array<ArrayBuffer> = new Uint8Array(1024);
  private started = false;
  private idx = 0;

  // coupling state
  private sAmp = 0;
  private slots: ModeWeight[] = []; // persistent smoothed modes

  /** Must be called from a user gesture (autoplay policy). Idempotent. */
  async start(): Promise<void> {
    if (this.started && this.ctx) {
      await this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();

    // Strike bus -> master lowpass -> dry/wet (convolution reverb) -> limiter.
    const bus = ctx.createGain();
    bus.gain.value = 0.3; // headroom for the worst-case coincident onset sum
    const masterLP = ctx.createBiquadFilter();
    masterLP.type = "lowpass";
    masterLP.frequency.value = 3200; // pass the air partial + tierce, tame harshness
    masterLP.Q.value = 0.4;

    const dry = ctx.createGain();
    dry.gain.value = 0.75;
    const predelay = ctx.createDelay(0.2);
    predelay.delayTime.value = 0.03; // keep the onset crisp
    const convolver = ctx.createConvolver();
    convolver.buffer = this.makeImpulseResponse(ctx, 8.0, 2.7); // dark stone-temple tail
    const wetLP = ctx.createBiquadFilter();
    wetLP.type = "lowpass";
    wetLP.frequency.value = 3200;
    const wet = ctx.createGain();
    wet.gain.value = 0.25;
    const mix = ctx.createGain();
    mix.gain.value = 1;

    // Limiter (hard knee, fast attack) + a tanh soft-clip ceiling after it, so
    // even coincident strike onsets can't hard-clip at the destination.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 0;
    comp.ratio.value = 20;
    comp.attack.value = 0.001;
    comp.release.value = 0.4;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1025);
    for (let i = 0; i <= 1024; i++) {
      const x = i / 512 - 1; // map index -> [-1, 1]
      curve[i] = Math.tanh(1.5 * x); // gentle ceiling at ±tanh(1.5) ≈ ±0.905
    }
    shaper.curve = curve;
    shaper.oversample = "2x";

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048; // resolve bowl partials into separate bins
    analyser.smoothingTimeConstant = 0.5;

    bus.connect(masterLP);
    masterLP.connect(dry);
    dry.connect(mix);
    bus.connect(predelay);
    predelay.connect(convolver);
    convolver.connect(wetLP);
    wetLP.connect(wet);
    wet.connect(mix);
    mix.connect(comp);
    comp.connect(shaper);
    shaper.connect(analyser);
    analyser.connect(ctx.destination);

    this.ctx = ctx;
    this.bus = bus;
    this.analyser = analyser;
    this.bins = new Uint8Array(analyser.frequencyBinCount);
    this.started = true;
  }

  /** Build a synthetic stereo impulse response (exponentially-decaying noise). */
  private makeImpulseResponse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const length = Math.max(1, Math.floor(seconds * rate));
    const buf = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return buf;
  }

  /** One decaying sine voice (a single partial or one half of a beating pair). */
  private voice(
    ctx: AudioContext,
    bus: GainNode,
    t0: number,
    freqHz: number,
    amp: number,
    tau: number,
    pan: number,
    atk: number,
  ): void {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freqHz, t0); // no glide
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(amp, t0 + atk);
    g.gain.setTargetAtTime(0.0001, t0 + atk, tau / 6.9); // −60 dB ≈ 6.9 τ
    osc.connect(g);
    if (pan !== 0) {
      const sp = ctx.createStereoPanner();
      sp.pan.value = pan;
      g.connect(sp);
      sp.connect(bus);
    } else {
      g.connect(bus);
    }
    osc.start(t0);
    osc.stop(t0 + atk + tau + 0.2);
  }

  /**
   * Synthesize and play one bowl/bell strike at the given fundamental.
   * `transientGain` softens the mallet click for the ambient ("sung") loop.
   * `intensity` (0..~1.3) scales the whole strike's loudness — a light tap vs a
   * hard hit.
   */
  strike(freq = 110, transientGain = 0.18, intensity = 1): void {
    const ctx = this.ctx;
    const bus = this.bus;
    if (!ctx || !bus) return;
    const t0 = ctx.currentTime;

    // Per-strike gain stage: everything for this strike routes through `dest`,
    // scaled by intensity, so a light vs hard hit differs in loudness.
    const dest = ctx.createGain();
    dest.gain.value = Math.max(0.08, Math.min(1.3, intensity));
    dest.connect(bus);

    for (const p of PARTIALS) {
      const baseHz = freq * p.ratio * (1 + (Math.random() - 0.5) * 0.004); // ±0.2% jitter
      const atk = p.ratio >= 8 ? 0.005 : 0.012;
      if (p.beat > 0) {
        // Detuned pair, split by an ABSOLUTE Hz offset, panned for a moving beat.
        this.voice(ctx, dest, t0, baseHz - p.beat / 2, p.amp / 2, p.tau, -0.15, atk);
        this.voice(ctx, dest, t0, baseHz + p.beat / 2, p.amp / 2, p.tau, 0.15, atk);
      } else {
        this.voice(ctx, dest, t0, baseHz, p.amp, p.tau, 0, atk);
      }
    }

    // Sub-octave boom — felt body, lowpassed so it stays felt-not-muddy.
    const boom = ctx.createOscillator();
    boom.type = "sine";
    boom.frequency.setValueAtTime(freq * 0.5, t0);
    const boomLP = ctx.createBiquadFilter();
    boomLP.type = "lowpass";
    boomLP.frequency.value = 180;
    boomLP.Q.value = 0.7;
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0, t0);
    bg.gain.linearRampToValueAtTime(0.5, t0 + 0.03);
    bg.gain.setTargetAtTime(0.0001, t0 + 0.03, 20 / 6.9);
    boom.connect(bg);
    bg.connect(boomLP);
    boomLP.connect(dest);
    boom.start(t0);
    boom.stop(t0 + 20.2);

    // Mallet contact transient — a short band-passed noise burst.
    const noiseLen = Math.max(1, Math.floor(0.05 * ctx.sampleRate));
    const nb = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) nd[i] = Math.random() * 2 - 1;
    const ns = ctx.createBufferSource();
    ns.buffer = nb;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 3200;
    bp.Q.value = 2;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0, t0);
    ng.gain.linearRampToValueAtTime(transientGain, t0 + 0.001);
    ng.gain.setTargetAtTime(0.0001, t0 + 0.001, 0.006); // completes within the 0.05s burst
    ns.connect(bp);
    bp.connect(ng);
    ng.connect(dest);
    ns.start(t0);
    ns.stop(t0 + 0.06);
  }

  private nextFreq(): number {
    const f = SCALE[this.idx % SCALE.length];
    this.idx++;
    return f;
  }

  /** Strike the next pentatonic fundamental. main.ts owns all scheduling. */
  strikeNow(transientGain = 0.18, intensity = 1): void {
    this.strike(this.nextFreq(), transientGain, intensity);
  }

  /**
   * Read the live spectrum -> field-driving state (multi-mode superposition).
   * null until started.
   */
  read(): AudioDrive | null {
    const analyser = this.analyser;
    const ctx = this.ctx;
    if (!this.started || !analyser || !ctx) return null;
    analyser.getByteFrequencyData(this.bins);
    const bins = this.bins;
    const N = bins.length;
    const binHz = ctx.sampleRate / analyser.fftSize;

    // RMS -> amplitude (smoothed).
    let sumSq = 0;
    let sum = 0;
    for (let i = 0; i < N; i++) {
      sumSq += bins[i] * bins[i];
      sum += bins[i];
    }
    const rms = Math.sqrt(sumSq / N) / 255;
    this.sAmp += (Math.min(1, rms * 2.4) - this.sAmp) * 0.16;

    // Peak-pick: local maxima above an adaptive floor.
    const mean = sum / N;
    const floor = Math.max(8, mean);
    const MARGIN = 18;
    const cands: { i: number; mag: number }[] = [];
    for (let i = 1; i < N - 1; i++) {
      const v = bins[i];
      if (v > floor + MARGIN && v > bins[i - 1] && v >= bins[i + 1]) cands.push({ i, mag: v });
    }
    cands.sort((a, b) => b.mag - a.mag);
    const K_RAW = 8;
    const top = cands.slice(0, K_RAW);

    // Parabolic refine -> frequency, then sort ascending by frequency.
    const peaks = top.map(({ i, mag }) => {
      const denom = bins[i - 1] - 2 * bins[i] + bins[i + 1];
      const delta = Math.abs(denom) > 1e-6 ? (0.5 * (bins[i - 1] - bins[i + 1])) / denom : 0;
      return { f: (i + delta) * binHz, mag };
    });
    peaks.sort((a, b) => a.f - b.f);

    // Map each peak -> Chladni mode by frequency ratio to the lowest peak.
    const targets: ModeWeight[] = [];
    if (peaks.length > 0) {
      const fRef = peaks[0].f || 1;
      const fp0 = MODES[0].fp;
      const maxRatio = MODES[MODES.length - 1].fp / fp0;
      const maxIdx = Math.floor(6 + 21 * this.sAmp); // fewer/lower modes when quiet
      for (const pk of peaks) {
        let ratio = pk.f / fRef;
        if (ratio < 1) ratio = 1;
        if (ratio > maxRatio) ratio = maxRatio;
        let bestJ = 0;
        let bestD = Infinity;
        for (let j = 0; j < MODES.length; j++) {
          const d = Math.abs(MODES[j].fp / fp0 - ratio);
          if (d < bestD) {
            bestD = d;
            bestJ = j;
          }
        }
        if (bestJ > maxIdx) continue;
        const mm = MODES[bestJ];
        const wRaw = Math.max(0, (pk.mag - floor) / 255);
        const existing = targets.find((t) => t.m === mm.m && t.n === mm.n);
        if (existing) {
          if (wRaw > existing.w) existing.w = wRaw;
        } else {
          targets.push({ m: mm.m, n: mm.n, w: wRaw });
        }
      }
    }

    // Per-mode attack/release, matched by (m,n) identity (not array position).
    const kUp = 0.25;
    const kDown = 0.06;
    const FREE_BELOW = 0.02;
    const K_MAX = 6;
    for (const slot of this.slots) {
      const t = targets.find((x) => x.m === slot.m && x.n === slot.n);
      slot.w += ((t ? t.w : 0) - slot.w) * (t ? kUp : kDown);
    }
    for (const t of targets) {
      if (!this.slots.find((s) => s.m === t.m && s.n === t.n) && this.slots.length < K_MAX) {
        this.slots.push({ m: t.m, n: t.n, w: t.w * kUp });
      }
    }
    this.slots = this.slots.filter((s) => s.w >= FREE_BELOW);

    // Clamp to K (4, or up to 6 while loud), keep the strongest.
    this.slots.sort((a, b) => b.w - a.w);
    const K = this.sAmp > 0.5 ? K_MAX : 4;
    if (this.slots.length > K) this.slots = this.slots.slice(0, K);

    // Normalize Σw = 1 so the summed force magnitude stays ~single-mode (STR valid).
    let total = 0;
    for (const s of this.slots) total += s.w;
    const modes: ModeWeight[] =
      total > 0 ? this.slots.map((s) => ({ m: s.m, n: s.n, w: s.w / total })) : [];

    // No auto-reform: each gong compounds the previous one's dispersal from the
    // current particle positions (impermanence). Only the explicit ❉ reform
    // pulls the mandala back; between strikes the destruction simply persists.
    const rep = modes.length ? modes[0] : { m: 3, n: 5, w: 1 };
    return { amp: this.sAmp, modes, home: 0, m: rep.m, n: rep.n };
  }
}
