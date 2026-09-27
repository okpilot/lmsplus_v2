/** IDs matching this pattern are 1-3 capital letters (`Z`, `AA`, `FV`). */
export const ID_RE = /^[A-Z]{1,3}$/

/** Splits one `| a | b\|c | d |` markdown table row into trimmed cells, honouring `\|` escapes. */
export function splitTableRow(line: string): string[] {
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
  if (cells.length > 0 && cells[0]?.trim() === '') cells.shift()
  if (cells.length > 0 && cells[cells.length - 1]?.trim() === '') cells.pop()
  return cells.map((c) => c.trim())
}

/** Extracts the data rows of the "Vector-to-Spec Mapping" table (header + separator skipped). */
export function parseMatrixRows(markdown: string): string[][] {
  const lines = markdown.split('\n').map((l) => l.replace(/\r$/, ''))
  const startIndex = lines.findIndex((l) => l.trim() === '## Vector-to-Spec Mapping')
  if (startIndex === -1) return []

  const rows: string[][] = []
  let sawHeader = false
  let sawSeparator = false
  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (line.startsWith('## ')) break
    if (!line.startsWith('|')) {
      // A pipe row without a leading `|` still renders; keep it as one cell so validation rejects it.
      if (sawSeparator && line.includes('|')) rows.push([line.trim()])
      continue
    }
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

/** IDs (matching {@link ID_RE}) in column 0 of parsed matrix rows. */
export function extractIds(rows: readonly (readonly string[])[]): string[] {
  return rows.map((row) => (row[0] ?? '').trim()).filter((id) => ID_RE.test(id))
}

/** Orders vector IDs by length first, then alphabetically (`Z` < `AA` < `FV`). */
export function compareVectorIds(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length
  return a < b ? -1 : a > b ? 1 : 0
}

/** Increments a base-26 capital-letter ID with carry (`Z` -> `AA`, `ZZ` -> `AAA`). */
function incrementId(id: string): string {
  const letters = id.split('')
  let i = letters.length - 1
  while (i >= 0) {
    if (letters[i] !== 'Z') {
      letters[i] = String.fromCharCode(id.charCodeAt(i) + 1)
      return letters.join('')
    }
    letters[i] = 'A'
    i--
  }
  return `A${letters.join('')}`
}

/** Max ID (matching {@link ID_RE}) across every list, plus one, with Z->AA carry. Throws on ZZZ or all-empty input. */
export function nextVectorId(idLists: readonly (readonly string[])[]): string {
  const ids = idLists.flat().filter((id) => ID_RE.test(id))
  if (ids.length === 0) throw new Error('nextVectorId: no IDs matching ^[A-Z]{1,3}$ in any list')
  const max = ids.reduce((best, id) => (compareVectorIds(id, best) > 0 ? id : best))
  if (max === 'ZZZ') throw new Error('nextVectorId: ZZZ is the last representable 1-3 letter ID')
  return incrementId(max)
}

/** Throws when any value is not a vector ID — a dropped value would let an ID be allocated twice. */
export function assertVectorIds(values: readonly string[]): void {
  const invalid = values.filter((value) => !ID_RE.test(value))
  if (invalid.length > 0) {
    throw new Error(`next-vector-id: not a vector ID: ${invalid.join(', ')}`)
  }
}
