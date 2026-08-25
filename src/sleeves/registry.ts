/**
 * Who owns what.
 *
 * This registry — not the contents of `sleeves/` — is the list of sleeves in the
 * project. A title can therefore exist before its artwork does: an entry with no
 * matching PDF shows as an "awaiting artwork" box, which is how a new tape gets
 * onto the board the moment someone takes it on.
 *
 * A PDF that turns up in `sleeves/` without an entry here still renders; it just
 * has no owners listed. Adding it here is what gives it a proper title.
 */
export interface SleeveEntry {
  /** Matches the PDF's filename stem: `<id>.pdf` in `sleeves/`. */
  id: string
  title: string
  owners: string[]
}

export const REGISTRY: SleeveEntry[] = [
  { id: 'clockmaster', title: 'The Clock Master', owners: ['Brandon', 'Jess'] },
  { id: 'idiocracy', title: 'Idiocracy', owners: ['Angie'] },
  { id: 'jennifers-body', title: "Jennifer's Body", owners: ['Melissa'] },
]

export function findEntry(id: string): SleeveEntry | undefined {
  return REGISTRY.find((entry) => entry.id === id)
}

/** "Brandon and Jess" · "Brandon, Jess and Angie" · "Unassigned" */
export function formatOwners(owners: string[]): string {
  if (owners.length === 0) return 'Unassigned'
  if (owners.length === 1) return owners[0]
  return `${owners.slice(0, -1).join(', ')} and ${owners[owners.length - 1]}`
}

/** The upload endpoint will only ever write to one of these paths. */
export const ALLOWED_SLEEVE_IDS = REGISTRY.map((entry) => entry.id)
