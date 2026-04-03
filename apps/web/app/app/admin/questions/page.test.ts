import { describe, expect, it } from 'vitest'
import { parseFilters } from './page'

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000'

describe('parseFilters', () => {
  it('passes through a valid UUID for subjectId', () => {
    expect(parseFilters({ subjectId: VALID_UUID }).subjectId).toBe(VALID_UUID)
  })

  it('passes through a valid UUID for topicId', () => {
    expect(parseFilters({ topicId: VALID_UUID }).topicId).toBe(VALID_UUID)
  })

  it('passes through a valid UUID for subtopicId', () => {
    expect(parseFilters({ subtopicId: VALID_UUID }).subtopicId).toBe(VALID_UUID)
  })

  it('rejects non-UUID string for subjectId', () => {
    expect(parseFilters({ subjectId: 'not-a-uuid' }).subjectId).toBeUndefined()
  })

  it('rejects non-UUID string for topicId', () => {
    expect(parseFilters({ topicId: '123' }).topicId).toBeUndefined()
  })

  it('rejects non-UUID string for subtopicId', () => {
    expect(parseFilters({ subtopicId: "'; DROP TABLE questions;--" }).subtopicId).toBeUndefined()
  })

  it('rejects array values for UUID params', () => {
    const result = parseFilters({
      subjectId: ['a', 'b'],
      topicId: ['c'],
      subtopicId: ['d'],
    })
    expect(result.subjectId).toBeUndefined()
    expect(result.topicId).toBeUndefined()
    expect(result.subtopicId).toBeUndefined()
  })

  it('returns undefined for missing UUID params', () => {
    const result = parseFilters({})
    expect(result.subjectId).toBeUndefined()
    expect(result.topicId).toBeUndefined()
    expect(result.subtopicId).toBeUndefined()
  })

  it('passes through valid difficulty values', () => {
    expect(parseFilters({ difficulty: 'easy' }).difficulty).toBe('easy')
    expect(parseFilters({ difficulty: 'medium' }).difficulty).toBe('medium')
    expect(parseFilters({ difficulty: 'hard' }).difficulty).toBe('hard')
  })

  it('rejects invalid difficulty values', () => {
    expect(parseFilters({ difficulty: 'extreme' }).difficulty).toBeUndefined()
  })

  it('passes through valid status values', () => {
    expect(parseFilters({ status: 'active' }).status).toBe('active')
    expect(parseFilters({ status: 'draft' }).status).toBe('draft')
  })

  it('rejects invalid status values', () => {
    expect(parseFilters({ status: 'archived' }).status).toBeUndefined()
  })

  it('trims search and passes through non-empty value', () => {
    expect(parseFilters({ search: '  QNH  ' }).search).toBe('QNH')
  })

  it('returns undefined for whitespace-only search', () => {
    expect(parseFilters({ search: '   ' }).search).toBeUndefined()
  })

  it('truncates search to 200 characters', () => {
    const longSearch = 'a'.repeat(300)
    expect(parseFilters({ search: longSearch }).search).toHaveLength(200)
  })

  it('returns undefined for array search param', () => {
    expect(parseFilters({ search: ['a', 'b'] }).search).toBeUndefined()
  })
})
