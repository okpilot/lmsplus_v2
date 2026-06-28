import { describe, expect, it } from 'vitest'
import type { StudyQuestion } from '@/lib/queries/study-queries'
import { buildDiscoveryHandoff } from './build-discovery-handoff'

// ---- Fixtures -------------------------------------------------------------

function makeQuestion(id: string, correctOptionId: string): StudyQuestion {
  return {
    id,
    questionText: `Question ${id}?`,
    questionImageUrl: null,
    options: [
      { id: `${id}-a`, text: 'A' },
      { id: `${id}-b`, text: 'B' },
    ],
    correctOptionId,
    subjectCode: null,
    topicName: null,
    subtopicName: null,
    explanationText: 'Because reasons.',
    explanationImageUrl: 'https://example.test/img.png',
    questionNumber: null,
    difficulty: null,
  }
}

const QUESTIONS: StudyQuestion[] = [
  makeQuestion('q-1', 'q-1-a'),
  makeQuestion('q-2', 'q-2-b'),
  makeQuestion('q-3', 'q-3-a'),
]

const OPTS = { userId: 'user-1', subjectName: 'Meteorology', subjectCode: 'MET' }

// ---- Tests ----------------------------------------------------------------

describe('buildDiscoveryHandoff — pre-marked answers', () => {
  it('pre-marks each question with its own correct option and zero response time', () => {
    const handoff = buildDiscoveryHandoff(QUESTIONS, OPTS)
    for (const q of QUESTIONS) {
      const answer = handoff.draftAnswers[q.id]
      expect(answer).toBeDefined()
      expect(answer?.selectedOptionId).toBe(q.correctOptionId)
      expect(answer?.responseTimeMs).toBe(0)
    }
  })
})

describe('buildDiscoveryHandoff — feedback entries', () => {
  it('marks every feedback entry correct as multiple_choice with null explanations', () => {
    const handoff = buildDiscoveryHandoff(QUESTIONS, OPTS)
    for (const q of QUESTIONS) {
      const fb = handoff.draftFeedback[q.id]
      expect(fb).toBeDefined()
      expect(fb?.questionType).toBe('multiple_choice')
      expect(fb?.isCorrect).toBe(true)
      // multiple_choice variant carries correctOptionId; narrow before reading it.
      if (fb?.questionType === 'multiple_choice') {
        expect(fb.correctOptionId).toBe(q.correctOptionId)
      }
      expect(fb?.explanationText).toBeNull()
      expect(fb?.explanationImageUrl).toBeNull()
    }
  })
})

describe('buildDiscoveryHandoff — handoff envelope', () => {
  it('tags the handoff with mode discovery and preserves questionId order', () => {
    const handoff = buildDiscoveryHandoff(QUESTIONS, OPTS)
    expect(handoff.mode).toBe('discovery')
    expect(handoff.questionIds).toEqual(['q-1', 'q-2', 'q-3'])
    expect(handoff.draftCurrentIndex).toBe(0)
  })

  it('passes through userId, subjectName, and subjectCode', () => {
    const handoff = buildDiscoveryHandoff(QUESTIONS, OPTS)
    expect(handoff.userId).toBe('user-1')
    expect(handoff.subjectName).toBe('Meteorology')
    expect(handoff.subjectCode).toBe('MET')
  })

  it('generates a fresh sessionId each call', () => {
    const a = buildDiscoveryHandoff(QUESTIONS, OPTS)
    const b = buildDiscoveryHandoff(QUESTIONS, OPTS)
    expect(a.sessionId).toEqual(expect.any(String))
    expect(a.sessionId.length).toBeGreaterThan(0)
    expect(a.sessionId).not.toBe(b.sessionId)
  })

  it('returns empty handoff maps for an empty question set', () => {
    const handoff = buildDiscoveryHandoff([], OPTS)
    expect(handoff.questionIds).toEqual([])
    expect(handoff.draftAnswers).toEqual({})
    expect(handoff.draftFeedback).toEqual({})
  })
})
