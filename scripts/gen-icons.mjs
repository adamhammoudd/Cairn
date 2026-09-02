// Rasterises public/cairn-mark.svg into the favicon / app-icon set, plus two
// high-quality PNG exports of the brand mark and the header lockup.
//
// One source of truth: public/cairn-mark.svg (also rendered inline by the
// <Logo> component). Re-run after editing the mark:
//
//   node scripts/gen-icons.mjs
//
// Outputs:
//   src/app/icon.svg            - scalable favicon (Next file convention)
//   src/app/favicon.ico         - 32px .ico fallback for old browsers
//   src/app/apple-icon.png      - 180px Apple touch icon (Next file convention)
//   public/apple-touch-icon.png - same, for tools that hardcode this path
//   public/icon-192.png         } PWA manifest icons (public/site.webmanifest)
//   public/icon-512.png         }
//   public/cairn-mark.png       - 1024px transparent PNG of the mark alone
//   public/cairn-lockup.png     - transparent PNG of the mark + "Cairn" wordmark
//                                 (the header lockup), wordmark in Newsreader
//                                 Medium from scripts/assets/Newsreader-Medium.ttf

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
  ["public/cairn-mark.png", 1024],
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

// ---------------------------------------------------------------------------
// cairn-lockup.png - the header lockup: mark + "Cairn" wordmark, on the app
// canvas (#0A0A0A), exactly as it reads in the top nav.
//
// Proportions mirror the <Logo> component (src/components/logo.tsx): the gap is
// 0.375x and the wordmark 0.833x the mark size, the wordmark is Newsreader
// Medium in --color-primary (#F5F5F5) with 0.01em tracking. The mark and the
// trimmed wordmark are composited as separate layers so the wordmark is
// optically centred against the mark with no baseline guesswork.
const MARK = 512;                       // mark box, px
const GAP = Math.round(MARK * 0.375);   // matches <Logo>
const FONT = Math.round(MARK * 0.833);  // matches <Logo>
const PAD = Math.round(MARK * 0.28);    // breathing room around the lockup
const CANVAS = "#0a0a0a";               // --color-canvas / top-nav background

const markPng = await png(MARK).toBuffer();

// density:96 keeps 1 SVG px == 1 output px, so the wordmark rasterises at the
// same scale as the mark above.
const ttf = (await readFile(path.join(root, "scripts/assets/Newsreader-Medium.ttf"))).toString("base64");
const wordmarkSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${FONT * 5}" height="${FONT * 2}">
  <style>@font-face { font-family: 'Newsreader'; font-weight: 500; src: url(data:font/ttf;base64,${ttf}) format('truetype'); }</style>
  <text x="0" y="${Math.round(FONT * 1.4)}" font-family="Newsreader, Georgia, serif" font-weight="500"
        font-size="${FONT}" letter-spacing="${(FONT * 0.01).toFixed(2)}" fill="#F5F5F5">Cairn</text>
</svg>`;
const wordmark = sharp(Buffer.from(wordmarkSvg), { density: 96 }).trim({ threshold: 1 });
const { data: wordData, info: wordInfo } = await wordmark.png().toBuffer({ resolveWithObject: true });

const contentH = Math.max(MARK, wordInfo.height);
const lockupW = PAD + MARK + GAP + wordInfo.width + PAD;
const lockupH = PAD + contentH + PAD;
await sharp({ create: { width: lockupW, height: lockupH, channels: 4, background: CANVAS } })
  .composite([
    { input: markPng, left: PAD, top: Math.round((lockupH - MARK) / 2) },
    { input: wordData, left: PAD + MARK + GAP, top: Math.round((lockupH - wordInfo.height) / 2) },
  ])
  .png()
  .toFile(path.join(root, "public/cairn-lockup.png"));
console.log(`  public/cairn-lockup.png  ${lockupW}x${lockupH}`);

console.log("done.");
