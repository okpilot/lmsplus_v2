/**
 * Pure validation for authored `multiple_choice` content
 * (scripts/content/vfr-rt-part3-mc-*.json). No I/O, no DB, no process state — the importer
 * calls both gates, and the co-located suite exercises them directly as well as sweeping the
 * shipped corpus.
 *
 * Two deliberately separate entry points with distinct error prefixes, so an operator reading
 * a failure knows immediately WHICH gate rejected the content:
 *   - `assertMcItem`      — per-question structure. A failure here means the row would import
 *                           un-answerable or ambiguous (duplicate option text, a `correct` that
 *                           names no option, option ids that are not a leading run of a..d).
 *   - `assertMcKeyBalance` — a CORPUS-level house rule that no per-item check can see: the
 *                           answer key must not concentrate on one option id. This exists
 *                           because the first draft of the Part 3 pool put the key on `b` or
 *                           `c` in 17 of 18 questions with no `d` at all, which is guessable
 *                           without reading a single stem. Every per-question check passed.
 *
 * WHY THE OPTION-ID RULE IS A LEADING RUN: `questions_mc_correct_option_id_check`
 * (mig 20260619000100) constrains the stored `correct_option_id` to 'a'..'d', so an option with
 * any other id can never be the answer. A gap does NOT make the runner skip a letter — it
 * labels buttons from the array index (`LETTERS[index]` in app/app/_components/answer-options.tsx),
 * so ids a, b, d render as A, B, C. The hazard is the inverse: the third button reads "C" while
 * its stored id is 'd', so every surface that shows `correct_option_id` as a letter contradicts
 * what the student saw. Grading is unaffected — selection and comparison both key on the id.
 *
 * NOT enforced here: `explanation` is optional to this gate (the importer falls back to a
 * generic string), while the suite requires one on every shipped question. That asymmetry is
 * deliberate and suite-only — do not read the optional field as permission to omit it.
 *
 * Keep this file flat in scripts/ — knip's apps/web entry glob is `scripts/*.ts`.
 */

import { requireRecord, requireText } from './content-assertions'

/** The ids an option may carry, in order. This is now the only copy — the importer's own
 *  `MC_OPTION_IDS` was deleted when its MC validation moved here — and it mirrors the DB
 *  CHECK `questions_mc_correct_option_id_check` on `correct_option_id`. */
export const MC_OPTION_IDS = ['a', 'b', 'c', 'd'] as const

export type AuthoredMcOption = { id: string; text: string }

export type AuthoredMcQuestion = {
  num: string
  prompt: string
  options: AuthoredMcOption[]
  correct: string
  explanation?: string
}

/**
 * How far above a perfectly even key one option id may sit before the pool is guessable,
 * as a MULTIPLE of the even share — not a fixed percentage.
 *
 * It has to be relative: with four options an even key is 25% each, but with two options an
 * even key is 50% each, so a flat 40% cap would reject a perfectly balanced true/false pool
 * as "guessable". At 1.6x, four options tolerate up to 40% (the 17-of-18 skew that motivated
 * this gate was 94%) and two options tolerate up to 80%.
 */
export const KEY_SKEW_TOLERANCE = 1.6

/** Corpus size below which the key-balance share test is not meaningful — with 4 ids and a
 *  handful of questions, an honest key can exceed any share by chance alone. */
export const MIN_CORPUS_FOR_KEY_BALANCE = 12

function assertOptionShape(raw: unknown, at: string, index: number): AuthoredMcOption {
  requireRecord(raw, `${at}: options[${index}]`)
  const { id, text } = raw
  requireText(id, `${at}: options[${index}].id`)
  requireText(text, `${at}: options[${index}].text`)
  return { id, text }
}

/** Option ids must be a LEADING RUN of a..d — a/b, or a/b/c, or a/b/c/d. Anything else
 *  (a gap, a repeat, an out-of-order pair, an id outside a..d) is rejected. */
function assertOptionIds(options: AuthoredMcOption[], at: string): void {
  // A one-option question has no distractor, so it is not a choice — and no key-balance check
  // can catch it either (with a single addressable id the permitted share is 100%).
  if (options.length < 2) {
    throw new Error(`${at}: a multiple_choice question needs at least 2 options`)
  }
  const expected = MC_OPTION_IDS.slice(0, options.length)
  if (options.length > MC_OPTION_IDS.length) {
    throw new Error(`${at}: ${options.length} options, but only ${MC_OPTION_IDS.length} ids exist`)
  }
  const actual = options.map((o) => o.id)
  if (actual.join(',') !== expected.join(',')) {
    throw new Error(
      `${at}: option ids must be ${expected.join('/')} in order, got ${actual.join('/')}`,
    )
  }
}

