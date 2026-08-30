// Rasterises public/cairn-mark.svg into the favicon / app-icon set.
//
// One source of truth: public/cairn-mark.svg (also rendered inline by the
// <Logo> component). Re-run after editing the mark:
//
//   node scripts/gen-icons.mjs
//
// Outputs:
//   src/app/icon.svg           - scalable favicon (Next file convention)
//   src/app/favicon.ico        - 32px .ico fallback for old browsers
//   src/app/apple-icon.png     - 180px Apple touch icon (Next file convention)
//   public/apple-touch-icon.png - same, for tools that hardcode this path
//   public/icon-192.png        } PWA manifest icons (public/site.webmanifest)
//   public/icon-512.png        }

import { readFile, writeFile, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "public", "cairn-mark.svg");

const svg = await readFile(src);

// A raster at `size`, transparent background, the mark filling the square.
const png = (size) => sharp(svg, { density: 384 }).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png();

const targets = [
  ["src/app/apple-icon.png", 180],
  ["public/apple-touch-icon.png", 180],
  ["public/icon-192.png", 192],
  ["public/icon-512.png", 512],
];

for (const [rel, size] of targets) {
  await png(size).toFile(path.join(root, rel));
  console.log(`  ${rel}  ${size}x${size}`);
}

// Next.js serves src/app/icon.svg as the primary <link rel="icon">.
await copyFile(src, path.join(root, "src/app/icon.svg"));
console.log("  src/app/icon.svg");

// .ico: sharp has no ICO encoder, so wrap a 32x32 PNG in a minimal single-image
// ICONDIR. PNG-payload .ico is understood by every browser that still asks for
// /favicon.ico.
const ico32 = await png(32).toBuffer();
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // image count
const entry = Buffer.alloc(16);
entry.writeUInt8(32, 0); // width
entry.writeUInt8(32, 1); // height
entry.writeUInt8(0, 2); // palette
entry.writeUInt8(0, 3); // reserved
entry.writeUInt16LE(1, 4); // colour planes
entry.writeUInt16LE(32, 6); // bits per pixel
entry.writeUInt32LE(ico32.length, 8); // image size
entry.writeUInt32LE(6 + 16, 12); // offset
await writeFile(path.join(root, "src/app/favicon.ico"), Buffer.concat([header, entry, ico32]));
console.log("  src/app/favicon.ico  32x32");

console.log("done.");
