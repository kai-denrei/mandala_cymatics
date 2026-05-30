// Reactivity tabs — named "ears" presets. Each is a fixed tuning of the mic +
// cymatics controls (raw 0..100 slider values); selecting a tab loads these into
// the panel sliders and re-reads them live. Pattern and renderer are untouched.
//
// These are STARTING POINTS, fixed in code. To bake in a new tuning: dial it on
// the sliders, read off the values, and commit them here. The human-readable
// record for `ohm` also lives at presets/ohm.json (and the git tag `ohm`).

export interface ReactivityPreset {
  id: string;
  label: string;
  /** Mic-reactivity sliders, raw 0..100. */
  mic: {
    floor: number; // c-floor   (noise gate)
    bass: number; // c-low      (40–250 Hz weight)
    mid: number; // c-mid       (250–2000 Hz weight)
    treble: number; // c-high   (2–8 kHz weight)
    react: number; // c-react   (master reaction strength)
    scatter: number; // c-punch (steady diffusion between pops — kept low for a crisp settle)
    fling: number; // c-fling  (Explode sensitivity — how easily a beat triggers a full-cloud pop)
    flow: number; // c-flow    (small continuous agitation so settled grains keep skittering)
  };
  /** Cymatics sliders, raw 0..100. */
  cymatics: {
    jolt: number; // c-jolt
    settle: number; // c-settle
    decay: number; // c-decay
    jitter: number; // c-jitter
  };
}

export const PRESETS: ReactivityPreset[] = [
  {
    // The current hum-responsive baseline (= git tag `ohm`, build b1fe182b).
    // Bass-leaning ears: tracks sustained low tones / humming especially well.
    id: "ohm",
    label: "ohm",
    mic: { floor: 50, bass: 67, mid: 47, treble: 33, react: 35, scatter: 25, fling: 30, flow: 8 },
    cymatics: { jolt: 41, settle: 60, decay: 25, jitter: 30 },
  },
  {
    // The single "Music" preset — one universal tuning that answers well to all
    // music. Flatter band weights so mids/treble (melody, vocals, hats) drive
    // alongside bass, more React so beats/onsets register, a touch livelier
    // scatter + snappier settle. (Formerly the "all-music" tab.)
    id: "music",
    label: "music",
    mic: { floor: 50, bass: 60, mid: 60, treble: 55, react: 55, scatter: 30, fling: 60, flow: 12 },
    cymatics: { jolt: 45, settle: 64, decay: 30, jitter: 32 },
  },
  {
    // RETAINED, UNEXPOSED. Techno — a steady 4-on-the-floor kick + hats tuning.
    // No UI references it after the mode collapse; kept here so it can be revived
    // (e.g. re-add a mode button) without re-deriving the values.
    id: "techno",
    label: "techno",
    mic: { floor: 50, bass: 70, mid: 50, treble: 60, react: 70, scatter: 40, fling: 80, flow: 15 },
    cymatics: { jolt: 55, settle: 75, decay: 20, jitter: 35 },
  },
];

/** Look up a preset by id, falling back to the first (ohm) if absent. */
export function presetById(id: string): ReactivityPreset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}

export const DEFAULT_PRESET_ID = "ohm";
