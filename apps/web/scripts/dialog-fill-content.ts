/**
 * Pure validation + composition for authored `dialog_fill` content
 * (scripts/content/vfr-rt-part2-*.json). No I/O, no DB, no process state — the importer
 * calls it, and the co-located suite plus the corpus gate exercise it directly.
 *
 * Two deliberately separate entry points with distinct error prefixes, so an operator reading
 * a failure knows immediately WHICH gate rejected the content:
 *   - `assertDialogFillItem`      — mirrors the DB CHECKs. A failure here means the row would
 *                                   have been rejected by Postgres (or stored un-answerable).
 *   - `assertDialogFillAuthoring` — R1–R4 house rules from the file's own `authoring_notes`.
 *                                   A failure here means the row would import fine but teach
 *                                   badly.
 *
 * Storage grammar: the source template carries bare `{{n}}` markers and the answers live only
 * in `blanks`; `composeDialogTemplate` builds the stored `{{n|canonical;syn1;syn2}}` token so
 * each answer has exactly one source of truth. The `|` is mandatory —
 * `questions_dialog_fill_template_wellformed` erases `\{\{\d+\|[^{}|]*\}\}` and rejects any
 * remaining brace, so a bare `{{n}}` reaching the DB fails the CHECK.
 *
 * Keep this file flat in scripts/ — knip's apps/web entry glob is `scripts/*.ts`.
 */

import { normalizeAnswer } from '../lib/grading/normalize-answer'
import { requireRecord, requireText } from './content-assertions'

export type AuthoredBlank = {
  index: number
  shape: 'recall' | 'derivable'
  canonical: string
  synonyms: string[]
  /**
   * Prose recording WHY this blank has its shape. Authoring metadata only: nothing reads it,
   * and `toStoredBlanks` strips it before the row is written. Optional because
   * `assertAuthoredBlank` does not validate it — declaring it required would let the assertion
   * narrow it to `string` on content that omits it, handing a future reader a silent `undefined`.
   */
  rule?: string
}

export type StoredBlank = { index: number; canonical: string; synonyms: string[] }

export type DialogFillItem = {
  num: string
  prompt: string
  template: string
  blanks: AuthoredBlank[]
  explanation?: string
}

type LineMarker = { index: number; start: number; end: number }

// Built fresh on every use: a /g regex carries `lastIndex` across calls, so a shared one used
// with .test()/.exec() alternates results. The repo has been bitten here before
// (parse-dialog-display.ts:20 resets lastIndex by hand for the same reason).
const MARKER_PATTERN = String.raw`\{\{(\d+)\}\}`
function markerRe(): RegExp {
  return new RegExp(MARKER_PATTERN, 'g')
}

// Non-global — safe to use with .test() and as a first-match .replace().
const SPEAKER_PREFIX_RE = /^\[(atc|pilot)\]\s?/
const FORBIDDEN_ANSWER_CHARS_RE = /[{}|;]/
const BRACE_RE = /[{}]/

function lineMarkers(text: string): LineMarker[] {
  const found: LineMarker[] = []
  const re = markerRe()
  let match = re.exec(text)
  while (match !== null) {
    // match[1] is the \d+ capture — guaranteed present whenever the pattern matches.
    found.push({
      index: Number.parseInt(match[1] ?? '', 10),
      start: match.index,
      end: match.index + match[0].length,
    })
    match = re.exec(text)
  }
  return found
}

function assertAnswerChars(text: string, label: string): void {
  if (FORBIDDEN_ANSWER_CHARS_RE.test(text)) {
    throw new Error(
      `${label} must not contain { } | or ; — they delimit the stored token (mig 125 CHECK, a student-leak guard) (got ${JSON.stringify(text)})`,
    )
  }
}

/**
 * Shape + delimiter checks for one authored blank. Does NOT check `shape`/`rule`: those are
 * authoring fields with no DB counterpart, and R1 in `assertDialogFillAuthoring` is what
 * verifies `shape` at runtime.
 */
