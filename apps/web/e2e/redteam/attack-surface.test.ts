import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ID_RE, parseMatrixRows } from './matrix'

// ---------------------------------------------------------------------------
// Validation helpers for the Vector-to-Spec Mapping table in attack-surface.md.
// Pure parsing (splitTableRow, parseMatrixRows) lives in matrix.ts; row
// validation stays here since it needs no production import either.
// ---------------------------------------------------------------------------

const REDTEAM_DIR = path.resolve(__dirname)
const MATRIX_PATH = path.join(REDTEAM_DIR, 'attack-surface.md')
const TECHNIQUES_PATH = path.join(REDTEAM_DIR, 'techniques.json')

const STATUS_VALUES = new Set(['FIXED', 'GAP', 'MISSED', 'BLOCKED'])
const VECTOR_RE = /^[\w./:()-]+$/
const SPEC_FILE_RE = /^[\w-]+\.spec\.ts$/
const NOTES_RE = /^#\d+$/
/** IDs of the rows predating the Technique column; a new row must carry all 7 cells. */
const LEGACY_ROW_IDS_PATH = path.join(REDTEAM_DIR, 'legacy-row-ids.json')

/** Reads a repo-local JSON file that must hold an array of strings. */
function readStringArray(file: string): string[] {
  const data: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (!Array.isArray(data) || !data.every((x): x is string => typeof x === 'string')) {
    throw new Error(`${file}: expected a JSON array of strings`)
  }
  return data
}

/** Checks one 7-cell row against the closed rules; returns its errors. */
function validateRow(
  row: readonly string[],
  techniqueSet: ReadonlySet<string>,
  specFileExists: (name: string) => boolean,
): string[] {
  const id = row[0] ?? '(no id)'
  const [, vector, , specFile, status, notes, technique] = row.map((c) => c.trim())
  const errors: string[] = []
  if (!ID_RE.test(id.trim())) {
    errors.push(`row ${id}: ID "${id}" does not match ${ID_RE}`)
  }
  if (!techniqueSet.has(technique ?? '')) {
    errors.push(`row ${id}: technique "${technique}" is not in techniques.json`)
  }
  if (!VECTOR_RE.test(vector ?? '')) {
    errors.push(`row ${id}: vector "${vector}" does not match ${VECTOR_RE}`)
  }
  if (!SPEC_FILE_RE.test(specFile ?? '')) {
    errors.push(`row ${id}: spec file "${specFile}" is not a single *.spec.ts name`)
  } else if (!specFileExists(specFile ?? '')) {
    errors.push(`row ${id}: spec file "${specFile}" does not exist in apps/web/e2e/redteam/`)
  }
  if (!STATUS_VALUES.has(status ?? '')) {
    errors.push(`row ${id}: status "${status}" is not one of FIXED, GAP, MISSED, BLOCKED`)
  }
  if (notes !== '' && !NOTES_RE.test(notes ?? '')) {
    errors.push(`row ${id}: notes "${notes}" is not empty or a #N issue reference`)
  }
  if (status === 'GAP' && !NOTES_RE.test(notes ?? '')) {
    errors.push(`row ${id}: status "${status}" requires a #N notes reference`)
  }
  return errors
}

/**
 * Validates every 7-cell row (Technique column, index 6) against the closed
 * rules. A 6-cell row (pre-existing, no Technique cell) is skipped; any other
 * cell count is rejected (a missing cell, or an unescaped `|` in prose). An ID
 * repeated anywhere in the matrix is rejected.
 */
