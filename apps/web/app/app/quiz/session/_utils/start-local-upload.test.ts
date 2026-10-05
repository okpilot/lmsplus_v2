import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DraftAnswer } from '../../types'

const { mockUpload, mockClear } = vi.hoisted(() => ({ mockUpload: vi.fn(), mockClear: vi.fn() }))

vi.mock('./local-answer-upload', () => ({
  uploadLocalAnswers: (...a: unknown[]) => mockUpload(...a),
}))
vi.mock('./quiz-session-storage', () => ({
  clearActiveSessionIfCurrent: (...a: unknown[]) => mockClear(...a),
}))

import { startLocalUpload, UPLOAD_WAIT_MS } from './start-local-upload'

const B: DraftAnswer = { selectedOptionId: 'b', responseTimeMs: 200 }

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('startLocalUpload', () => {
  it('settles with the saved ids and clears the copy when the upload completes', async () => {
    mockUpload.mockResolvedValue({ saved: ['q2'], complete: true })
    const settle = vi.fn()

    startLocalUpload({ userId: 'u', sessionId: 's', answers: { q2: B }, settle })
    await vi.advanceTimersByTimeAsync(0)

    expect(settle).toHaveBeenCalledWith(['q2'])
    expect(mockClear).toHaveBeenCalledWith('u', 's')
  })

  it('settles with the ids saved so far once the wait limit passes', async () => {
    mockUpload.mockImplementation((o: { onSaved: (id: string) => void }) => {
      o.onSaved('q2')
      return new Promise(() => {})
    })
    const settle = vi.fn()

    startLocalUpload({ userId: 'u', sessionId: 's', answers: { q2: B }, settle })
    await vi.advanceTimersByTimeAsync(UPLOAD_WAIT_MS)

    expect(settle).toHaveBeenCalledWith(['q2'])
    expect(mockClear).not.toHaveBeenCalled()
  })

  it('does not call the server for an empty set and clears the copy', async () => {
    const settle = vi.fn()

    startLocalUpload({ userId: 'u', sessionId: 's', answers: {}, settle })
    await vi.advanceTimersByTimeAsync(0)

    expect(mockUpload).not.toHaveBeenCalled()
    expect(mockClear).toHaveBeenCalledWith('u', 's')
  })

  it('keeps the copy when the upload is incomplete', async () => {
    mockUpload.mockResolvedValue({ saved: [], complete: false })

    startLocalUpload({ userId: 'u', sessionId: 's', answers: { q2: B }, settle: vi.fn() })
    await vi.advanceTimersByTimeAsync(0)

    expect(mockClear).not.toHaveBeenCalled()
  })
})
