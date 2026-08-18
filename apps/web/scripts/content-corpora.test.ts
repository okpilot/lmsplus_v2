/**
 * Corpus sweeps for the two authored pools that had NO suite coverage at all when they shipped:
 * `vfr-rt-part3-ordering.json` (12 questions) and `vfr-rt-part3-diagram.json` (2).
 *
 * This file exists because the same lesson had already been learned one pool over. The header of
 * `mc-content.test.ts` records it: its corpus block used to import a single JSON file, so when two
 * more MC pools were added they shipped with no per-question validation, no explanation check and
 * no count pin, while the validator's own docblock advertised a `vfr-rt-part3-mc-*.json` glob. The
 * fix there was `MC_CORPORA`, a table. The ordering and diagram pools then landed in that same
 * commit with the same gap — `ordering-content.test.ts` and `diagram-content.test.ts` exercise the
 * VALIDATORS against synthetic fixtures, and nothing at all reads the shipped CONTENT.
 *
 * What that leaves uncaught, concretely: a typo in `answer_by_zone` (`"Final aproach"`) matches
 * zero labels in the layout, so `resolveDiagramConfig` throws — but only when a human runs the
 * importer, and only after subject/topic/subtopic resolution has already succeeded. CI stays
 * green. Same for a blank ordering step, a one-step question, or two steps that normalize to one.
 *
 * The diagram half deliberately re-derives the layout lookup rather than importing the importer:
 * `import-vfr-rt-content.ts` has zero exports, calls `config(...)` and `createClient(...)` at
 * module load and ends in `main().catch(...)`, so importing it from Vitest would open a live DB
 * connection and call `process.exit`. The registry layout it validates against is the same one the
 * importer uses, so a label rename still fails here first.
 */

import { describe, expect, it } from 'vitest'
import {
  RWY_2709_IMAGE_REF,
  RWY_2709_LABELS,
  RWY_2709_ZONES,
} from '../app/app/quiz/session/_components/diagrams/rwy-2709-layout'
import diagram from './content/vfr-rt-part3-diagram.json'
import ordering from './content/vfr-rt-part3-ordering.json'
import { assertOrderingItems, buildOrderingItems } from './ordering-content'

const ORDERING_CORPORA: readonly (readonly [string, unknown, number])[] = [
  ['vfr-rt-part3-ordering.json', ordering, 12],
]

const DIAGRAM_CORPORA: readonly (readonly [string, unknown, number])[] = [
  ['vfr-rt-part3-diagram.json', diagram, 2],
]

type AuthoredOrdering = { num: string; prompt: string; items: string[]; explanation?: string }
type AuthoredDiagramQ = {
  num: string
  prompt: string
  diagram: { image_ref: string; answer_by_zone: Record<string, string> }
  explanation?: string
}

function questionsOf(file: unknown): unknown[] {
  return (file as { questions: unknown[] }).questions
}

describe.each(ORDERING_CORPORA)('the authored ordering corpus in %s', (name, file, expected) => {
  const questions = questionsOf(file)

  it('holds exactly the number of questions the suite was told to expect', () => {
    // Exact, not a floor — a `>=` check stops tracking a corpus as it grows, so a mass deletion
    // would pass. Update the number in ORDERING_CORPORA in the same commit that adds or drops one.
    expect(questions.length).toBe(expected)
  })

  it('ships every question ready to import', () => {
    for (const [i, item] of questions.entries()) {
      const q = item as AuthoredOrdering
      const at = `${name} (${q.num ?? `#${i}`})`
      expect(typeof q.num === 'string' && q.num.trim() !== '', `${at}: num`).toBe(true)
      expect(typeof q.prompt === 'string' && q.prompt.trim() !== '', `${at}: prompt`).toBe(true)
      // The two real gates: shape/bounds, then the derived-id build, which is where a pair of
      // steps that normalize to the same text collides and throws.
      assertOrderingItems(q.items, at)
      buildOrderingItems(q.items, at)
    }
  })

  it('explains every question, since the explanation is the teaching surface', () => {
    const unexplained = (questions as AuthoredOrdering[]).filter(
      (q) => (q.explanation ?? '').trim() === '',
    )
    expect(unexplained.map((q) => q.num)).toEqual([])
  })
})

