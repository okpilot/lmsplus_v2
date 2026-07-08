import { beforeEach, describe, expect, it, vi } from 'vitest'
import { writeQuizSessionHandoff } from './write-quiz-session-handoff'

// ---- Fixtures -------------------------------------------------------------

const USER_ID = 'test-user-id'
const SESSION_ID = '00000000-0000-4000-a000-000000000001'
const QUESTION_IDS = ['q-1', 'q-2']

// ---- Lifecycle ------------------------------------------------------------

const mockSetItem = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: { setItem: mockSetItem, getItem: vi.fn(), removeItem: vi.fn() },
    writable: true,
  })
})

// ---- Tests ------------------------------------------------------------------

describe('writeQuizSessionHandoff — success', () => {
  it('writes the session handoff to sessionStorage under the user-scoped key', () => {
    const wrote = writeQuizSessionHandoff(USER_ID, SESSION_ID, QUESTION_IDS, 'Meteorology', 'MET')

    expect(wrote).toBe(true)
    expect(mockSetItem).toHaveBeenCalledTimes(1)
    const [key, json] = mockSetItem.mock.calls[0] as [string, string]
    expect(key).toBe(`quiz-session:${USER_ID}`)
    const payload = JSON.parse(json) as Record<string, unknown>
    expect(payload).toMatchObject({
      userId: USER_ID,
      sessionId: SESSION_ID,
      questionIds: QUESTION_IDS,
      subjectName: 'Meteorology',
      subjectCode: 'MET',
    })
  })

  it('omits subjectName and subjectCode from the payload when not provided', () => {
    writeQuizSessionHandoff(USER_ID, SESSION_ID, QUESTION_IDS)

    const json = mockSetItem.mock.calls[0]?.[1] as string
    const payload = JSON.parse(json) as Record<string, unknown>
    expect(payload.subjectName).toBeUndefined()
    expect(payload.subjectCode).toBeUndefined()
  })
})

describe('writeQuizSessionHandoff — private-mode storage failure', () => {
  it('returns false and warns when sessionStorage throws a SecurityError', () => {
    mockSetItem.mockImplementation(() => {
      throw new DOMException('The operation is insecure', 'SecurityError')
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const wrote = writeQuizSessionHandoff(USER_ID, SESSION_ID, QUESTION_IDS)

    expect(wrote).toBe(false)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    warnSpy.mockRestore()
  })
})

describe('writeQuizSessionHandoff — general storage failure', () => {
  it('returns false and warns when sessionStorage throws a quota error', () => {
    mockSetItem.mockImplementation(() => {
      throw new DOMException('The quota has been exceeded', 'QuotaExceededError')
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const wrote = writeQuizSessionHandoff(USER_ID, SESSION_ID, QUESTION_IDS)

    expect(wrote).toBe(false)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    warnSpy.mockRestore()
  })
})