function assertAuthoredBlank(value: unknown, label: string): asserts value is AuthoredBlank {
  requireRecord(value, label)
  const index = value.index
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) {
    throw new Error(`${label}.index must be a non-negative integer (got ${JSON.stringify(index)})`)
  }
  requireText(value.canonical, `${label}.canonical`)
  assertAnswerChars(value.canonical, `${label}.canonical`)
  if (!Array.isArray(value.synonyms)) {
    throw new Error(`${label}.synonyms must be an array (got ${JSON.stringify(value.synonyms)})`)
  }
  const synonyms: readonly unknown[] = value.synonyms
  for (const [j, synonym] of synonyms.entries()) {
    requireText(synonym, `${label}.synonyms[${j}]`)
    assertAnswerChars(synonym, `${label}.synonyms[${j}]`)
  }
}

function assertTemplateShape(template: string, at: string): void {
  if (lineMarkers(template).length === 0) {
    throw new Error(`${at}: 'template' must contain at least one {{n}} blank marker`)
  }
  if (BRACE_RE.test(template.replace(markerRe(), ' '))) {
    throw new Error(
      `${at}: 'template' has a { or } outside a {{n}} marker — questions_dialog_fill_template_wellformed rejects every leftover brace`,
    )
  }
  for (const rawLine of template.split('\n')) {
    const line = rawLine.trim()
    if (line === '') continue
    if (!SPEAKER_PREFIX_RE.test(line)) {
      throw new Error(
        `${at}: every 'template' line must start with [atc] or [pilot] for speaker styling (got ${JSON.stringify(rawLine)})`,
      )
    }
  }
}

function assertMarkerBlankBijection(
  template: string,
  blankIndices: ReadonlySet<number>,
  at: string,
): void {
  // Capture the RAW list before de-duplicating: a Set comparison proves set-equality, not a
  // bijection, so `{{0}} … {{0}}` with a single blanks[0] would pass. parse-dialog-display then
  // emits two blank segments for index 0, so the student gets two input boxes bound to one answer
  // slot (the second overwrites the first) while the score denominator counts one blank — and
  // quiz_session_answers' ON CONFLICT (session_id, question_id, blank_index) records only one.
  const found = lineMarkers(template).map((m) => m.index)
  const markers = new Set(found)
  if (found.length !== markers.size) {
    throw new Error(
      `${at}: 'template' repeats a {{n}} marker — two inputs would share one answer slot; give each blank its own index`,
    )
  }
  for (const index of markers) {
    if (!blankIndices.has(index)) {
      throw new Error(
        `${at}: template marker {{${index}}} has no matching entry in 'blanks' — it would be stored as a bare {{n}} and rejected by questions_dialog_fill_template_wellformed`,
      )
    }
  }
  for (const index of blankIndices) {
    if (!markers.has(index)) {
      throw new Error(
        `${at}: blanks[] carries index ${index} with no {{${index}}} marker in 'template' — unanswerable, yet still counted in the score denominator`,
      )
    }
  }
}

/**
 * Mirror every dialog_fill DB CHECK ahead of any write. Inserts are row-at-a-time with no
 * transaction, so a CHECK violation on row 17 leaves 16 rows committed; validating up front
 * turns that half-import into a clean abort.
 */
export function assertDialogFillItem(value: unknown, at: string): asserts value is DialogFillItem {
  requireRecord(value, at)
  requireText(value.num, `${at}: 'num'`)
  requireText(value.prompt, `${at}: 'prompt'`)
  if (value.explanation !== undefined) requireText(value.explanation, `${at}: 'explanation'`)
  requireText(value.template, `${at}: 'template'`)
  assertTemplateShape(value.template, at)
  if (!Array.isArray(value.blanks) || value.blanks.length === 0) {
    throw new Error(`${at}: 'blanks' must be a non-empty array`)
  }
  const blanks: readonly unknown[] = value.blanks
  const indices = new Set<number>()
  for (const [i, blank] of blanks.entries()) {
    assertAuthoredBlank(blank, `${at}: blanks[${i}]`)
    if (indices.has(blank.index)) {
      throw new Error(
        `${at}: duplicate blank index ${blank.index} — the grader selects a blank by index, so a repeat is ambiguous`,
      )
    }
    indices.add(blank.index)
  }
  assertMarkerBlankBijection(value.template, indices, at)
}

