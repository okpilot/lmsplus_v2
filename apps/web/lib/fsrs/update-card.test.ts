import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockUpsert } = vi.hoisted(() => ({
  mockUpsert: vi.fn(),
}))

vi.mock('@/lib/supabase-rpc', () => ({
  upsert: mockUpsert,
}))

// Controlled return values for FSRS helpers
const mockCreateEmptyCard = vi.fn()
const mockDbRowToCard = vi.fn()
const mockRatingFromAnswer = vi.fn()
const mockScheduleCard = vi.fn()
const mockStateToString = vi.fn()

vi.mock('@repo/db/fsrs', () => ({
  createEmptyCard: (...args: unknown[]) => mockCreateEmptyCard(...args),
  dbRowToCard: (...args: unknown[]) => mockDbRowToCard(...args),
  ratingFromAnswer: (...args: unknown[]) => mockRatingFromAnswer(...args),
  scheduleCard: (...args: unknown[]) => mockScheduleCard(...args),
  stateToString: (...args: unknown[]) => mockStateToString(...args),
}))

// ---- Subject under test ---------------------------------------------------

import { updateFsrsCard } from './update-card'

// ---- Helpers --------------------------------------------------------------

/** Build a fake Supabase chain that resolves maybeSingle() to a given value */
function buildSupabaseChain(maybeSingleReturn: unknown) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    returns: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(maybeSingleReturn),
  }
  return {
    from: vi.fn().mockReturnValue(chain),
    _chain: chain,
  }
}

const FAKE_CARD = { due: new Date(), stability: 1, difficulty: 5 }
const FAKE_NEXT_CARD = {
  due: new Date('2026-04-01T00:00:00Z'),
  stability: 2,
  difficulty: 4,
  elapsed_days: 1,
  scheduled_days: 3,
  reps: 1,
  lapses: 0,
  state: 1,
}
const FAKE_SCHEDULED = { card: FAKE_NEXT_CARD }
const EXISTING_ROW = {
  due: '2026-03-10T00:00:00Z',
  stability: 1.5,
  difficulty: 4.5,
  elapsed_days: 3,
  scheduled_days: 5,
  reps: 2,
  lapses: 0,
  state: 'review',
  last_review: '2026-03-08T00:00:00Z',
}

beforeEach(() => {
  vi.resetAllMocks()

  // Default FSRS mock chain
  mockCreateEmptyCard.mockReturnValue(FAKE_CARD)
  mockDbRowToCard.mockReturnValue(FAKE_CARD)
  mockRatingFromAnswer.mockReturnValue('good')
  mockScheduleCard.mockReturnValue(FAKE_SCHEDULED)
  mockStateToString.mockReturnValue('review')
  mockUpsert.mockResolvedValue(undefined)
})

// ---- Tests ----------------------------------------------------------------

describe('updateFsrsCard', () => {
  it('creates a new card from scratch when no existing card is found', async () => {
    const supabase = buildSupabaseChain({ data: null, error: null })

    await updateFsrsCard(supabase as never, 'user-1', 'question-1', true)

    expect(mockCreateEmptyCard).toHaveBeenCalledOnce()
    expect(mockDbRowToCard).not.toHaveBeenCalled()
  })

  it('converts the existing DB row when a card already exists', async () => {
    const supabase = buildSupabaseChain({ data: EXISTING_ROW, error: null })

    await updateFsrsCard(supabase as never, 'user-1', 'question-1', true)

    expect(mockDbRowToCard).toHaveBeenCalledWith(EXISTING_ROW)
    expect(mockCreateEmptyCard).not.toHaveBeenCalled()
  })

  it('passes isCorrect=true to ratingFromAnswer and schedules the card', async () => {
    const supabase = buildSupabaseChain({ data: null, error: null })

    await updateFsrsCard(supabase as never, 'user-1', 'question-1', true)

    expect(mockRatingFromAnswer).toHaveBeenCalledWith(true)
    expect(mockScheduleCard).toHaveBeenCalledWith(FAKE_CARD, 'good')
  })

  it('passes isCorrect=false to ratingFromAnswer for a wrong answer', async () => {
    mockRatingFromAnswer.mockReturnValue('again')
    const supabase = buildSupabaseChain({ data: null, error: null })

    await updateFsrsCard(supabase as never, 'user-1', 'question-2', false)

    expect(mockRatingFromAnswer).toHaveBeenCalledWith(false)
    expect(mockScheduleCard).toHaveBeenCalledWith(FAKE_CARD, 'again')
  })

  it('upserts scheduled card fields to fsrs_cards with onConflict key', async () => {
    const supabase = buildSupabaseChain({ data: null, error: null })

    await updateFsrsCard(supabase as never, 'user-42', 'question-99', true)

    expect(mockUpsert).toHaveBeenCalledOnce()
    const [, table, values, opts] = mockUpsert.mock.calls[0]!
    expect(table).toBe('fsrs_cards')
    expect(values.student_id).toBe('user-42')
    expect(values.question_id).toBe('question-99')
    expect(values.state).toBe('review')
    expect(opts).toEqual({ onConflict: 'student_id,question_id' })
  })

  it('includes a last_review ISO timestamp in the upserted values', async () => {
    const before = new Date()
    const supabase = buildSupabaseChain({ data: null, error: null })

    await updateFsrsCard(supabase as never, 'user-1', 'question-1', true)

    const [, , values] = mockUpsert.mock.calls[0]!
    const lastReview = new Date(values.last_review as string)
    expect(lastReview.getTime()).toBeGreaterThanOrEqual(before.getTime())
  })

  it('returns early without calling upsert when maybeSingle returns an error', async () => {
    const supabase = buildSupabaseChain({
      data: null,
      error: { message: 'permission denied for table fsrs_cards' },
    })

    await updateFsrsCard(supabase as never, 'user-1', 'question-1', true)

    expect(mockUpsert).not.toHaveBeenCalled()
    expect(mockScheduleCard).not.toHaveBeenCalled()
  })

  it('logs an error when the upsert call fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockUpsert.mockRejectedValue(new Error('connection timeout'))
    const supabase = buildSupabaseChain({ data: null, error: null })

    await updateFsrsCard(supabase as never, 'user-1', 'question-1', true)

    expect(consoleSpy).toHaveBeenCalledWith('FSRS card upsert failed:', expect.any(Error))
    consoleSpy.mockRestore()
  })

  it('queries fsrs_cards filtered by student_id and question_id', async () => {
    const supabase = buildSupabaseChain({ data: null, error: null })

    await updateFsrsCard(supabase as never, 'user-abc', 'q-xyz', true)

    expect(supabase.from).toHaveBeenCalledWith('fsrs_cards')
    expect(supabase._chain.eq).toHaveBeenCalledWith('student_id', 'user-abc')
    expect(supabase._chain.eq).toHaveBeenCalledWith('question_id', 'q-xyz')
  })
})
