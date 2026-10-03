import { describe, expect, it } from 'vitest'
import {
  isDisplayableProgressError,
  isTakeoverError,
  mapMembershipError,
  mapProgressRpcError,
  PROGRESS_ERROR_MESSAGES,
} from './progress-error-messages'

describe('mapProgressRpcError', () => {
  it('tells the student the quiz is open elsewhere when another tab took over', () => {
    const msg = mapProgressRpcError('session_taken_over', 'fallback')
    expect(msg).toMatch(/another tab or device/i)
    expect(msg).toMatch(/reload this page/i)
  })

  it('does not imply answers are lost when the time limit has passed', () => {
    const msg = mapProgressRpcError('session_expired', 'fallback')
    expect(msg).toMatch(/time limit/i)
    expect(msg).not.toMatch(/lost|discard|deleted/i)
  })

  it('maps the legacy spaced session-not-found string raised by the check RPCs', () => {
    expect(mapProgressRpcError('session not found or not owned by this student', 'fb')).toBe(
      PROGRESS_ERROR_MESSAGES.session_not_found,
    )
  })

  it('maps the legacy spaced membership string that embeds ids', () => {
    expect(mapProgressRpcError('question abc does not belong to session def', 'fb')).toBe(
      PROGRESS_ERROR_MESSAGES.question_not_in_session,
    )
  })

  it('maps a token embedded in a longer database message', () => {
    expect(mapProgressRpcError('ERROR: invalid_answer (P0001)', 'fb')).toBe(
      PROGRESS_ERROR_MESSAGES.invalid_answer,
    )
  })

  it.each(Object.keys(PROGRESS_ERROR_MESSAGES))('maps %s to its own copy', (key) => {
    expect(mapProgressRpcError(key, 'fb')).toBe(PROGRESS_ERROR_MESSAGES[key])
  })

  it('returns the fallback for an unrecognised error', () => {
    expect(mapProgressRpcError('connection reset by peer', 'Could not save progress')).toBe(
      'Could not save progress',
    )
  })

  it('returns the fallback when no message is given', () => {
    expect(mapProgressRpcError(undefined, 'Could not save progress')).toBe(
      'Could not save progress',
    )
  })

  // mapProgressRpcError matches via message.includes(key): an overlapping key would make
  // iteration order, not specificity, decide the mapping.
  it('keeps every error key free of being a substring of another key', () => {
    const keys = Object.keys(PROGRESS_ERROR_MESSAGES)
    for (const a of keys) {
      for (const b of keys) {
        if (a !== b) expect(b.includes(a)).toBe(false)
      }
    }
  })
})

describe('isDisplayableProgressError', () => {
  it('accepts mapped copy', () => {
    expect(isDisplayableProgressError(mapProgressRpcError('session_ended', 'fb'))).toBe(true)
  })

  it('rejects generic fallback copy', () => {
    expect(isDisplayableProgressError('Could not save progress')).toBe(false)
  })

  it('rejects a raw token', () => {
    expect(isDisplayableProgressError('session_taken_over')).toBe(false)
  })
})

describe('mapMembershipError', () => {
  it('wraps a membership message as an action failure', () => {
    expect(mapMembershipError('Session not found')).toEqual({
      success: false,
      error: 'Session not found',
    })
  })

  it('returns null when the membership check passed', () => {
    expect(mapMembershipError(null)).toBeNull()
  })
})

describe('isTakeoverError', () => {
  it('recognises only the takeover copy', () => {
    expect(isTakeoverError(PROGRESS_ERROR_MESSAGES.session_taken_over)).toBe(true)
    expect(isTakeoverError(PROGRESS_ERROR_MESSAGES.session_expired)).toBe(false)
    expect(isTakeoverError(undefined)).toBe(false)
  })
})
