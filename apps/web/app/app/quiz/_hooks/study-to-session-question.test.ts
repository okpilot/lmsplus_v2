import { describe, expect, it } from 'vitest'
import type { StudyQuestion } from '@/lib/queries/study-queries'
import { toSessionQuestion } from './study-to-session-question'

function makeStudyQuestion(): StudyQuestion {
  return {
    id: 'q-1',
    questionText: 'What is the MATZ radius?',
    questionImageUrl: 'https://img/q.png',
    options: [
      { id: 'a', text: '2 nm' },
      { id: 'b', text: '5 nm' },
      { id: 'c', text: '8 nm' },
      { id: 'd', text: '10 nm' },
    ],
    correctOptionId: 'b',
    subjectCode: 'ALW',
    topicName: 'Airspace',
    subtopicName: 'MATZ',
    explanationText: 'A MATZ extends 5 nm.',
    explanationImageUrl: 'https://img/e.png',
    questionNumber: 'ALW-001',
    difficulty: 'hard',
  }
}

const sequence = (values: number[]) => {
  let i = 0
  return () => values[i++ % values.length] ?? 0
}

describe('toSessionQuestion', () => {
  it('carries the display fields and defaults the multiple-choice-only fields', () => {
    expect(toSessionQuestion(makeStudyQuestion())).toMatchObject({
      id: 'q-1',
      question_text: 'What is the MATZ radius?',
      question_image_url: 'https://img/q.png',
      question_number: 'ALW-001',
      explanation_text: 'A MATZ extends 5 nm.',
      explanation_image_url: 'https://img/e.png',
      question_type: 'multiple_choice',
      dialog_template: null,
      blanks_safe: null,
      ordering_items: null,
      diagram_config: null,
    })
  })

  it('does not expose the correct option or study metadata', () => {
    const out = toSessionQuestion(makeStudyQuestion())
    expect(Object.keys(out)).not.toContain('correctOptionId')
    expect(Object.keys(out)).not.toContain('correct_option_id')
    expect(Object.keys(out)).not.toContain('topicName')
    expect(Object.keys(out)).not.toContain('difficulty')
  })

  it('returns every option exactly once in some order', () => {
    const input = makeStudyQuestion()
    const out = toSessionQuestion(input)
    expect(out.options).toHaveLength(input.options.length)
    expect([...out.options].sort((x, y) => x.id.localeCompare(y.id))).toEqual(input.options)
  })

  it('shuffles deterministically with an injected random source', () => {
    const rnd = [0.1, 0.9, 0.4]
    const first = toSessionQuestion(makeStudyQuestion(), sequence(rnd)).options.map((o) => o.id)
    const second = toSessionQuestion(makeStudyQuestion(), sequence(rnd)).options.map((o) => o.id)
    expect(first).toEqual(second)
    expect(first).not.toEqual(['a', 'b', 'c', 'd'])
  })

  it('leaves the input options order untouched', () => {
    const input = makeStudyQuestion()
    toSessionQuestion(input, sequence([0, 0, 0]))
    expect(input.options.map((o) => o.id)).toEqual(['a', 'b', 'c', 'd'])
  })
})
