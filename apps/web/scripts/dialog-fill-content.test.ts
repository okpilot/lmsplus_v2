import { describe, expect, it } from 'vitest'
import content from './content/vfr-rt-part2-dialog-pilot.json'
import {
  type AuthoredBlank,
  assertDialogFillAuthoring,
  assertDialogFillItem,
  composeDialogTemplate,
  type DialogFillItem,
  toStoredBlanks,
} from './dialog-fill-content'

const AT = 'content/test.json[0] (VRT-P2-TEST-01)'

function blank(
  index: number,
  shape: AuthoredBlank['shape'],
  canonical: string,
  synonyms: string[] = [],
): AuthoredBlank {
  return { index, shape, canonical, synonyms, rule: 'test fixture' }
}

/** A minimal item that satisfies every storage check and every authoring rule. */
function makeItem(overrides: Partial<DialogFillItem> = {}): DialogFillItem {
  return {
    num: 'VRT-P2-TEST-01',
    prompt: 'Complete the pilot transmission.',
    template: '[pilot] S-AB, {{0}} {{1}} information\n[atc] S-AB, runway 33',
    blanks: [blank(0, 'recall', 'request'), blank(1, 'recall', 'departure')],
    ...overrides,
  }
}

/** The DB's own well-formedness CHECK, executed in JS. */
function leftoverBraces(composed: string): boolean {
  return /[{}]/.test(composed.replace(/\{\{\d+\|[^{}|]*\}\}/g, ''))
}

describe('composeDialogTemplate', () => {
  it('joins the canonical and its synonyms into one piped token', () => {
    const composed = composeDialogTemplate(
      '[pilot] {{0}}, S-AB',
      [{ index: 0, canonical: 'runway 33', synonyms: ['runway three three', 'rwy 33'] }],
      AT,
    )
    expect(composed).toBe('[pilot] {{0|runway 33;runway three three;rwy 33}}, S-AB')
  })

  it('emits no trailing separator when the answer has no synonyms', () => {
    const composed = composeDialogTemplate(
      '[pilot] {{0}} information',
      [{ index: 0, canonical: 'request', synonyms: [] }],
      AT,
    )
    expect(composed).toBe('[pilot] {{0|request}} information')
  })

  it('keeps speaker prefixes and line breaks untouched', () => {
    const composed = composeDialogTemplate(
      '[atc] S-AB, squawk 6503\n[pilot] {{0}}, S-AB',
      [{ index: 0, canonical: 'squawk 6503', synonyms: [] }],
      AT,
    )
    expect(composed).toBe('[atc] S-AB, squawk 6503\n[pilot] {{0|squawk 6503}}, S-AB')
  })

  it('gives a double-digit blank its own answer instead of the single-digit one', () => {
    const composed = composeDialogTemplate(
      '[pilot] {{1}} and {{10}}',
      [
        { index: 1, canonical: 'alpha', synonyms: [] },
        { index: 10, canonical: 'beta', synonyms: [] },
      ],
      AT,
    )
    expect(composed).toBe('[pilot] {{1|alpha}} and {{10|beta}}')
  })

  it('refuses a template marker that no answer covers', () => {
    expect(() =>
      composeDialogTemplate(
        '[pilot] {{0}} {{1}}',
        [{ index: 0, canonical: 'a', synonyms: [] }],
        AT,
      ),
    ).toThrow(/\{\{1\}\}/)
  })

  it('produces a template the database well-formedness check accepts', () => {
    const item = makeItem()
    expect(
      leftoverBraces(composeDialogTemplate(item.template, toStoredBlanks(item.blanks), AT)),
    ).toBe(false)
  })
})

