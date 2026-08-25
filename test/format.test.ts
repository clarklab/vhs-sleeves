import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { checkSleeveFormat } from '../netlify/lib/format.mts'
import { ALLOWED_SLEEVE_IDS } from '../src/sleeves/registry'

/**
 * With no passphrase, this check is the entire gate on the upload endpoint —
 * so it is tested against the real files, not just synthetic ones. It has to run
 * server-side to mean anything: the browser-side copy is a convenience that any
 * `curl` skips.
 */

/** A minimal but structurally valid PDF with the given page sizes. */
function buildPdf(pages: [number, number][]): Uint8Array {
  const kids = pages.map((_, i) => `${i + 3} 0 R`).join(' ')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`,
    ...pages.map(
      ([w, h]) => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << >> >>`,
    ),
  ]

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((object, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`
  })

  const xrefAt = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`

  return new TextEncoder().encode(pdf)
}

const bytesOf = (path: string) => new Uint8Array(readFileSync(path))

describe('checkSleeveFormat', () => {
  it('accepts the printer template itself', async () => {
    expect(await checkSleeveFormat(bytesOf('template/VHS-2025-01-29.pdf'))).toBeNull()
  })

  it('accepts every sleeve currently in the project', async () => {
    for (const id of ALLOWED_SLEEVE_IDS) {
      expect(await checkSleeveFormat(bytesOf(`sleeves/${id}.pdf`))).toBeNull()
    }
  })

  it('accepts a bare PDF cut to the die-line', async () => {
    expect(await checkSleeveFormat(buildPdf([[866.549, 749.261]]))).toBeNull()
  })

  it('rejects a valid PDF at the wrong page size', async () => {
    const message = await checkSleeveFormat(buildPdf([[612, 792]]))
    expect(message).toMatch(/612\.0 × 792\.0pt/)
    expect(message).toMatch(/866\.549 × 749\.261pt/)
  })

  it('rejects a page that is close but not the template', async () => {
    expect(await checkSleeveFormat(buildPdf([[870, 749.261]]))).toMatch(/die-line/)
  })

  it('accepts the die-line exported at 300dpi', async () => {
    // idiocracy.pdf arrived this way; the panel crops scale to whatever page
    // they are handed, so a bigger export is the same sleeve.
    expect(await checkSleeveFormat(buildPdf([[3611, 3122]]))).toBeNull()
  })

  it('rejects a multi-page PDF even when the pages are the right size', async () => {
    const message = await checkSleeveFormat(
      buildPdf([
        [866.549, 749.261],
        [866.549, 749.261],
      ]),
    )
    expect(message).toMatch(/single page/)
    expect(message).toMatch(/has 2/)
  })

  it('rejects a file that is not a PDF at all', async () => {
    const zip = new TextEncoder().encode('PK not a pdf')
    expect(await checkSleeveFormat(zip)).toMatch(/not a PDF/)
  })

  it('rejects a PDF header with garbage behind it', async () => {
    const broken = new TextEncoder().encode('%PDF-1.4\nthis is not a document')
    expect(await checkSleeveFormat(broken)).not.toBeNull()
  })
})
