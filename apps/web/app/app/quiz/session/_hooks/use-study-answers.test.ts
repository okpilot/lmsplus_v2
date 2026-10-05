import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DraftAnswer } from '../../types'
import { useStudyAnswers } from './use-study-answers'

const A: DraftAnswer = { selectedOptionId: 'a', responseTimeMs: 100 }
const B: DraftAnswer = { selectedOptionId: 'b', responseTimeMs: 200 }

describe('useStudyAnswers', () => {
  it('starts empty without initial answers', () => {
    const { result } = renderHook(() => useStudyAnswers(undefined))

    expect(result.current.studyAnswers.size).toBe(0)
  })

  it('seeds the answers from the initial answers', () => {
    const { result } = renderHook(() => useStudyAnswers({ q1: A }))

    expect(result.current.studyAnswers.get('q1')).toEqual(A)
  })

  it('keeps the ref in step with the latest answers', () => {
    const { result } = renderHook(() => useStudyAnswers({ q1: A }))

    act(() => result.current.setStudyAnswers(new Map([['q2', B]])))

    expect(result.current.studyAnswersRef.current.get('q2')).toEqual(B)
    expect(result.current.studyAnswers.get('q2')).toEqual(B)
  })
})
