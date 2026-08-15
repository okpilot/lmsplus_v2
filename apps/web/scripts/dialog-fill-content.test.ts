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
    // The [atc] line leads so the default satisfies R7 (a recall blank reads back the line above
    // it). Tests that exercise R7 itself override this.
    template: '[atc] S-AB, pass your message\n[pilot] S-AB, {{0}} {{1}} information',
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

  it.each([
    ['the position of the callsign', 'Straight-in approach. Complete the callsign at the end.'],
    ['the order items return in', 'Joining the circuit. Read the items back in the order given.'],
    ['the acknowledgement to use', 'Position report. Acknowledge with wilco.'],
    ['the abbreviation rule', 'Approaching. Note which form of the callsign is abbreviated.'],
  ])('refuses a prompt that tells the student %s', (_label, prompt) => {
    expect(() => assertDialogFillAuthoring(makeItem({ prompt }), AT)).toThrow(/authoring R6/)
  })

  it('accepts a prompt that only sets the scene', () => {
    const item = makeItem({ prompt: 'Straight-in approach to Ljubljana.' })
    expect(() => assertDialogFillAuthoring(item, AT)).not.toThrow()
  })

  it('refuses a readback whose items are all blank, leaving only commas to divide them', () => {
    const item = makeItem({
      template:
        '[atc] S-GI, after departing Cessna has passed, runway 14, cleared to land\n[pilot] {{0}}, {{1}}, {{2}}, S-GI',
      blanks: [
        blank(0, 'derivable', 'after departing Cessna has passed'),
        blank(1, 'derivable', 'runway 14'),
        blank(2, 'derivable', 'cleared to land'),
      ],
    })
    expect(() => assertDialogFillAuthoring(item, AT)).toThrow(/authoring R5/)
  })

  it('accepts a readback that keeps one item visible beside the blank', () => {
    const item = makeItem({
      template:
        '[atc] S-GI, after departing Cessna has passed, runway 14, cleared to land\n[pilot] {{0}}, runway 14, cleared to land, S-GI',
      blanks: [blank(0, 'derivable', 'after departing Cessna has passed')],
    })
    expect(() => assertDialogFillAuthoring(item, AT)).not.toThrow()
  })

  it('does not count a trailing callsign as the visible item', () => {
    const item = makeItem({
      template: '[atc] S-MN, runway 33, cleared to land\n[pilot] {{0}}, {{1}}, S-MN',
      blanks: [blank(0, 'derivable', 'runway 33'), blank(1, 'derivable', 'cleared to land')],
    })
    expect(() => assertDialogFillAuthoring(item, AT)).toThrow(/authoring R5/)
  })

  it('accepts a line where only one blank is a content item and the other is the callsign', () => {
    const item = makeItem({
      template: '[atc] S-EW report three minutes before PE1\n[pilot] {{0}}, {{1}}',
      blanks: [blank(0, 'recall', 'wilco'), blank(1, 'derivable', 'S-EW')],
    })
    expect(() => assertDialogFillAuthoring(item, AT)).not.toThrow()
  })

  it('accepts a blank that sits beside text in the same comma-separated item', () => {
    const item = makeItem({
      template: '[atc] S-MN, runway 33, cleared to land\n[pilot] runway {{0}}, {{1}}, S-MN',
      blanks: [blank(0, 'derivable', '33'), blank(1, 'derivable', 'cleared to land')],
    })
    expect(() => assertDialogFillAuthoring(item, AT)).not.toThrow()
  })

  it('refuses an answer with no declared origin', () => {
    const bad = { ...blank(0, 'recall', 'request') } as { shape?: unknown }
    bad.shape = undefined
    const item = makeItem({
      blanks: [bad as AuthoredBlank, blank(1, 'recall', 'departure')],
    })
    expect(() => assertDialogFillAuthoring(item, AT)).toThrow(/R1/)
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
    // Carries an [atc] line only to satisfy R7 — the assertion under test is R5's, that a visible
    // trailing word anchors the split.
    const item = makeItem({
      template: '[atc] S-AB, pass your message\n[pilot] S-AB, {{0}} {{1}} {{2}} information',
      blanks: [
        blank(0, 'recall', 'request'),
        blank(1, 'recall', 'departure'),
        blank(2, 'recall', 'aerodrome'),
      ],
    })
    expect(() => assertDialogFillAuthoring(item, AT)).not.toThrow()
  })

  it('rejects a recalled phrase with no controller transmission beside it', () => {
    const item = makeItem({
      template: '[pilot] S-AT, downwind, {{0}}\n[atc] S-AT, report final runway 14',
      blanks: [blank(0, 'recall', 'request full stop')],
    })
    expect(() => assertDialogFillAuthoring(item, AT)).toThrow(/authoring R7/)
  })

  it('rejects a recalled phrase whose only controller line comes after it', () => {
    // The DLG-05/DLG-24 shape. Whether the reply reveals the request is a judgement no check can
    // make, so answered-after items must declare it rather than pass silently.
    const item = makeItem({
      template: '[pilot] S-BS, {{0}}\n[atc] S-BS, line up and wait',
      blanks: [blank(0, 'recall', 'ready for departure')],
    })
    expect(() => assertDialogFillAuthoring(item, AT)).toThrow(/authoring R7/)
  })

  it('accepts an unpinned recalled phrase when the item declares what pins it', () => {
    const item = makeItem({
      template: '[pilot] S5-DAA, {{0}} to maintain VMC due clouds, request turn left',
      blanks: [blank(0, 'recall', 'unable')],
      unanchored: 'Sits inline inside a visible sentence, which pins it.',
    })
    expect(() => assertDialogFillAuthoring(item, AT)).not.toThrow()
  })

  it('rejects an empty declaration as though it were absent', () => {
    const item = makeItem({
      template: '[pilot] S5-DAA, {{0}} to maintain VMC due clouds, request turn left',
      blanks: [blank(0, 'recall', 'unable')],
      unanchored: '   ',
    })
    expect(() => assertDialogFillAuthoring(item, AT)).toThrow(/authoring R7/)
  })

  it('still sees the controller line when the template lines carry stray indentation', () => {
    // The shape checks trim before testing the [atc] prefix, so an indented template is valid
    // content; R7 must read it the same way or it rejects an anchor that is plainly on screen.
    const item = makeItem({
      template: '  [atc] S-AB, pass your message\n  [pilot] S-AB, {{0}} {{1}} information',
    })
    expect(() => assertDialogFillAuthoring(item, AT)).not.toThrow()
  })

  it('leaves a derivable phrase alone when no controller line is beside it', () => {
    // DLG-23: the callsign line follows another pilot line; the answer is in the visible text.
    const item = makeItem({
      template:
        '[atc] S-AS, report over ME1\n[pilot] maintaining 2500 feet, S-AS\n[pilot] {{0}}, over ME1',
      blanks: [blank(0, 'derivable', 'S-AS', ['SAS'])],
    })
    expect(() => assertDialogFillAuthoring(item, AT)).not.toThrow()
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
