import { describe, expect, it } from 'vitest'
import type { SessionQuestion } from '@/app/app/_types/session'
import type { DraftAnswer } from '@/app/app/quiz/types'
import { buildVfrRtExamPayload } from './build-vfr-rt-exam-payload'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function q(n: number, extra: Partial<SessionQuestion>): SessionQuestion {
  return {
    id: id(n),
    question_text: '',
    question_image_url: null,
    question_number: null,
    options: [],
    explanation_text: null,
    explanation_image_url: null,
    question_type: 'multiple_choice',
    dialog_template: null,
    blanks_safe: null,
    ordering_items: null,
    diagram_config: null,
    ...extra,
  }
}

const mc = q(1, {
  options: [
    { id: 'a', text: '' },
    { id: 'b', text: '' },
  ],
})
const short = q(2, { question_type: 'short_answer' })
const dialog = q(3, { question_type: 'dialog_fill', blanks_safe: [{ index: 0 }, { index: 1 }] })
const ordering = q(4, {
  question_type: 'ordering',
  ordering_items: [
    { id: 'x', text: '' },
    { id: 'y', text: '' },
    { id: 'z', text: '' },
  ],
})
const diagram = q(5, {
  question_type: 'diagram_label',
  diagram_config: {
    image_ref: 'r',
    zones: [
      { id: 'z1', x: 0, y: 0, w: 1, h: 1 },
      { id: 'z2', x: 0, y: 0, w: 1, h: 1 },
    ],
    labels: [
      { id: 'l1', text: '' },
      { id: 'l2', text: '' },
    ],
  },
})
const all = [mc, short, dialog, ordering, diagram]

function build(qs: SessionQuestion[], a: Record<string, Partial<DraftAnswer>>) {
  const map = new Map<string, DraftAnswer>(
    Object.entries(a).map(([k, v]) => [k, { responseTimeMs: 7, ...v }]),
  )
  return buildVfrRtExamPayload(map, qs)
}

describe('buildVfrRtExamPayload', () => {
  it('keeps a valid answer of every question type with its response time', () => {
    const payload = build(all, {
      [mc.id]: { selectedOptionId: 'b' },
      [short.id]: { responseText: 'cleared' },
      [dialog.id]: { blankAnswers: [{ index: 1, text: 'x' }] },
      [ordering.id]: { order: ['z', 'x', 'y'] },
      [diagram.id]: { mapping: [{ zoneId: 'z1', labelId: 'l2' }] },
    })
    expect(payload).toHaveLength(1 + 1 + 1 + 3 + 1)
    expect(payload.every((e) => e.responseTimeMs === 7)).toBe(true)
  })

  it('drops an answer for a question that was not delivered', () => {
    expect(build([mc], { [id(99)]: { selectedOptionId: 'a' } })).toEqual([])
  })

  it('drops a multiple-choice answer whose option is not among the delivered options', () => {
    expect(build([mc], { [mc.id]: { selectedOptionId: 'd' } })).toEqual([])
  })

  it('drops a short answer that is empty or whitespace', () => {
    expect(build([short], { [short.id]: { responseText: '  ' } })).toEqual([])
  })

  it('drops a short-answer question answered with a multiple-choice shape', () => {
    expect(build([short], { [short.id]: { selectedOptionId: 'a' } })).toEqual([])
  })

  it('drops a dialog answer whose blank index is not delivered', () => {
    expect(build([dialog], { [dialog.id]: { blankAnswers: [{ index: 5, text: 'x' }] } })).toEqual(
      [],
    )
  })

  it('drops a dialog answer with a duplicate blank index', () => {
    const blankAnswers = [
      { index: 0, text: 'a' },
      { index: 0, text: 'b' },
    ]
    expect(build([dialog], { [dialog.id]: { blankAnswers } })).toEqual([])
  })

  it('drops an incomplete ordering answer while other questions survive', () => {
    const payload = build(all, {
      [mc.id]: { selectedOptionId: 'a' },
      [ordering.id]: { order: ['x', 'y'] },
    })
    expect(payload.map((e) => e.questionId)).toEqual([mc.id])
  })

  it('drops an ordering answer with an unknown or repeated item id', () => {
    expect(build([ordering], { [ordering.id]: { order: ['x', 'y', 'q'] } })).toEqual([])
    expect(build([ordering], { [ordering.id]: { order: ['x', 'x', 'y'] } })).toEqual([])
  })

  it('numbers ordering slots 0 to N-1 in placed order', () => {
    const payload = build([ordering], { [ordering.id]: { order: ['y', 'z', 'x'] } })
    expect(payload).toMatchObject([
      { selectedOptionId: 'y', blankIndex: 0 },
      { selectedOptionId: 'z', blankIndex: 1 },
      { selectedOptionId: 'x', blankIndex: 2 },
    ])
  })

  it('drops a diagram answer with an unknown zone or label', () => {
    expect(
      build([diagram], { [diagram.id]: { mapping: [{ zoneId: 'zz', labelId: 'l1' }] } }),
    ).toEqual([])
    expect(
      build([diagram], { [diagram.id]: { mapping: [{ zoneId: 'z1', labelId: 'll' }] } }),
    ).toEqual([])
  })

  it('drops a diagram answer that reuses a zone or a label', () => {
    const sameZone = [
      { zoneId: 'z1', labelId: 'l1' },
      { zoneId: 'z1', labelId: 'l2' },
    ]
    const sameLabel = [
      { zoneId: 'z1', labelId: 'l1' },
      { zoneId: 'z2', labelId: 'l1' },
    ]
    expect(build([diagram], { [diagram.id]: { mapping: sameZone } })).toEqual([])
    expect(build([diagram], { [diagram.id]: { mapping: sameLabel } })).toEqual([])
  })

  it('keeps a partial diagram answer that places only some zones', () => {
    const payload = build([diagram], {
      [diagram.id]: { mapping: [{ zoneId: 'z2', labelId: 'l1' }] },
    })
    expect(payload).toMatchObject([{ selectedOptionId: 'l1', responseText: 'z2' }])
  })

  it('drops a question whose entries fail the payload schema', () => {
    const badMc = q(6, { options: [{ id: 'zz', text: '' }] })
    expect(build([badMc], { [badMc.id]: { selectedOptionId: 'zz' } })).toEqual([])
  })
})
