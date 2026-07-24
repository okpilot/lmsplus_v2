import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockRouterPush, mockStartStudy, mockSessionStorageSetItem, mockEndDiscovery } = vi.hoisted(
  () => ({
    mockRouterPush: vi.fn(),
    mockStartStudy: vi.fn(),
    mockSessionStorageSetItem: vi.fn(),
    mockEndDiscovery: vi.fn(),
  }),
)

vi.mock('../actions/study', () => ({
  startStudy: (...args: unknown[]) => mockStartStudy(...args),
}))

vi.mock('../actions/end-discovery', () => ({
  endDiscovery: (...args: unknown[]) => mockEndDiscovery(...args),
}))

vi.mock('../session/_utils/quiz-session-handoff', () => ({
  sessionHandoffKey: (userId: string) => `quiz-session:${userId}`,
}))

// ---- Subject under test ---------------------------------------------------

import type { StudyQuestion } from '@/lib/queries/study-queries'
import { buildStudyStartHandler, type StudyStartDeps } from './study-start-handlers'

// ---- Fixtures -------------------------------------------------------------

const SUBJECT_ID = '00000000-0000-4000-a000-000000000001'

function makeQuestion(id = 'q-1'): StudyQuestion {
  return {
    id,
    questionText: 'What is the MATZ radius?',
    questionImageUrl: null,
    options: [{ id: 'a', text: '5 nm' }],
    correctOptionId: 'a',
    subjectCode: null,
    topicName: null,
    subtopicName: null,
    explanationText: null,
    explanationImageUrl: null,
    questionNumber: null,
    difficulty: null,
  }
}

function makeDeps(overrides: Partial<StudyStartDeps> = {}): StudyStartDeps {
  return {
    userId: 'test-user-id',
    subjectId: SUBJECT_ID,
    subjects: [
      { id: SUBJECT_ID, code: '050', name: 'Meteorology', short: 'MET', questionCount: 30 },
    ],
    count: 10,
    maxQuestions: 100,
    topicTree: {
      getSelectedTopicIds: () => [],
      getSelectedSubtopicIds: () => [],
    },
    router: { push: mockRouterPush } as unknown as StudyStartDeps['router'],
    loading: false,
    setLoading: vi.fn(),
    setError: vi.fn(),
    inFlight: { current: false },
    ...overrides,
  }
}

// ---- Lifecycle ------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: { setItem: mockSessionStorageSetItem, getItem: vi.fn(), removeItem: vi.fn() },
    writable: true,
  })
  mockStartStudy.mockResolvedValue({ success: true, questions: [makeQuestion()] })
  mockEndDiscovery.mockResolvedValue({ success: true })
})

// ---- Same-tick re-entry ----------------------------------------------------

describe('buildStudyStartHandler — same-tick re-entry', () => {
  it('starts only one discovery session when invoked twice in the same tick', async () => {
    const handleStart = buildStudyStartHandler(makeDeps())
    const first = handleStart()
    const second = handleStart()
    await Promise.all([first, second])
    expect(mockStartStudy).toHaveBeenCalledTimes(1)
  })
})

// ---- Retryable failures release the guard ----------------------------------

describe('buildStudyStartHandler — retryable failures', () => {
  it('allows a second attempt after the server rejects the start', async () => {
    mockStartStudy.mockResolvedValue({
      success: false,
      error: 'Finish or exit your active exam first.',
    })
    const deps = makeDeps()
    const handleStart = buildStudyStartHandler(deps)

    await handleStart()
    await handleStart()

    expect(mockStartStudy).toHaveBeenCalledTimes(2)
    expect(deps.inFlight.current).toBe(false)
  })

  it('allows a second attempt when the question pool comes back empty', async () => {
    mockStartStudy.mockResolvedValue({ success: true, questions: [] })
    const deps = makeDeps()
    const handleStart = buildStudyStartHandler(deps)

    await handleStart()

    expect(mockRouterPush).not.toHaveBeenCalled()
    expect(deps.inFlight.current).toBe(false)
    expect(deps.setError).toHaveBeenCalledWith('No questions match these filters.')

    await handleStart()
    expect(mockStartStudy).toHaveBeenCalledTimes(2)
  })

  it('allows a second attempt after the start throws', async () => {
    mockStartStudy.mockRejectedValue(new Error('network error'))
    const deps = makeDeps()
    const handleStart = buildStudyStartHandler(deps)

    await handleStart()

    expect(deps.inFlight.current).toBe(false)
    expect(deps.setError).toHaveBeenCalledWith('Something went wrong. Please try again.')

    await handleStart()
    expect(mockStartStudy).toHaveBeenCalledTimes(2)
  })

  it('ends the orphaned discovery session and allows a retry when the handoff write fails', async () => {
    mockSessionStorageSetItem.mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    const deps = makeDeps()
    const handleStart = buildStudyStartHandler(deps)

    await handleStart()

    expect(mockEndDiscovery).toHaveBeenCalledTimes(1)
    // No-args (blanket) form is the contract — the scoped { sessionId } form is a
    // different endDiscovery mode reserved for callers that know the row id.
    expect(mockEndDiscovery).toHaveBeenCalledWith()
    expect(mockRouterPush).not.toHaveBeenCalled()
    expect(deps.inFlight.current).toBe(false)
    expect(deps.setError).toHaveBeenCalledWith(
      'Unable to start discovery right now. Please try again.',
    )

    await handleStart()
    expect(mockStartStudy).toHaveBeenCalledTimes(2)
  })

  it('still allows a retry when the orphan cleanup itself throws', async () => {
    mockSessionStorageSetItem.mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    mockEndDiscovery.mockRejectedValue(new Error('cleanup network failure'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    try {
      const deps = makeDeps()
      const handleStart = buildStudyStartHandler(deps)

      await handleStart()

      expect(deps.inFlight.current).toBe(false)
      expect(deps.setError).toHaveBeenCalledWith(
        'Unable to start discovery right now. Please try again.',
      )

      await handleStart()
      expect(mockStartStudy).toHaveBeenCalledTimes(2)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('logs the server error when the orphan cleanup reports failure', async () => {
    mockSessionStorageSetItem.mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    mockEndDiscovery.mockResolvedValue({ success: false as const, error: 'discovery not found' })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    try {
      const handleStart = buildStudyStartHandler(makeDeps())
      await handleStart()

      expect(errorSpy).toHaveBeenCalledWith(
        '[use-study-start] orphan cleanup failed:',
        'discovery not found',
      )
    } finally {
      errorSpy.mockRestore()
    }
  })
})

// ---- Terminal success keeps the guard engaged --------------------------------

describe('buildStudyStartHandler — terminal success', () => {
  it('ignores further start attempts after a successful start navigates away', async () => {
    const deps = makeDeps()
    const handleStart = buildStudyStartHandler(deps)

    await handleStart()
    expect(mockRouterPush).toHaveBeenCalledWith('/app/quiz/session')

    await handleStart()
    expect(mockStartStudy).toHaveBeenCalledTimes(1)
    expect(mockRouterPush).toHaveBeenCalledTimes(1)
  })
})
