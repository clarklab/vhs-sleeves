import { describe, expect, it } from 'vitest'
import { ALLOWED_SLEEVE_IDS, REGISTRY, formatOwners } from '../src/sleeves/registry'
import { joinSources, titleFromPath } from '../src/sleeves/discover'

describe('registry', () => {
  it('assigns every sleeve an owner', () => {
    for (const entry of REGISTRY) {
      expect(entry.owners.length).toBeGreaterThan(0)
    }
  })

  it('records who is on what', () => {
    const owners = Object.fromEntries(REGISTRY.map((e) => [e.id, e.owners]))
    expect(owners.clockmaster).toEqual(['Brandon', 'Jess'])
    expect(owners.idiocracy).toEqual(['Angie'])
    expect(owners['jennifers-body']).toEqual(['Melissa'])
  })

  it('uses ids that are safe to build a repo path from', () => {
    for (const id of ALLOWED_SLEEVE_IDS) {
      expect(id).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it('has no duplicate ids', () => {
    expect(new Set(ALLOWED_SLEEVE_IDS).size).toBe(ALLOWED_SLEEVE_IDS.length)
  })
})

describe('formatOwners', () => {
  it('reads naturally for one, two and three people', () => {
    expect(formatOwners(['Angie'])).toBe('Angie')
    expect(formatOwners(['Brandon', 'Jess'])).toBe('Brandon and Jess')
    expect(formatOwners(['Brandon', 'Jess', 'Angie'])).toBe('Brandon, Jess and Angie')
  })

  it('says so when nobody has claimed it', () => {
    expect(formatOwners([])).toBe('Unassigned')
  })
})

describe('joinSources', () => {
  const registry = [
    { id: 'clockmaster', title: 'The Clock Master', owners: ['Brandon', 'Jess'] },
    { id: 'jennifers-body', title: "Jennifer's Body", owners: ['Melissa'] },
  ]

  it('attaches artwork to the entry that claims it', () => {
    const joined = joinSources(registry, new Map([['clockmaster', '/assets/clock.pdf']]))
    expect(joined.find((s) => s.id === 'clockmaster')!.url).toBe('/assets/clock.pdf')
  })

  it('keeps a registered sleeve on the board before its artwork exists', () => {
    const joined = joinSources(registry, new Map())
    const pending = joined.find((s) => s.id === 'jennifers-body')!
    expect(pending.url).toBeNull()
    expect(pending.title).toBe("Jennifer's Body")
    expect(pending.owners).toEqual(['Melissa'])
  })

  it('still shows a PDF nobody registered, with no owners', () => {
    const joined = joinSources(registry, new Map([['the-thing', '/assets/thing.pdf']]))
    const stray = joined.find((s) => s.id === 'the-thing')!
    expect(stray.title).toBe('The Thing')
    expect(stray.owners).toEqual([])
  })

  it('does not duplicate an entry that has artwork', () => {
    const joined = joinSources(registry, new Map([['clockmaster', '/a.pdf']]))
    expect(joined.filter((s) => s.id === 'clockmaster')).toHaveLength(1)
  })
})

describe('titleFromPath', () => {
  it('title-cases a filename stem', () => {
    expect(titleFromPath('sleeves/the-thing_1982.pdf')).toBe('The Thing 1982')
  })

  it('leaves all-caps words alone', () => {
    expect(titleFromPath('sleeves/VHS-2025-01-29.pdf')).toBe('VHS 2025 01 29')
  })
})

describe('upload target', () => {
  it('points at the project repo, in owner/name form', async () => {
    const { TARGET_REPO } = await import('../netlify/functions/submit-sleeve.mts')
    expect(TARGET_REPO).toBe('clarklab/vhs-sleeves')
    // A typo here would only surface as a confusing GitHub 404 on the first upload.
    expect(TARGET_REPO).toMatch(/^[\w.-]+\/[\w.-]+$/)
    expect(TARGET_REPO).not.toMatch(/^https?:|\.git$/)
  })
})
