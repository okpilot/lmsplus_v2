import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('../../_hooks/use-navigation-guard', () => ({ useNavigationGuard: vi.fn() }))
vi.mock('../../actions/quiz-progress', () => ({
  saveQuizAnswer: () => Promise.resolve({ success: true }),
  saveQuizPosition: () => Promise.resolve({ success: true }),
}))
vi.mock('./use-quiz-persistence', () => ({ useQuizPersistence: () => ({ checkpoint: vi.fn() }) }))

import { useNavigationGuard } from '../../_hooks/use-navigation-guard'
import { _resetConnectionState, adjustPending } from '../_utils/connection-state'
import { useQuizState } from './use-quiz-state'

const SESSION_ID = '00000000-0000-4000-a000-000000000001'
const QUESTION = {
  id: '00000000-0000-4000-a000-000000000011',
  question_text: 'Q1',
  question_image_url: null,
  question_number: null,
  explanation_text: null,
  explanation_image_url: null,
  options: [],
  question_type: 'multiple_choice' as const,
  dialog_template: null,
  blanks_safe: null,
  ordering_items: null,
  diagram_config: null,
}

function lastGuardArg(mock: MockInstance) {
  return mock.mock.calls[mock.mock.calls.length - 1]?.[0]
}

beforeEach(() => {
  vi.resetAllMocks()
  _resetConnectionState()
})

describe('useQuizState navigation guard while a save is unsent', () => {
  it.each(['study', 'exam'] as const)('warns before leaving a %s session', (mode) => {
    const guard = useNavigationGuard as unknown as MockInstance
    renderHook(() =>
      useQuizState({ userId: 'u', sessionId: SESSION_ID, questions: [QUESTION], mode }),
    )
    expect(lastGuardArg(guard)).toBe(false)
    act(() => adjustPending(1))
    expect(lastGuardArg(guard)).toBe(true)
    act(() => adjustPending(-1))
    expect(lastGuardArg(guard)).toBe(false)
  })
})
