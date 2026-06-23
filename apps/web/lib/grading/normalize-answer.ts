// Mirrors the SQL helper public.normalize_answer(text) (mig 128) EXACTLY —
// parity is contractual (grading compares normalized response vs canonical on
// both client preview and server). The final .trim() (mig 128 / #921) removes a
// stray edge space left when punctuation was adjacent to a leading/trailing
// space (e.g. ". hello" -> "hello", "hello ." -> "hello").
export function normalizeAnswer(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/[\][.,;:!?"'()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