describe('assertDialogFillItem', () => {
  it('accepts a well-formed item', () => {
    expect(() => assertDialogFillItem(makeItem(), AT)).not.toThrow()
  })

  it.each(['{', '}', '|', ';'])('refuses the delimiter %s inside an answer', (char) => {
    const item = makeItem({
      blanks: [blank(0, 'recall', `req${char}uest`), blank(1, 'recall', 'departure')],
    })
    expect(() => assertDialogFillItem(item, AT)).toThrow(/must not contain/)
  })

  it.each(['{', '}', '|', ';'])('refuses the delimiter %s inside an accepted synonym', (char) => {
    const item = makeItem({
      blanks: [blank(0, 'recall', 'request', [`ask${char}for`]), blank(1, 'recall', 'departure')],
    })
    expect(() => assertDialogFillItem(item, AT)).toThrow(/must not contain/)
  })

  it('refuses two answers claiming the same slot', () => {
    const item = makeItem({
      template: '[pilot] {{0}} {{0}} information',
      blanks: [blank(0, 'recall', 'request'), blank(0, 'recall', 'departure')],
    })
    expect(() => assertDialogFillItem(item, AT)).toThrow(/duplicate blank index 0/)
  })

  it('refuses a template slot with no answer behind it', () => {
    const item = makeItem({
      template: '[pilot] S-AB, {{0}} {{1}} {{2}} information',
    })
    expect(() => assertDialogFillItem(item, AT)).toThrow(/\{\{2\}\} has no matching entry/)
  })

  it('refuses two input boxes that would share one answer slot', () => {
    // Set-equality would pass this: the marker set {0,1} equals the blank set {0,1}. Only the
    // raw marker list shows index 0 twice. The student would get three boxes for two answers.
    const item = makeItem({
      template: '[pilot] S-AB, {{0}} {{1}} information, {{0}} again',
    })
    expect(() => assertDialogFillItem(item, AT)).toThrow(/repeats a \{\{n\}\} marker/)
  })

  it('refuses an answer the student can never reach', () => {
    const item = makeItem({
      blanks: [
        blank(0, 'recall', 'request'),
        blank(1, 'recall', 'departure'),
        blank(2, 'derivable', 'runway 33'),
      ],
    })
    expect(() => assertDialogFillItem(item, AT)).toThrow(/unanswerable/)
  })

  it('refuses a stray brace outside a blank marker', () => {
    const item = makeItem({ template: '[pilot] S-AB, {{0}} {{1}} information }' })
    expect(() => assertDialogFillItem(item, AT)).toThrow(/outside a \{\{n\}\} marker/)
  })

  it.each([
    ['a negative slot number', -1],
    ['a fractional slot number', 0.5],
    ['a slot number given as text', '0'],
  ])('refuses %s', (_label, index) => {
    const item = makeItem({
      template: '[pilot] S-AB, {{0}} information',
      blanks: [{ ...blank(0, 'recall', 'request'), index } as unknown as AuthoredBlank],
    })
    expect(() => assertDialogFillItem(item, AT)).toThrow(/non-negative integer/)
  })

  it('refuses a whitespace-only answer', () => {
    const item = makeItem({
      blanks: [blank(0, 'recall', '   '), blank(1, 'recall', 'departure')],
    })
    expect(() => assertDialogFillItem(item, AT)).toThrow(/must be a non-empty string/)
  })

  it('refuses a line with no speaker so the dialogue cannot lose its styling', () => {
    const item = makeItem({ template: 'S-AB, {{0}} {{1}} information' })
    expect(() => assertDialogFillItem(item, AT)).toThrow(/\[atc\] or \[pilot\]/)
  })

  it('refuses a dialogue with nothing to fill in', () => {
    const item = makeItem({ template: '[pilot] S-AB, request departure information', blanks: [] })
    expect(() => assertDialogFillItem(item, AT)).toThrow(/at least one \{\{n\}\}/)
  })

  it('refuses an item with an empty answer list', () => {
    const item = makeItem({ blanks: [] })
    expect(() => assertDialogFillItem(item, AT)).toThrow(/non-empty array/)
  })

  it('refuses a blanks field that is not an array', () => {
    const item = makeItem({ blanks: 'should be an array' as unknown as AuthoredBlank[] })
    expect(() => assertDialogFillItem(item, AT)).toThrow(/non-empty array/)
  })

  it('rejects an explanation that is present but blank', () => {
    const item = makeItem({ explanation: '   ' })
    expect(() => assertDialogFillItem(item, AT)).toThrow(/must be a non-empty string/)
  })

  it('refuses a blank whose synonyms field is not an array', () => {
    const item = makeItem({
      blanks: [
        { ...blank(0, 'recall', 'request'), synonyms: 'not an array' as unknown as string[] },
        blank(1, 'recall', 'departure'),
      ],
    })
    expect(() => assertDialogFillItem(item, AT)).toThrow(/must be an array/)
  })

  it('refuses a blank that carries an empty synonym', () => {
    const item = makeItem({
      blanks: [blank(0, 'recall', 'request', ['']), blank(1, 'recall', 'departure')],
    })
    expect(() => assertDialogFillItem(item, AT)).toThrow(/must be a non-empty string/)
  })

  it('names the offending question in the message', () => {
    const item = makeItem({ template: 'S-AB, {{0}} {{1}} information' })
    expect(() => assertDialogFillItem(item, AT)).toThrow(AT)
  })
})

