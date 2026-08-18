import { describe, expect, it } from 'vitest'
import emergency from './content/vfr-rt-part3-mc-emergency.json'
import numbers from './content/vfr-rt-part3-mc-numbers.json'
import posrep from './content/vfr-rt-part3-mc-posrep.json'
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

/**
 * Test-local copy of the ghost-option-quote check the corpus sweep below runs against the real
 * content. It is NOT exported from mc-content.ts — this check lives only in this test file — so
 * this is the one place both the corpus sweep and the synthetic mechanism suite below share the
 * exact same regex and substring logic; they cannot silently diverge from each other.
 *
 * Kept here rather than inlined twice because a corpus sweep alone cannot pin this mechanism:
 * the shipped corpus contains no ghost option (it was fixed), so narrowing the marker regex back
 * to bold-only leaves the sweep green either way — see 'the ghost-option-quote check itself'
 * below, which is what actually goes red on that regression.
 */
function findGhostOptionQuotes(
  explanation: string | undefined,
  offeredOptionTexts: readonly string[],
  guideKeywords: ReadonlySet<string>,
): string[] {
  const collapse = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ')
  const offered = offeredOptionTexts.map(collapse)
  const named = [...(explanation ?? '').matchAll(/\*{1,2}([^*\n]+)\*{1,2}/g)]
    .map((m) => m[1] as string)
    .filter((span) => !/[a-z]/.test(span))
  return named.filter(
    (span) =>
      !guideKeywords.has(span.trim()) && !offered.some((option) => option.includes(collapse(span))),
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

  it('rejects two options that differ only by an interior double space', () => {
    // The gate keys on normalizeForId, which collapses interior runs. A bare trim().toLowerCase()
    // folds only case and the ends, so this pair used to pass as two distinct options while a
    // student reads one answer twice. Permanent regression test: the behaviour change that fixed
    // it was originally verified with a throwaway probe, which left it unpinned.
    const doubled = question({
      options: [
        { id: 'a', text: 'runway three zero' },
        { id: 'b', text: 'runway three  zero' },
      ],
      correct: 'a',
    })
    expect(() => assertMcItem(doubled, AT)).toThrow(/have the same text/)
  })

  it('keeps two genuinely different options apart', () => {
    // Guards the opposite error: normalizeForId must not be confused with normalizeAnswer, which
    // strips punctuation and would collapse distinct options into one false duplicate.
    const distinct = question({
      options: [
        { id: 'a', text: 'RWY 27' },
        { id: 'b', text: 'RWY-27 approach' },
      ],
      correct: 'a',
    })
    expect(() => assertMcItem(distinct, AT)).not.toThrow()
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

  it('rejects a question with more options than there are valid ids', () => {
    const tooMany = question({
      options: [
        { id: 'a', text: 'runway thirty' },
        { id: 'b', text: 'runway three hundred' },
        { id: 'c', text: 'runway three thousand' },
        { id: 'd', text: 'runway three zero' },
        { id: 'e', text: 'runway thirty thousand' },
      ],
      correct: 'a',
    })
    expect(() => assertMcItem(tooMany, AT)).toThrow(/5 options, but only 4 ids exist/)
  })

  it('rejects a non-array options field', () => {
    const raw: unknown = { ...question(), options: 'not-an-array' }
    expect(() => assertMcItem(raw, AT)).toThrow(/non-empty array/)
  })

  it('rejects an option element that is not an object', () => {
    const raw: unknown = { ...question(), options: [null] }
    expect(() => assertMcItem(raw, AT)).toThrow(/must be an object/)
  })

  it('rejects a blank prompt', () => {
    expect(() => assertMcItem(question({ prompt: '   ' }), AT)).toThrow(/prompt/)
  })

  it('rejects a blank num field', () => {
    expect(() => assertMcItem(question({ num: '   ' }), AT)).toThrow(/num/)
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

  it('accepts a pool where one option holds exactly the maximum permitted share', () => {
    // four options: even share = 25%, tolerance 1.6× → cap = 40%.
    // Cycle 'a/b/b/c/d' over 20 questions gives b exactly 8/20 = 40% — accepted because
    // the comparison is strictly greater-than, not greater-than-or-equal.
    const atCap = pool(20, ['a', 'b', 'b', 'c', 'd'])
    expect(() => assertMcKeyBalance(atCap, AT)).not.toThrow()
  })

  it('ignores an uneven key on a pool too small to judge', () => {
    const tiny = pool(MIN_CORPUS_FOR_KEY_BALANCE - 1, ['a'])
    expect(() => assertMcKeyBalance(tiny, AT)).not.toThrow()
  })

  it('rejects a skewed pool at exactly the minimum corpus size', () => {
    // At exactly MIN_CORPUS_FOR_KEY_BALANCE the grace period is over — the guard fires.
    const atMinimum = pool(MIN_CORPUS_FOR_KEY_BALANCE, ['a'])
    expect(() => assertMcKeyBalance(atMinimum, AT)).toThrow(/option 'a'/)
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

/**
 * Every shipped multiple_choice pool, not just the first one. The block below used to import a
 * single file; when two more MC pools were added they shipped with NO suite coverage at all —
 * no per-question validation, no explanation check, no count pin — while `mc-content.ts`'s
 * header still advertised the `vfr-rt-part3-mc-*.json` glob. A table keeps the two honest and
 * covers the next pool automatically.
 */
const MC_CORPORA: readonly (readonly [string, unknown, number])[] = [
  ['vfr-rt-part3-mc-numbers.json', numbers, 20],
  ['vfr-rt-part3-mc-emergency.json', emergency, 11],
  ['vfr-rt-part3-mc-posrep.json', posrep, 5],
]

describe.each(MC_CORPORA)('the authored MC corpus in %s', (name, file, expectedCount) => {
  const questions = (file as { questions: unknown[] }).questions

  it('holds exactly the number of questions the suite was told to expect', () => {
    // Exact, not a floor: a >= N check stops tracking a corpus as it grows, so a mass deletion
    // would pass. Update the number in MC_CORPORA in the same commit that adds or drops one.
    expect(questions.length).toBe(expectedCount)
  })

  it('ships every question ready to import', () => {
    for (const [i, item] of questions.entries()) {
      const num = (item as { num?: string }).num ?? `#${i}`
      assertMcItem(item, `${name} (${num})`)
    }
  })

  it('spreads the answer key so the pool cannot be guessed', () => {
    for (const item of questions) assertMcItem(item, name)
    // PARTIALLY VACUOUS for two of the three rows, by design of the gate rather than by
    // oversight: `emergency` (11) and `posrep` (5) sit under MIN_CORPUS_FOR_KEY_BALANCE, so
    // this call returns immediately for them. The union block below is what actually covers
    // their keys — do not delete it thinking this case already does.
    assertMcKeyBalance(questions as AuthoredMcQuestion[], name)
  })
})

/**
 * The union of every Part 3 MC pool, checked as one corpus.
 *
 * The per-file block above cannot see a skew in `emergency` (11) or `posrep` (5): both sit under
 * `MIN_CORPUS_FOR_KEY_BALANCE`, so `assertMcKeyBalance` returns immediately and their
 * "spreads the answer key" case asserts nothing at all. That hole was opened by splitting Part 3
 * into subareas — one 20-question pool became 20 / 11 / 5 — and it left 16 of 36 questions
 * unchecked while every test stayed green. The importer carries the same gate; this block pins the CORPUS that gate protects, not the
 * gate itself — the suite never loads the importer, so deleting its union block leaves every
 * test here green.
 */
describe('the Part 3 multiple_choice pools taken together', () => {
  // Scoped to ONE topic, mirroring the importer, which unions by (subject_code, topic_code).
  // Flattening all of MC_CORPORA would diverge the moment a pool from another topic is added:
  // the suite would assert key balance across a cross-topic union the importer deliberately
  // refuses to form, so valid content would turn this red and the two gates would disagree
  // about what a "pool" even is.
  const P3_TOPIC = 'P3_MC'
  const union = MC_CORPORA.filter(
    ([, file]) => (file as { topic_code: string }).topic_code === P3_TOPIC,
  ).flatMap(([, file]) => (file as { questions: unknown[] }).questions)

  it('holds every Part 3 multiple-choice question', () => {
    // Derived from MC_CORPORA rather than a second hard-coded 36, so adding a pool fails the
    // per-file count pin (which names the real number) instead of failing here confusingly.
    const expected = MC_CORPORA.filter(
      ([, file]) => (file as { topic_code: string }).topic_code === P3_TOPIC,
    ).reduce((n, [, , count]) => n + count, 0)
    // Anchor FIRST. `expected` is derived with the same filter as `union`, so if the filter ever
    // matched nothing both would be 0: expect(0).toBe(0) passes, and the key-balance case below
    // would early-return under MIN_CORPUS_FOR_KEY_BALANCE — two tests going vacuous at once with
    // no signal. The hard-coded 36 this replaced was an accidental guard against exactly that;
    // this line is the deliberate one.
    expect(expected).toBeGreaterThan(0)
    expect(union.length).toBe(expected)
  })

  it('spreads the answer key across the whole topic, not just within each subarea', () => {
    for (const item of union) assertMcItem(item, 'Part 3 MC union')
    // Non-vacuous where the per-file cases are not: 36 clears the corpus floor, so this really
    // does exercise the skew maths. Forcing every key onto one id here fails; doing the same to
    // emergency or posrep alone does not.
    assertMcKeyBalance(union as AuthoredMcQuestion[], 'Part 3 MC union')
  })
})

describe.each(MC_CORPORA)('the authored MC corpus in %s (explanations)', (name, file) => {
  const questions = (file as { questions: unknown[] }).questions

  it('does not emphasise a capitalised phrase that no option contains', () => {
    // EMC-06 shipped an explanation that told the student *MAYDAY ACKNOWLEDGED* "appears nowhere in
    // the guide" — a distractor that had been REPLACED in the options and left behind in the prose,
    // which then contradicted the next paragraph's "every option here is a real phrase". A student
    // reads the explanation as the teaching surface, so a ghost option is worse than a vague one.
    //
    // Matches a span emphasised with EITHER marker. Bold-only was the original mistake and it
    // missed the very defect above: EMC-06's ghost shipped in *italics*, so restoring that exact
    // sentence left the suite green. Italic is the commoner form here, not the rarer one.
    //
    // Two guide keywords are emphasised like an option quote without being options; they are
    // allowlisted by exact string, so a third one fails loudly rather than drifting in silently.
    const GUIDE_KEYWORDS = new Set(['DECIMAL', 'OMIT'])
    // Validate BEFORE the cast, matching the sibling case below. This case runs first, so an
    // unguarded cast here would pre-empt the named failure that one arranges: a malformed question
    // would surface as an opaque TypeError instead (code-style.md §5 — not relaxed in test files).
    for (const item of questions) assertMcItem(item, name)
    for (const item of questions) {
      const q = item as AuthoredMcQuestion
      // SCOPE, measured — this covers ALL-CAPS quotes only. The corpora carry far more emphasised
      // quotes than that: bolding and italicising PROSE is how these explanations emphasise a
      // rule, and the check discards every one that is not all-caps for that reason — widening it
      // would read ordinary emphasised prose as a ghost. The numbers corpus is where that bites —
      // it spells its options out (`one two eight decimal one seven five`), so its option texts
      // are never all-caps and this check sees at most a handful of spans there. The discriminator
      // that would beat this scope has to tell an option quote from an emphasised phrase, which
      // case alone cannot do.
      //
      // Substring, not equality: an explanation may quote a FRAGMENT of an option, as PMC-03 does
      // with *OPERATIONS NORMAL* against the longer option that contains it. A true ghost names a
      // phrase no option contains at all, and still fails. See findGhostOptionQuotes() above and
      // 'the ghost-option-quote check itself' below for what this line actually pins.
      const ghosts = findGhostOptionQuotes(
        q.explanation,
        q.options.map((o) => o.text),
        GUIDE_KEYWORDS,
      )
      expect(ghosts, `${name} (${q.num}): explanation names non-existent option(s)`).toEqual([])
    }
  })

  it('explains every question, since the explanation is the teaching surface', () => {
    // Validate before reading fields: without this the cast below is load-bearing, and a
    // malformed question would surface as a TypeError here rather than a named failure.
    for (const item of questions) assertMcItem(item, name)
    const unexplained = (questions as AuthoredMcQuestion[]).filter(
      (q) => (q.explanation ?? '').trim() === '',
    )
    expect(unexplained.map((q) => q.num)).toEqual([])
  })
})

/**
 * Synthetic-fixture coverage for findGhostOptionQuotes() itself, independent of the real corpus.
 *
 * WHY this describe block exists at all: the sweep above proves the SHIPPED content carries no
 * ghost, but it cannot prove the CHECK still recognises one, because a corpus with no defect in
 * it passes identically whether the marker regex matches `*italics*`, `**bold**`, or only one of
 * the two. Measured directly — narrowing findGhostOptionQuotes() back to a bold-only regex still
 * leaves every case in the sweep above green, because the real EMC-06 defect was already fixed
 * out of the corpus before this test file existed. That is exactly the shape this branch has hit
 * twice already: a second condition (here, "the corpus happens to be clean") reaches the same
 * verdict as the guard, so the guard itself is never actually exercised.
 *
 * These fixtures are built so each one is discriminating: the italics case below asserts a ghost
 * IS found, using a phrase wrapped in single-asterisk emphasis only. If the marker regex ever
 * regresses to bold-only again — the original mistake this file's header names — this case goes
 * red immediately, with no dependency on what the shipped JSON currently contains.
 */
describe('the ghost-option-quote check itself', () => {
  const GUIDE_KEYWORDS = new Set(['DECIMAL', 'OMIT'])
  const OPTIONS = ['ROGER MAYDAY', 'CANCEL DISTRESS', 'DISTRESS TRAFFIC ENDED']

  it('flags a capitalised phrase in single-asterisk italics that no option names', () => {
    const ghosts = findGhostOptionQuotes(
      'Every option here is real, but *MAYDAY ACKNOWLEDGED* appears nowhere in the guide.',
      OPTIONS,
      GUIDE_KEYWORDS,
    )
    expect(ghosts).toEqual(['MAYDAY ACKNOWLEDGED'])
  })

  it('flags a capitalised phrase in double-asterisk bold that no option names', () => {
    const ghosts = findGhostOptionQuotes(
      'Every option here is real, but **MAYDAY ACKNOWLEDGED** appears nowhere in the guide.',
      OPTIONS,
      GUIDE_KEYWORDS,
    )
    expect(ghosts).toEqual(['MAYDAY ACKNOWLEDGED'])
  })

  it('does not flag an italicised phrase that quotes part of an option', () => {
    const ghosts = findGhostOptionQuotes(
      '*ROGER MAYDAY* is the phrase the ATS unit uses.',
      OPTIONS,
      GUIDE_KEYWORDS,
    )
    expect(ghosts).toEqual([])
  })

  it('does not flag a bolded phrase that quotes part of an option', () => {
    const ghosts = findGhostOptionQuotes(
      '**CANCEL DISTRESS** is the pilot’s, not the controller’s.',
      OPTIONS,
      GUIDE_KEYWORDS,
    )
    expect(ghosts).toEqual([])
  })

  it('ignores an emphasised phrase that is entirely lowercase', () => {
    const ghosts = findGhostOptionQuotes(
      'The second sentence is the point of the first: *who* says it and *when*.',
      OPTIONS,
      GUIDE_KEYWORDS,
    )
    expect(ghosts).toEqual([])
  })

  // The offered option must NOT contain the keyword as a substring. An earlier version of this
  // fixture offered 'one two eight decimal one seven five', which already contains 'decimal' —
  // so the substring guard suppressed the flag on its own and deleting the allowlist clause
  // entirely left this test green. The allowlist has to be the only thing standing between
  // **DECIMAL** and a flag, or this pins nothing (code-style.md §7).
  it('does not flag an allowlisted guide keyword', () => {
    const ghosts = findGhostOptionQuotes(
      'Give the frequency in **DECIMAL** form, never spelling out the word.',
      ['climb to flight level one two zero'],
      GUIDE_KEYWORDS,
    )
    expect(ghosts).toEqual([])
  })

  it('flags a ghost even when a genuine allcaps quote appears earlier in the same explanation', () => {
    // Two spans in one explanation: the first is genuine (ROGER MAYDAY), the second is not. A
    // check that stops at the first match, or that only inspects the last span, would miss this.
    const ghosts = findGhostOptionQuotes(
      '**ROGER MAYDAY** is correct. **MAYDAY ACKNOWLEDGED** is not a phrase in the guide.',
      OPTIONS,
      GUIDE_KEYWORDS,
    )
    expect(ghosts).toEqual(['MAYDAY ACKNOWLEDGED'])
  })
})
