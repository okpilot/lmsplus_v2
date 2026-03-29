import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockRpc } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
}))

vi.mock('@/lib/supabase-rpc', () => ({
  rpc: mockRpc,
}))

const mockGetUser = vi.fn().mockResolvedValue({
  data: { user: { id: 'user-1' } },
})

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
  }),
}))

// ---- Subject under test ---------------------------------------------------

import { loadSessionQuestions } from './load-session-questions'

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
})

describe('loadSessionQuestions', () => {
  it('returns failure when user is not authenticated', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    const result = await loadSessionQuestions(['q1'])
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Not authenticated')
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns failure when getUser returns an auth error', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'token expired' },
    })
    const result = await loadSessionQuestions(['q1'])
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Not authenticated')
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns questions mapped from RPC data in the requested order', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: 'q2',
          question_text: 'What is VFR?',
          question_image_url: null,
          options: [{ id: 'a', text: 'Option A' }],
        },
        {
          id: 'q1',
          question_text: 'What is IFR?',
          question_image_url: null,
          options: [{ id: 'a', text: 'Option A' }],
        },
      ],
      error: null,
    })

    // Request order q1, q2 — result should be sorted to match
    const result = await loadSessionQuestions(['q1', 'q2'])
    expect(result.success).toBe(true)
    if (!result.success) return
    // Test setup guarantees two questions in result
    expect(result.questions[0]!.id).toBe('q1')
    expect(result.questions[1]!.id).toBe('q2')
  })

  it('returns all question fields mapped correctly', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: 'q1',
          question_text: 'Explain VFR minima',
          question_image_url: 'https://cdn.example.com/img.png',
          options: [
            { id: 'a', text: 'Option A' },
            { id: 'b', text: 'Option B' },
          ],
        },
      ],
      error: null,
    })

    const result = await loadSessionQuestions(['q1'])
    expect(result.success).toBe(true)
    if (!result.success) return
    // Test setup guarantees one question in result
    expect(result.questions[0]!).toMatchObject({
      id: 'q1',
      question_text: 'Explain VFR minima',
      question_image_url: 'https://cdn.example.com/img.png',
    })
    expect(result.questions[0]!.options).toEqual([
      { id: 'a', text: 'Option A' },
      { id: 'b', text: 'Option B' },
    ])
  })

  it('returns failure when RPC returns an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'RPC failed' } })

    const result = await loadSessionQuestions(['q1'])
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Failed to load questions. Please try again.')
  })

  it('returns failure when RPC returns empty data', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })

    const result = await loadSessionQuestions(['q1'])
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('No questions found')
  })

  it('returns failure when RPC returns null data', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })

    const result = await loadSessionQuestions(['q1'])
    expect(result.success).toBe(false)
  })

  it('requests quiz questions for the provided IDs', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'not called' } })
    const ids = ['q1', 'q2', 'q3']
    await loadSessionQuestions(ids)
    expect(mockRpc).toHaveBeenCalledWith(expect.anything(), 'get_quiz_questions', {
      p_question_ids: ids,
    })
  })
})
