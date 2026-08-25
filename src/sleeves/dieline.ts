/**
 * The VHS sleeve die-line.
 *
 * Measured directly from the printer's template (template/VHS-2025-01-29.pdf) by
 * parsing its vector paths, and independently confirmed against sleeves/idiocracy.pdf,
 * whose cover image is placed at x=113.4 w=295.8 — the front panel to within 0.4pt.
 *
 * All coordinates are PDF points on the reference page, origin bottom-left.
 *
 *   flat layout, left to right:
 *   ┌───────┬─────────────────┬───────┬─────────────────┬──┐
 *   │ left  │      FRONT      │ right │      BACK       │gt│   ← glue tab, not modelled
 *   └───────┴─────────────────┴───────┴─────────────────┴──┘
 *   43.4  113.0             409.2   481.0             777.2
 *
 * Folded, that is a tube of FRONT × depth, open at the bottom (thumb notches),
 * closed at the top by the hood flap that hinges off the front panel's top edge.
 */

export const REFERENCE_PAGE = { width: 866.549, height: 749.261 } as const

/** Vertical extent of the four body panels. */
export const BODY = { yMin: 43.3, yMax: 578.8 } as const

export type PanelName = 'left' | 'front' | 'right' | 'back' | 'hood'

export interface Rect {
  /** left edge, PDF points */
  x: number
  /** bottom edge, PDF points (y grows upward) */
  y: number
  width: number
  height: number
}

const bodyPanel = (x0: number, x1: number): Rect => ({
  x: x0,
  y: BODY.yMin,
  width: x1 - x0,
  height: BODY.yMax - BODY.yMin,
})

export const PANELS: Record<PanelName, Rect> = {
  left: bodyPanel(43.4, 113.0),
  front: bodyPanel(113.0, 409.2),
  right: bodyPanel(409.2, 481.0),
  back: bodyPanel(481.0, 777.2),
  // The hood hinges off the front panel's top edge. Its real die-cut outline is
  // arched and slightly wider than the front, with side ears; we model the
  // rectangular core, which is what actually shows on the folded box.
  hood: { x: 113.0, y: BODY.yMax, width: 409.2 - 113.0, height: 714.4 - BODY.yMax },
}

export const PANEL_ORDER: PanelName[] = ['left', 'front', 'right', 'back', 'hood']

const PT_TO_CM = 2.54 / 72

export const ptToCm = (pt: number): number => pt * PT_TO_CM

/**
 * Box dimensions in centimetres (the scene works at 1 unit = 1cm).
 *
 * The two side panels are drawn 69.6pt and 71.8pt wide — an intentional printing
 * asymmetry so the outer wrap clears the inner one. A rectangular tube needs a
 * single depth, so we use the one that makes the perimeter close exactly:
 *   depth = (perimeter - 2 * width) / 2
 * The ~1.5% stretch on the side artwork is not visible.
 */
function boxDimensions() {
  const width = PANELS.front.width
  const perimeter = PANELS.left.width + PANELS.front.width + PANELS.right.width + PANELS.back.width
  const depth = (perimeter - 2 * width) / 2
  return {
    width: ptToCm(width),
    height: ptToCm(PANELS.front.height),
    depth: ptToCm(depth),
    hoodHeight: ptToCm(PANELS.hood.height),
    hoodWidth: ptToCm(PANELS.hood.width),
  }
}

/** 10.45 × 18.89 × 2.49 cm — a real VHS case. */
export const BOX = boxDimensions()

/** Cardboard thickness, in cm. Gives the fold seams something to catch light on. */
export const STOCK_THICKNESS = 0.045

/**
 * The thumb notch — the semicircle bitten out of the bottom edge of each side
 * panel, which is what you hook a finger into to push the tape back out.
 *
 * Measured off the template's bezier clusters: both arcs sit at x 79.35 and
 * 443.81, which are the two side panels' centre lines, rising from the trim edge
 * at y 43.3 to an apex at y 70.26 — a semicircle of radius 26.96pt.
 */
export const THUMB_NOTCH_RADIUS = ptToCm(26.96)

export interface CropRect {
  sx: number
  sy: number
  sw: number
  sh: number
}

/**
 * Convert a panel rect into a crop rect on a rasterised page canvas.
 *
 * Handles two flips at once: canvas y grows downward where PDF y grows upward,
 * and a page whose size differs from the reference is scaled proportionally
 * rather than rejected.
 */
export function panelCrop(
  panel: PanelName,
  pageWidthPt: number,
  pageHeightPt: number,
  canvasWidthPx: number,
  canvasHeightPx: number,
): CropRect {
  const rect = PANELS[panel]
  const kx = canvasWidthPx / pageWidthPt
  const ky = canvasHeightPx / pageHeightPt
  const fitX = pageWidthPt / REFERENCE_PAGE.width
  const fitY = pageHeightPt / REFERENCE_PAGE.height

  return {
    sx: rect.x * fitX * kx,
    sy: (pageHeightPt - (rect.y + rect.height) * fitY) * ky,
    sw: rect.width * fitX * kx,
    sh: rect.height * fitY * ky,
  }
}

/** True when a page matches the template it was cut from, within a point. */
export function matchesReferencePage(widthPt: number, heightPt: number): boolean {
  return (
    Math.abs(widthPt - REFERENCE_PAGE.width) < 1 && Math.abs(heightPt - REFERENCE_PAGE.height) < 1
  )
}
