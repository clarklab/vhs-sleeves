import { describe, expect, it } from 'vitest'
import {
  BOX,
  BODY,
  PANELS,
  REFERENCE_PAGE,
  matchesReferencePage,
  panelCrop,
  ptToCm,
} from '../src/sleeves/dieline'

describe('die-line constants', () => {
  it('describes a real VHS case in centimetres', () => {
    expect(BOX.width).toBeCloseTo(10.45, 1)
    expect(BOX.height).toBeCloseTo(18.89, 1)
    expect(BOX.depth).toBeCloseTo(2.49, 1)
  })

  it('places the front panel where idiocracy.pdf places its cover image', () => {
    // /Im0 is drawn at x=113.4 with width=295.8 in that file.
    expect(PANELS.front.x).toBeCloseTo(113.4, 0)
    expect(PANELS.front.width).toBeCloseTo(295.8, 0)
  })

  it('leaves no gaps or overlaps between the four body panels', () => {
    expect(PANELS.left.x + PANELS.left.width).toBe(PANELS.front.x)
    expect(PANELS.front.x + PANELS.front.width).toBe(PANELS.right.x)
    expect(PANELS.right.x + PANELS.right.width).toBe(PANELS.back.x)
  })

  it('hinges the hood off the top of the body', () => {
    expect(PANELS.hood.y).toBe(BODY.yMax)
    expect(PANELS.hood.x).toBe(PANELS.front.x)
    expect(PANELS.hood.width).toBe(PANELS.front.width)
  })

  it('picks a depth that closes the tube exactly', () => {
    const perimeterPt =
      PANELS.left.width + PANELS.front.width + PANELS.right.width + PANELS.back.width
    expect(2 * BOX.width + 2 * BOX.depth).toBeCloseTo(ptToCm(perimeterPt), 6)
  })
})

describe('panelCrop', () => {
  const canvasWidth = 3000
  const canvasHeight = Math.round(
    (REFERENCE_PAGE.height / REFERENCE_PAGE.width) * canvasWidth,
  )

  it('flips PDF y-up into canvas y-down', () => {
    const crop = panelCrop(
      'front',
      REFERENCE_PAGE.width,
      REFERENCE_PAGE.height,
      canvasWidth,
      canvasHeight,
    )
    // The canvas height is rounded to whole pixels, so the vertical scale is a
    // hair off the horizontal one. Each axis has to be checked against its own.
    const kx = canvasWidth / REFERENCE_PAGE.width
    const ky = canvasHeight / REFERENCE_PAGE.height
    expect(crop.sx).toBeCloseTo(PANELS.front.x * kx, 3)
    // top of the panel in PDF space becomes the small-y edge in canvas space
    expect(crop.sy).toBeCloseTo((REFERENCE_PAGE.height - BODY.yMax) * ky, 3)
    expect(crop.sw).toBeCloseTo(PANELS.front.width * kx, 3)
    expect(crop.sh).toBeCloseTo((BODY.yMax - BODY.yMin) * ky, 3)
  })

  it('keeps every panel inside the canvas', () => {
    for (const panel of ['left', 'front', 'right', 'back', 'hood'] as const) {
      const crop = panelCrop(
        panel,
        REFERENCE_PAGE.width,
        REFERENCE_PAGE.height,
        canvasWidth,
        canvasHeight,
      )
      expect(crop.sx).toBeGreaterThanOrEqual(0)
      expect(crop.sy).toBeGreaterThanOrEqual(0)
      expect(crop.sx + crop.sw).toBeLessThanOrEqual(canvasWidth + 0.5)
      expect(crop.sy + crop.sh).toBeLessThanOrEqual(canvasHeight + 0.5)
    }
  })

  it('rescales the die-line for a page exported at a different size', () => {
    const scale = 1.5
    const wide = panelCrop(
      'front',
      REFERENCE_PAGE.width * scale,
      REFERENCE_PAGE.height * scale,
      canvasWidth,
      canvasHeight,
    )
    const reference = panelCrop(
      'front',
      REFERENCE_PAGE.width,
      REFERENCE_PAGE.height,
      canvasWidth,
      canvasHeight,
    )
    // Same page proportions at any scale must select the same pixels.
    expect(wide.sx).toBeCloseTo(reference.sx, 3)
    expect(wide.sw).toBeCloseTo(reference.sw, 3)
    expect(wide.sy).toBeCloseTo(reference.sy, 3)
  })
})

describe('matchesReferencePage', () => {
  it('accepts the template and idiocracy.pdf', () => {
    expect(matchesReferencePage(866.549, 749.261)).toBe(true)
  })

  it('rejects a page from a different die', () => {
    expect(matchesReferencePage(612, 792)).toBe(false)
  })
})
