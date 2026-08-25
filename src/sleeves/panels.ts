import { CanvasTexture, LinearFilter, SRGBColorSpace, Texture } from 'three'
import {
  PANEL_ORDER,
  PanelName,
  matchesReferencePage,
  panelCrop,
} from './dieline'
import { RenderedPage, renderFirstPage } from './renderPdf'

export type PanelTextures = Record<PanelName, Texture>

export interface SleeveArtwork {
  textures: PanelTextures
  /** Average colour of the back panel, used for the box interior and bottom edge. */
  interior: string
  dispose(): void
}

/**
 * Slice a rasterised page into one texture per panel, cropped to the die-line.
 *
 * Cropping is what keeps trim marks, bleed lines and the "Cover"/"Back Cover"
 * labels off the box. Artwork that bleeds fully hides them anyway; artwork that
 * doesn't would otherwise show a printer's proof wrapped around a video case.
 */
export function sliceIntoPanels(page: RenderedPage): SleeveArtwork {
  if (!matchesReferencePage(page.widthPt, page.heightPt)) {
    console.warn(
      `[sleeve] page is ${page.widthPt.toFixed(1)} × ${page.heightPt.toFixed(1)}pt, ` +
        `expected the template's 866.5 × 749.3pt. Scaling the die-line to fit.`,
    )
  }

  const textures = {} as PanelTextures
  for (const panel of PANEL_ORDER) {
    const crop = panelCrop(panel, page.widthPt, page.heightPt, page.canvas.width, page.canvas.height)
    const target = document.createElement('canvas')
    target.width = Math.max(1, Math.round(crop.sw))
    target.height = Math.max(1, Math.round(crop.sh))
    const ctx = target.getContext('2d')!
    ctx.drawImage(
      page.canvas,
      crop.sx,
      crop.sy,
      crop.sw,
      crop.sh,
      0,
      0,
      target.width,
      target.height,
    )

    const texture = new CanvasTexture(target)
    texture.colorSpace = SRGBColorSpace
    texture.minFilter = LinearFilter
    texture.magFilter = LinearFilter
    texture.anisotropy = 8
    textures[panel] = texture
  }

  return {
    textures,
    interior: averageColor(page.canvas),
    dispose() {
      for (const panel of PANEL_ORDER) textures[panel].dispose()
    },
  }
}

/** Sample the page down to 1×1 and read the colour back. */
function averageColor(source: HTMLCanvasElement): string {
  const tiny = document.createElement('canvas')
  tiny.width = 1
  tiny.height = 1
  const ctx = tiny.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(source, 0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  // Darkened well past the artwork — this is the unprinted inside of the card.
  const k = 0.28
  return `rgb(${Math.round(r * k)}, ${Math.round(g * k)}, ${Math.round(b * k)})`
}

export async function loadArtwork(url: string): Promise<SleeveArtwork> {
  const page = await renderFirstPage(url)
  const artwork = sliceIntoPanels(page)
  page.canvas.width = 0
  page.canvas.height = 0
  return artwork
}
