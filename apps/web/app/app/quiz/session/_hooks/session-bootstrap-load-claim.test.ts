import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockClaim, mockLoadQuestions, mockGetFlagged } = vi.hoisted(() => ({
  mockClaim: vi.fn(),
  mockLoadQuestions: vi.fn(),
  mockGetFlagged: vi.fn(),
}))

vi.mock('../_utils/claim-quiz-device', () => ({
  claimQuizDeviceBounded: (...a: unknown[]) => mockClaim(...a),
}))
vi.mock('@/lib/queries/load-session-questions', () => ({
  loadSessionQuestions: (...a: unknown[]) => mockLoadQuestions(...a),
}))
vi.mock('@/lib/queries/load-vfr-rt-exam-questions', () => ({ loadVfrRtExamQuestions: vi.fn() }))
vi.mock('../../actions/flag', () => ({ getFlaggedIds: (...a: unknown[]) => mockGetFlagged(...a) }))

import { applyInitialLoad, loadSessionData } from './session-bootstrap-load'

const ok = { success: true, questions: [{ id: 'q1' }] }

beforeEach(() => {
  vi.resetAllMocks()
  mockLoadQuestions.mockResolvedValue(ok)
  mockGetFlagged.mockResolvedValue({ success: true, flaggedIds: [] })
  mockClaim.mockResolvedValue(null)
})

describe('loadSessionData — claim', () => {
  it.each(['study', 'exam'] as const)('claims the session in %s mode', async (mode) => {
    await loadSessionData(['q1'], { sessionId: 's1', mode })
    expect(mockClaim).toHaveBeenCalledWith('s1')
  })

  it('starts the claim before the flag fetch', async () => {
    await loadSessionData(['q1'], { sessionId: 's1', mode: 'study' })
    const claimOrder = mockClaim.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    const flagsOrder = mockGetFlagged.mock.invocationCallOrder[0] ?? 0
    expect(claimOrder).toBeLessThan(flagsOrder)
  })

  it('does not claim in discovery mode', async () => {
    await loadSessionData(['q1'], { sessionId: 's1', mode: 'discovery' })
    expect(mockClaim).not.toHaveBeenCalled()
  })

  it('does not claim without a session source', async () => {
    await loadSessionData(['q1'])
    expect(mockClaim).not.toHaveBeenCalled()
  })

  it('returns the mapped claim error alongside the questions', async () => {
    mockClaim.mockResolvedValue('This session has already ended.')
    const r = await loadSessionData(['q1'], { sessionId: 's1', mode: 'study' })
    expect(r).toMatchObject({ success: true, claimError: 'This session has already ended.' })
  })

  it('still loads the questions when the claim yields nothing', async () => {
    const r = await loadSessionData(['q1'], { sessionId: 's1', mode: 'study' })
    expect(r).toMatchObject({ success: true, claimError: undefined })
  })
})

describe('applyInitialLoad', () => {
  const setters = () => ({
    setError: vi.fn(),
    setFlaggedIds: vi.fn(),
    setQuestions: vi.fn(),
    setClaimError: vi.fn(),
  })

  it('reports a load failure and seeds nothing', () => {
    const set = setters()
    applyInitialLoad({ success: false, error: 'bad' }, 'u1', set)
    expect(set.setError).toHaveBeenCalledWith('bad')
    expect(set.setQuestions).not.toHaveBeenCalled()
  })

  it('seeds flags, claim error and questions on success', () => {
    const set = setters()
    applyInitialLoad(
      { success: true, questions: [], flaggedIds: ['f'], claimError: 'c' },
      'u1',
      set,
    )
    expect(set.setFlaggedIds).toHaveBeenCalledWith(['f'])
    expect(set.setClaimError).toHaveBeenCalledWith('c')
    expect(set.setQuestions).toHaveBeenCalledWith([])
  })

  it('clears the claim error when the load carried none', () => {
    const set = setters()
    applyInitialLoad({ success: true, questions: [], flaggedIds: [] }, 'u1', set)
    expect(set.setClaimError).toHaveBeenCalledWith(null)
  })
})
