import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGrid } = vi.hoisted(() => ({ mockGrid: vi.fn() }))
vi.mock('../../_components/question-grid', () => ({
  QuestionGrid: (props: unknown) => {
    mockGrid(props)
    return null
  },
}))

import type { QuizState } from '../_hooks/use-quiz-state'
import { QuizSessionGrid } from './quiz-session-grid'

type GridProps = {
  feedbackMap: Map<string, unknown>
  answeredIds?: Set<string>
  seenIds?: Set<number>
  isExamMode: boolean
}

function state(over: Partial<QuizState>): QuizState {
  return {
    currentIndex: 0,
    pinnedQuestions: new Set<string>(),
    questionIds: ['q1'],
    isExam: false,
    answeredIds: new Set(['q1']),
    seenIndices: new Set([0]),
    navigateTo: vi.fn(),
    ...over,
  } as unknown as QuizState
}

function lastProps(): GridProps {
  return mockGrid.mock.calls.at(-1)?.[0] as GridProps
}

const feedback = new Map([['q1', { isCorrect: true }]])

describe('QuizSessionGrid', () => {
  beforeEach(() => vi.resetAllMocks())

  it('passes feedback and answered ids through in practice mode', () => {
    render(
      <QuizSessionGrid
        s={state({})}
        isDiscovery={false}
        totalQuestions={1}
        flaggedIds={new Set()}
        feedbackMap={feedback}
      />,
    )
    const p = lastProps()
    expect(p.feedbackMap.size).toBe(1)
    expect(p.answeredIds).toEqual(new Set(['q1']))
    expect(p.seenIds).toBeUndefined()
  })

  it('hides feedback colouring in exam mode', () => {
    render(
      <QuizSessionGrid
        s={state({ isExam: true })}
        isDiscovery={false}
        totalQuestions={1}
        flaggedIds={new Set()}
        feedbackMap={feedback}
      />,
    )
    const p = lastProps()
    expect(p.feedbackMap.size).toBe(0)
    expect(p.isExamMode).toBe(true)
  })

  it('drives the grid by seen indices in Discovery', () => {
    render(
      <QuizSessionGrid
        s={state({})}
        isDiscovery
        totalQuestions={1}
        flaggedIds={new Set()}
        feedbackMap={feedback}
      />,
    )
    const p = lastProps()
    expect(p.feedbackMap.size).toBe(0)
    expect(p.answeredIds).toBeUndefined()
    expect(p.seenIds).toEqual(new Set([0]))
  })
})
