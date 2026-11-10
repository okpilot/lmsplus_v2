import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockRouter } from '@/lib/test-support/mock-router'
import type { DraftAnswer } from '../../types'

const {
  mockSubmit,
  mockSave,
  mockDiscard,
  mockWhenQueueIdle,
  mockIsTakenOver,
  mockGetStatus,
  mockResend,
} = vi.hoisted(() => ({
  mockSubmit: vi.fn(),
  mockSave: vi.fn(),
  mockDiscard: vi.fn(),
  mockWhenQueueIdle: vi.fn(),
  mockIsTakenOver: vi.fn(),
  mockGetStatus: vi.fn(),
  mockResend: vi.fn(),
}))

vi.mock('./quiz-submit', () => ({
  handleSubmitSession: (...a: unknown[]) => mockSubmit(...a),
  handleSaveSession: (...a: unknown[]) => mockSave(...a),
  handleDiscardSession: (...a: unknown[]) => mockDiscard(...a),
}))
vi.mock('../_utils/with-reconnect', () => ({ whenQueueIdle: () => mockWhenQueueIdle() }))
vi.mock('../_utils/session-takeover', () => ({
  isTakenOver: (...a: unknown[]) => mockIsTakenOver(...a),
}))
vi.mock('../_utils/connection-state', () => ({ getConnectionStatus: () => mockGetStatus() }))
vi.mock('../_utils/progress-sync-saves', () => ({
  resendUnsavedAnswers: (...a: unknown[]) => mockResend(...a),
}))

import {
  buildHandleDiscard,
  buildHandleSave,
  buildHandleSubmit,
  QUEUE_IDLE_TIMEOUT_MS,
} from './quiz-submit-handlers'

const UNSAVED = 'Some answers have not saved yet. Check your connection and try again.'

// Resolves whether or not `run` has settled, so a hung wait fails by assertion, not timeout.
async function settle(run: Promise<unknown>) {
  await Promise.race([run, Promise.resolve()])
  await Promise.resolve()
}

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

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  mockWhenQueueIdle.mockResolvedValue(undefined)
  mockSubmit.mockResolvedValue(undefined)
  mockSave.mockResolvedValue(undefined)
  mockDiscard.mockResolvedValue(undefined)
  mockIsTakenOver.mockReturnValue(false)
  mockGetStatus.mockReturnValue('ok')
  mockResend.mockResolvedValue(true)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('queued-save wait is bounded', () => {
  it('bounds the whole-queue wait at 15 seconds', () => {
    expect(QUEUE_IDLE_TIMEOUT_MS).toBe(15_000)
  })

  it('stops a stalled submit at the bound: error shown, submitting cleared, finish never called', async () => {
    openGate()
    const deps = submitDeps()
    const run = buildHandleSubmit(deps)()
    await vi.advanceTimersByTimeAsync(QUEUE_IDLE_TIMEOUT_MS - 1)
    expect(deps.setError).not.toHaveBeenCalledWith(UNSAVED)
    await vi.advanceTimersByTimeAsync(1)
    await settle(run)
    expect(deps.setError).toHaveBeenLastCalledWith(UNSAVED)
    expect(deps.setPendingAction).toHaveBeenLastCalledWith(null)
    expect(mockSubmit).not.toHaveBeenCalled()
  })

  it('stops a stalled save-for-later at the bound without calling the save action', async () => {
    openGate()
    const deps = baseDeps()
    const run = buildHandleSave(deps)()
    await vi.advanceTimersByTimeAsync(QUEUE_IDLE_TIMEOUT_MS)
    await settle(run)
    expect(deps.setError).toHaveBeenLastCalledWith(UNSAVED)
    expect(deps.setPendingAction).toHaveBeenLastCalledWith(null)
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('stops a stalled discard at the bound without calling the discard action', async () => {
    openGate()
    const deps = baseDeps()
    const run = buildHandleDiscard(deps)()
    await vi.advanceTimersByTimeAsync(QUEUE_IDLE_TIMEOUT_MS)
    await settle(run)
    expect(deps.setError).toHaveBeenLastCalledWith(UNSAVED)
    expect(deps.setPendingAction).toHaveBeenLastCalledWith(null)
    expect(mockDiscard).not.toHaveBeenCalled()
  })

  it('accepts a retry after the bound released the in-flight guard', async () => {
    openGate()
    const deps = submitDeps()
    const handleSubmit = buildHandleSubmit(deps)
    const first = handleSubmit()
    await vi.advanceTimersByTimeAsync(QUEUE_IDLE_TIMEOUT_MS)
    await settle(first)
    expect(deps.inFlight.current).toBe(false)
    mockWhenQueueIdle.mockResolvedValue(undefined)
    await handleSubmit()
    expect(mockSubmit).toHaveBeenCalledTimes(1)
  })

  it('shows the error at 15 s for a queue that settles at 20 s, and a later submit proceeds', async () => {
    const gate = openGate()
    const deps = submitDeps()
    const handleSubmit = buildHandleSubmit(deps)
    const first = handleSubmit()
    await vi.advanceTimersByTimeAsync(QUEUE_IDLE_TIMEOUT_MS)
    await settle(first)
    expect(deps.setError).toHaveBeenLastCalledWith(UNSAVED)
    await vi.advanceTimersByTimeAsync(5_000)
    gate.open()
    expect(mockSubmit).not.toHaveBeenCalled()
    mockWhenQueueIdle.mockResolvedValue(undefined)
    await handleSubmit()
    expect(mockSubmit).toHaveBeenCalledTimes(1)
  })

  it('shows no error at the bound when the session was taken over, and still does not submit', async () => {
    openGate()
    mockIsTakenOver.mockReturnValue(true)
    const deps = submitDeps()
    const run = buildHandleSubmit(deps)()
    await vi.advanceTimersByTimeAsync(QUEUE_IDLE_TIMEOUT_MS)
    await settle(run)
    expect(deps.setError).not.toHaveBeenCalledWith(UNSAVED)
    expect(deps.setPendingAction).toHaveBeenLastCalledWith(null)
    expect(mockSubmit).not.toHaveBeenCalled()
  })

  it('shows no error at the bound when signed out, and still does not save', async () => {
    openGate()
    mockGetStatus.mockReturnValue('signed-out')
    const deps = baseDeps()
    const run = buildHandleSave(deps)()
    await vi.advanceTimersByTimeAsync(QUEUE_IDLE_TIMEOUT_MS)
    await settle(run)
    expect(deps.setError).not.toHaveBeenCalledWith(UNSAVED)
    expect(deps.setPendingAction).toHaveBeenLastCalledWith(null)
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('proceeds without error and clears the timer when the queue idles before the bound', async () => {
    const gate = openGate()
    const deps = submitDeps()
    const run = buildHandleSubmit(deps)()
    await vi.advanceTimersByTimeAsync(QUEUE_IDLE_TIMEOUT_MS - 1000)
    gate.open()
    await run
    expect(mockSubmit).toHaveBeenCalledTimes(1)
    expect(deps.setError).not.toHaveBeenCalledWith(UNSAVED)
    expect(vi.getTimerCount()).toBe(0)
  })
})
