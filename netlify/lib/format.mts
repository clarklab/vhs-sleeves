import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { REFERENCE_PAGE, matchesReferencePage } from '../../src/sleeves/dieline'

/**
 * The format gate.
 *
 * With no passphrase on the endpoint, this is the only thing standing between the
 * internet and the repo — so it parses the file for real rather than trusting the
 * extension or the first five bytes. It lives outside `netlify/functions/` so it
 * is never deployed as a function of its own, and so the local dev server can run
 * exactly the same check as production.
 */

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
const PDF_MAGIC = '%PDF-'

/** Returns null when the file is a valid sleeve, or the reason it isn't. */
export async function checkSleeveFormat(bytes: Uint8Array): Promise<string | null> {
  if (Buffer.from(bytes.subarray(0, 5)).toString('latin1') !== PDF_MAGIC) {
    return 'That file is not a PDF.'
  }

  let doc
  try {
    doc = await getDocument({
      data: bytes,
      isEvalSupported: false,
      useSystemFonts: false,
    }).promise
  } catch {
    return 'That PDF could not be opened. Try re-exporting it.'
  }

  try {
    if (doc.numPages !== 1) {
      return `The sleeve template is a single page; that PDF has ${doc.numPages}.`
    }
    const page = await doc.getPage(1)
    const { width, height } = page.getViewport({ scale: 1 })
    if (!matchesReferencePage(width, height)) {
      return (
        `That page is ${width.toFixed(1)} × ${height.toFixed(1)}pt, which isn't the sleeve ` +
        `die-line (${REFERENCE_PAGE.width} × ${REFERENCE_PAGE.height}pt). Start from the ` +
        `template PDF and keep its proportions — exporting at a higher resolution is fine.`
      )
    }
  } catch {
    return 'That PDF could not be read past its first page.'
  } finally {
    await doc.destroy()
  }

  return null
}
