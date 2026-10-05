import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DraftAnswer } from '../../types'

const { mockRead, mockClear, mockUpload } = vi.hoisted(() => ({
  mockRead: vi.fn(),
  mockClear: vi.fn(),
  mockUpload: vi.fn(),
}))

vi.mock('../_utils/quiz-session-storage', () => ({
  readActiveSession: (...a: unknown[]) => mockRead(...a),
  clearActiveSessionIfCurrent: (...a: unknown[]) => mockClear(...a),
}))
vi.mock('../_utils/local-answer-upload', async (orig) => ({
  ...(await orig<typeof import('../_utils/local-answer-upload')>()),
  uploadLocalAnswers: (...a: unknown[]) => mockUpload(...a),
}))

import { UPLOAD_WAIT_MS } from '../_utils/start-local-upload'
import { useLocalAnswerUpload } from './use-local-answer-upload'

const A: DraftAnswer = { selectedOptionId: 'a', responseTimeMs: 100 }
const B: DraftAnswer = { selectedOptionId: 'b', responseTimeMs: 200 }
const C: DraftAnswer = { selectedOptionId: 'c', responseTimeMs: 300 }
const SERVER: Record<string, DraftAnswer> = { q1: A }
const DONE = { saved: ['q2'], complete: true }

type Props = Parameters<typeof useLocalAnswerUpload>[0]

function props(over: Partial<Props> = {}): Props {
  return {
    userId: 'u1',
    sessionId: 's1',
    questionIds: ['q1', 'q2', 'q3'],
    serverAnswers: SERVER,
    claimed: true,
    claimFailed: false,
    ...over,
  }
}

function local(over: Record<string, unknown> = {}) {
  return {
    userId: 'u1',
    sessionId: 's1',
    questionIds: ['q1', 'q2', 'q3'],
    answers: { q2: B },
    ...over,
  }
}

const settle = () => act(async () => {})

