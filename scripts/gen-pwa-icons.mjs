// One-off: generate PWA icons (opaque, flattened onto the site background) from
// a source mandala icon. Run: node scripts/gen-pwa-icons.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const SRC = "IconsTibetanMandalas__/05_RandomCreativeMandala.png";
const OUT = "public/pwa";
const BG = { r: 0x12, g: 0x0e, b: 0x1a }; // #120e1a — matches the app background

mkdirSync(OUT, { recursive: true });

async function flat(size, inner) {
  // Fit the motif into `inner` px, centered on a `size` px opaque BG square.
  const pad = Math.round((size - inner) / 2);
  const motif = await sharp(SRC)
    .resize(inner, inner, { fit: "contain", background: { ...BG, alpha: 0 } })
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: motif, top: pad, left: pad }])
    .flatten({ background: BG })
    .png({ palette: true, quality: 90, compressionLevel: 9 });
}

await (await flat(192, 184)).toFile(`${OUT}/icon-192.png`);
await (await flat(512, 496)).toFile(`${OUT}/icon-512.png`);
await (await flat(512, 400)).toFile(`${OUT}/icon-maskable-512.png`); // ~78% safe zone
await (await flat(180, 172)).toFile(`${OUT}/apple-touch-icon-180.png`);

console.log("wrote pwa icons to", OUT);
