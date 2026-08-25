import * as pdfjs from 'pdfjs-dist'
import { REFERENCE_PAGE, matchesReferencePage } from './dieline'

/**
 * Netlify's synchronous function bodies cap out around 6MB, and base64 inflates
 * by a third. 4MB of PDF leaves comfortable headroom.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

export interface ValidationResult {
  ok: boolean
  /** Shown to the person uploading, so it has to say what to do about it. */
  message: string
}

const PDF_MAGIC = '%PDF-'

/**
 * Check an upload before it costs anyone a round trip.
 *
 * The page-size check is the valuable one: it catches a sleeve laid out on the
 * wrong template, which would otherwise fold into a visibly wrong box only after
 * a full commit-and-deploy cycle.
 */
export async function validateSleevePdf(file: File): Promise<ValidationResult> {
  if (!/\.pdf$/i.test(file.name)) {
    return { ok: false, message: 'That is not a PDF. Export the sleeve as PDF and try again.' }
  }

  if (file.size === 0) {
    return { ok: false, message: 'That file is empty.' }
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1)
    return {
      ok: false,
      message: `That PDF is ${mb}MB — the limit is 4MB. Downsample the placed images and re-export.`,
    }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const header = new TextDecoder('latin1').decode(bytes.slice(0, 5))
  if (header !== PDF_MAGIC) {
    return { ok: false, message: 'That file is named .pdf but is not a PDF.' }
  }

  let doc: pdfjs.PDFDocumentProxy
  try {
    doc = await pdfjs.getDocument({ data: bytes.slice() }).promise
  } catch {
    return { ok: false, message: 'That PDF could not be opened. Try re-exporting it.' }
  }

  try {
    const page = await doc.getPage(1)
    const { width, height } = page.getViewport({ scale: 1 })
    if (!matchesReferencePage(width, height)) {
      return {
        ok: false,
        message:
          `That page is ${width.toFixed(1)} × ${height.toFixed(1)}pt, which isn't the sleeve ` +
          `die-line (${REFERENCE_PAGE.width} × ${REFERENCE_PAGE.height}pt). Start from the ` +
          `template and keep its proportions — a higher-resolution export is fine.`,
      }
    }
  } finally {
    await doc.destroy()
  }

  return { ok: true, message: 'Looks like a sleeve.' }
}

/** Base64 without the data: prefix, chunked so large files don't blow the stack. */
export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}
