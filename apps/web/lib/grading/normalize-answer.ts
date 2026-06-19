export function normalizeAnswer(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/[\][.,;:!?"'()]/g, '')
    .replace(/\s+/g, ' ')
}
