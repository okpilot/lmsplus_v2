/**
 * Pure (client-safe) keys for the preloaded Discovery counts. The filter sets the UI can
 * produce: none, unseen (exclusive), incorrect, flagged, incorrect + flagged.
 */
export const PRELOADED_FILTER_SETS: readonly (readonly string[])[] = [
  [],
  ['unseen'],
  ['incorrect'],
  ['flagged'],
  ['incorrect', 'flagged'],
]

/** Order-independent key of an active filter list ('all' already removed); '' = none. */
export function filterSetKey(filters: readonly string[]): string {
  return [...filters].sort().join(',')
}
