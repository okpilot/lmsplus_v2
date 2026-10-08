import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPipeline } = vi.hoisted(() => ({ mockPipeline: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('./use-answer-pipeline', () => ({
  useAnswerPipeline: (...a: unknown[]) => mockPipeline(...a),
}))

import { useStudyPipeline } from './use-study-pipeline'

const sync = {
  nav: { currentIndex: 1, navigateTo: vi.fn() },
  currentIndexRef: { current: 1 },
} as never
const getters = { getQuestionId: () => 'q1', getAnswerStartTime: () => 0 }

beforeEach(() => {
  vi.resetAllMocks()
  mockPipeline.mockReturnValue({ feedback: new Map() })
})

describe('useStudyPipeline', () => {
  it('starts from the saved answers', () => {
    const initialAnswers = { q1: { selectedOptionId: 'a', responseTimeMs: 5 } }
    const { result } = renderHook(() =>
      useStudyPipeline({ initialAnswers } as never, sync, getters),
    )

    expect([...result.current.answers.keys()]).toEqual(['q1'])
  })

  it('starts empty when nothing was saved', () => {
    const { result } = renderHook(() => useStudyPipeline({} as never, sync, getters))

    expect(result.current.answers.size).toBe(0)
  })

  it('hands the pipeline the live answers and the current index', () => {
    renderHook(() => useStudyPipeline({} as never, sync, getters))

    const given = mockPipeline.mock.calls[0]?.[0] as { getCurrentIndex: () => number }
    expect(given.getCurrentIndex()).toBe(1)
  })
})
