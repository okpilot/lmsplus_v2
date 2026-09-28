// Cross-language parity: deriveContentId('o', [text]) (this package) must equal the SQL
// `ordering_item_id(text)` function (migration 20260928000100_ordering_items_derived_ids.sql,
// #1045) for every text a real question author could type — otherwise a question imported by
// scripts/import-vfr-rt-content.ts or scripts/seed-vfr-rt-training-eval.ts (which both derive
// ordering item ids in JS via buildOrderingItems) would be rejected at INSERT by the
// `is_valid_ordering_items` CHECK, which recomputes the id in SQL.
//
// This is a real Postgres call (`admin.rpc('ordering_item_id', ...)`), not a re-implementation of
// the SQL in JS — a JS mirror of the SQL could drift from the SQL the same way a hand-rolled id
// could, and would prove nothing about the actual migration.
//
// The SQL spells out JS's `\s` / `trim()` whitespace set; PostgreSQL's own `\s` omits U+FEFF.
import { describe, expect, it } from 'vitest'
import { getAdminClient } from '@/lib/integration-support/harness'
import { deriveContentId } from './content-ids'

const admin = getAdminClient()

async function sqlOrderingItemId(text: string): Promise<string> {
  const { data, error } = await admin.rpc('ordering_item_id', { p_text: text })
  if (error) throw new Error(`ordering_item_id RPC: ${error.message}`)
  if (typeof data !== 'string') throw new Error('ordering_item_id RPC: non-string result')
  return data
}

describe("deriveContentId('o', [text]) vs SQL ordering_item_id(text)", () => {
  it.each([
    ['plain text', 'engine failure'],
    ['mixed case', 'Engine FAILURE'],
    ['internal double spaces', 'engine   failure'],
    ['leading/trailing whitespace', '  engine failure  '],
    ['tabs and newlines around content', '\t engine failure \n'],
    ['punctuation preserved', 'RWY 27, cleared to land.'],
    ['digits', 'squawk 7700'],
    ['non-ASCII letters (accented)', 'niveau de vol élevé'],
    ['non-ASCII letters (cyrillic)', 'высота полёта'],
    ['em dash and curly quotes', 'position — “five miles” north'],
    ['non-breaking space (NBSP, U+00A0)', 'engine failure'],
    ['em space (U+2003)', 'engine failure'],
    ['ideographic space (U+3000)', 'engine　failure'],
    ['vertical tab', 'engine\u000Bfailure'],
    ['form feed', 'engine\u000Cfailure'],
    ['leading/trailing NBSP', '\u00A0engine failure\u00A0'],
    ['leading/trailing ideographic space', '\u3000engine failure\u3000'],
    ['leading/trailing line/paragraph separator', '\u2028engine failure\u2029'],
    ['leading BOM (U+FEFF)', '\uFEFFengine failure'],
    ['internal BOM (U+FEFF)', 'engine\uFEFFfailure'],
    ["'v' at both ends", 'vacate via v'],
  ])('matches for %s', async (_label, text) => {
    expect(await sqlOrderingItemId(text)).toBe(deriveContentId('o', [text]))
  })
})
