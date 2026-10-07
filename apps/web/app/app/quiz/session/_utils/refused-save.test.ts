import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mapProgressRpcError } from '../../actions/progress-error-messages'
import { _resetConnectionState, getConnectionStatus, setConnectionStatus } from './connection-state'
import {
  _resetRefusedSave,
  isTransientRefusal,
  refusedAnswerHold,
  retryRefusedSave,
  skipRefusedSave,
} from './refused-save'

const GENERIC = 'Could not save progress'
const value = (v: { success: boolean; error?: string }) => ({ kind: 'value' as const, value: v })
const refusal = (token: string) => ({
  success: false as const,
  error: mapProgressRpcError(token, GENERIC),
})

async function exhaustRetries(hold: ReturnType<typeof refusedAnswerHold>) {
  for (const delay of [2000, 4000]) {
    const p = hold(value(refusal('x')))
    await vi.advanceTimersByTimeAsync(delay)
    await p
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  _resetConnectionState()
  _resetRefusedSave()
})

describe('isTransientRefusal over the save_quiz_answer error tokens', () => {
  it.each([
    ['invalid_answer', false],
    ['question_not_in_session', false],
    ['invalid_time_spent', false],
    ['session_ended', false],
    ['session_taken_over', false],
    ['not_authenticated', false],
    ['something_unmapped', true],
  ])('treats %s as transient: %s', (token, expected) => {
    expect(isTransientRefusal(refusal(token).error)).toBe(expected)
  })

  it('does not retry a failed input parse', () => {
    expect(isTransientRefusal('Invalid input')).toBe(false)
  })
})

