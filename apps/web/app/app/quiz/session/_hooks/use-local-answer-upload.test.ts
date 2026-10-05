import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DraftAnswer } from '../../types'

const { mockRead, mockClear, mockUpload } = vi.hoisted(() => ({
  mockRead: vi.fn(),
  mockClear: vi.fn(),
  mockUpload: vi.fn(),
}))

vi.mock('../_utils/quiz-session-storage', () => ({
  readActiveSession: (...a: unknown[]) => mockRead(...a),
  clearActiveSession: (...a: unknown[]) => mockClear(...a),
}))
vi.mock('../_utils/local-answer-upload', async (orig) => ({
  ...(await orig<typeof import('../_utils/local-answer-upload')>()),
  uploadLocalAnswers: (...a: unknown[]) => mockUpload(...a),
}))

import { useLocalAnswerUpload } from './use-local-answer-upload'

const A: DraftAnswer = { selectedOptionId: 'a', responseTimeMs: 100 }
const B: DraftAnswer = { selectedOptionId: 'b', responseTimeMs: 200 }
const SERVER: Record<string, DraftAnswer> = { q1: A }

type Props = Parameters<typeof useLocalAnswerUpload>[0]

function props(over: Partial<Props> = {}): Props {
  return {
    userId: 'u1',
    sessionId: 's1',
    questionIds: ['q1', 'q2'],
    serverAnswers: SERVER,
    claimed: true,
    ...over,
  }
}

function local(over: Record<string, unknown> = {}) {
  return { userId: 'u1', sessionId: 's1', questionIds: ['q1', 'q2'], answers: { q2: B }, ...over }
}

const settle = () => act(async () => {})

beforeEach(() => {
  vi.resetAllMocks()
  mockRead.mockReturnValue(null)
  mockUpload.mockResolvedValue(true)
})

describe('useLocalAnswerUpload', () => {
  it('returns the server answers when there is no local copy', async () => {
    const { result } = renderHook(() => useLocalAnswerUpload(props()))
    await settle()

    expect(result.current.answers).toEqual(SERVER)
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('shows an answer only this browser had alongside the server answers', async () => {
    mockRead.mockReturnValue(local())

    const { result } = renderHook(() => useLocalAnswerUpload(props({ claimed: false })))
    await settle()

    expect(result.current.answers).toEqual({ q1: A, q2: B })
  })

  it('does not upload before the claim has landed', async () => {
    mockRead.mockReturnValue(local())

    renderHook(() => useLocalAnswerUpload(props({ claimed: false })))
    await settle()

    expect(mockUpload).not.toHaveBeenCalled()
    expect(mockClear).not.toHaveBeenCalled()
  })

  it('uploads the local only answers once after the claim, then clears the local copy', async () => {
    mockRead.mockReturnValue(local())

    const { rerender } = renderHook((p: Props) => useLocalAnswerUpload(p), {
      initialProps: props({ claimed: false }),
    })
    rerender(props({ claimed: true }))
    await settle()
    rerender(props({ claimed: true }))
    await settle()

    expect(mockUpload).toHaveBeenCalledTimes(1)
    expect(mockUpload).toHaveBeenCalledWith({ sessionId: 's1', answers: { q2: B } })
    expect(mockClear).toHaveBeenCalledWith('u1')
  })

  it('keeps the local copy when an upload fails', async () => {
    mockRead.mockReturnValue(local())
    mockUpload.mockResolvedValue(false)

    renderHook(() => useLocalAnswerUpload(props()))
    await settle()

    expect(mockClear).not.toHaveBeenCalled()
  })

  it('keeps the local copy when the upload throws', async () => {
    mockRead.mockReturnValue(local())
    mockUpload.mockRejectedValue(new Error('network'))

    renderHook(() => useLocalAnswerUpload(props()))
    await settle()

    expect(mockClear).not.toHaveBeenCalled()
  })

  it('leaves the local copy of another session untouched', async () => {
    mockRead.mockReturnValue(local({ sessionId: 'other' }))

    renderHook(() => useLocalAnswerUpload(props()))
    await settle()

    expect(mockUpload).not.toHaveBeenCalled()
    expect(mockClear).not.toHaveBeenCalled()
  })

  it('clears a local copy of this session whose answers the server already holds', async () => {
    mockRead.mockReturnValue(local({ answers: { q1: A } }))

    renderHook(() => useLocalAnswerUpload(props()))
    await settle()

    expect(mockUpload).not.toHaveBeenCalled()
    expect(mockClear).toHaveBeenCalledWith('u1')
  })
})
