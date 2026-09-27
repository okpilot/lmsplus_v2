import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// ---------------------------------------------------------------------------
// Pure parsing/validation helpers for the Vector-to-Spec Mapping table in
// attack-surface.md. Kept local to this test file (no production import) —
// the matrix is a markdown doc, not code with its own module.
// ---------------------------------------------------------------------------

const REDTEAM_DIR = path.resolve(__dirname)
const MATRIX_PATH = path.join(REDTEAM_DIR, 'attack-surface.md')
const TECHNIQUES_PATH = path.join(REDTEAM_DIR, 'techniques.json')

const STATUS_VALUES = new Set(['FIXED', 'GAP', 'MISSED', 'BLOCKED'])
const VECTOR_RE = /^[\w./:()-]+$/
const SPEC_FILE_RE = /^[\w-]+\.spec\.ts$/
const NOTES_RE = /^#\d+$/
/** Rows predating the Technique column; a new row must carry all 7 cells. Lower it when a legacy row goes. */
const LEGACY_SIX_CELL_ROWS = 177

/** Splits one `| a | b\|c | d |` markdown table row into trimmed cells, honouring `\|` escapes. */
function splitTableRow(line: string): string[] {
  const cells: string[] = []
  let current = ''
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '\\' && line[i + 1] === '|') {
      current += '|'
      i++
      continue
    }
    if (ch === '|') {
      cells.push(current)
      current = ''
      continue
    }
    current += ch
  }
  cells.push(current)
  if (cells.length > 0 && cells[0].trim() === '') cells.shift()
  if (cells.length > 0 && cells[cells.length - 1].trim() === '') cells.pop()
  return cells.map((c) => c.trim())
}

/** Extracts the data rows of the "Vector-to-Spec Mapping" table (header + separator skipped). */
function parseMatrixRows(markdown: string): string[][] {
  const lines = markdown.split('\n').map((l) => l.replace(/\r$/, ''))
  const startIndex = lines.findIndex((l) => l.trim() === '## Vector-to-Spec Mapping')
  if (startIndex === -1) return []

  const rows: string[][] = []
  let sawHeader = false
  let sawSeparator = false
  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('## ')) break
    if (!line.startsWith('|')) continue
    if (!sawHeader) {
      sawHeader = true
      continue
    }
    if (!sawSeparator) {
      sawSeparator = true
      continue
    }
    rows.push(splitTableRow(line))
  }
  return rows
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
  if ((status === 'GAP' || status === 'MISSED') && !NOTES_RE.test(notes ?? '')) {
    errors.push(`row ${id}: status "${status}" requires a #N notes reference`)
  }
  return errors
}

/**
 * Validates every 7-cell row (Technique column, index 6) against the closed
 * rules. A 6-cell row (pre-existing, no Technique cell) is skipped; any other
 * cell count is rejected (a missing cell, or an unescaped `|` in prose).
 */
function validateMatrixRows(
  rows: readonly string[][],
  techniques: readonly string[],
  specFileExists: (name: string) => boolean,
): string[] {
  const techniqueSet = new Set(techniques)
  const errors: string[] = []
  for (const row of rows) {
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

function realSpecFileExists(name: string): boolean {
  return fs.existsSync(path.join(REDTEAM_DIR, name))
}

/** A row that satisfies every rule. */
const VALID_ROW = ['Z1', 'probe-something', 'HIGH', REAL_SPEC_FILE, 'FIXED', '', 'rate-limit']

function matrixWithRow(row: readonly string[]): string {
  return [
    '## Vector-to-Spec Mapping',
    '',
    '| ID | Vector | Priority | Spec File | Status | Notes | Technique |',
    '|----|--------|----------|-----------|--------|-------|---|',
    `| ${row.join(' | ')} |`,
  ].join('\n')
}

describe('parseMatrixRows', () => {
  it('reads a row from the Vector-to-Spec Mapping table', () => {
    const rows = parseMatrixRows(matrixWithRow(VALID_ROW))
    expect(rows).toEqual([VALID_ROW])
  })

  it('keeps a literal pipe inside a cell when it is escaped', () => {
    const row = ['Z2', 'probe', 'HIGH', REAL_SPEC_FILE, 'FIXED', '', 'a\\|b']
    const rows = parseMatrixRows(matrixWithRow(row))
    expect(rows[0][6]).toBe('a|b')
  })

  it('stops reading rows at the next heading', () => {
    const markdown = `${matrixWithRow(VALID_ROW)}\n\n## Files to Watch\n\n| not | a | matrix | row |`
    const rows = parseMatrixRows(markdown)
    expect(rows).toEqual([VALID_ROW])
  })
})

describe('the real attack-surface matrix', () => {
  it('has zero validation errors', () => {
    const markdown = fs.readFileSync(MATRIX_PATH, 'utf8')
    const techniques = JSON.parse(fs.readFileSync(TECHNIQUES_PATH, 'utf8')) as string[]
    const rows = parseMatrixRows(markdown)
    const errors = validateMatrixRows(rows, techniques, realSpecFileExists)
    expect(errors).toEqual([])
  })

  it('adds no row without a Technique column beyond the pre-existing ones', () => {
    const rows = parseMatrixRows(fs.readFileSync(MATRIX_PATH, 'utf8'))
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.filter((r) => r.length === 6).length).toBe(LEGACY_SIX_CELL_ROWS)
  })
})

describe('validateMatrixRows', () => {
  const techniques = JSON.parse(fs.readFileSync(TECHNIQUES_PATH, 'utf8')) as string[]

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

  it('requires a #N notes reference when status is MISSED', () => {
    const row = [...VALID_ROW]
    row[4] = 'MISSED'
    row[5] = ''
    const errors = validateMatrixRows([row], techniques, realSpecFileExists)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('requires a #N notes reference')
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
  const techniques = JSON.parse(fs.readFileSync(TECHNIQUES_PATH, 'utf8')) as string[]

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
