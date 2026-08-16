// Mirrors the SQL helper public.normalize_answer(text) (mig 128) EXACTLY — parity is contractual.
// Grading itself is SERVER-side only: the comparison lives in public.answer_matches (mig 158),
// which is typo-tolerant, so do NOT reimplement matching here. This copy exists for the authoring
// corpus gate (scripts/dialog-fill-content.ts R3), which reasons about what a student could copy
// off the screen and therefore has to agree with the database's NORMALISATION — not with its
// notion of "the same string", which since mig 158 is answer_matches and is deliberately looser.
// R3 compares exact normalised word runs on purpose: it asks whether the answer is visible on
// screen, not whether a typo of it would be accepted. Two strings R3 treats as distinct can still
// both grade correct. Widening R3 to match answer_matches would be a category error (#1194).
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
