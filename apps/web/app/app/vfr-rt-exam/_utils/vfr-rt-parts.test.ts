import { describe, expect, it } from 'vitest'
import type { VfrRtQuestion } from '@/lib/queries/vfr-rt-exam'
import { buildPartSegments, partForType } from './vfr-rt-parts'

function q(id: string, type: VfrRtQuestion['question_type']): VfrRtQuestion {
  return {
    id,
    question_type: type,
    question_text: '',
    question_image_url: null,
    subject_code: 'RT',
    topic_code: 'RT.1',
    difficulty: 'easy',
    question_number: '1',
    options: null,
    dialog_template: null,
    blanks_safe: null,
  }
}

describe('partForType', () => {
  it('maps short_answer to Part 1', () => {
    expect(partForType('short_answer').label).toBe('Part 1')
  })
  it('maps dialog_fill to Part 2', () => {
    expect(partForType('dialog_fill').label).toBe('Part 2')
  })
  it('maps multiple_choice to Part 3', () => {
    expect(partForType('multiple_choice').label).toBe('Part 3')
  })
  it('throws when given an unknown question type', () => {
    // Guard against future DB schema values reaching the client before types are
    // regenerated — the 3-value union is exhaustive at compile time only.
    expect(() => partForType('unknown_type' as VfrRtQuestion['question_type'])).toThrow(
      '[partForType] Unknown question type: unknown_type',
    )
  })
})

describe('buildPartSegments', () => {
  const questions = [
    q('s1', 'short_answer'),
    q('s2', 'short_answer'),
    q('d1', 'dialog_fill'),
    q('m1', 'multiple_choice'),
  ]

  it('counts totals per part', () => {
    const segments = buildPartSegments(questions, {})
    expect(segments).toEqual([
      { label: 'Part 1', answered: 0, total: 2 },
      { label: 'Part 2', answered: 0, total: 1 },
      { label: 'Part 3', answered: 0, total: 1 },
    ])
  })

  it('counts a short answer as answered only when non-empty after trim', () => {
    const segments = buildPartSegments(questions, { s1: { short: 'QNH' }, s2: { short: '  ' } })
    expect(segments[0]).toEqual({ label: 'Part 1', answered: 1, total: 2 })
  })

  it('counts a multiple-choice question as answered when an option is selected', () => {
    const segments = buildPartSegments(questions, { m1: { mc: 'opt-a' } })
    expect(segments[2]).toEqual({ label: 'Part 3', answered: 1, total: 1 })
  })

  it('counts a dialog question as answered when at least one blank is filled', () => {
    const segments = buildPartSegments(questions, { d1: { blanks: { 0: 'cleared' } } })
    expect(segments[1]).toEqual({ label: 'Part 2', answered: 1, total: 1 })
  })
})
