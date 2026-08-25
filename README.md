# VHS Garage Library

A 3D viewer for print-ready VHS cover sleeves. Each flat PDF folds into a box you can
spin, unfold back to flat, and slide a cassette into.

```bash
npm install
npm run dev
```

Everything works locally, uploads included — no GitHub repo or token needed. In dev the
upload endpoint writes the PDF straight into `sleeves/` instead of committing to GitHub;
Vite reloads and the new artwork wraps the box. The route, the request, the allowlist and
the format check are the same code the deployed function runs, so testing an upload
locally tests the real validation.

## Adding a sleeve

Drop the PDF into `sleeves/` and reload. That's it — no manifest, no build step. The
filename becomes the title (`the-thing_1982.pdf` → "The Thing 1982").

```
sleeves/          ← cover PDFs, one box each
template/         ← the printer's die-line, kept out of the library
```

## The team

| Sleeve | Project owners |
|---|---|
| The Clock Master | Brandon and Jess |
| Idiocracy | Angie |
| Jennifer's Body | Melissa |

Owners live in [`src/sleeves/registry.ts`](src/sleeves/registry.ts). A registered sleeve
with no PDF yet still gets a box, so a new tape can go on the board before its artwork
exists.

## Submitting work

Each sleeve's panel has **Download current PDF** and **Blank template**, and an upload
box. A submitted PDF is parsed on the server and must be a real PDF, exactly one page,
measuring exactly 866.549 × 749.261pt — that format check is the only gate, so it runs
server-side where `curl` can't skip it. It's then committed to the repo by a Netlify
function and published on the next build, about two minutes.

Commits go to `clarklab/vhs-sleeves`, hardcoded in the function. The GitHub token is the
one thing that isn't — it lives only in the Netlify site environment, never in the bundle.
**First-time setup: [SETUP.md](SETUP.md).**

## Using it

- **Click a box** to open it — the camera flies in and the tape slides up into the sleeve.
- **Drag the fold slider** to unfold the box back to the flat printed sheet and anywhere
  in between. The tape retracts on the way out.
- **Drag** to orbit, scroll to zoom. **Escape** or ← Library goes back.

## The die-line

Every sleeve is cut from the same 866.549 × 749.261 pt template, laid out left to right
as `side | front | side | back | glue tab`. Folded that's 10.45 × 18.89 × 2.49 cm — a real
VHS slipcase. The measured coordinates live in [`src/sleeves/dieline.ts`](src/sleeves/dieline.ts);
if a template ever changes, that file is the only thing to edit.

Panels are cropped to their trim rects, so crop marks, bleed lines and the template's
"Cover"/"Back Cover" labels never appear on the box.

## Scripts

| | |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | typecheck + production build |
| `npm test` | Vitest |

Full design notes: [`docs/superpowers/specs/2026-08-10-vhs-sleeve-viewer-design.md`](docs/superpowers/specs/2026-08-10-vhs-sleeve-viewer-design.md)
