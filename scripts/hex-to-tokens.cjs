// One-shot, mechanical: replaces hex colour literals in components with the named
// design tokens in src/app/globals.css (audit 2026-10-02, item 6.4). Each hex goes
// to the NEAREST token by RGB distance; anything farther than MAX is reported
// and left alone for a human. Run: node scripts/hex-to-tokens.cjs [--dry]
const fs = require("fs");
const path = require("path");

const TOKENS = {
  canvas: "#0a0a0a", panel: "#0f0f0f", raised: "#151515", active: "#171717",
  "line-soft": "#1e1e1e", line: "#2a2a2a", "line-strong": "#3a3a3a",
  primary: "#f5f5f5", muted: "#8a8a8a", dim: "#7b7b7b",
  accent: "#2fc685", "accent-light": "#5ee6a6", "accent-dark": "#22b573",
  negative: "#d96c6c", "negative-light": "#e39b9b", "negative-dark": "#c25a5a",
  warning: "#d9a441", info: "#5b8def", violet: "#9b8ce0",
  "text-soft": "#c9c9c9",
  "tint-accent-bg": "#1c2a23",
  "tint-accent-text": "#e6f5ee",
  "tint-warning-border": "#2a2418",
  "tint-warning-text": "#c8c0ad",
  "legend-neg": "#3a2a2a",
  "legend-pos": "#1f3a30",
};
const MAX = 30;
const dry = process.argv.includes("--dry");
const rgb = (h) => { h = h.replace("#", ""); if (h.length === 3) h = [...h].map((c) => c + c).join(""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const dist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
function nearest(hex) {
  const c = rgb(hex);
  // A tint (not a neutral grey) is only snapped when it is nearly a token already; a
  // legend stop like #1f3a30 would otherwise turn into a grey border colour.
  const neutral = Math.max(...c) - Math.min(...c) <= 8;
  let best = null;
  for (const [name, h] of Object.entries(TOKENS)) {
    const d = dist(c, rgb(h));
    if (!best || d < best.d) best = { name, d };
  }
  if (best && !neutral && best.d > 12) best.d = 999;
  return best;
}

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk("src/components").filter((f) => f.endsWith(".tsx"));
const unmatched = [];
const stats = new Map();
let total = 0;

for (const f of files) {
  let s = fs.readFileSync(f, "utf8");
  const before = s;
  // 1. Tailwind arbitrary colour classes: bg-[#0c0c0c], hover:border-[#2f2f2f], from-[#101110]/60 ...
  s = s.replace(/\b([a-z][\w:-]*?)-\[(#[0-9a-fA-F]{3,6})\](\/\d+)?/g, (m, pre, hex, op) => {
    const n = nearest(hex);
    if (n.d > MAX) { unmatched.push(`${f}: ${m} (nearest ${n.name} off by ${n.d.toFixed(0)})`); return m; }
    total++; stats.set(`${hex.toLowerCase()} -> ${n.name}`, (stats.get(`${hex.toLowerCase()} -> ${n.name}`) ?? 0) + 1);
    return `${pre}-${n.name}${op ?? ""}`;
  });
  // 2. A hex inside any other bracketed class value (shadows, gradients): var(--color-x).
  s = s.replace(/\[[^\]\s]*#[0-9a-fA-F]{3,6}[^\]\s]*\]/g, (m) => m.replace(/#[0-9a-fA-F]{3,6}\b/g, (hex) => {
    const n = nearest(hex);
    if (n.d > MAX) { unmatched.push(`${f}: ${m}`); return hex; }
    total++; stats.set(`${hex.toLowerCase()} -> ${n.name}`, (stats.get(`${hex.toLowerCase()} -> ${n.name}`) ?? 0) + 1);
    return `var(--color-${n.name})`;
  }));
  // 3. Quoted literals in JS/JSX: "#2fc685" / '#1c1c1c' / `#...` (not inside a url or entity).
  s = s.replace(/(["'`])(#[0-9a-fA-F]{3,6})\1/g, (m, q, hex) => {
    const n = nearest(hex);
    if (n.d > MAX) { unmatched.push(`${f}: ${m}`); return m; }
    total++; stats.set(`${hex.toLowerCase()} -> ${n.name}`, (stats.get(`${hex.toLowerCase()} -> ${n.name}`) ?? 0) + 1);
    return `${q}var(--color-${n.name})${q}`;
  });
  // 4. Hex followed by other CSS inside a quoted value ("1px solid #232323", "linear-gradient(..#fff..)").
  s = s.replace(/(["'`])([^"'`\n]*?)(#[0-9a-fA-F]{6}\b)([^"'`\n]*?)\1/g, (m) =>
    m.replace(/#[0-9a-fA-F]{6}\b/g, (hex) => {
      const n = nearest(hex);
      if (n.d > MAX) { unmatched.push(`${f}: ${hex} in ${m.slice(0, 60)}`); return hex; }
      total++; stats.set(`${hex.toLowerCase()} -> ${n.name}`, (stats.get(`${hex.toLowerCase()} -> ${n.name}`) ?? 0) + 1);
      return `var(--color-${n.name})`;
    }),
  );
  if (s !== before && !dry) fs.writeFileSync(f, s);
}
console.log(`${total} literals replaced${dry ? " (dry run)" : ""}`);
console.log([...stats].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v}x ${k}`).join("\n"));
if (unmatched.length) console.log("\nLEFT FOR A HUMAN:\n" + unmatched.join("\n"));
