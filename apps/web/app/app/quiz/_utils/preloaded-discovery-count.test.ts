import { describe, expect, it } from 'vitest'
import { findPreloadedCount } from './preloaded-discovery-count'

const COUNTS = { s1: { count: 7, byTopic: { t1: 7 }, bySubtopic: {} } }

const DEFAULTS = {
  subjectId: 's1',
  filters: [] as string[],
  calcMode: 'all' as const,
  imageMode: 'all' as const,
  questionType: 'multiple_choice' as const,
}

describe('findPreloadedCount', () => {
  it('returns the subject counts for the Discovery defaults', () => {
    expect(findPreloadedCount(COUNTS, DEFAULTS)).toEqual(COUNTS.s1)
  })

  it('returns null when nothing was preloaded', () => {
    expect(findPreloadedCount(undefined, DEFAULTS)).toBeNull()
  })

  it('returns null for a subject missing from the preload', () => {
    expect(findPreloadedCount(COUNTS, { ...DEFAULTS, subjectId: 's2' })).toBeNull()
  })

  it('returns null when a student filter is active', () => {
    expect(findPreloadedCount(COUNTS, { ...DEFAULTS, filters: ['unseen'] })).toBeNull()
  })

  it.each([
    ['calculator mode', { calcMode: 'only' as const }],
    ['image mode', { imageMode: 'exclude' as const }],
  ])('returns null when %s restricts the pool', (_label, override) => {
    expect(findPreloadedCount(COUNTS, { ...DEFAULTS, ...override })).toBeNull()
  })

  it('returns null when the count is not restricted to multiple choice', () => {
    expect(findPreloadedCount(COUNTS, { ...DEFAULTS, questionType: undefined })).toBeNull()
  })
})
