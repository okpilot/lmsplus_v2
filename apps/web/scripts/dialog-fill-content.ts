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
  rule: string
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
const WORD_CHAR_RE = /\w/
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
  if (words.length > 1) {
    throw new Error(
      `${at}: authoring R2 — recall canonical ${JSON.stringify(blank.canonical)} (blanks index ${blank.index}) must be a single word; split a recalled phrase one blank per word and leave its last word visible as the anchor. Synonyms are exempt from this rule.`,
    )
  }
  if (containsWordRun(visible, words)) {
    throw new Error(
      `${at}: authoring R3 — recall canonical ${JSON.stringify(blank.canonical)} (blanks index ${blank.index}) already appears in the visible template, so nothing is being recalled; mark it 'derivable' or reword the dialogue.`,
    )
  }
}

/**
 * R4 for one line. A run of >= 2 consecutive recall blanks must be followed, immediately and on
 * the same line, by text containing a WORD CHARACTER. "Some visible text" is too loose: the
 * callsign shape `{{0}}, {{1}}` puts a bare comma between two blanks, so punctuation alone
 * would satisfy a loose reading and leave exactly the anchorless run the notes forbid.
 *
 * The speaker prefix is stripped by the caller BEFORE this runs — otherwise a run at the start
 * of a line appears anchored by its own `[pilot]` tag, which silently masks every all-blank line.
 */
function assertLineRunsAnchored(
  body: string,
  shapes: ReadonlyMap<number, AuthoredBlank['shape']>,
  at: string,
): void {
  const markers = lineMarkers(body)
  let run = 0
  for (const [i, marker] of markers.entries()) {
    const next = markers[i + 1]
    const gap = body.slice(marker.end, next?.start ?? body.length)
    const adjacent = next !== undefined && !WORD_CHAR_RE.test(gap)
    const continues = adjacent && next !== undefined && shapes.get(next.index) === 'recall'
    run = shapes.get(marker.index) === 'recall' ? run + 1 : 0
    if (run >= 2 && !continues && !WORD_CHAR_RE.test(gap)) {
      throw new Error(
        `${at}: authoring R4 — the run of ${run} consecutive recall blanks ending at {{${marker.index}}} has no anchor; leave the LAST word of the recalled phrase visible right after the run, on the same line.`,
      )
    }
    if (!adjacent) run = 0
  }
}

/**
 * House authoring rules, derived from the content file's own `authoring_notes`:
 *   R1 every blank carries `shape` ∈ recall | derivable
 *   R2 a recall CANONICAL is a single word (synonyms exempt)
 *   R3 a recall canonical never appears in the visible template, under normalizeAnswer semantics
 *   R4 a run of >= 2 consecutive recall blanks is followed by an anchor word on the same line
 *
 * R4 keys on RUNS, not lines. Five lines across four questions are entirely blanks — that shape
 * is mandatory for the callsign-placement questions, where the student decides which blank holds
 * the callsign — so a line-based rule would reject the corpus it was written for.
 */
export function assertDialogFillAuthoring(item: DialogFillItem, at: string): void {
  const shapes = new Map<number, AuthoredBlank['shape']>()
  const visible = visibleWords(item.template)
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
    assertLineRunsAnchored(rawLine.trim().replace(SPEAKER_PREFIX_RE, ''), shapes, at)
  }
}
