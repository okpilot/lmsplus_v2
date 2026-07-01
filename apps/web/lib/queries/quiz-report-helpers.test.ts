import { describe, expect, it } from 'vitest'
import {
  type AnswerKeyRow,
  buildAnswerKeyMap,
  buildDistinctQuestionOrder,
} from './quiz-report-helpers'

describe('buildDistinctQuestionOrder', () => {
  it('keeps the first occurrence of each question in answered order', () => {
    const rows = [
      { question_id: 'q3' },
      { question_id: 'q1' },
      { question_id: 'q3' },
      { question_id: 'q2' },
      { question_id: 'q1' },
    ]
    expect(buildDistinctQuestionOrder(rows)).toEqual(['q3', 'q1', 'q2'])
  })

  it('returns an empty list when there are no rows', () => {
    expect(buildDistinctQuestionOrder([])).toEqual([])
  })
})

describe('buildAnswerKeyMap', () => {
  it('maps a short-answer row to its canonical answer', () => {
    const rows: AnswerKeyRow[] = [
      { question_id: 'q1', question_type: 'short_answer', blank_index: null, answer_key: 'mayday' },
    ]
    const map = buildAnswerKeyMap(rows)
    expect(map.get('q1')).toEqual({ type: 'short_answer', canonical: 'mayday' })
  })

  it('collapses dialog-fill blank rows into a per-index canonical map', () => {
    const rows: AnswerKeyRow[] = [
      { question_id: 'q2', question_type: 'dialog_fill', blank_index: 0, answer_key: 'cleared' },
      { question_id: 'q2', question_type: 'dialog_fill', blank_index: 1, answer_key: 'climb' },
    ]
    const entry = buildAnswerKeyMap(rows).get('q2')
    expect(entry?.type).toBe('dialog_fill')
    if (entry?.type !== 'dialog_fill') throw new Error('expected dialog_fill entry')
    expect(entry.canonicalByIndex.get(0)).toBe('cleared')
    expect(entry.canonicalByIndex.get(1)).toBe('climb')
  })

  it('omits a dialog-fill blank whose index or key is null', () => {
    const rows: AnswerKeyRow[] = [
      { question_id: 'q3', question_type: 'dialog_fill', blank_index: 0, answer_key: 'cleared' },
      { question_id: 'q3', question_type: 'dialog_fill', blank_index: null, answer_key: 'x' },
      { question_id: 'q3', question_type: 'dialog_fill', blank_index: 1, answer_key: null },
    ]
    const entry = buildAnswerKeyMap(rows).get('q3')
    if (entry?.type !== 'dialog_fill') throw new Error('expected dialog_fill entry')
    expect(entry.canonicalByIndex.size).toBe(1)
    expect(entry.canonicalByIndex.get(0)).toBe('cleared')
  })

  it('keys both a short-answer and a dialog-fill question in one pass', () => {
    const rows: AnswerKeyRow[] = [
      { question_id: 'q1', question_type: 'short_answer', blank_index: null, answer_key: 'roger' },
      { question_id: 'q2', question_type: 'dialog_fill', blank_index: 0, answer_key: 'wilco' },
    ]
    const map = buildAnswerKeyMap(rows)
    expect(map.size).toBe(2)
    expect(map.get('q1')?.type).toBe('short_answer')
    expect(map.get('q2')?.type).toBe('dialog_fill')
  })

  it('collapses ordering slot rows into a per-position canonical map', () => {
    const rows: AnswerKeyRow[] = [
      { question_id: 'q4', question_type: 'ordering', blank_index: 0, answer_key: 'mayday' },
      { question_id: 'q4', question_type: 'ordering', blank_index: 1, answer_key: 'position' },
    ]
    const entry = buildAnswerKeyMap(rows).get('q4')
    expect(entry?.type).toBe('ordering')
    if (entry?.type !== 'ordering') throw new Error('expected ordering entry')
    expect(entry.canonicalBySlot.get(0)).toBe('mayday')
    expect(entry.canonicalBySlot.get(1)).toBe('position')
  })

  it('omits an ordering slot whose index or key is null', () => {
    const rows: AnswerKeyRow[] = [
      { question_id: 'q5', question_type: 'ordering', blank_index: 0, answer_key: 'mayday' },
      { question_id: 'q5', question_type: 'ordering', blank_index: null, answer_key: 'x' },
      { question_id: 'q5', question_type: 'ordering', blank_index: 1, answer_key: null },
    ]
    const entry = buildAnswerKeyMap(rows).get('q5')
    if (entry?.type !== 'ordering') throw new Error('expected ordering entry')
    expect(entry.canonicalBySlot.size).toBe(1)
    expect(entry.canonicalBySlot.get(0)).toBe('mayday')
  })

  it('keeps ordering and dialog-fill keys separate in one pass', () => {
    const rows: AnswerKeyRow[] = [
      { question_id: 'q2', question_type: 'dialog_fill', blank_index: 0, answer_key: 'wilco' },
      { question_id: 'q4', question_type: 'ordering', blank_index: 0, answer_key: 'mayday' },
    ]
    const map = buildAnswerKeyMap(rows)
    expect(map.get('q2')?.type).toBe('dialog_fill')
    expect(map.get('q4')?.type).toBe('ordering')
  })
})
