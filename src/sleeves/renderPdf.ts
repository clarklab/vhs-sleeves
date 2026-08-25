import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/**
 * Wide enough that the front panel rasterises to ~1030px across, which is where
 * the artwork stops looking soft when you orbit right up to the box.
 */
export const PAGE_RENDER_WIDTH = 3000

export interface RenderedPage {
  canvas: HTMLCanvasElement
  widthPt: number
  heightPt: number
}

/** Rasterise page 1 of a PDF to a canvas, in the browser, at print-ish resolution. */
export async function renderFirstPage(url: string): Promise<RenderedPage> {
  const doc = await pdfjs.getDocument({ url }).promise
  try {
    const page = await doc.getPage(1)
    const unscaled = page.getViewport({ scale: 1 })
    const scale = PAGE_RENDER_WIDTH / unscaled.width
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas context unavailable')

    await page.render({ canvasContext: ctx, viewport }).promise

    return { canvas, widthPt: unscaled.width, heightPt: unscaled.height }
  } finally {
    await doc.destroy()
  }
}
