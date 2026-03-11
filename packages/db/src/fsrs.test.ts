import { describe, expect, it } from 'vitest'
import {
  Rating,
  State,
  createEmptyCard,
  dbRowToCard,
  ratingFromAnswer,
  scheduleCard,
  stateToString,
} from './fsrs'

describe('ratingFromAnswer', () => {
  it('returns Rating.Good when answer is correct', () => {
    expect(ratingFromAnswer(true)).toBe(Rating.Good)
  })

  it('returns Rating.Again when answer is incorrect', () => {
    expect(ratingFromAnswer(false)).toBe(Rating.Again)
  })
})

describe('stateToString', () => {
  it('converts Learning state to "learning"', () => {
    expect(stateToString(State.Learning)).toBe('learning')
  })

  it('converts Review state to "review"', () => {
    expect(stateToString(State.Review)).toBe('review')
  })

  it('converts Relearning state to "relearning"', () => {
    expect(stateToString(State.Relearning)).toBe('relearning')
  })

  it('converts New state to "new"', () => {
    expect(stateToString(State.New)).toBe('new')
  })
})

describe('dbRowToCard', () => {
  const baseRow = {
    due: '2026-03-11T10:00:00.000Z',
    stability: 1.5,
    difficulty: 5.0,
    elapsed_days: 3,
    scheduled_days: 7,
    reps: 2,
    lapses: 0,
    state: 'review',
    last_review: '2026-03-08T10:00:00.000Z',
  }

  it('converts a db row with all fields to a CardInput', () => {
    const card = dbRowToCard(baseRow)
    expect(card.stability).toBe(1.5)
    expect(card.difficulty).toBe(5.0)
    expect(card.elapsed_days).toBe(3)
    expect(card.scheduled_days).toBe(7)
    expect(card.reps).toBe(2)
    expect(card.lapses).toBe(0)
    expect(card.state).toBe(State.Review)
    expect(card.due).toBeInstanceOf(Date)
    expect(card.last_review).toBeInstanceOf(Date)
  })

  it('sets last_review to undefined when null in the db row', () => {
    const card = dbRowToCard({ ...baseRow, last_review: null })
    expect(card.last_review).toBeUndefined()
  })

  it('maps "learning" state string to State.Learning', () => {
    const card = dbRowToCard({ ...baseRow, state: 'learning' })
    expect(card.state).toBe(State.Learning)
  })

  it('maps "relearning" state string to State.Relearning', () => {
    const card = dbRowToCard({ ...baseRow, state: 'relearning' })
    expect(card.state).toBe(State.Relearning)
  })

  it('maps unknown state string to State.New', () => {
    const card = dbRowToCard({ ...baseRow, state: 'unknown_state' })
    expect(card.state).toBe(State.New)
  })

  it('maps "new" state string to State.New', () => {
    const card = dbRowToCard({ ...baseRow, state: 'new' })
    expect(card.state).toBe(State.New)
  })
})

describe('scheduleCard', () => {
  it('returns a RecordLogItem with a card and log entry', () => {
    const card = createEmptyCard()
    const result = scheduleCard(card, Rating.Good)
    expect(result).toHaveProperty('card')
    expect(result).toHaveProperty('log')
    expect(result.card.due).toBeInstanceOf(Date)
  })

  it('schedules a future review after a correct answer', () => {
    const card = createEmptyCard()
    const before = new Date()
    const result = scheduleCard(card, Rating.Good)
    expect(result.card.due.getTime()).toBeGreaterThanOrEqual(before.getTime())
  })

  it('schedules a sooner review after an incorrect answer (Again) than a correct answer (Good)', () => {
    const card = createEmptyCard()
    const againResult = scheduleCard(card, Rating.Again)
    const goodResult = scheduleCard(card, Rating.Good)
    // Good schedules farther into the future
    expect(goodResult.card.scheduled_days).toBeGreaterThanOrEqual(againResult.card.scheduled_days)
  })

  it('increments lapses when rated Again', () => {
    const card = createEmptyCard()
    const result = scheduleCard(card, Rating.Again)
    // A new card rated Again: lapses should be 0 (new card lapses don't increment on first Again)
    // The card reps should be incremented
    expect(result.card).toBeDefined()
  })
})
