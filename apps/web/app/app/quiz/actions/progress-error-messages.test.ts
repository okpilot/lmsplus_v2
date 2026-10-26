import { describe, expect, it } from 'vitest'
import {
  isDisplayableProgressError,
  isTakeoverError,
  mapProgressRpcError,
  PROGRESS_ERROR_MESSAGES,
} from './progress-error-messages'

describe('mapProgressRpcError', () => {
  it('tells the student the quiz is open elsewhere when another tab took over', () => {
    const msg = mapProgressRpcError('session_taken_over', 'fallback')
    expect(msg).toMatch(/another tab or device/i)
    expect(msg).toMatch(/reload this page/i)
  })

  it('tells the student a saved quiz must be resumed from saved quizzes', () => {
    const msg = mapProgressRpcError('session_saved', 'fallback')
    expect(msg).toMatch(/saved for later/i)
    expect(isDisplayableProgressError(msg)).toBe(true)
  })

  it('tells the student the saved-quiz cap has been reached', () => {
    const msg = mapProgressRpcError('saved_quiz_limit_reached', 'fallback')
    expect(msg).toMatch(/20 saved quizzes/i)
    expect(isDisplayableProgressError(msg)).toBe(true)
  })

  it('tells the student a quiz that is not saved cannot be resumed', () => {
    const msg = mapProgressRpcError('session_not_saved', 'fallback')
    expect(msg).toMatch(/not (in your )?saved/i)
    expect(msg).not.toBe(mapProgressRpcError('session_saved', 'fallback'))
    expect(isDisplayableProgressError(msg)).toBe(true)
  })

  it('tells the student another session is open when resuming a saved quiz', () => {
    const msg = mapProgressRpcError('another_session_active', 'fallback')
    expect(msg).toMatch(/active session/i)
    expect(isDisplayableProgressError(msg)).toBe(true)
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

  it('does not map a token embedded in a longer database message', () => {
    expect(mapProgressRpcError('ERROR: invalid_answer (P0001)', 'fb')).toBe('fb')
    expect(mapProgressRpcError('xx another_session_active', 'fb')).toBe('fb')
  })

  it('does not map the legacy session-not-found text with a suffix', () => {
    expect(
      mapProgressRpcError('session not found or not owned by this student — extra', 'fb'),
    ).toBe('fb')
  })

  it('maps a membership message with real ids to the not-in-session copy', () => {
    expect(
      mapProgressRpcError(
        'question 9b1c0000-0000-4000-a000-000000000001 does not belong to session 7a2d0000-0000-4000-a000-000000000002',
        'fb',
      ),
    ).toBe(PROGRESS_ERROR_MESSAGES.question_not_in_session)
  })

  it('does not map a membership-shaped message with a prefix', () => {
    expect(mapProgressRpcError('xx question abc does not belong to session def', 'fb')).toBe('fb')
  })

  it('maps both damaged-config texts to the same non-fallback copy', () => {
    const a = mapProgressRpcError('session config is malformed — question_ids not set', 'fb')
    const b = mapProgressRpcError('session_config_malformed', 'fb')
    expect(a).not.toBe('fb')
    expect(b).toBe(a)
  })

  it('tells the student they are not enrolled in the course', () => {
    expect(mapProgressRpcError('not_enrolled', 'fallback')).toBe(
      'You are not enrolled in this course.',
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

describe('isTakeoverError', () => {
  it('recognises only the takeover copy', () => {
    expect(isTakeoverError(PROGRESS_ERROR_MESSAGES.session_taken_over)).toBe(true)
    expect(isTakeoverError(PROGRESS_ERROR_MESSAGES.session_expired)).toBe(false)
    expect(isTakeoverError(undefined)).toBe(false)
  })
})