/**
 * Project to exactly the three stored keys. JSONB accepts extra keys silently, so `shape` and
 * `rule` would otherwise persist in `questions.blanks_config`. They would NOT reach any student
 * payload or graded record — `blanks_safe` is built index-only and `get_report_answer_keys`
 * projects only `index` and `canonical` — so this is hygiene, not a leak. Do not go hunting
 * for one.
 */
export function toStoredBlanks(blanks: readonly AuthoredBlank[]): StoredBlank[] {
  return blanks.map((blank) => ({
    index: blank.index,
    canonical: blank.canonical,
    synonyms: [...blank.synonyms],
  }))
}

/**
 * Turn the authored bare-marker template into the stored one. Replacement runs off a regex
 * matching the WHOLE token, never a string replace of `{{n}}` — a naive replace of `{{1}}`
 * corrupts `{{10}}`. A synonym-less blank yields `{{0|request}}`, with no trailing `;`.
 */
export function composeDialogTemplate(
  template: string,
  blanks: readonly StoredBlank[],
  at: string,
): string {
  const byIndex = new Map(blanks.map((blank) => [blank.index, blank]))
  return template.replace(markerRe(), (_match, digits: string) => {
    const index = Number.parseInt(digits, 10)
    const blank = byIndex.get(index)
    if (blank === undefined) {
      throw new Error(`${at}: template marker {{${index}}} has no matching entry in 'blanks'`)
    }
    return `{{${index}|${[blank.canonical, ...blank.synonyms].join(';')}}}`
  })
}

/** Every word visible to the student: speaker prefixes and blank markers removed, normalized. */
function visibleWords(template: string): string[] {
  const visible = template
    .split('\n')
    .map((line) => line.trim().replace(SPEAKER_PREFIX_RE, ''))
    .join('\n')
    .replace(markerRe(), ' ')
  const normalized = normalizeAnswer(visible)
  return normalized === '' ? [] : normalized.split(' ')
}

/** True when `needle`'s words appear as a contiguous run inside `haystack`. */
function containsWordRun(haystack: readonly string[], needle: readonly string[]): boolean {
  if (needle.length === 0) return false
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (needle.every((word, j) => haystack[i + j] === word)) return true
  }
  return false
}

/**
 * R2 + R3 for one recall blank. R2 constrains the CANONICAL only — synonyms are exempt, and
 * that exemption is load-bearing: several single-word recall answers legitimately carry
 * multi-word synonyms (`wilco` accepts `will report runway vacated`).
 */
function assertRecallBlank(blank: AuthoredBlank, visible: readonly string[], at: string): void {
  const words = normalizeAnswer(blank.canonical)
    .split(' ')
    .filter((word) => word !== '')
  if (containsWordRun(visible, words)) {
    throw new Error(
      `${at}: authoring R3 — recall canonical ${JSON.stringify(blank.canonical)} (blanks index ${blank.index}) already appears in the visible template, so nothing is being recalled; mark it 'derivable' or reword the dialogue.`,
    )
  }
}

/**
 * A callsign canonical — `S-AA`, `S5-DBS`. Requires the hyphen, with at most two characters
 * before it, so `wilco` and `touch-and-go` are not mistaken for one. Callsigns are exempt from
 * R5 because the dialogue always states the callsign aloud, so the student can read it off the
 * controller's line; blanking one never hides how a readback divides.
 */
const CALLSIGN_RE = /^[a-z0-9]{1,2}-[a-z]{2,3}$/i

/**
 * R5 — a readback line must leave at least one CONTENT item visible.
 *
 * The exam's own worked example brackets whole phrases but always keeps one item given:
 * `QNH 1025, [descending to 2500 feet], [wilco], [S-BC]`. The visible `QNH 1025` is what shows
 * the student how the readback divides. Blank every content item and only the commas remain,
 * so the student must guess both the split AND each phrase — DLG-15 asked for three phrases off
 * a bare `___, ___, ___, S-GI` and was rejected on eval for exactly this.
 *
 * A trailing callsign does NOT satisfy the rule: it is present on every readback and so carries
 * no information about the division.
 */
