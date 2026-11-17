// Renders a cover SVG to a 2400×1254 PNG (2× the 1200×627 preview size).
// Usage: node docs/covers/render.mjs docs/covers/<name>.svg src/assets/covers/<name>.png
import { readFile } from "node:fs/promises";
import sharp from "sharp";

const [source, target] = process.argv.slice(2);
if (!source || !target) {
  console.error("Usage: node docs/covers/render.mjs <source.svg> <target.png>");
  process.exit(1);
}
await sharp(await readFile(source), { density: 144 }).png().toFile(target);
console.log(`Wrote ${target}`);
