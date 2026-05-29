// Five Buddhas palette and variations. Pure module — no DOM.
// East/Vairocana white · South/Ratnasambhava yellow · West/Amitabha red ·
// North/Amoghasiddhi green · Centre/Akshobhya blue.

import type { PaletteName } from "./types";

// Curated fixed palettes. Each is a 5-stop ramp: the operator-chosen 4 colours
// plus one interpolated mid-stop (between [1] and [2]) for a smoother gradient.
export const PALETTES: Record<PaletteName, readonly string[]> = {
  buddhas: ["#F2EBD8", "#E8B83D", "#C73A2A", "#2E7D5C", "#2D4A8C"], // default — Five Buddhas
  sunrise: ["#E89951", "#ECB65F", "#EECE67", "#F0E76F", "#A5CF83"],
  ember: ["#760031", "#D51C39", "#EA3E4C", "#FF6060", "#FEEC41"],
  lagoon: ["#007979", "#24B1B1", "#91D0CA", "#FFF0E4", "#FFE0C5"],
  twilight: ["#111844", "#4B5694", "#5E6FA1", "#7288AE", "#EAE0CF"],
  saffron: ["#D92243", "#F69D39", "#EBB057", "#E0C375", "#FFF5E5"],
  meadow: ["#59B292", "#FFC94D", "#FCD88C", "#FAE7CB", "#FA6781"],
  blossom: ["#D6336C", "#FF4081", "#FF7BA1", "#FFB6C1", "#FFF5F8"],
};

/** Rotate a hex colour's hue by `deg` degrees in HSL space. Returns rgb(). */
export function shiftHue(hex: string, deg: number): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  let h = 0;
  let s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  h = (h + deg) % 360;
  if (h < 0) h += 360;
  const hueToRgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) {
    const v = Math.round(l * 255);
    return `rgb(${v},${v},${v})`;
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const rr = Math.round(hueToRgb(p, q, h / 360 + 1 / 3) * 255);
  const gg = Math.round(hueToRgb(p, q, h / 360) * 255);
  const bb = Math.round(hueToRgb(p, q, h / 360 - 1 / 3) * 255);
  return `rgb(${rr},${gg},${bb})`;
}

/** Resolve a palette name + hue rotation into 5 concrete CSS colours. */
export function resolvePalette(name: PaletteName, hue: number): string[] {
  return PALETTES[name].map((c) => shiftHue(c, hue));
}
