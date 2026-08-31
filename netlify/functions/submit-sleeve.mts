import type { Config, Context } from '@netlify/functions'
import { MAX_UPLOAD_BYTES, checkSleeveFormat } from '../lib/format.mts'
import { ALLOWED_SLEEVE_IDS } from '../../src/sleeves/registry'

/**
 * Accept an edited sleeve PDF and commit it to the repo, which makes Netlify
 * rebuild and publish it.
 *
 * There is no passphrase: the die-line IS the gate. That only means something if
 * the check runs here, because the browser-side check is a convenience that any
 * `curl` skips. So this parses the file for real — it has to open as a PDF, be a
 * single page, and measure exactly like the printer's template.
 *
 * The GitHub token lives here and only here. Anything shipped to the browser is
 * readable by anyone who opens devtools, so a token in the frontend bundle would
 * be a public write key to the repo.
 */

/**
 * The repo uploads are committed to.
 *
 * Safe to hardcode — it is a public repository name, not a secret, and pinning it
 * means the only thing Netlify has to be told is the token. The env var still wins
 * if it is set, so a fork or a scratch repo needs no code change.
 */
export const TARGET_REPO = process.env.GITHUB_REPO || 'clarklab/vhs-sleeves'

interface SubmitBody {
  sleeveId?: unknown
  submittedBy?: unknown
  contentBase64?: unknown
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

export default async (req: Request, _context: Context) => {
  const token = process.env.GITHUB_TOKEN
  const repo = TARGET_REPO
  const branch = process.env.GITHUB_BRANCH || 'main'

  // GET is a health check: open /api/submit-sleeve in a browser to see whether
  // the deploy actually has a token, without doing a real upload. It reports
  // only whether one is present — never the value, and never a prefix of it.
  if (req.method === 'GET') {
    return json(200, {
      endpoint: 'submit-sleeve',
      repo,
      branch,
      tokenConfigured: Boolean(token),
      hint: token
        ? 'Ready to accept uploads.'
        : 'Set GITHUB_TOKEN in Netlify, then redeploy — env vars only reach ' +
          'functions on a fresh deploy.',
    })
  }

  if (req.method !== 'POST') return json(405, { error: 'Use POST.' })

  if (!token) {
    return json(500, {
      error:
        'Uploads are not configured yet. GITHUB_TOKEN needs to be set in the Netlify ' +
        'site environment.',
    })
  }

  let body: SubmitBody
  try {
    body = (await req.json()) as SubmitBody
  } catch {
    return json(400, { error: 'Malformed request.' })
  }

  const { sleeveId, submittedBy, contentBase64 } = body

  // The path is built from an allowlisted id, never from a user-supplied
  // filename — otherwise "../../netlify.toml" would be a valid target.
  if (typeof sleeveId !== 'string' || !ALLOWED_SLEEVE_IDS.includes(sleeveId)) {
    return json(400, { error: 'Unknown sleeve.' })
  }

  if (typeof contentBase64 !== 'string' || contentBase64.length === 0) {
    return json(400, { error: 'No file received.' })
  }

  let bytes: Buffer
  try {
    bytes = Buffer.from(contentBase64, 'base64')
  } catch {
    return json(400, { error: 'File could not be decoded.' })
  }

  if (bytes.length === 0 || bytes.length > MAX_UPLOAD_BYTES) {
    return json(413, { error: 'File must be between 1 byte and 4MB.' })
  }

  const formatError = await checkSleeveFormat(new Uint8Array(bytes))
  if (formatError) return json(422, { error: formatError })

  const who = typeof submittedBy === 'string' ? submittedBy.slice(0, 60).trim() : ''
  const path = `sleeves/${sleeveId}.pdf`
  const api = `https://api.github.com/repos/${repo}/contents/${path}`
  const headers = {
    authorization: `Bearer ${token}`,
    accept: 'application/vnd.github+json',
    'content-type': 'application/json',
    'user-agent': 'vhs-sleeve-library',
  }

  // Updating an existing file requires its current blob sha; a new file must not
  // send one at all.
  let sha: string | undefined
  const existing = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers })
  if (existing.ok) {
    sha = ((await existing.json()) as { sha: string }).sha
  } else if (existing.status !== 404) {
    return json(502, { error: `GitHub rejected the lookup (${existing.status}).` })
  }

  const commit = await fetch(api, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: who ? `Update ${sleeveId} sleeve (via ${who})` : `Update ${sleeveId} sleeve`,
      content: contentBase64,
      branch,
      ...(sha ? { sha } : {}),
    }),
  })

  if (!commit.ok) {
    const detail = await commit.text()
    console.error('[submit-sleeve] GitHub write failed', commit.status, detail)
    return json(502, {
      error:
        commit.status === 401 || commit.status === 403
          ? 'The GitHub token was rejected. Check it has Contents: read and write on this repo.'
          : `GitHub refused the commit (${commit.status}).`,
    })
  }

  const result = (await commit.json()) as { commit: { sha: string; html_url: string } }
  return json(200, {
    ok: true,
    sleeveId,
    commitSha: result.commit.sha.slice(0, 7),
    commitUrl: result.commit.html_url,
  })
}

export const config: Config = { path: '/api/submit-sleeve' }
