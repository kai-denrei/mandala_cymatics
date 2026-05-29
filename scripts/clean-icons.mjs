// One-off: clean the bottom-left scan-noise spray from the RADIAL control icons.
// Their motif fits inside an inscribed disc, so: (1) drop faint semi-transparent
// speckles via an alpha threshold, (2) clip the 4 corners (where the spray sits)
// with a disc mask. Star/burst icons reach the corners, so they are left alone.
// Run: node scripts/clean-icons.mjs
import sharp from "sharp";
import { rename } from "node:fs/promises";

const DIR = "public/icons";
const RADIAL = ["strike", "reform", "dashboard", "minus"];
const ALPHA_MIN = 140; // below this = scan fringe → drop
const R_FRAC = 0.475; // disc radius as a fraction of the icon side

for (const name of RADIAL) {
  const file = `${DIR}/${name}.png`;
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let p = 3; p < data.length; p += 4) {
    if (data[p] < ALPHA_MIN) data[p] = 0; // remove faint speckle fringe
  }
  const r = Math.round(R_FRAC * info.width);
  const mask = Buffer.from(
    `<svg width="${info.width}" height="${info.height}"><circle cx="${info.width / 2}" cy="${info.height / 2}" r="${r}" fill="#fff"/></svg>`,
  );
  const tmp = `${DIR}/.${name}.clean.png`;
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .composite([{ input: mask, blend: "dest-in" }]) // keep only the inscribed disc
    .png()
    .toFile(tmp);
  await rename(tmp, file);
  console.log("cleaned", name);
}
