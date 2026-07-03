import { describe, expect, it } from 'vitest'
import { mapResumeRpcError } from './resume-helpers'

describe('mapResumeRpcError', () => {
  it('tells the user to resolve their other active session when one is already active', () => {
    expect(mapResumeRpcError('another_session_active')).toMatch(/active session/i)
  })

  it('tells the user the saved questions are no longer available when the pool is invalid', () => {
    expect(mapResumeRpcError('invalid_question_ids')).toMatch(/no longer available/i)
  })

  it('tells the user the saved questions are no longer available when none remain', () => {
    expect(mapResumeRpcError('no_questions_provided')).toMatch(/no longer available/i)
  })

  it('returns a generic retry message for an unrecognized error', () => {
    expect(mapResumeRpcError('some_unexpected_db_error')).toMatch(/failed to resume/i)
  })

  it('returns a generic retry message when no error is given', () => {
    expect(mapResumeRpcError(undefined)).toMatch(/failed to resume/i)
  })
})