beforeEach(() => {
  vi.resetAllMocks()
  mockRead.mockReturnValue(null)
  mockUpload.mockResolvedValue(DONE)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useLocalAnswerUpload', () => {
  it('returns the server answers when there is no local copy', async () => {
    const { result } = renderHook(() => useLocalAnswerUpload(props()))
    await settle()

    expect(result.current.answers).toEqual(SERVER)
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('returns the server answers without waiting for the claim when there is nothing local', async () => {
    const { result } = renderHook(() => useLocalAnswerUpload(props({ claimed: false })))
    await settle()

    expect(result.current.answers).toEqual(SERVER)
  })

  it('holds back an answer only this browser had until the server has saved it', async () => {
    mockRead.mockReturnValue(local())

    const { result } = renderHook(() => useLocalAnswerUpload(props({ claimed: false })))
    await settle()

    expect(result.current.answers).toBeNull()
  })

  it('does not upload before the claim has landed', async () => {
    mockRead.mockReturnValue(local())

    renderHook(() => useLocalAnswerUpload(props({ claimed: false })))
    await settle()

    expect(mockUpload).not.toHaveBeenCalled()
    expect(mockClear).not.toHaveBeenCalled()
  })

  it('uploads the local only answers once after the claim, then shows them and clears the copy', async () => {
    mockRead.mockReturnValue(local())

    const { result, rerender } = renderHook((p: Props) => useLocalAnswerUpload(p), {
      initialProps: props({ claimed: false }),
    })
    rerender(props({ claimed: true }))
    await settle()
    rerender(props({ claimed: true }))
    await settle()

    expect(mockUpload).toHaveBeenCalledTimes(1)
    expect(mockUpload).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 's1', answers: { q2: B } }),
    )
    expect(result.current.answers).toEqual({ q1: A, q2: B })
    expect(mockClear).toHaveBeenCalledWith('u1', 's1')
  })

  it('leaves out an answer the server refused and still clears the copy', async () => {
    mockRead.mockReturnValue(local({ answers: { q2: B, q3: C } }))
    mockUpload.mockResolvedValue({ saved: ['q3'], complete: true })

    const { result } = renderHook(() => useLocalAnswerUpload(props()))
    await settle()

    expect(result.current.answers).toEqual({ q1: A, q3: C })
    expect(mockClear).toHaveBeenCalledWith('u1', 's1')
  })

  it('shows only the answers saved before a session-wide failure and keeps the copy', async () => {
    mockRead.mockReturnValue(local({ answers: { q2: B, q3: C } }))
    mockUpload.mockResolvedValue({ saved: ['q2'], complete: false })

    const { result } = renderHook(() => useLocalAnswerUpload(props()))
    await settle()

    expect(result.current.answers).toEqual({ q1: A, q2: B })
    expect(mockClear).not.toHaveBeenCalled()
  })

  it('shows the server answers and keeps the copy when the upload throws', async () => {
    mockRead.mockReturnValue(local())
    mockUpload.mockRejectedValue(new Error('network'))

    const { result } = renderHook(() => useLocalAnswerUpload(props()))
    await settle()

    expect(result.current.answers).toEqual(SERVER)
    expect(mockClear).not.toHaveBeenCalled()
  })

  it('shows what the server saved so far when a rejected upload had already saved some', async () => {
    mockRead.mockReturnValue(local({ answers: { q2: B, q3: C } }))
    mockUpload.mockImplementation(async (o: { onSaved: (id: string) => void }) => {
      o.onSaved('q2')
      throw new Error('network')
    })

    const { result } = renderHook(() => useLocalAnswerUpload(props()))
    await settle()

    expect(result.current.answers).toEqual({ q1: A, q2: B })
  })

  it('keeps the runner closed after the wait limit until the save in progress returns, then shows it', async () => {
    vi.useFakeTimers()
    mockRead.mockReturnValue(local({ answers: { q2: B, q3: C } }))
    let finish: (r: { saved: string[]; complete: boolean }) => void = () => {}
    mockUpload.mockImplementation((o: { onSaved: (id: string) => void }) => {
      o.onSaved('q2')
      return new Promise((r) => {
        finish = r
      })
    })

    const { result } = renderHook(() => useLocalAnswerUpload(props()))
    await settle()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UPLOAD_WAIT_MS)
    })
    expect(result.current.answers).toBeNull()
    await act(async () => finish({ saved: ['q2'], complete: false }))

    expect(result.current.answers).toEqual({ q1: A, q2: B })
    expect(mockClear).not.toHaveBeenCalled()
  })

  it('shows the answers an upload finishing after the wait limit saved and clears the copy first', async () => {
    vi.useFakeTimers()
    mockRead.mockReturnValue(local())
    let finish: (r: typeof DONE) => void = () => {}
    mockUpload.mockReturnValue(
      new Promise((r) => {
        finish = r
      }),
    )

    const { result } = renderHook(() => useLocalAnswerUpload(props()))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UPLOAD_WAIT_MS)
    })
    expect(result.current.answers).toBeNull()
    await act(async () => finish(DONE))

    expect(result.current.answers).toHaveProperty('q2')
    expect(mockClear).toHaveBeenCalledTimes(1)
  })

  it('shows the server answers and uploads nothing when the claim failed after the copy was read', async () => {
    mockRead.mockReturnValue(local())

    const { result, rerender } = renderHook((p: Props) => useLocalAnswerUpload(p), {
      initialProps: props({ claimed: false }),
    })
    await settle()
    expect(result.current.answers).toBeNull()
    rerender(props({ claimed: false, claimFailed: true }))
    await settle()

    expect(result.current.answers).toEqual(SERVER)
    expect(mockUpload).not.toHaveBeenCalled()
    expect(mockClear).not.toHaveBeenCalled()
  })

  it('shows the server answers and uploads nothing when the claim had already failed on mount', async () => {
    mockRead.mockReturnValue(local())

    const { result } = renderHook(() => useLocalAnswerUpload(props({ claimFailed: true })))
    await settle()

    expect(result.current.answers).toEqual(SERVER)
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('shows the server answers when the stored session was replaced before the claim', async () => {
    mockRead.mockReturnValueOnce(local()).mockReturnValue(local({ sessionId: 'other' }))

    const { result, rerender } = renderHook((p: Props) => useLocalAnswerUpload(p), {
      initialProps: props({ claimed: false }),
    })
    await settle()
    rerender(props({ claimed: true }))
    await settle()

    expect(result.current.answers).toEqual(SERVER)
    expect(mockUpload).not.toHaveBeenCalled()
    expect(mockClear).not.toHaveBeenCalled()
  })

  it('leaves the local copy of another session untouched', async () => {
    mockRead.mockReturnValue(local({ sessionId: 'other' }))

    const { result } = renderHook(() => useLocalAnswerUpload(props()))
    await settle()

    expect(result.current.answers).toEqual(SERVER)
    expect(mockUpload).not.toHaveBeenCalled()
    expect(mockClear).not.toHaveBeenCalled()
  })

  it('clears a local copy of this session whose answers the server already holds', async () => {
    mockRead.mockReturnValue(local({ answers: { q1: A } }))

    renderHook(() => useLocalAnswerUpload(props()))
    await settle()

    expect(mockUpload).not.toHaveBeenCalled()
    expect(mockClear).toHaveBeenCalledWith('u1', 's1')
  })
})
