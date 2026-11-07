import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockRouter } from '@/lib/test-support/mock-router'
import type { DraftAnswer } from '../../types'
import { _resetRunnerExit, resetRunnerExit, runnerToken } from '../_utils/runner-exit'

const { mockSubmit, mockSave, mockDiscard, mockWhenQueueIdle } = vi.hoisted(() => ({
  mockSubmit: vi.fn(),
  mockSave: vi.fn(),
  mockDiscard: vi.fn(),
  mockWhenQueueIdle: vi.fn(),
}))

vi.mock('./quiz-submit', () => ({
  handleSubmitSession: (...a: unknown[]) => mockSubmit(...a),
  handleSaveSession: (...a: unknown[]) => mockSave(...a),
  handleDiscardSession: (...a: unknown[]) => mockDiscard(...a),
}))
vi.mock('../_utils/with-reconnect', () => ({ whenQueueIdle: () => mockWhenQueueIdle() }))

import { buildHandleDiscard, buildHandleSave, buildHandleSubmit } from './quiz-submit-handlers'

function baseDeps() {
  return {
    userId: 'u',
    sessionId: 's',
    router: createMockRouter(),
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
    navFallbackTimer: { current: null as ReturnType<typeof setTimeout> | null },
    setShowFinishDialog: vi.fn(),
  }
}

function holdQueue() {
  const gate: { open: () => void } = { open: () => {} }
  mockWhenQueueIdle.mockReturnValue(
    new Promise<void>((resolve) => {
      gate.open = resolve
    }),
  )
  return gate
}

beforeEach(() => {
  vi.resetAllMocks()
  _resetRunnerExit()
  mockWhenQueueIdle.mockResolvedValue(undefined)
  mockSubmit.mockResolvedValue(undefined)
  mockSave.mockResolvedValue(undefined)
  mockDiscard.mockResolvedValue(undefined)
})

const PATHS = [
  ['submit', () => buildHandleSubmit(submitDeps()), mockSubmit],
  ['save', () => buildHandleSave(baseDeps()), mockSave],
  ['discard', () => buildHandleDiscard(baseDeps()), mockDiscard],
] as const

describe.each(PATHS)('%s handler runner token', (_name, build, mockSession) => {
  it('passes the token taken when the button was pressed, not after the queue wait', async () => {
    const gate = holdQueue()
    const tokenAtPress = runnerToken()
    const run = build()()
    resetRunnerExit()
    gate.open()
    await run
    const call = mockSession.mock.calls[0]?.[0] as { token?: number }
    expect(call.token).toBe(tokenAtPress)
  })

  it('passes a token that is still current when the runner stays mounted', async () => {
    await build()()
    const call = mockSession.mock.calls[0]?.[0] as { token?: number }
    expect(call.token).toBe(runnerToken())
  })
})
