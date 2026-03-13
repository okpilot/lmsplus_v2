import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockGetUser, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

// ---- Subject under test ---------------------------------------------------

import { checkAnswer } from './check-answer'

// ---- Fixtures -------------------------------------------------------------

const USER_ID = '00000000-0000-0000-0000-000000000001'
const QUESTION_ID = '00000000-0000-0000-0000-000000000011'
const CORRECT_OPTION_ID = 'opt-correct'
const WRONG_OPTION_ID = 'opt-wrong'

const QUESTION_ROW = {
  options: [
    { id: CORRECT_OPTION_ID, correct: true },
    { id: WRONG_OPTION_ID, correct: false },
  ],
  explanation_text: 'Because lift equals weight in level flight.',
  explanation_image_url: null,
}

// ---- Helpers --------------------------------------------------------------

function buildChain(data: unknown, error: unknown = null) {
  const terminal = { data, error }
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnValue(terminal),
  }
  return chain
}

function setupAuthenticatedUser() {
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
}

function setupUnauthenticated() {
  mockGetUser.mockResolvedValue({ data: { user: null } })
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- checkAnswer ----------------------------------------------------------

describe('checkAnswer', () => {
  it('returns failure when user is not authenticated', async () => {
    setupUnauthenticated()
    const result = await checkAnswer({
      questionId: QUESTION_ID,
      selectedOptionId: CORRECT_OPTION_ID,
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Not authenticated')
  })

  it('throws a ZodError when questionId is not a valid UUID', async () => {
    setupAuthenticatedUser()
    await expect(
      checkAnswer({ questionId: 'not-a-uuid', selectedOptionId: CORRECT_OPTION_ID }),
    ).rejects.toThrow()
  })

  it('throws a ZodError when selectedOptionId is an empty string', async () => {
    setupAuthenticatedUser()
    await expect(checkAnswer({ questionId: QUESTION_ID, selectedOptionId: '' })).rejects.toThrow()
  })

  it('throws a ZodError when raw input is missing required fields', async () => {
    setupAuthenticatedUser()
    await expect(checkAnswer({})).rejects.toThrow()
  })

  it('returns failure when question is not found in the database', async () => {
    setupAuthenticatedUser()
    mockFrom.mockReturnValue(buildChain(null, { message: 'PGRST116' }))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await checkAnswer({
      questionId: QUESTION_ID,
      selectedOptionId: CORRECT_OPTION_ID,
    })

    consoleSpy.mockRestore()
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Question not found')
  })

  it('returns failure when data is null with no error', async () => {
    setupAuthenticatedUser()
    mockFrom.mockReturnValue(buildChain(null, null))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await checkAnswer({
      questionId: QUESTION_ID,
      selectedOptionId: CORRECT_OPTION_ID,
    })

    consoleSpy.mockRestore()
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Question not found')
  })

  it('returns failure when question has no correct option', async () => {
    setupAuthenticatedUser()
    const noCorrectRow = {
      options: [
        { id: 'opt-a', correct: false },
        { id: 'opt-b', correct: false },
      ],
      explanation_text: null,
      explanation_image_url: null,
    }
    mockFrom.mockReturnValue(buildChain(noCorrectRow))

    const result = await checkAnswer({ questionId: QUESTION_ID, selectedOptionId: 'opt-a' })

    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('No correct option found')
  })

  it('returns isCorrect true when selectedOptionId matches the correct option', async () => {
    setupAuthenticatedUser()
    mockFrom.mockReturnValue(buildChain(QUESTION_ROW))

    const result = await checkAnswer({
      questionId: QUESTION_ID,
      selectedOptionId: CORRECT_OPTION_ID,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.isCorrect).toBe(true)
    expect(result.correctOptionId).toBe(CORRECT_OPTION_ID)
  })

  it('returns isCorrect false when selectedOptionId does not match the correct option', async () => {
    setupAuthenticatedUser()
    mockFrom.mockReturnValue(buildChain(QUESTION_ROW))

    const result = await checkAnswer({ questionId: QUESTION_ID, selectedOptionId: WRONG_OPTION_ID })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.isCorrect).toBe(false)
    expect(result.correctOptionId).toBe(CORRECT_OPTION_ID)
  })

  it('includes explanation text and image URL in a successful result', async () => {
    setupAuthenticatedUser()
    const rowWithImage = {
      ...QUESTION_ROW,
      explanation_text: 'Bernoulli explains lift.',
      explanation_image_url: 'https://cdn.example.com/lift-diagram.png',
    }
    mockFrom.mockReturnValue(buildChain(rowWithImage))

    const result = await checkAnswer({
      questionId: QUESTION_ID,
      selectedOptionId: CORRECT_OPTION_ID,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.explanationText).toBe('Bernoulli explains lift.')
    expect(result.explanationImageUrl).toBe('https://cdn.example.com/lift-diagram.png')
  })

  it('returns null explanation fields when question has no explanation', async () => {
    setupAuthenticatedUser()
    const rowNoExplanation = {
      ...QUESTION_ROW,
      explanation_text: null,
      explanation_image_url: null,
    }
    mockFrom.mockReturnValue(buildChain(rowNoExplanation))

    const result = await checkAnswer({
      questionId: QUESTION_ID,
      selectedOptionId: CORRECT_OPTION_ID,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.explanationText).toBeNull()
    expect(result.explanationImageUrl).toBeNull()
  })

  it('queries only active (non-deleted) questions via the deleted_at IS NULL filter', async () => {
    setupAuthenticatedUser()
    const chain = buildChain(QUESTION_ROW)
    mockFrom.mockReturnValue(chain)

    await checkAnswer({ questionId: QUESTION_ID, selectedOptionId: CORRECT_OPTION_ID })

    expect(mockFrom).toHaveBeenCalledWith('questions')
    expect(chain.is as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(expect.anything(), null)
  })
})
