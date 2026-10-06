import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mapProgressRpcError } from '../../actions/progress-error-messages'
import { _resetConnectionState, getConnectionStatus } from './connection-state'
import {
  _resetRefusedSave,
  refusalClass,
  refusedAnswerHold,
  retryRefusedSave,
  skipRefusedSave,
} from './refused-save'

const GENERIC = 'Could not save progress'
const refusal = (token: string) => ({
  success: false as const,
  error: mapProgressRpcError(token, GENERIC),
})

beforeEach(() => {
  vi.useFakeTimers()
  _resetConnectionState()
  _resetRefusedSave()
})

describe('refusalClass over the save_quiz_answer error tokens', () => {
  it.each([
    ['invalid_answer', 'per-answer'],
    ['question_not_in_session', 'per-answer'],
    ['invalid_time_spent', 'per-answer'],
    ['session_config_malformed', 'session-wide'],
    ['not_authenticated', 'session-wide'],
    ['user_not_found_or_inactive', 'session-wide'],
    ['session_not_found', 'session-wide'],
    ['session_discarded', 'session-wide'],
    ['session_ended', 'session-wide'],
    ['session_saved', 'session-wide'],
    ['unsupported_session_mode', 'session-wide'],
    ['session_expired', 'session-wide'],
    ['session_taken_over', 'session-wide'],
    ['something_unmapped', 'transient'],
  ])('classifies %s as %s', (token, expected) => {
    expect(refusalClass(refusal(token).error)).toBe(expected)
  })

  it('classifies a failed input parse as per-answer', () => {
    expect(refusalClass('Invalid input')).toBe('per-answer')
  })
})

describe('refusedAnswerHold', () => {
  it('lets a saved answer through without waiting', async () => {
    await expect(refusedAnswerHold()({ success: true })).resolves.toBe('done')
    expect(getConnectionStatus()).toBe('ok')
  })

  it('ends the job on a session-wide refusal without holding', async () => {
    await expect(refusedAnswerHold()(refusal('session_ended'))).resolves.toBe('done')
    expect(getConnectionStatus()).toBe('ok')
  })

  it('retries a transient refusal after 2 s and again after 4 s, then holds', async () => {
    const hold = refusedAnswerHold()
    const first = hold(refusal('x'))
    await vi.advanceTimersByTimeAsync(1999)
    expect(getConnectionStatus()).toBe('ok')
    await vi.advanceTimersByTimeAsync(1)
    await expect(first).resolves.toBe('retry')
    const second = hold(refusal('x'))
    await vi.advanceTimersByTimeAsync(3999)
    let settled = false
    void second.then(() => {
      settled = true
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await expect(second).resolves.toBe('retry')
    const third = hold(refusal('x'))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(getConnectionStatus()).toBe('save-failed')
    retryRefusedSave()
    await expect(third).resolves.toBe('retry')
  })

  it('holds at once on a per-answer refusal', async () => {
    const pending = refusedAnswerHold()(refusal('invalid_answer'))
    await vi.advanceTimersByTimeAsync(0)
    expect(getConnectionStatus()).toBe('save-failed')
    skipRefusedSave()
    await expect(pending).resolves.toBe('done')
  })

  it('clears the block and resends when the student chooses Try again', async () => {
    const pending = refusedAnswerHold()(refusal('question_not_in_session'))
    await vi.advanceTimersByTimeAsync(0)
    retryRefusedSave()
    await expect(pending).resolves.toBe('retry')
    expect(getConnectionStatus()).toBe('ok')
  })

  it('clears the block and ends the job when the student chooses Continue without it', async () => {
    const pending = refusedAnswerHold()(refusal('invalid_time_spent'))
    await vi.advanceTimersByTimeAsync(0)
    skipRefusedSave()
    await expect(pending).resolves.toBe('done')
    expect(getConnectionStatus()).toBe('ok')
  })

  it('holds again at once after Try again when a transient refusal persists past the retries', async () => {
    const hold = refusedAnswerHold()
    for (const delay of [2000, 4000]) {
      const p = hold(refusal('x'))
      await vi.advanceTimersByTimeAsync(delay)
      await p
    }
    const held = hold(refusal('x'))
    await vi.advanceTimersByTimeAsync(0)
    retryRefusedSave()
    await held
    const again = hold(refusal('x'))
    await vi.advanceTimersByTimeAsync(0)
    expect(getConnectionStatus()).toBe('save-failed')
    skipRefusedSave()
    await expect(again).resolves.toBe('done')
  })

  it('records that the student continued without a held save', async () => {
    const hold = refusedAnswerHold()
    expect(hold.skipped).toBe(false)
    const pending = hold(refusal('invalid_answer'))
    await vi.advanceTimersByTimeAsync(0)
    skipRefusedSave()
    await pending
    expect(hold.skipped).toBe(true)
  })

  it('does not record a skip for Try again, a session-wide refusal or a saved answer', async () => {
    const hold = refusedAnswerHold()
    const held = hold(refusal('invalid_answer'))
    await vi.advanceTimersByTimeAsync(0)
    retryRefusedSave()
    await held
    await hold(refusal('session_ended'))
    await hold({ success: true })
    expect(hold.skipped).toBe(false)
  })

  it('ignores retry and skip when nothing is held', () => {
    expect(() => {
      retryRefusedSave()
      skipRefusedSave()
    }).not.toThrow()
  })
})
