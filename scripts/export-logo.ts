// Script ponctuel : exporte le logo Classheure en grand format (PNG).
// Usage : bun run scripts/export-logo.ts   (supprimable après usage)
import sharp from "sharp";
import { readFileSync } from "node:fs";

const svg = readFileSync("src/assets/logo.svg", "utf8");

for (const size of [512, 1024]) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(`public/logo-${size}.png`);
  console.log(`✔ public/logo-${size}.png`);
}
