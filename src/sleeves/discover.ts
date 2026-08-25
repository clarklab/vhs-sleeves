import { REGISTRY, SleeveEntry, findEntry } from './registry'

export interface SleeveSource extends SleeveEntry {
  /** null when the sleeve is on the board but nobody has submitted artwork yet. */
  url: string | null
}

/** "the-thing_1982" → "The Thing 1982" — the fallback for an unregistered PDF. */
export function titleFromPath(path: string): string {
  const stem = path.split('/').pop()!.replace(/\.pdf$/i, '')
  return stem
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => (/[a-z]/.test(word) ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ')
}

export function idFromPath(path: string): string {
  return path.split('/').pop()!.replace(/\.pdf$/i, '')
}

/**
 * Join the registry against whatever PDFs are actually in `sleeves/`.
 *
 * Vite resolves this glob at build time and hashes each file as an asset, so a
 * PDF landing in the folder — by hand or by an upload commit — is the whole
 * publishing step.
 */
export function discoverSleeves(): SleeveSource[] {
  const modules = import.meta.glob('../../sleeves/*.pdf', {
    query: '?url',
    import: 'default',
    eager: true,
  }) as Record<string, string>

  const artwork = new Map<string, string>()
  for (const [path, url] of Object.entries(modules)) artwork.set(idFromPath(path), url)

  return joinSources(REGISTRY, artwork).sort((a, b) => a.title.localeCompare(b.title))
}

/** Split out from the glob so it can be tested without a bundler. */
export function joinSources(
  registry: SleeveEntry[],
  artwork: Map<string, string>,
): SleeveSource[] {
  const sources: SleeveSource[] = registry.map((entry) => ({
    ...entry,
    url: artwork.get(entry.id) ?? null,
  }))

  // A PDF nobody has registered still deserves a box — it just has no owners.
  for (const [id, url] of artwork) {
    if (findEntryIn(registry, id)) continue
    sources.push({ id, title: titleFromPath(id), owners: [], url })
  }

  return sources
}

const findEntryIn = (registry: SleeveEntry[], id: string) =>
  registry === REGISTRY ? findEntry(id) : registry.find((entry) => entry.id === id)