describe('refusedAnswerHold', () => {
  it('lets a saved answer through without waiting', async () => {
    await expect(refusedAnswerHold()(value({ success: true }))).resolves.toBe('done')
    expect(getConnectionStatus()).toBe('ok')
  })

  it('ends the job on a session-wide refusal without holding', async () => {
    await expect(refusedAnswerHold()(value(refusal('session_ended')))).resolves.toBe('done')
    expect(getConnectionStatus()).toBe('ok')
  })

  it('retries a transient refusal after 2 s and again after 4 s, then holds', async () => {
    const hold = refusedAnswerHold()
    const first = hold(value(refusal('x')))
    await vi.advanceTimersByTimeAsync(1999)
    expect(getConnectionStatus()).toBe('ok')
    await vi.advanceTimersByTimeAsync(1)
    await expect(first).resolves.toBe('retry')
    const second = hold(value(refusal('x')))
    await vi.advanceTimersByTimeAsync(3999)
    let settled = false
    void second.then(() => {
      settled = true
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await expect(second).resolves.toBe('retry')
    const third = hold(value(refusal('x')))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(getConnectionStatus()).toBe('save-failed')
    retryRefusedSave()
    await expect(third).resolves.toBe('retry')
  })

  it('does not hold a per-answer refusal', async () => {
    const hold = refusedAnswerHold()
    await expect(hold(value(refusal('invalid_answer')))).resolves.toBe('done')
    expect(getConnectionStatus()).toBe('ok')
    expect(hold.skipped).toBe(false)
  })

  it('retries a thrown save after 2 s and 4 s, then holds', async () => {
    const hold = refusedAnswerHold()
    const first = hold({ kind: 'thrown' })
    await vi.advanceTimersByTimeAsync(2000)
    await expect(first).resolves.toBe('retry')
    const second = hold({ kind: 'thrown' })
    await vi.advanceTimersByTimeAsync(4000)
    await expect(second).resolves.toBe('retry')
    const third = hold({ kind: 'thrown' })
    await vi.advanceTimersByTimeAsync(0)
    expect(getConnectionStatus()).toBe('save-failed')
    skipRefusedSave()
    await expect(third).resolves.toBe('done')
    expect(hold.skipped).toBe(true)
  })

  it('holds one choice at a time when two saves are held in turn', async () => {
    const holdA = refusedAnswerHold()
    const holdB = refusedAnswerHold()
    for (const h of [holdA, holdB]) {
      for (const d of [2000, 4000]) {
        const p = h({ kind: 'thrown' })
        await vi.advanceTimersByTimeAsync(d)
        await p
      }
    }
    const a = holdA({ kind: 'thrown' })
    await vi.advanceTimersByTimeAsync(0)
    skipRefusedSave()
    await expect(a).resolves.toBe('done')
    const b = holdB({ kind: 'thrown' })
    await vi.advanceTimersByTimeAsync(0)
    expect(getConnectionStatus()).toBe('save-failed')
    retryRefusedSave()
    await expect(b).resolves.toBe('retry')
    expect(holdA.skipped).toBe(true)
    expect(holdB.skipped).toBe(false)
  })

  it('shows Still saving while resending after the student chooses Try again', async () => {
    const hold = refusedAnswerHold()
    await exhaustRetries(hold)
    const pending = hold(value(refusal('x')))
    await vi.advanceTimersByTimeAsync(0)
    retryRefusedSave()
    await expect(pending).resolves.toBe('retry')
    expect(getConnectionStatus()).toBe('slow')
  })

  it('replaces a stale offline banner with Still saving while an automatic resend waits', async () => {
    setConnectionStatus('offline')
    const pending = refusedAnswerHold()({ kind: 'thrown' })
    await vi.advanceTimersByTimeAsync(0)
    expect(getConnectionStatus()).toBe('slow')
    await vi.advanceTimersByTimeAsync(2000)
    await expect(pending).resolves.toBe('retry')
  })

  it('leaves a clear status alone while an automatic resend waits', async () => {
    const pending = refusedAnswerHold()({ kind: 'thrown' })
    await vi.advanceTimersByTimeAsync(0)
    expect(getConnectionStatus()).toBe('ok')
    await vi.advanceTimersByTimeAsync(2000)
    await pending
  })

  it('clears the block and ends the job when the student chooses Continue without it', async () => {
    const hold = refusedAnswerHold()
    await exhaustRetries(hold)
    const pending = hold(value(refusal('x')))
    await vi.advanceTimersByTimeAsync(0)
    skipRefusedSave()
    await expect(pending).resolves.toBe('done')
    expect(getConnectionStatus()).toBe('ok')
  })

  it('holds again at once after Try again when a transient refusal persists past the retries', async () => {
    const hold = refusedAnswerHold()
    for (const delay of [2000, 4000]) {
      const p = hold(value(refusal('x')))
      await vi.advanceTimersByTimeAsync(delay)
      await p
    }
    const held = hold(value(refusal('x')))
    await vi.advanceTimersByTimeAsync(0)
    retryRefusedSave()
    await held
    const again = hold(value(refusal('x')))
    await vi.advanceTimersByTimeAsync(0)
    expect(getConnectionStatus()).toBe('save-failed')
    skipRefusedSave()
    await expect(again).resolves.toBe('done')
  })

  it('records that the student continued without a held save', async () => {
    const hold = refusedAnswerHold()
    expect(hold.skipped).toBe(false)
    await exhaustRetries(hold)
    const pending = hold(value(refusal('x')))
    await vi.advanceTimersByTimeAsync(0)
    skipRefusedSave()
    await pending
    expect(hold.skipped).toBe(true)
  })

  it('does not record a skip for Try again, a session-wide refusal or a saved answer', async () => {
    const hold = refusedAnswerHold()
    await exhaustRetries(hold)
    const held = hold(value(refusal('x')))
    await vi.advanceTimersByTimeAsync(0)
    retryRefusedSave()
    await held
    await hold(value(refusal('session_ended')))
    await hold(value({ success: true }))
    expect(hold.skipped).toBe(false)
  })

  it('ignores retry and skip when nothing is held', () => {
    expect(() => {
      retryRefusedSave()
      skipRefusedSave()
    }).not.toThrow()
  })
})
