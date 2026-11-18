import { describe, expect, it } from 'vitest'
import { START_INTERNAL_EXAM_ERROR_MESSAGES } from './_error-messages'

describe('START_INTERNAL_EXAM_ERROR_MESSAGES', () => {
  it('tells the student they are not enrolled in this course', () => {
    expect(START_INTERNAL_EXAM_ERROR_MESSAGES.not_enrolled).toBe(
      'You are not enrolled in this course.',
    )
  })

  it('tells the student the exam has not been opened yet', () => {
    expect(START_INTERNAL_EXAM_ERROR_MESSAGES.sitting_not_open).toBe(
      'This exam has not been opened yet. Your invigilator will tell you when to start.',
    )
  })

  it('tells the student to reload while an overdue attempt is finalised', () => {
    expect(START_INTERNAL_EXAM_ERROR_MESSAGES.overdue_attempt_pending).toBe(
      'Your previous attempt at this exam is still being finalised. Reload the page, then enter your code again.',
    )
  })

  it('tells the student they have already passed this exam', () => {
    expect(START_INTERNAL_EXAM_ERROR_MESSAGES.already_passed).toBe(
      'You have already passed this exam.',
    )
  })
})
