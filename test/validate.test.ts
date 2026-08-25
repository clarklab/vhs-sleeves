import { describe, expect, it } from 'vitest'
import { MAX_UPLOAD_BYTES, toBase64, validateSleevePdf } from '../src/sleeves/validate'

/**
 * The checks that run before pdf.js is involved at all. These are the ones that
 * matter for a wrong file: they reject it in the browser, so a bad upload never
 * reaches the repo or costs a deploy.
 */
const fileOf = (name: string, bytes: Uint8Array) =>
  new File([bytes as unknown as BlobPart], name, { type: 'application/pdf' })

const pdfBytes = (size = 64) => {
  const bytes = new Uint8Array(size)
  bytes.set(new TextEncoder().encode('%PDF-1.7'))
  return bytes
}

describe('validateSleevePdf', () => {
  it('rejects a file that is not named .pdf', async () => {
    const result = await validateSleevePdf(fileOf('cover.ai', pdfBytes()))
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/not a PDF/i)
  })

  it('rejects an empty file', async () => {
    const result = await validateSleevePdf(fileOf('cover.pdf', new Uint8Array(0)))
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/empty/i)
  })

  it('rejects a file over the 4MB ceiling, and says what to do', async () => {
    const oversize = pdfBytes(MAX_UPLOAD_BYTES + 1)
    const result = await validateSleevePdf(fileOf('cover.pdf', oversize))
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/4MB/)
    expect(result.message).toMatch(/downsample/i)
  })

  it('rejects something merely renamed to .pdf', async () => {
    const notPdf = new TextEncoder().encode('PK this is a zip')
    const result = await validateSleevePdf(fileOf('cover.pdf', notPdf))
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/not a PDF/i)
  })
})

describe('toBase64', () => {
  it('round-trips bytes', () => {
    const bytes = new TextEncoder().encode('%PDF-1.7 hello')
    expect(atob(toBase64(bytes))).toBe('%PDF-1.7 hello')
  })

  it('handles payloads larger than one chunk without blowing the stack', () => {
    const big = new Uint8Array(0x8000 * 3 + 17).fill(65)
    expect(atob(toBase64(big)).length).toBe(big.length)
  })
})