describe.each(DIAGRAM_CORPORA)('the authored diagram corpus in %s', (name, file, expected) => {
  const questions = questionsOf(file)
  const layouts: Record<string, { zones: typeof RWY_2709_ZONES; labels: typeof RWY_2709_LABELS }> =
    { [RWY_2709_IMAGE_REF]: { zones: RWY_2709_ZONES, labels: RWY_2709_LABELS } }

  it('ships an identifier and prompt for every question', () => {
    // Parity with the ordering corpus above, which has always checked these. Without it a diagram
    // question with a blank prompt or no num passes every remaining case, because they all key on
    // the mapping — and the importer would happily build a row that renders an empty question.
    for (const [i, item] of questions.entries()) {
      const q = item as AuthoredDiagramQ
      const at = `${name} (${q.num ?? `#${i}`})`
      expect(typeof q.num === 'string' && q.num.trim() !== '', `${at}: num`).toBe(true)
      expect(typeof q.prompt === 'string' && q.prompt.trim() !== '', `${at}: prompt`).toBe(true)
    }
  })

  it('holds exactly the number of questions the suite was told to expect', () => {
    expect(questions.length).toBe(expected)
  })

  it('names a registered diagram for every question', () => {
    for (const item of questions as AuthoredDiagramQ[]) {
      expect(Object.keys(layouts), `${name} (${item.num})`).toContain(item.diagram.image_ref)
    }
  })

  it('places every chip on a zone the artwork actually defines', () => {
    for (const item of questions as AuthoredDiagramQ[]) {
      const layout = layouts[item.diagram.image_ref]
      if (!layout) throw new Error(`${name} (${item.num}): unregistered ref`)
      const placements = Object.keys(item.diagram.answer_by_zone)
      // Without this, `answer_by_zone: {}` satisfies all three diagram cases: each iterates zero
      // entries and asserts nothing. A question with no placements at all would sweep green.
      expect(placements.length, `${name} (${item.num}): no placements`).toBeGreaterThan(0)
      for (const key of placements) {
        const index = Number(key)
        expect(Number.isInteger(index), `${name} (${item.num}): zone key '${key}'`).toBe(true)
        expect(layout.zones[index], `${name} (${item.num}): zone index ${index}`).toBeDefined()
      }
    }
  })

  it('names a chip the artwork offers, exactly once, for every placement', () => {
    // The typo case: "Final aproach" matches zero labels and would otherwise surface only when a
    // human runs the importer. Exactly-one, not at-least-one — two labels sharing a text would
    // make the pairing ambiguous, which is the rule resolveDiagramConfig enforces.
    for (const item of questions as AuthoredDiagramQ[]) {
      const layout = layouts[item.diagram.image_ref]
      if (!layout) throw new Error(`${name} (${item.num}): unregistered ref`)
      const entries = Object.entries(item.diagram.answer_by_zone)
      // Per-case guard, not just the suite-level one: iterating {} asserts nothing, so without
      // this the case would stay green for a question with no placements at all.
      expect(entries.length, `${name} (${item.num}): no placements`).toBeGreaterThan(0)
      for (const [key, text] of entries) {
        const matches = layout.labels.filter((l) => l.text === text)
        expect(matches.length, `${name} (${item.num}) zone ${key} names '${text}'`).toBe(1)
      }
    }
  })

  it('maps each question to its expected zones and chips', () => {
    // The checks above are per-placement: they prove each entry names a real zone and a real chip,
    // but not that the mapping is the RIGHT one or a COMPLETE one. `{ "0": "Go-around" }` — one
    // valid zone, one real (distractor) chip — satisfies every one of them while seeding a broken
    // question. Pinning the whole map is what makes this corpus sweep able to fail.
    //
    // The two questions use disjoint zone sets by design: DIAG-01 is the five LEGS (even indices),
    // DIAG-02 the four TURNS between them (odd). That split is the reason both can share one
    // artwork, so it is worth pinning rather than deriving.
    const expected: Record<string, Record<string, string>> = {
      'VRT-P3-DIAG-01': {
        '0': 'Upwind leg',
        '2': 'Crosswind leg',
        '4': 'Downwind leg',
        '6': 'Base leg',
        '8': 'Final approach',
      },
      'VRT-P3-DIAG-02': {
        '1': 'Crosswind turn',
        '3': 'Downwind turn',
        '5': 'Base turn',
        '7': 'Final turn',
      },
    }
    for (const item of questions as AuthoredDiagramQ[]) {
      expect(expected[item.num], `${name}: no pinned map for ${item.num}`).toBeDefined()
      expect(item.diagram.answer_by_zone, `${name} (${item.num})`).toEqual(expected[item.num])
    }
  })

  it('never sends two zones the same chip', () => {
    for (const item of questions as AuthoredDiagramQ[]) {
      const texts = Object.values(item.diagram.answer_by_zone)
      expect(texts.length, `${name} (${item.num}): no placements`).toBeGreaterThan(0)
      expect(new Set(texts).size, `${name} (${item.num}): duplicate chip`).toBe(texts.length)
    }
  })

  it('explains every question, since the explanation is the teaching surface', () => {
    const unexplained = (questions as AuthoredDiagramQ[]).filter(
      (q) => (q.explanation ?? '').trim() === '',
    )
    expect(unexplained.map((q) => q.num)).toEqual([])
  })
})
