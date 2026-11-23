import { describe, expect, it } from 'vitest'
import { START_INTERNAL_EXAM_ERROR_MESSAGES } from './_error-messages'

describe('START_INTERNAL_EXAM_ERROR_MESSAGES', () => {
  it('tells the student they are not enrolled in this course', () => {
    expect(START_INTERNAL_EXAM_ERROR_MESSAGES.not_enrolled).toBe(
      'You are not enrolled in this course.',
    )
  })

  it('tells the student the exam is not open', () => {
    expect(START_INTERNAL_EXAM_ERROR_MESSAGES.sitting_not_open).toBe(
      'This exam is not open. Your invigilator will tell you when to start.',
    )
  })

  it('tells the student they have already passed this exam', () => {
    expect(START_INTERNAL_EXAM_ERROR_MESSAGES.already_passed).toBe(
      'You have already passed this exam.',
    )
  })
})
