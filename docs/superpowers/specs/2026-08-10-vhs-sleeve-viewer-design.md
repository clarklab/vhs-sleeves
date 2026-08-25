# VHS Sleeve Viewer — Design

**Date:** 2026-08-10

A browser app that reads the flat print-ready PDFs for VHS cover sleeves and shows each
one as a foldable 3D box with a cassette that slides in, in an orbitable library.

## The die-line

Measured from the printer's template (`template/VHS-2025-01-29.pdf`) by parsing its
vector paths, and confirmed independently against `sleeves/idiocracy.pdf`, whose cover
image is placed at `x=113.4 w=295.8` — the front panel to within 0.4 pt.

Reference page: **866.549 × 749.261 pt**. Coordinates are PDF points, origin bottom-left.

| Panel | x range | Width | Notes |
|---|---|---|---|
| left side | 43.4 → 113.0 | 69.6 pt | |
| **front** | 113.0 → 409.2 | 296.2 pt | hood hinges off its top edge |
| right side | 409.2 → 481.0 | 71.8 pt | |
| **back** | 481.0 → 777.2 | 296.2 pt | |
| glue tab | 777.2 → 787.4 | 10.2 pt | not modelled |

Body runs `y 43.3 → 578.8` (535.5 pt). Hood occupies `y 578.8 → 714.4` (135.6 pt).
Bleed is 8.85 pt (⅛"); type safety is inset ~9 pt from every fold.

Folded, that is **10.45 × 18.89 × 2.49 cm** — a real VHS slipcase (104.5 × 189 × 25 mm),
open at the bottom with thumb notches, closed at the top by the hood.

The two side panels are printed at different widths (69.6 vs 71.8 pt) so the outer wrap
clears the inner one. A rectangular tube needs one depth, so the model uses the value
that closes the perimeter exactly: `depth = (perimeter − 2 × width) / 2`. The ~1.5%
stretch on the side artwork is not visible.

## Decisions

**Geometry is hardcoded, not detected.** Every sleeve comes off the same printer
template, so the constants above live in `dieline.ts`. A page of a different size is
scaled proportionally and logged, rather than rejected.

**Panels are cropped to trim.** The template's trim, bleed and type-safety lines and its
"Cover"/"Back Cover" labels are all outside the panel rects, so they never reach the box.
`idiocracy.pdf` still carries those guide vectors — hidden under its full-bleed
background — which is exactly why cropping matters for artwork that doesn't bleed.

**PDFs rasterise in the browser.** pdf.js renders page 1 at 3000 px wide (front panel
≈ 1030 px), then each panel is cropped into its own `CanvasTexture`. This is what makes
"drop a PDF in the folder" literally the whole workflow — no manifest, no prebake step.

**Discovery is a Vite glob.** `import.meta.glob('../../sleeves/*.pdf')` resolves at build
time and hashes each PDF as an asset. The template stays at `template/` so it is not
mistaken for a cover.

## Fold: the box *is* the animation

There is no separate flat mesh and box mesh. The sleeve is one hinge chain:

```
front (root)
  ├─ leftHinge  ─ left
  ├─ rightHinge ─ right ─ backHinge ─ back
  └─ hoodHinge  ─ hoodTop ─ tuckHinge ─ hoodTuck
```

`setFold(t)` lerps every hinge 0° → 90°. At `t = 0` the panels lie in a plane exactly as
printed; at `t = 1` the same geometry has closed into the tube, hood over the top and
tucked down inside the back. One number drives all of it.

Every panel folds away from the viewer so the front artwork keeps facing +Z. Each panel
is a thin box (0.45 mm stock) whose outward face carries the artwork and whose other five
faces are the unprinted inside of the card.

The slider is always available in the detail view. Unfolding below 98% retracts the tape
first, so a cassette is never inside a sleeve that isn't a sleeve yet.

## Cassette

Procedural, no asset files: black shell, two reels behind a transmissive window, hinged
flap, face and spine labels. Oriented as a tape actually sits in its sleeve — the 187 mm
dimension vertical, flap down one side. Slides up into the open bottom on a 1.25 s
ease-out, auto-played when a sleeve is opened.

## Library & camera

One persistent scene. Cards sit in a grid, folded, idling with a slow spin, each with an
HTML label projected under it. Clicking one flies the camera in to frame it at ~78% of
viewport height, dims the other cards back, reveals the controls and plays the insert.
`OrbitControls` is enabled only in focus mode. Escape or the back button returns.

## Modules

| File | Responsibility |
|---|---|
| `sleeves/dieline.ts` | panel rects, page rescaling, cm conversion |
| `sleeves/discover.ts` | glob → `{ id, title, url }[]` |
| `sleeves/renderPdf.ts` | url → high-res page canvas (pdf.js) |
| `sleeves/panels.ts` | page canvas → per-panel textures + interior colour |
| `three/SleeveBox.ts` | hinge chain, `setFold(t)` |
| `three/Cassette.ts` | procedural tape, `setInsertion(t)` |
| `three/SleeveCard.ts` | one library item and its animation state |
| `three/LibraryScene.ts` | renderer, lights, layout, picking, camera |
| `ui/overlay.ts` | masthead, projected labels, detail controls |

## Failure handling

Loading is per-card, so the grid is interactive immediately and boxes fill in as their
PDFs finish. A PDF that won't parse leaves a neutral placeholder box with a "failed"
badge on its label and a count in the masthead; the rest of the library is unaffected.

## Testing

Vitest over the pure logic, which is where the real bugs are: die-line arithmetic, canvas
crop rects (including the PDF y-up → canvas y-down flip and page rescaling), filename →
title, that the hinge chain actually seals into a closed tube at `t = 1`, and that the
cassette fits inside the folded box on all three axes. 24 tests. The three.js visuals are
verified by running it.

## Known limitations

- Panels are rectangular. The real die-cut has an arched hood with side ears and curved
  thumb notches; those outlines are not modelled, so the flat view is a simplification.
- The hood is modelled at the front panel's width rather than its true (slightly wider,
  eared) cut.
- No shadows — lighting is an environment probe plus three directional lights.