/** Two options that differ only in case or surrounding space are the same answer to a reader,
 *  so one of them is unpickable and the item has no single correct response. */
function assertOptionTextsDistinct(options: AuthoredMcOption[], at: string): void {
  const seen = new Map<string, string>()
  for (const option of options) {
    const key = option.text.trim().toLowerCase()
    const prior = seen.get(key)
    if (prior !== undefined) {
      throw new Error(`${at}: options ${prior} and ${option.id} have the same text`)
    }
    seen.set(key, option.id)
  }
}

/**
 * Per-question structural gate. Throws on the first problem, naming the question so the
 * operator can find it — never returns a list, because a content file with two broken
 * questions is not meaningfully better than one with a single broken question.
 */
export function assertMcItem(raw: unknown, at: string): asserts raw is AuthoredMcQuestion {
  requireRecord(raw, at)
  const { num, prompt, correct, explanation } = raw
  requireText(num, `${at}: num`)
  requireText(prompt, `${at}: prompt`)
  requireText(correct, `${at}: correct`)
  if (!Array.isArray(raw.options) || raw.options.length === 0) {
    throw new Error(`${at}: 'options' must be a non-empty array`)
  }
  const options = raw.options.map((option, i) => assertOptionShape(option, at, i))
  assertOptionIds(options, at)
  assertOptionTextsDistinct(options, at)
  if (!options.some((o) => o.id === correct)) {
    throw new Error(`${at}: 'correct' is '${correct}' but no option carries that id`)
  }
  if (explanation !== undefined) {
    requireText(explanation, `${at}: explanation`)
  }
}

export type KeyBalance = { counts: Record<string, number>; total: number }

/** Tallies the answer key by option id. Exported so a report can show the distribution
 *  without re-deriving it, and so the test can assert on the tally directly. */
export function tallyKey(questions: readonly AuthoredMcQuestion[]): KeyBalance {
  const counts: Record<string, number> = {}
  for (const id of MC_OPTION_IDS) counts[id] = 0
  for (const question of questions) {
    counts[question.correct] = (counts[question.correct] ?? 0) + 1
  }
  return { counts, total: questions.length }
}

/** The option ids the corpus can actually key on — an id no question offers as an option can
 *  never be the answer, so demanding it appear in the key would fail an honest 3-option pool. */
function addressableIds(questions: readonly AuthoredMcQuestion[]): string[] {
  const offered = new Set(questions.flatMap((q) => q.options.map((o) => o.id)))
  return MC_OPTION_IDS.filter((id) => offered.has(id))
}

/**
 * Corpus-level gate: no single option id may hold more than `KEY_SKEW_TOLERANCE` times the
 * even share of the key, and every id the corpus actually offers must be the answer at least
 * once.
 *
 * The over-concentration check runs across ALL ids before the never-used check, because when
 * both fire the skew is the headline — "b holds 75% of the key" tells the author what to fix,
 * while "a is never the answer" is the same defect seen from its quiet end.
 *
 * Skipped below `MIN_CORPUS_FOR_KEY_BALANCE` questions — on a short pool an honest key really
 * can land on one id repeatedly, and a gate that fires on chance teaches the author to game it.
 */
export function assertMcKeyBalance(
  questions: readonly AuthoredMcQuestion[],
  at: string,
  tolerance: number = KEY_SKEW_TOLERANCE,
): void {
  if (questions.length < MIN_CORPUS_FOR_KEY_BALANCE) return
  const { counts, total } = tallyKey(questions)
  const ids = addressableIds(questions)
  const maxShare = Math.min(1, (1 / ids.length) * tolerance)
  for (const id of ids) {
    const share = (counts[id] ?? 0) / total
    if (share > maxShare) {
      throw new Error(
        `${at}: option '${id}' holds ${counts[id]}/${total} of the answer key (${(share * 100).toFixed(0)}%, max ${(maxShare * 100).toFixed(0)}%) — the pool is guessable`,
      )
    }
  }
  for (const id of ids) {
    if ((counts[id] ?? 0) === 0) {
      throw new Error(
        `${at}: option '${id}' is offered but is never the answer in ${total} questions`,
      )
    }
  }
}
