import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionQuestion } from '@/app/app/_types/session'
import { createMockRouter } from '@/lib/test-support/mock-router'
import type { DraftAnswer } from '../../types'

const { mockSubmit, mockSave, mockDiscard, mockWhenQueueIdle } = vi.hoisted(() => ({
  mockSubmit: vi.fn(),
  mockSave: vi.fn(),
  mockDiscard: vi.fn(),
  mockWhenQueueIdle: vi.fn(),
}))

vi.mock('./quiz-submit-vfr-rt', () => ({ handleSubmitVfrRtExamSession: vi.fn() }))
vi.mock('./quiz-submit', () => ({
  handleSubmitSession: (...a: unknown[]) => mockSubmit(...a),
  handleSaveSession: (...a: unknown[]) => mockSave(...a),
  handleDiscardSession: (...a: unknown[]) => mockDiscard(...a),
}))
vi.mock('../_utils/with-reconnect', () => ({ whenQueueIdle: () => mockWhenQueueIdle() }))

import { buildHandleDiscard, buildHandleSave, buildHandleSubmit } from './quiz-submit-handlers'

function openGate() {
  const gate: { open: () => void } = { open: () => {} }
  mockWhenQueueIdle.mockReturnValue(
    new Promise<void>((resolve) => {
      gate.open = resolve
    }),
  )
  return gate
}

function baseDeps() {
  return {
    userId: 'u',
    sessionId: 's',
    router: createMockRouter(),
    draftId: undefined,
    setPendingAction: vi.fn(),
    setError: vi.fn(),
    submitted: { current: false },
    inFlight: { current: false },
  }
}

function submitDeps() {
  return {
    ...baseDeps(),
    answersRef: { current: new Map<string, DraftAnswer>() },
    pendingQuestionIdRef: { current: new Set<string>() },
    navFallbackTimer: { current: null as ReturnType<typeof setTimeout> | null },
    setShowFinishDialog: vi.fn(),
    questions: [] as SessionQuestion[],
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockWhenQueueIdle.mockResolvedValue(undefined)
  mockSubmit.mockResolvedValue(undefined)
  mockSave.mockResolvedValue(undefined)
  mockDiscard.mockResolvedValue(undefined)
})

describe('finish actions wait for queued saves', () => {
  it('holds the submit until queued saves have settled', async () => {
    const gate = openGate()
    const run = buildHandleSubmit(submitDeps())()
    await Promise.resolve()
    expect(mockSubmit).not.toHaveBeenCalled()
    gate.open()
    await run
    expect(mockSubmit).toHaveBeenCalledTimes(1)
  })

  it('shows the submit as in flight and clears the error while it waits', async () => {
    const gate = openGate()
    const deps = submitDeps()
    const run = buildHandleSubmit(deps)()
    expect(deps.setPendingAction).toHaveBeenCalledWith('submit')
    expect(deps.setError).toHaveBeenCalledWith(null)
    gate.open()
    await run
  })

  it('ignores a second submit tap while the first is waiting', async () => {
    const gate = openGate()
    const handleSubmit = buildHandleSubmit(submitDeps())
    const first = handleSubmit()
    await handleSubmit()
    gate.open()
    await first
    expect(mockSubmit).toHaveBeenCalledTimes(1)
  })

  it('submits an answer whose check settled during the wait but not one still pending', async () => {
    const gate = openGate()
    const deps = submitDeps()
    const answer = { selectedOptionId: 'o', responseTimeMs: 1 } as DraftAnswer
    deps.answersRef.current = new Map([
      ['settled', answer],
      ['stuck', answer],
    ])
    deps.pendingQuestionIdRef.current = new Set(['settled', 'stuck'])
    const run = buildHandleSubmit(deps)()
    await Promise.resolve()
    deps.pendingQuestionIdRef.current.delete('settled')
    gate.open()
    await run
    const submitted = mockSubmit.mock.calls[0]?.[0] as { answers: Map<string, DraftAnswer> }
    expect([...submitted.answers.keys()]).toEqual(['settled'])
  })

  it('holds save-for-later until queued saves have settled', async () => {
    const gate = openGate()
    const deps = baseDeps()
    const run = buildHandleSave(deps)()
    await Promise.resolve()
    expect(mockSave).not.toHaveBeenCalled()
    expect(deps.setPendingAction).toHaveBeenCalledWith('save')
    gate.open()
    await run
    expect(mockSave).toHaveBeenCalledTimes(1)
  })

  it('holds discard until queued saves have settled', async () => {
    const gate = openGate()
    const deps = baseDeps()
    const run = buildHandleDiscard(deps)()
    await Promise.resolve()
    expect(mockDiscard).not.toHaveBeenCalled()
    expect(deps.setPendingAction).toHaveBeenCalledWith('discard')
    gate.open()
    await run
    expect(mockDiscard).toHaveBeenCalledTimes(1)
  })
})