function validateMatrixRows(
  rows: readonly string[][],
  techniques: readonly string[],
  specFileExists: (name: string) => boolean,
): string[] {
  const techniqueSet = new Set(techniques)
  const errors: string[] = []
  const seenIds = new Set<string>()
  for (const row of rows) {
    const id = (row[0] ?? '').trim()
    if (seenIds.has(id)) errors.push(`row ${id}: duplicate ID`)
    seenIds.add(id)
    if (row.length === 6) continue
    if (row.length !== 7) {
      errors.push(
        `row ${row[0] ?? '(no id)'}: ${row.length} cells, expected 7 (escape a literal | as \\|)`,
      )
      continue
    }
    errors.push(...validateRow(row, techniqueSet, specFileExists))
  }
  return errors
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const REAL_SPEC_FILE = 'rate-limiting.spec.ts'

/** Matches a line (after leading whitespace) statically skipping a titled test or describe block. */
const STATIC_SKIP_LINE_RE =
  /^\s*(test\.describe\.skip|test\.describe\.fixme|test\.skip|test\.fixme|it\.skip|describe\.skip)\(\s*(['"`])/

/** True when the spec source holds at least one statically-skipped titled test or describe. */
function hasStaticSkip(source: string): boolean {
  return source.split(/\r\n|\n/).some((line) => STATIC_SKIP_LINE_RE.test(line))
}

/** IDs of 7-cell rows past `GAP` whose spec is still skipped — a skipped spec passes `e2e:redteam` while running nothing. */
function skippedSpecRowIds(
  rows: string[][],
  readSpec: (name: string) => string,
  specFileExists: (name: string) => boolean = () => true,
): string[] {
  return rows
    .filter((r) => r.length === 7 && r[4]?.trim() !== 'GAP')
    .filter((r) => specFileExists((r[3] ?? '').trim()))
    .filter((r) => hasStaticSkip(readSpec((r[3] ?? '').trim())))
    .map((r) => (r[0] ?? '').trim())
}

function realSpecFileExists(name: string): boolean {
  return fs.existsSync(path.join(REDTEAM_DIR, name))
}

/** A row that satisfies every rule. */
const VALID_ROW = ['ZZ', 'probe-something', 'HIGH', REAL_SPEC_FILE, 'FIXED', '', 'rate-limit']

function matrixWithRow(row: readonly string[]): string {
  return [
    '## Vector-to-Spec Mapping',
    '',
    '| ID | Vector | Priority | Spec File | Status | Notes | Technique |',
    '|----|--------|----------|-----------|--------|-------|---|',
    `| ${row.join(' | ')} |`,
  ].join('\n')
}

describe('validateMatrixRows — row-shape errors surfaced through parseMatrixRows', () => {
  it('flags a row written without a leading pipe instead of dropping it', () => {
    const markdown = `${matrixWithRow(VALID_ROW)}\n${VALID_ROW.join(' | ')} |`
    const rows = parseMatrixRows(markdown)
    const techniques = readStringArray(TECHNIQUES_PATH)
    const errors = validateMatrixRows(rows, techniques, realSpecFileExists)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('1 cells, expected 7')
  })
})

describe('the real attack-surface matrix', () => {
  // Every committed row is 6-cell, so this validates no real row until the first 7-cell row lands;
  // validateRow's rules are pinned by the validateMatrixRows fixtures below.
  it('has zero validation errors', () => {
    const markdown = fs.readFileSync(MATRIX_PATH, 'utf8')
    const techniques = readStringArray(TECHNIQUES_PATH)
    const rows = parseMatrixRows(markdown)
    const errors = validateMatrixRows(rows, techniques, realSpecFileExists)
    expect(errors).toEqual([])
  })

  it('adds no row without a Technique column beyond the pre-existing ones', () => {
    const rows = parseMatrixRows(fs.readFileSync(MATRIX_PATH, 'utf8'))
    const legacyIds = readStringArray(LEGACY_ROW_IDS_PATH)
    expect(legacyIds.length).toBeGreaterThan(0)
    const sixCellIds = rows.filter((r) => r.length === 6).map((r) => r[0] ?? '')
    expect(sixCellIds.sort()).toEqual([...legacyIds].sort())
  })

  it('has no row past GAP whose spec is still skipped', () => {
    const rows = parseMatrixRows(fs.readFileSync(MATRIX_PATH, 'utf8'))
    const readSpec = (name: string) => fs.readFileSync(path.join(REDTEAM_DIR, name), 'utf8')
    expect(skippedSpecRowIds(rows, readSpec, realSpecFileExists)).toEqual([])
  })
})

describe('skippedSpecRowIds', () => {
  const skipped = "test.skip('rejects a forged token', async () => {})"
  const running = "test('rejects a forged token', async () => {})"
  const blockedRow = () => [...VALID_ROW].fill('BLOCKED', 4, 5)

  it('flags a BLOCKED row whose spec is still skipped', () => {
    expect(skippedSpecRowIds([blockedRow()], () => skipped)).toEqual(['ZZ'])
  })

  it('accepts a BLOCKED row whose spec runs', () => {
    expect(skippedSpecRowIds([blockedRow()], () => running)).toEqual([])
  })

  it('accepts a GAP row whose spec is skipped', () => {
    expect(skippedSpecRowIds([[...VALID_ROW].fill('GAP', 4, 5)], () => skipped)).toEqual([])
  })

  it('does not flag a spec that only mentions test.skip() in a comment', () => {
    const source =
      'test.beforeEach(async () => {\n  // reset id so a test.skip() below does not leak\n})'
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual([])
  })

  it('does not flag a spec with a conditional runtime test.skip', () => {
    const source =
      "test('rejects a forged token', async () => {\n  if (cond) {\n    test.skip(true, 'reason')\n    return\n  }\n})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual([])
  })

  it('flags a spec with a titled test.skip', () => {
    const source = "test.skip('rejects a forged token', async () => {})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual(['ZZ'])
  })

  it('flags a spec with a titled test.describe.skip', () => {
    const source = "test.describe.skip('forged token flows', () => {})"
    expect(skippedSpecRowIds([blockedRow()], () => source)).toEqual(['ZZ'])
  })

  it('skips a row whose spec file does not exist instead of throwing', () => {
    expect(() =>
      skippedSpecRowIds(
        [blockedRow()],
        (name) => fs.readFileSync(path.join(REDTEAM_DIR, name), 'utf8'),
        () => false,
      ),
    ).not.toThrow()
    expect(
      skippedSpecRowIds(
        [blockedRow()],
        (name) => fs.readFileSync(path.join(REDTEAM_DIR, name), 'utf8'),
        () => false,
      ),
    ).toEqual([])
  })
})

describe('validateMatrixRows', () => {
  const techniques = readStringArray(TECHNIQUES_PATH)

  it('accepts a row whose cells all satisfy the closed rules', () => {
    const errors = validateMatrixRows([VALID_ROW], techniques, realSpecFileExists)
    expect(errors).toEqual([])
  })

  it('skips a 6-cell row with no Technique column even when its other cells are invalid prose', () => {
    const row = ['Z1', 'not a valid vector!!', 'HIGH', 'nonexistent.spec.ts', 'WRONG', 'prose']
    const errors = validateMatrixRows([row], techniques, realSpecFileExists)
    expect(errors).toEqual([])
  })

  it('rejects a row whose Technique cell is empty', () => {
    const row = [...VALID_ROW]
    row[6] = ''
    const errors = validateMatrixRows([row], techniques, realSpecFileExists)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('not in techniques.json')
  })

  it('rejects a Technique code in the wrong case', () => {
    const row = [...VALID_ROW]
    row[6] = 'Rate-Limit'
    const errors = validateMatrixRows([row], techniques, realSpecFileExists)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('not in techniques.json')
  })

  it('rejects a row split by an unescaped pipe into more than 7 cells', () => {
    const row = [...VALID_ROW, 'leaked prose']
    const errors = validateMatrixRows([row], techniques, realSpecFileExists)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('expected 7')
  })

  it('rejects a new row reusing the ID of an existing row', () => {
    const legacy = ['A', 'legacy-vector', 'HIGH', 'x.spec.ts', 'prose', 'prose']
    const row = [...VALID_ROW]
    row[0] = 'A'
    const errors = validateMatrixRows([legacy, row], techniques, realSpecFileExists)
    expect(errors).toEqual(['row A: duplicate ID'])
  })

  it('rejects a new row whose ID is not 1-3 capital letters', () => {
    const row = [...VALID_ROW]
    row[0] = 'fv1'
    const errors = validateMatrixRows([row], techniques, realSpecFileExists)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('does not match')
  })

  it('rejects a row with fewer than 6 cells instead of skipping it as pre-existing', () => {
    const row = VALID_ROW.slice(0, 5)
    const errors = validateMatrixRows([row], techniques, realSpecFileExists)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('5 cells, expected 7')
  })

  it('rejects a technique code that is not in the closed list', () => {
    const row = [...VALID_ROW]
    row[6] = 'not-a-real-code'
    const errors = validateMatrixRows([row], techniques, realSpecFileExists)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('not in techniques.json')
  })

  it('rejects a vector identifier containing spaces or punctuation outside the allowed set', () => {
    const row = [...VALID_ROW]
    row[1] = 'bad vector!'
    const errors = validateMatrixRows([row], techniques, realSpecFileExists)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('does not match')
  })

  it('rejects a spec file cell naming more than one file', () => {
    const row = [...VALID_ROW]
    row[3] = `${REAL_SPEC_FILE} + other.spec.ts`
    const errors = validateMatrixRows([row], techniques, realSpecFileExists)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('not a single *.spec.ts name')
  })

  it('rejects a spec file that does not exist in the redteam directory', () => {
    const row = [...VALID_ROW]
    row[3] = 'this-file-does-not-exist.spec.ts'
    const errors = validateMatrixRows([row], techniques, realSpecFileExists)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('does not exist')
  })

  it('rejects a status outside the closed FIXED/GAP/MISSED/BLOCKED set', () => {
    const row = [...VALID_ROW]
    row[4] = 'PASSING'
    const errors = validateMatrixRows([row], techniques, realSpecFileExists)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('is not one of FIXED, GAP, MISSED, BLOCKED')
  })

  it('rejects a notes cell that is neither empty nor a #N issue reference', () => {
    const row = [...VALID_ROW]
    row[5] = 'see the PR description'
    const errors = validateMatrixRows([row], techniques, realSpecFileExists)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('is not empty or a #N issue reference')
  })

  it('requires a #N notes reference when status is GAP', () => {
    const row = [...VALID_ROW]
    row[4] = 'GAP'
    row[5] = ''
    const errors = validateMatrixRows([row], techniques, realSpecFileExists)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('requires a #N notes reference')
  })

  it('accepts a MISSED row with empty notes, since its fix lands in the same PR', () => {
    const row = [...VALID_ROW]
    row[4] = 'MISSED'
    row[5] = ''
    const errors = validateMatrixRows([row], techniques, realSpecFileExists)
    expect(errors).toEqual([])
  })

  it('accepts a GAP row that carries a #N notes reference', () => {
    const row = [...VALID_ROW]
    row[4] = 'GAP'
    row[5] = '#1234'
    const errors = validateMatrixRows([row], techniques, realSpecFileExists)
    expect(errors).toEqual([])
  })
})

describe('techniques.json', () => {
  const techniques = readStringArray(TECHNIQUES_PATH)

  it('is non-empty', () => {
    expect(techniques.length).toBeGreaterThan(0)
  })

  it('has no duplicate codes', () => {
    expect(new Set(techniques).size).toBe(techniques.length)
  })

  it('is sorted alphabetically', () => {
    expect(techniques).toEqual([...techniques].sort())
  })
})
