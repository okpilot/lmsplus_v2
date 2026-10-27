import { describe, expect, it } from 'vitest'
import { mapResumeRpcError } from './resume-error-messages'

describe('mapResumeRpcError', () => {
  it('tells the student they are not enrolled in this course when resume is refused for enrolment', () => {
    expect(mapResumeRpcError('not_enrolled')).toBe('You are not enrolled in this course.')
  })
})
