import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Connect, Plugin } from 'vite'
import { MAX_UPLOAD_BYTES, checkSleeveFormat } from '../netlify/lib/format.mts'
import { ALLOWED_SLEEVE_IDS } from '../src/sleeves/registry'

/**
 * Stands in for the Netlify function while developing.
 *
 * In production an upload is committed to GitHub and published by the next
 * build. Locally there is no repo and no token, so the same request writes the
 * PDF straight into `sleeves/` — Vite notices the file change and reloads, and
 * the new artwork wraps the box a second later.
 *
 * The point is that everything upstream of the write is identical: same route,
 * same request shape, same allowlist, and the same `checkSleeveFormat` the
 * deployed function uses. Testing the upload locally therefore tests the real
 * validation, not a mock of it.
 */
export function localUploads(): Plugin {
  return {
    name: 'vhs-local-uploads',
    apply: 'serve',
    configureServer(server) {
      const handler: Connect.NextHandleFunction = (req, res) => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(body))
        }

        if (req.method !== 'POST') return send(405, { error: 'Use POST.' })

        const chunks: Buffer[] = []
        let size = 0
        req.on('data', (chunk: Buffer) => {
          size += chunk.length
          // base64 inflates by a third; refuse to buffer past that.
          if (size > MAX_UPLOAD_BYTES * 1.5) req.destroy()
          else chunks.push(chunk)
        })

        req.on('end', () => {
          void (async () => {
            let body: { sleeveId?: unknown; submittedBy?: unknown; contentBase64?: unknown }
            try {
              body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
            } catch {
              return send(400, { error: 'Malformed request.' })
            }

            const { sleeveId, contentBase64, submittedBy } = body
            if (typeof sleeveId !== 'string' || !ALLOWED_SLEEVE_IDS.includes(sleeveId)) {
              return send(400, { error: 'Unknown sleeve.' })
            }
            if (typeof contentBase64 !== 'string' || contentBase64.length === 0) {
              return send(400, { error: 'No file received.' })
            }

            const bytes = Buffer.from(contentBase64, 'base64')
            if (bytes.length === 0 || bytes.length > MAX_UPLOAD_BYTES) {
              return send(413, { error: 'File must be between 1 byte and 4MB.' })
            }

            const formatError = await checkSleeveFormat(new Uint8Array(bytes))
            if (formatError) return send(422, { error: formatError })

            // The path is built from an allowlisted id, never a supplied filename.
            const target = resolve(server.config.root, 'sleeves', `${sleeveId}.pdf`)
            await writeFile(target, bytes)

            const who = typeof submittedBy === 'string' && submittedBy.trim() ? submittedBy.trim() : 'you'
            server.config.logger.info(
              `\n  ✓ ${sleeveId}.pdf written to sleeves/ (local upload by ${who})\n`,
            )

            send(200, { ok: true, sleeveId, commitSha: 'local' })
          })()
        })
      }

      server.middlewares.use('/api/submit-sleeve', handler)
    },
  }
}
