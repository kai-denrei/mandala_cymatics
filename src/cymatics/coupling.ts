// Shared FFT → weighted-Chladni-mode coupler. Peak-picks the dominant partials
// of an AnalyserNode's spectrum and maps each (by frequency ratio) to a
// square-plate Chladni mode (natural freq ∝ √(m²+n²)), returning a normalized
// superposition. Both the synth gong and the live microphone use this — each
// with its OWN instance, so their smoothing state stays independent.

import type { ModeWeight } from "../types";

interface Mode {
  m: number;
  n: number;
  fp: number; // √(m²+n²)
}

// Antisymmetric modes (m < n), sorted by ascending fp.
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

export interface SpectrumOut {
  amp: number; // smoothed 0..1
  modes: ModeWeight[]; // normalized Σw = 1
  m: number; // representative (top-weight) mode
  n: number;
}

export class SpectrumCoupler {
  private slots: ModeWeight[] = []; // persistent smoothed modes
  private sAmp = 0;
  private bins: Uint8Array<ArrayBuffer> = new Uint8Array(1024);

  /** Clear smoothed state so a new session doesn't replay stale modes/level. */
  reset(): void {
    this.slots = [];
    this.sAmp = 0;
  }

  /**
   * Read the analyser's spectrum into a normalized multi-mode field state.
   * `ampGain` scales RMS→amplitude (mic input is much quieter than the gong).
   */
  read(analyser: AnalyserNode, ctx: AudioContext, ampGain = 2.4): SpectrumOut {
    if (this.bins.length !== analyser.frequencyBinCount) {
      this.bins = new Uint8Array(analyser.frequencyBinCount);
    }
    analyser.getByteFrequencyData(this.bins);
    const bins = this.bins;
    const N = bins.length;
    const binHz = ctx.sampleRate / analyser.fftSize;

    // RMS → amplitude (smoothed).
    let sumSq = 0;
    let sum = 0;
    for (let i = 0; i < N; i++) {
      sumSq += bins[i] * bins[i];
      sum += bins[i];
    }
    const rms = Math.sqrt(sumSq / N) / 255;
    this.sAmp += (Math.min(1, rms * ampGain) - this.sAmp) * 0.16;

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

    // Parabolic refine → frequency, then sort ascending by frequency.
    const peaks = top.map(({ i, mag }) => {
      const denom = bins[i - 1] - 2 * bins[i] + bins[i + 1];
      const delta = Math.abs(denom) > 1e-6 ? (0.5 * (bins[i - 1] - bins[i + 1])) / denom : 0;
      return { f: (i + delta) * binHz, mag };
    });
    peaks.sort((a, b) => a.f - b.f);

    // Map each peak → Chladni mode by frequency ratio to the lowest peak.
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

    // Per-mode attack/release, matched by (m,n) identity.
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

    // Clamp to K, keep strongest, normalize Σw = 1.
    this.slots.sort((a, b) => b.w - a.w);
    const K = this.sAmp > 0.5 ? K_MAX : 4;
    if (this.slots.length > K) this.slots = this.slots.slice(0, K);
    let total = 0;
    for (const s of this.slots) total += s.w;
    const modes: ModeWeight[] =
      total > 0 ? this.slots.map((s) => ({ m: s.m, n: s.n, w: s.w / total })) : [];

    const rep = modes.length ? modes[0] : { m: 3, n: 5, w: 1 };
    return { amp: this.sAmp, modes, m: rep.m, n: rep.n };
  }
}
