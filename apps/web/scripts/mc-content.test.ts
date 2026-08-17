import { describe, expect, it } from 'vitest'
import content from './content/vfr-rt-part3-mc-numbers.json'
import {
  type AuthoredMcQuestion,
  assertMcItem,
  assertMcKeyBalance,
  MIN_CORPUS_FOR_KEY_BALANCE,
  tallyKey,
} from './mc-content'

const AT = 'test.json (VRT-P3-MC-99)'

function question(overrides: Partial<AuthoredMcQuestion> = {}): AuthoredMcQuestion {
  return {
    num: 'VRT-P3-MC-99',
    prompt: 'How is "RWY 30" transmitted?',
    options: [
      { id: 'a', text: 'runway thirty' },
      { id: 'b', text: 'runway three hundred' },
      { id: 'c', text: 'runway three thousand' },
      { id: 'd', text: 'runway three zero' },
    ],
    correct: 'd',
    ...overrides,
  }
}

/** A pool of `total` questions whose key lands on the given ids, cycling through them. */
function pool(total: number, keys: readonly string[]): AuthoredMcQuestion[] {
  return Array.from({ length: total }, (_, i) =>
    question({ num: `VRT-P3-MC-${i}`, correct: keys[i % keys.length] }),
  )
}

describe('a single authored question', () => {
  it('accepts a four-option question whose key names one of them', () => {
    expect(() => assertMcItem(question(), AT)).not.toThrow()
  })

  it('accepts a two-option question', () => {
    const twoWay = question({
      options: [
        { id: 'a', text: 'true' },
        { id: 'b', text: 'false' },
      ],
      correct: 'b',
    })
    expect(() => assertMcItem(twoWay, AT)).not.toThrow()
  })

  it('rejects a key that names no option', () => {
    expect(() => assertMcItem(question({ correct: 'c1' }), AT)).toThrow(/no option carries that id/)
  })

  it('rejects options whose ids skip a letter', () => {
    const gapped = question({
      options: [
        { id: 'a', text: 'runway thirty' },
        { id: 'b', text: 'runway three hundred' },
        { id: 'd', text: 'runway three zero' },
      ],
      correct: 'd',
    })
    expect(() => assertMcItem(gapped, AT)).toThrow(/must be a\/b\/c in order/)
  })

  it('rejects options listed out of order', () => {
    const swapped = question({
      options: [
        { id: 'b', text: 'runway three hundred' },
        { id: 'a', text: 'runway thirty' },
      ],
      correct: 'a',
    })
    expect(() => assertMcItem(swapped, AT)).toThrow(/in order/)
  })

  it('rejects two options that differ only in case', () => {
    const shouting = question({
      options: [
        { id: 'a', text: 'ten o’clock' },
        { id: 'b', text: 'TEN O’CLOCK' },
      ],
      correct: 'a',
    })
    expect(() => assertMcItem(shouting, AT)).toThrow(/have the same text/)
  })

  it('rejects an empty option list', () => {
    expect(() => assertMcItem(question({ options: [] }), AT)).toThrow(/non-empty array/)
  })

  it('rejects a question offering only one answer', () => {
    const soleOption = question({ options: [{ id: 'a', text: 'runway three zero' }], correct: 'a' })
    expect(() => assertMcItem(soleOption, AT)).toThrow(/at least 2 options/)
  })

  it('rejects a blank prompt', () => {
    expect(() => assertMcItem(question({ prompt: '   ' }), AT)).toThrow(/prompt/)
  })

  it('rejects a present but blank explanation', () => {
    expect(() => assertMcItem(question({ explanation: '  ' }), AT)).toThrow(/explanation/)
  })

  it('rejects a null question', () => {
    expect(() => assertMcItem(null, AT)).toThrow(/must be an object/)
  })
})

describe('the answer key across a pool', () => {
  it('rejects a pool where one option holds most of the key', () => {
    expect(() => assertMcKeyBalance(pool(20, ['b', 'b', 'b', 'c']), AT)).toThrow(
      /holds 15\/20 of the answer key \(75%, max 40%\)/,
    )
  })

  it('rejects a pool where an offered option is never the answer', () => {
    expect(() => assertMcKeyBalance(pool(20, ['a', 'b', 'c']), AT)).toThrow(
      /option 'd' is offered but is never the answer/,
    )
  })

  it('accepts an even key across all four options', () => {
    expect(() => assertMcKeyBalance(pool(20, ['a', 'b', 'c', 'd']), AT)).not.toThrow()
  })

  it('ignores an uneven key on a pool too small to judge', () => {
    const tiny = pool(MIN_CORPUS_FOR_KEY_BALANCE - 1, ['a'])
    expect(() => assertMcKeyBalance(tiny, AT)).not.toThrow()
  })

  it('does not demand an option the pool never offers', () => {
    const twoWay = pool(20, ['a', 'b']).map((q) => ({
      ...q,
      options: [
        { id: 'a', text: 'true' },
        { id: 'b', text: 'false' },
      ],
    }))
    expect(() => assertMcKeyBalance(twoWay, AT)).not.toThrow()
  })

  it('tightens with a stricter tolerance than the default', () => {
    const even = pool(20, ['a', 'b', 'c', 'd'])
    expect(() => assertMcKeyBalance(even, AT)).not.toThrow()
    // 25% each is even, so a tolerance below 1.0x the even share rejects even a perfect key —
    // proving the caller's argument reaches the maths rather than the default being hard-coded.
    expect(() => assertMcKeyBalance(even, AT, 0.9)).toThrow(/max 23%/)
  })

  it('counts every option id, including those never used', () => {
    expect(tallyKey(pool(4, ['a', 'b']))).toEqual({
      counts: { a: 2, b: 2, c: 0, d: 0 },
      total: 4,
    })
  })
})

describe('the authored VFR RT Part 3 numbers corpus', () => {
  const questions = (content as { questions: unknown[] }).questions

  it('is large enough for the per-question checks below to mean something', () => {
    // Exact, not a floor: a >= N check stops tracking the corpus as it grows, so a mass
    // deletion would pass. Update this number in the same commit that adds or drops a question.
    expect(questions.length).toBe(18)
  })

  it.each(questions.map((q, i) => [(q as { num?: string }).num ?? `#${i}`, q] as const))(
    'ships %s ready to import',
    (num, item) => {
      assertMcItem(item, `vfr-rt-part3-mc-numbers.json (${num})`)
    },
  )

  it('spreads the answer key so the pool cannot be guessed', () => {
    for (const item of questions) assertMcItem(item, 'vfr-rt-part3-mc-numbers.json')
    assertMcKeyBalance(questions as AuthoredMcQuestion[], 'vfr-rt-part3-mc-numbers.json')
  })

  it('explains every question, since the explanation is the teaching surface', () => {
    const unexplained = (questions as AuthoredMcQuestion[]).filter(
      (q) => (q.explanation ?? '').trim() === '',
    )
    expect(unexplained.map((q) => q.num)).toEqual([])
  })
})
