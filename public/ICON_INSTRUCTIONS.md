Place your PNG (the one you provided) into this folder and name it `source-icon.png`.

Recommended generated files and filenames (place these in `public/`):
- `apple-touch-icon.png` — Apple touch icon (180x180)
- `favicon-32x32.png` — favicon (32x32)
- `favicon-16x16.png` — favicon (16x16)
- `favicon.ico` — multi-size .ico (optional)

Quick ImageMagick commands to create the PNG sizes (run in this repo root):

```bash
# resize source to 180x180 for Apple touch icon
magick public/source-icon.png -resize 180x180 public/apple-touch-icon.png

# create favicons
magick public/source-icon.png -resize 32x32 public/favicon-32x32.png
magick public/source-icon.png -resize 16x16 public/favicon-16x16.png

# create a multi-size .ico (optional)
magick public/source-icon.png -resize 16x16 favicon-16x16.png -resize 32x32 favicon-32x32.png public/favicon.ico
```

If you prefer a GUI tool, export PNGs at the exact sizes above and drop them here. Next.js will serve these from `/` (for example `/apple-touch-icon.png`).

After adding files, reload the site and clear browser cache (or open in a private window) to see the updated tab icon.