function assertLineSplitLegible(
  body: string,
  canonicals: ReadonlyMap<number, string>,
  at: string,
): void {
  const items = body
    .split(',')
    .map((i) => i.trim())
    .filter((i) => i !== '')
  const blankItems = items.filter((i) => new RegExp(`^${MARKER_PATTERN}$`).test(i))
  const contentBlanks = blankItems.filter((i) => {
    const index = Number(markerRe().exec(i)?.[1])
    return !CALLSIGN_RE.test(canonicals.get(index) ?? '')
  })
  // An item mixing text and a blank (`runway {{0}}`) is itself an anchor — the split is visible.
  const hasInlineAnchor = items.some(
    (i) => markerRe().test(i) && !new RegExp(`^${MARKER_PATTERN}$`).test(i),
  )
  const visibleContent = items.filter((i) => !markerRe().test(i) && !CALLSIGN_RE.test(i))
  if (contentBlanks.length >= 2 && visibleContent.length === 0 && !hasInlineAnchor) {
    throw new Error(
      `${at}: authoring R5 — this line blanks ${contentBlanks.length} content items with nothing visible between the commas, so the split cannot be inferred; leave the item that is NOT the lesson visible and blank the hard one.`,
    )
  }
}

/**
 * Terms that name a Part 2 competency rather than the scene. The briefing lists these rules in
 * its preamble — read during PREPARATION — and its example task carries no instruction at all,
 * just the dialogue. A prompt that repeats a rule hands the student the answer at the moment they
 * are meant to supply it: DLG-10 shipped as "Complete the callsign AT THE END of each pilot
 * transmission", which is verbatim the rule under test.
 */
const PROMPT_LEAK_RE =
  /\b(callsign|read ?back|in the order|wilco|abbreviat|decide|runway in use|only the qnh)\b/i

/** R6 — the prompt sets the scene and nothing more. */
function assertPromptSetsSceneOnly(prompt: string, at: string): void {
  const leak = PROMPT_LEAK_RE.exec(prompt)
  if (leak) {
    throw new Error(
      `${at}: authoring R6 — the prompt names the competency under test (${JSON.stringify(leak[0])}); the exam's own example task carries no instruction, so keep the prompt to the scene (where, what situation) and let the dialogue pose the question.`,
    )
  }
}

/**
 * House authoring rules, derived from the content file's own `authoring_notes`:
 *   R1 every blank carries `shape` ∈ recall | derivable
 *   R3 a recall canonical never appears in the visible template, under normalizeAnswer semantics
 *   R5 a line never blanks 2+ CONTENT items with no visible item to show the split
 *   R6 the prompt sets the scene and never names the competency under test
 *
 * R2 (single-word recall canonicals) and R4 (anchor word after a run of recall blanks) were
 * REMOVED on 2026-08-12: both existed to make a per-word split guessable, and per-word splitting
 * is gone. The exam brackets whole phrases — `[descending to 2500 feet]`, `[wilco]` — so a
 * recalled phrase is now one blank, exactly like a derivable one. The numbering is kept as-is so
 * existing references to R5/R6 stay valid.
 *
 * R4 keys on RUNS, not lines. Five lines across four questions are entirely blanks — that shape
 * is mandatory for the callsign-placement questions, where the student decides which blank holds
 * the callsign — so a line-based rule would reject the corpus it was written for. R5 permits
 * those same lines because only ONE of their two blanks is a content item.
 */
export function assertDialogFillAuthoring(item: DialogFillItem, at: string): void {
  const shapes = new Map<number, AuthoredBlank['shape']>()
  const canonicals = new Map(item.blanks.map((b) => [b.index, b.canonical]))
  const visible = visibleWords(item.template)
  assertPromptSetsSceneOnly(item.prompt, at)
  for (const blank of item.blanks) {
    const shape = blank.shape
    if (shape !== 'recall' && shape !== 'derivable') {
      throw new Error(
        `${at}: authoring R1 — blanks index ${blank.index} must carry shape 'recall' or 'derivable' (got ${JSON.stringify(shape)})`,
      )
    }
    shapes.set(blank.index, shape)
    if (shape === 'recall') assertRecallBlank(blank, visible, at)
  }
  for (const rawLine of item.template.split('\n')) {
    const body = rawLine.trim().replace(SPEAKER_PREFIX_RE, '')
    assertLineSplitLegible(body, canonicals, at)
  }
}
