import { describe, expect, it } from 'vitest'
import { getOverallMastery } from './overall-mastery'

const subject = (totalQuestions: number, answeredCorrectly: number) => ({
  totalQuestions,
  answeredCorrectly,
})

describe('getOverallMastery', () => {
  it('sums every subject into one rounded percentage', () => {
    expect(getOverallMastery([subject(50, 25), subject(30, 15)])).toEqual({
      percentage: 50,
      masteredCount: 40,
      totalQuestions: 80,
    })
  })

  it('reports zero for an empty syllabus', () => {
    expect(getOverallMastery([])).toEqual({ percentage: 0, masteredCount: 0, totalQuestions: 0 })
  })

  it('reports zero when no subject has questions', () => {
    expect(getOverallMastery([subject(0, 0)]).percentage).toBe(0)
  })

  it('clamps percentage and mastered count when orphan responses exceed the question total', () => {
    expect(getOverallMastery([subject(1, 3)])).toEqual({
      percentage: 100,
      masteredCount: 1,
      totalQuestions: 1,
    })
  })

  it('rounds to the nearest whole percent', () => {
    expect(getOverallMastery([subject(3, 1)]).percentage).toBe(33)
  })
})
