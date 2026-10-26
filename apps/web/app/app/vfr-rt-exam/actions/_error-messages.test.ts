import { describe, expect, it } from 'vitest'
import { START_VFR_RT_EXAM_ERROR_MESSAGES } from './_error-messages'

describe('START_VFR_RT_EXAM_ERROR_MESSAGES', () => {
  it('tells the student they are not enrolled in this course', () => {
    expect(START_VFR_RT_EXAM_ERROR_MESSAGES.not_enrolled).toBe(
      'You are not enrolled in this course.',
    )
  })
})
