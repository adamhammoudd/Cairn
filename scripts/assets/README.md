# scripts/assets

Build-time assets for `scripts/gen-icons.mjs`. Not shipped to the browser.

## Newsreader-Medium.ttf

Newsreader (Medium / 500), latin subset, pulled from Google Fonts — the same
face `next/font` loads for the running app (`src/app/layout.tsx`). Vendored here
so `gen-icons.mjs` can render the `cairn-lockup.png` wordmark without a system
font install or a network fetch.

Licensed under the SIL Open Font License 1.1 (<https://openfontlicense.org>).
Copyright the Newsreader Project Authors
(<https://github.com/productiontype/Newsreader>).
