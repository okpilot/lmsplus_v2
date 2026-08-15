// Mirrors the SQL helper public.normalize_answer(text) (mig 128) EXACTLY — parity is contractual.
// Grading itself is SERVER-side only: the comparison lives in public.answer_matches (mig 158),
// which is typo-tolerant, so do NOT reimplement matching here. This copy exists for the authoring
// corpus gate (scripts/dialog-fill-content.ts R3), which reasons about what a student could copy
// off the screen and therefore has to agree with the database's notion of "the same string".
// The final .trim() (mig 128 / #921) removes a
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
