# Which design is the current one

**The files in this folder are not the current design.** Read this before using
anything here as a spec.

## Current source of truth

The live design is the Claude Design project **"Base Camp Page Redesign"**:

```
https://claude.ai/design/p/69447c24-953f-4b0c-affd-6920c10bf2c8
```

It holds **14 separate page files**, one per screen, plus `support.js` and its
own `github.md` screen map:

| File | Route |
| --- | --- |
| `Base Camp.dc.html` | `/` |
| `Markets.dc.html` | `/markets` |
| `Portfolio.dc.html` | `/portfolio` |
| `Screener.dc.html` | `/screener` |
| `Sector Map.dc.html` | `/sector-map` |
| `Compare.dc.html` | `/comparison` |
| `News.dc.html` | `/news` |
| `Watchlists.dc.html` | `/watchlists` |
| `Alerts.dc.html` | `/alerts` |
| `Calendar.dc.html` | `/calendar` |
| `Assistant.dc.html` | `/assistant` |
| `Research Library.dc.html` | `/research` |
| `Waitlist.dc.html` | `/waitlist` |
| `Welcome.dc.html` | `/welcome` |

Read a file with the design MCP rather than by fetching the page — the preview
iframe is cross-origin, so the rendered DOM is not reachable, and the file
contents are what carry the values:

```
DesignSync  method=list_files  projectId=69447c24-953f-4b0c-affd-6920c10bf2c8
DesignSync  method=get_file    projectId=…  path="Portfolio.dc.html"
```

These are `x-dc` artifact exports: declarative HTML with inline styles and
`{{ }}` bindings, plus a `<script type="text/x-dc">` block holding the sample
data. Every px value and hex is in the markup, which is why the source beats a
screenshot for this job.

## What is in this folder, and why it is still here

`Cairn.dc.html` and `Cairn Settings.dc.html` are exports from an **earlier**
design project (see `github.md`: sync dated 2026-08-14). They describe a
design that has since been replaced.

They are kept rather than deleted because this folder is a **sync target** —
`github.md` names `repo: adamhammoudd/Cairn, branch: main`, so a design project
writes into it. Deleting the files here would likely see them re-pushed on the
next sync, and a file that keeps reappearing is worse than one that is
labelled.

## Why this file exists

The two exports here were mistaken for the current spec, and work was built
against them before the error surfaced. Two concrete ways they disagree with
the live design:

- **Page titles.** The old export sets them at 32px; the current design sets
  them at **40px**.
- **Secondary text.** The old export uses `#6A6A6A`, which measures 3.66:1 on
  canvas — below the WCAG AA floor. `globals.css` raised it to `#7b7b7b` after
  axe-core flagged it, and the current design agrees, defining
  `--ink-faint: #7b7b7b /* dim (raised to AA) */`.

Building from the older file therefore both misses the design and reintroduces
a known accessibility violation.

## Where the current design is implemented

All 14 screens were built against the live project in PRs #96–#109. Each PR
records what it implemented and, where the design showed something the data
could not support, what it deliberately left out and why.
