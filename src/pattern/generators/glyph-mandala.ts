import type { PatternGenerator, PatternParams } from "../types";
import { makeRng, randRange, pick } from "../rng";
import { BG_HEX } from "../../grid";

// Tibetan syllable pools. Single seeds for dense rings; phrases unused at draw
// time but kept as documented intent — we only render single glyphs so every
// sector stays byte-identical and the system Tibetan font shapes them cleanly.
const SEEDS = [
  "ༀ", // oṃ
  "ཨ", // a
  "ཧཱུྃ", // hūṃ
  "ཤ", // sha
  "ར", // ra
  "ཉ", // nya
  "ཝ", // wa
] as const;

const TIBETAN_FONT = '"Kailasa","Noto Sans Tibetan","Microsoft Himalaya",serif';

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const glyphMandala: PatternGenerator = {
  id: "glyph-mandala",
  label: "Glyph Mandala",
  symmetric: true,
  render(ctx: CanvasRenderingContext2D, size: number, pal: string[], params: PatternParams): void {
    // 1. Background first.
    ctx.fillStyle = BG_HEX;
    ctx.fillRect(0, 0, size, size);

    const rng = makeRng(params.seed);
    const cx = size / 2;
    const cy = size / 2;
    const maxR = 0.45 * size;

    const n = clamp(Math.round(params.order), 4, 12);
    const rings = clamp(Math.round(params.depth), 2, 5);
    const dense = params.complexity >= 4; // 2*n glyphs per ring when dense

    // jitter: ONE rng draw, applied to the whole mandala → still symmetric.
    const globalRot = (params.jitter || 0) * randRange(rng, -1, 1) * (Math.PI / n);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Precompute per-ring choices ONCE (before any n-fold replication) so all
    // sectors draw identically. Reserve glyph picks in ring order too.
    type Ring = { rr: number; gs: number; color: string; glyph: string; count: number };
    const ringData: Ring[] = [];
    for (let R = 1; R <= rings; R++) {
      const rr = (0.12 + 0.33 * (R / rings)) * size;
      const gs = (0.05 + 0.02 * ((rings - R) / rings)) * size;
      const glyph = pick(rng, SEEDS); // uniform per ring → symmetric
      ringData.push({
        rr,
        gs,
        color: pal[R % 5],
        glyph,
        count: dense ? 2 * n : n,
      });
    }
    const centreGlyph = pick(rng, SEEDS); // centre pick after ring picks

    // 2 + backing. Translucent filled inner disc to give the disc body.
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = pal[1];
    ctx.beginPath();
    ctx.arc(cx, cy, maxR * 0.95, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Faint petals between centre and rim (symmetric, rotated as a whole).
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(globalRot);
    ctx.globalAlpha = 0.3;
    const petalR = maxR * 0.78;
    ctx.fillStyle = pal[2]; // one colour for all n petals → exact n-fold symmetry
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = Math.cos(a) * petalR * 0.55;
      const py = Math.sin(a) * petalR * 0.55;
      ctx.beginPath();
      ctx.ellipse(px, py, petalR * 0.42, petalR * 0.16, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Faint concentric ring strokes at each ring radius.
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 3;
    for (let R = 1; R <= rings; R++) {
      const rr = ringData[R - 1].rr;
      ctx.strokeStyle = pal[R % 5];
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(rr, maxR), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // Glyph rings. n-fold replication with identical content per sector.
    for (const ring of ringData) {
      const rr = Math.min(ring.rr, maxR - ring.gs * 0.5);
      const count = ring.count;
      ctx.fillStyle = ring.color;
      ctx.font = `${ring.gs}px ${TIBETAN_FONT}`;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + globalRot;
        ctx.save();
        ctx.translate(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        ctx.rotate(a + Math.PI / 2);
        ctx.fillText(ring.glyph, 0, 0);
        ctx.restore();
      }
    }

    // Centre: filled disc behind, then larger glyph.
    ctx.save();
    ctx.fillStyle = pal[4];
    ctx.beginPath();
    ctx.arc(cx, cy, 0.05 * size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = pal[0];
    ctx.font = `${0.12 * size}px ${TIBETAN_FONT}`;
    ctx.fillText(centreGlyph, cx, cy);
  },
};