describe('assertDialogFillAuthoring', () => {
  it('accepts a well-formed item', () => {
    expect(() => assertDialogFillAuthoring(makeItem(), AT)).not.toThrow()
  })

  it('refuses an answer with no declared origin', () => {
    const bad = { ...blank(0, 'recall', 'request') } as { shape?: unknown }
    bad.shape = undefined
    const item = makeItem({
      blanks: [bad as AuthoredBlank, blank(1, 'recall', 'departure')],
    })
    expect(() => assertDialogFillAuthoring(item, AT)).toThrow(/R1/)
  })

  it('refuses a whole recalled phrase crammed into one box', () => {
    const item = makeItem({
      template: '[pilot] S-AB, {{0}} information',
      blanks: [blank(0, 'recall', 'request departure')],
    })
    expect(() => assertDialogFillAuthoring(item, AT)).toThrow(/R2/)
  })

  it('accepts a multi-word alternative answer for a single-word recalled one', () => {
    const item = makeItem({
      template: '[atc] S-MN, report runway vacated\n[pilot] {{0}}, S-MN',
      blanks: [blank(0, 'recall', 'wilco', ['will report runway vacated'])],
    })
    expect(() => assertDialogFillAuthoring(item, AT)).not.toThrow()
  })

  it('refuses a recalled answer that is already printed on screen', () => {
    const item = makeItem({
      template: '[atc] S-AB, request departure information\n[pilot] S-AB, {{0}} information',
      blanks: [blank(0, 'recall', 'request')],
    })
    expect(() => assertDialogFillAuthoring(item, AT)).toThrow(/R3/)
  })

  it('does not mistake a longer word for the recalled one', () => {
    // 'in' is a substring of 'crossing' and 'right' but is not a visible word of its own.
    const item = makeItem({
      template:
        '[atc] S-AB, light aircraft crossing left to right\n[pilot] S-AB, {{0}} {{1}} sight',
      blanks: [blank(0, 'recall', 'traffic'), blank(1, 'recall', 'in')],
    })
    expect(() => assertDialogFillAuthoring(item, AT)).not.toThrow()
  })

  it('refuses consecutive recalled boxes with no word left visible after them', () => {
    const item = makeItem({ template: '[pilot] S-AB, {{0}} {{1}}' })
    expect(() => assertDialogFillAuthoring(item, AT)).toThrow(/R4/)
  })

  it('refuses punctuation alone as the word left visible after the boxes', () => {
    const item = makeItem({ template: '[pilot] S-AB, {{0}} {{1}}, ...' })
    expect(() => assertDialogFillAuthoring(item, AT)).toThrow(/R4/)
  })

  it('does not accept a speaker tag as the visible word for a run starting the line', () => {
    const item = makeItem({ template: '[pilot] {{0}} {{1}}' })
    expect(() => assertDialogFillAuthoring(item, AT)).toThrow(/R4/)
  })

  it('accepts a single recalled box that ends its line', () => {
    // The DLG-12 shape: one recall answer plus a derivable callsign, both boxes, no anchor.
    const item = makeItem({
      template: '[atc] S-EW report three minutes before PE1\n[pilot] {{0}}, {{1}}',
      blanks: [
        blank(0, 'recall', 'wilco', ['will report three minutes before PE1']),
        blank(1, 'derivable', 'S-EW', ['SEW']),
      ],
    })
    expect(() => assertDialogFillAuthoring(item, AT)).not.toThrow()
  })

  it('accepts a line made entirely of derivable boxes', () => {
    // The callsign-placement shape (DLG-13/16/19): the student decides which box holds it.
    const item = makeItem({
      template: '[atc] S-AA, squawk 6503\n[pilot] {{0}}, {{1}}',
      blanks: [blank(0, 'derivable', 'squawk 6503'), blank(1, 'derivable', 'S-AA', ['SAA'])],
    })
    expect(() => assertDialogFillAuthoring(item, AT)).not.toThrow()
  })

  it('accepts a longer run of recalled boxes that does end in a visible word', () => {
    const item = makeItem({
      template: '[pilot] S-AB, {{0}} {{1}} {{2}} information',
      blanks: [
        blank(0, 'recall', 'request'),
        blank(1, 'recall', 'departure'),
        blank(2, 'recall', 'aerodrome'),
      ],
    })
    expect(() => assertDialogFillAuthoring(item, AT)).not.toThrow()
  })

  it('refuses a longer run of recalled boxes that ends the line', () => {
    const item = makeItem({
      template: '[pilot] S-AB, {{0}} {{1}} {{2}}',
      blanks: [
        blank(0, 'recall', 'request'),
        blank(1, 'recall', 'departure'),
        blank(2, 'recall', 'aerodrome'),
      ],
    })
    expect(() => assertDialogFillAuthoring(item, AT)).toThrow(/R4/)
  })
})

describe('toStoredBlanks', () => {
  it('keeps only the three keys the database column holds', () => {
    const stored = toStoredBlanks([blank(0, 'recall', 'request', ['ask'])])
    expect(Object.keys(stored[0] as object)).toEqual(['index', 'canonical', 'synonyms'])
    expect(stored[0]).toEqual({ index: 0, canonical: 'request', synonyms: ['ask'] })
  })

  it('does not alias the authored synonym array', () => {
    const authored = blank(0, 'recall', 'request', ['ask'])
    const stored = toStoredBlanks([authored])
    expect(stored[0]?.synonyms).not.toBe(authored.synonyms)
  })
})

describe('the authored VFR RT Part 2 corpus', () => {
  const questions = (content as { questions: unknown[] }).questions

  it('is large enough for the per-question checks below to mean something', () => {
    expect(questions.length).toBeGreaterThanOrEqual(24)
  })

  it.each(questions.map((q, i) => [(q as { num?: string }).num ?? `#${i}`, q] as const))(
    'ships %s ready to import',
    (num, question) => {
      const at = `vfr-rt-part2-dialog-pilot.json (${num})`
      assertDialogFillItem(question, at)
      assertDialogFillAuthoring(question, at)
      const composed = composeDialogTemplate(question.template, toStoredBlanks(question.blanks), at)
      expect(leftoverBraces(composed)).toBe(false)
    },
  )
})
