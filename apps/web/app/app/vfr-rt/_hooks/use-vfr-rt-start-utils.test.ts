import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { confirmRtOverwrite, writeRtHandoff } from './use-vfr-rt-start-utils'

// ---- writeRtHandoff ---------------------------------------------------------

describe('writeRtHandoff', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('writes the handoff payload to sessionStorage and returns true', () => {
    const ok = writeRtHandoff('user-1', 'sess-abc', ['q1', 'q2'])
    expect(ok).toBe(true)
    const stored = sessionStorage.getItem('quiz-session:user-1')
    expect(stored).not.toBeNull()
    const payload = JSON.parse(stored as string)
    expect(payload).toMatchObject({
      userId: 'user-1',
      sessionId: 'sess-abc',
      questionIds: ['q1', 'q2'],
      subjectName: 'VFR RT',
      subjectCode: 'RT',
    })
  })

  it('writes the handoff to a key scoped to the given userId', () => {
    writeRtHandoff('user-A', 'sess-1', [])
    writeRtHandoff('user-B', 'sess-2', [])
    expect(sessionStorage.getItem('quiz-session:user-A')).not.toBeNull()
    expect(sessionStorage.getItem('quiz-session:user-B')).not.toBeNull()
  })

  it('returns false and does not throw when sessionStorage.setItem throws', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    const ok = writeRtHandoff('user-1', 'sess-abc', ['q1'])
    expect(ok).toBe(false)
    setItemSpy.mockRestore()
  })

  it('stores an empty questionIds array without error', () => {
    const ok = writeRtHandoff('user-1', 'sess-abc', [])
    expect(ok).toBe(true)
    const payload = JSON.parse(sessionStorage.getItem('quiz-session:user-1') as string)
    expect(payload.questionIds).toEqual([])
  })
})

// ---- confirmRtOverwrite -----------------------------------------------------

describe('confirmRtOverwrite', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns true when the user confirms', () => {
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    expect(confirmRtOverwrite()).toBe(true)
  })

  it('returns false when the user cancels', () => {
    vi.spyOn(globalThis, 'confirm').mockReturnValue(false)
    expect(confirmRtOverwrite()).toBe(false)
  })

  it('includes the subject name in the prompt when provided', () => {
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    confirmRtOverwrite('Air Law')
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Air Law'))
  })

  it('omits the subject name suffix when no subjectName is provided', () => {
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    confirmRtOverwrite()
    // Message should not contain a parenthetical suffix
    const message = confirmSpy.mock.calls[0]?.[0]
    expect(message).not.toMatch(/\(/)
  })

  it('omits the subject name suffix when subjectName is undefined', () => {
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    confirmRtOverwrite(undefined)
    const message = confirmSpy.mock.calls[0]?.[0]
    expect(message).not.toMatch(/\(/)
  })
})
