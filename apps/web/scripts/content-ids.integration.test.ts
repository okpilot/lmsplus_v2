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
import { deriveLabelId, deriveZoneId } from './diagram-content'

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
    ['non-breaking space (NBSP, U+00A0)', 'engine\u00A0failure'],
    ['em space (U+2003)', 'engine\u2003failure'],
    ['ideographic space (U+3000)', 'engine\u3000failure'],
    ['vertical tab', 'engine\u000Bfailure'],
    ['form feed', 'engine\u000Cfailure'],
    ['leading/trailing NBSP', '\u00A0engine failure\u00A0'],
    ['leading/trailing ideographic space', '\u3000engine failure\u3000'],
    ['leading/trailing line/paragraph separator', '\u2028engine failure\u2029'],
    ['leading BOM (U+FEFF)', '\uFEFFengine failure'],
    ['internal BOM (U+FEFF)', 'engine\uFEFFfailure'],
    ["'v' at both ends", 'vacate via v'],
    ['uppercase Greek with final sigma', 'ΟΔΟΣ ΑΕΡΟΣ'],
    ['uppercase dotted I', 'İSTANBUL'],
  ])('matches for %s', async (_label, text) => {
    expect(await sqlOrderingItemId(text)).toBe(deriveContentId('o', [text]))
  })
})

// #1215: the diagram validator derives label and zone ids in SQL (via ordering_item_id); the
// importer derives them in JS. Parity is asserted through the real validator, which is what the
// questions CHECK calls.
async function validates(config: unknown): Promise<boolean> {
  const { data, error } = await admin.rpc('is_valid_diagram_config', { p_config: config })
  if (error) throw new Error(`is_valid_diagram_config RPC: ${error.message}`)
  return data === true
}

function oneZoneConfig(imageRef: string, index: number, labelText: string) {
  const zone = { id: deriveZoneId(imageRef, index), x: 0.1, y: 0.1, w: 0.1, h: 0.1 }
  const label = { id: deriveLabelId(labelText), text: labelText }
  return {
    image_ref: imageRef,
    zones: [zone],
    labels: [label],
    answer: [{ zone_id: zone.id, label_id: label.id }],
  }
}

describe('deriveLabelId vs the SQL diagram validator', () => {
  it.each([
    ['plain text', 'Runway heading'],
    ['mixed case', 'Runway HEADING'],
    ['internal double spaces', 'runway   heading'],
    ['leading/trailing whitespace', '  runway heading  '],
    ['non-ASCII letters (cyrillic)', 'высота полёта'],
    ['non-breaking space', 'runway\u00a0heading'],
    ['leading BOM', '\ufeffrunway heading'],
    ['uppercase dotted I', 'İSTANBUL'],
  ])('accepts the JS-derived label id for %s', async (_label, text) => {
    expect(await validates(oneZoneConfig('rwy-27-09-lh-pattern', 0, text))).toBe(true)
  })
})

describe('non-vacuity: the SQL diagram validator compares ids', () => {
  it('rejects a label id derived from different text', async () => {
    const base = oneZoneConfig('rwy-27-09', 0, 'Label')
    const wrong = deriveLabelId('Other')
    const config = {
      ...base,
      labels: [{ id: wrong, text: 'Label' }],
      answer: [{ zone_id: deriveZoneId('rwy-27-09', 0), label_id: wrong }],
    }
    expect(await validates(config)).toBe(false)
  })

  it('rejects a zone id derived for a different image_ref', async () => {
    const base = oneZoneConfig('rwy-27-09', 0, 'Label')
    const wrong = deriveZoneId('other-image', 0)
    const config = {
      ...base,
      zones: [{ id: wrong, x: 0.1, y: 0.1, w: 0.1, h: 0.1 }],
      answer: [{ zone_id: wrong, label_id: deriveLabelId('Label') }],
    }
    expect(await validates(config)).toBe(false)
  })
})

describe('deriveZoneId vs the SQL diagram validator', () => {
  it.each([
    ['uppercase image_ref', 'RWY-27-09-LH-Pattern', 0],
    ['leading/trailing whitespace image_ref', '  rwy-27-09  ', 0],
    ['internal double spaces image_ref', 'rwy  27  09', 0],
    ['NBSP in image_ref', 'rwy\u00a027', 0],
    ['index 0', 'rwy-27-09', 0],
    ['index 9', 'rwy-27-09', 9],
    ['index 10', 'rwy-27-09', 10],
    ['index 49', 'rwy-27-09', 49],
  ])('accepts the JS-derived zone id for %s', async (_label, imageRef, index) => {
    expect(await validates(oneZoneConfig(imageRef, index, 'Label'))).toBe(true)
  })

  it('rejects index 50 (beyond MAX_ZONES)', async () => {
    expect(await validates(oneZoneConfig('rwy-27-09', 50, 'Label'))).toBe(false)
  })
})
