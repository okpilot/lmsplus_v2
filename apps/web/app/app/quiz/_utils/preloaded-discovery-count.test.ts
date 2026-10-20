import { describe, expect, it } from 'vitest'
import { findPreloadedCount, freshCounts, PRELOAD_COUNTS_TTL_MS } from './preloaded-discovery-count'

const NONE = { count: 7, byTopic: { t1: 7 }, bySubtopic: {} }
const UNSEEN = { count: 5, byTopic: { t1: 5 }, bySubtopic: {} }
const BOTH = { count: 1, byTopic: { t1: 1 }, bySubtopic: {} }
const COUNTS = { s1: { '': NONE, unseen: UNSEEN, 'flagged,incorrect': BOTH } }

const DEFAULTS = {
  subjectId: 's1',
  filters: [] as string[],
  calcMode: 'all' as const,
  imageMode: 'all' as const,
  questionType: 'multiple_choice' as const,
}

describe('findPreloadedCount', () => {
  it('returns the subject counts for the Discovery defaults', () => {
    expect(findPreloadedCount(COUNTS, DEFAULTS)).toEqual(NONE)
  })

  it('returns the counts of the active student filter set', () => {
    expect(findPreloadedCount(COUNTS, { ...DEFAULTS, filters: ['unseen'] })).toEqual(UNSEEN)
  })

  it('finds a combined filter set whatever order the filters were picked in', () => {
    expect(findPreloadedCount(COUNTS, { ...DEFAULTS, filters: ['incorrect', 'flagged'] })).toEqual(
      BOTH,
    )
    expect(findPreloadedCount(COUNTS, { ...DEFAULTS, filters: ['flagged', 'incorrect'] })).toEqual(
      BOTH,
    )
  })

  it('returns null when nothing was preloaded', () => {
    expect(findPreloadedCount(undefined, DEFAULTS)).toBeNull()
  })

  it('returns null for a subject missing from the preload', () => {
    expect(findPreloadedCount(COUNTS, { ...DEFAULTS, subjectId: 's2' })).toBeNull()
  })

  it('returns null for a filter set that was not preloaded', () => {
    expect(findPreloadedCount(COUNTS, { ...DEFAULTS, filters: ['flagged'] })).toBeNull()
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

describe('freshCounts', () => {
  const preload = { topicsBySubject: {}, discoveryCounts: COUNTS, loadedAt: 1_000 }

  it('returns the counts while they are younger than the TTL', () => {
    expect(freshCounts(preload, 1_000 + PRELOAD_COUNTS_TTL_MS)).toBe(COUNTS)
  })

  it('returns nothing once the counts are older than the TTL', () => {
    expect(freshCounts(preload, 1_000 + PRELOAD_COUNTS_TTL_MS + 1)).toBeUndefined()
  })

  it('returns nothing when no preload has arrived', () => {
    expect(freshCounts(null, 5)).toBeUndefined()
  })
})
