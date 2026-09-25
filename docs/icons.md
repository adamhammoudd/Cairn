# App icon / favicon

The single source is **`public/cairn-mark.svg`** - the three-stone Cairn mark,
geometry identical to the `<Logo>` component (`src/components/logo.tsx`, which
renders this same file inline). The three stones sit on equal 3-unit gaps with
equal 10-unit top/bottom padding, so they read as evenly stacked at every size.

To change the icon, edit `cairn-mark.svg`, then regenerate the raster set:

```bash
node scripts/gen-icons.mjs
```

That writes:

| File | Purpose |
|---|---|
| `src/app/icon.svg` | scalable favicon (Next file convention) |
| `src/app/favicon.ico` | 32px `.ico` fallback for old browsers |
| `src/app/apple-icon.png` | 180px Apple touch icon (Next file convention) |
| `public/apple-touch-icon.png` | same, for tools that hardcode `/apple-touch-icon.png` |
| `public/icon-192.png`, `public/icon-512.png` | PWA icons, referenced by `public/site.webmanifest` |
| `public/cairn-mark.png` | 1024px transparent PNG of the mark alone (slide decks, share images, anywhere an `<img>` beats inline SVG) |
| `public/cairn-lockup.png` | mark + "Cairn" wordmark on the app canvas (`#0A0A0A`), the header lockup as a flat raster |

The wordmark in `cairn-lockup.png` is set in Newsreader Medium, vendored at
`scripts/assets/Newsreader-Medium.ttf` (Google Fonts, the same face
`next/font` loads for the running app). No system font install needed.

Next.js injects the `<link rel="icon">` / `apple-touch-icon` / manifest tags
automatically from those file-convention names - there is no icon list in
`src/app/layout.tsx` to keep in sync.

After regenerating, hard-reload (or a private window) to bust the browser's
cached tab icon.
