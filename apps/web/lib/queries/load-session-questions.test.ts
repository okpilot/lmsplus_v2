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
          question_type: 'multiple_choice',
          dialog_template: null,
          blanks_safe: null,
        },
        {
          id: 'q1',
          question_text: 'What is IFR?',
          question_image_url: null,
          options: [{ id: 'a', text: 'Option A' }],
          question_type: 'multiple_choice',
          dialog_template: null,
          blanks_safe: null,
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
          question_type: 'multiple_choice',
          dialog_template: null,
          blanks_safe: null,
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

  it('passes through question_type, dialog_template, and blanks_safe for a dialog_fill row', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: 'q-df',
          question_text: 'Fill the blanks',
          question_image_url: null,
          question_number: null,
          explanation_text: null,
          explanation_image_url: null,
          options: null,
          question_type: 'dialog_fill',
          dialog_template: 'Tower: {{1}} QNH, runway {{2}}.',
          blanks_safe: [{ index: 1 }, { index: 2 }],
        },
      ],
      error: null,
    })

    const result = await loadSessionQuestions(['q-df'])
    expect(result.success).toBe(true)
    if (!result.success) return
    const q = result.questions[0]!
    expect(q.question_type).toBe('dialog_fill')
    expect(q.dialog_template).toBe('Tower: {{1}} QNH, runway {{2}}.')
    expect(q.blanks_safe).toEqual([{ index: 1 }, { index: 2 }])
    // options is null from RPC — mapper converts to []
    expect(q.options).toEqual([])
  })

  it('provides the orderable items for an ordering question', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: 'q-ord',
          question_text: 'Order the MAYDAY call',
          question_image_url: null,
          question_number: null,
          explanation_text: null,
          explanation_image_url: null,
          options: null,
          question_type: 'ordering',
          dialog_template: null,
          blanks_safe: null,
          ordering_items_shuffled: [
            { id: 'item-b', text: 'callsign' },
            { id: 'item-a', text: 'MAYDAY' },
            { id: 'item-c', text: 'distress' },
          ],
        },
      ],
      error: null,
    })

    const result = await loadSessionQuestions(['q-ord'])
    expect(result.success).toBe(true)
    if (!result.success) return
    const q = result.questions[0]!
    expect(q.question_type).toBe('ordering')
    expect(q.ordering_items).toEqual([
      { id: 'item-b', text: 'callsign' },
      { id: 'item-a', text: 'MAYDAY' },
      { id: 'item-c', text: 'distress' },
    ])
    expect(q.dialog_template).toBeNull()
    expect(q.blanks_safe).toBeNull()
  })

  it('provides no orderable items when an ordering question omits its shuffled items', async () => {
    // Ordering fixture (not MC) so this exercises the ordering_items_shuffled: null
    // branch for an ordering question — the mapper must yield null ordering_items
    // rather than passing through, so a regression in that branch is caught.
    mockRpc.mockResolvedValue({
      data: [
        {
          id: 'q-ord-null',
          question_text: 'Sequence the MAYDAY call',
          question_image_url: null,
          question_number: '001',
          explanation_text: null,
          explanation_image_url: null,
          options: null,
          question_type: 'ordering',
          dialog_template: null,
          blanks_safe: null,
          ordering_items_shuffled: null,
        },
      ],
      error: null,
    })

    const result = await loadSessionQuestions(['q-ord-null'])
    expect(result.success).toBe(true)
    if (!result.success) return
    // Single-question fixture → exactly one mapped question; pins index 0 as populated.
    expect(result.questions).toHaveLength(1)
    expect(result.questions[0]!.ordering_items).toBeNull()
  })

  it('discards ordering items when an element lacks a string id or text', async () => {
    // Element-level guard (#998 CR): an ordering payload whose element is malformed
    // (non-string id, missing text) is not trusted — the mapper yields null rather
    // than passing the malformed array to the UI as orderable items.
    mockRpc.mockResolvedValue({
      data: [
        {
          id: 'q-ord-bad',
          question_text: 'Sequence the steps',
          question_image_url: null,
          question_number: '002',
          explanation_text: null,
          explanation_image_url: null,
          options: null,
          question_type: 'ordering',
          dialog_template: null,
          blanks_safe: null,
          ordering_items_shuffled: [{ id: 'a', text: 'Alpha' }, { id: 7 }],
        },
      ],
      error: null,
    })

    const result = await loadSessionQuestions(['q-ord-bad'])
    expect(result.success).toBe(true)
    if (!result.success) return
    // Single-question fixture → exactly one mapped question; pins index 0 as populated.
    expect(result.questions).toHaveLength(1)
    expect(result.questions[0]!.ordering_items).toBeNull()
  })

  it('discards ordering items when an element has a blank or whitespace-only id or text', async () => {
    // Mirrors the DB CHECK (mig 134: btrim(id) != '' AND btrim(text) != ''). A blank
    // id breaks id-keyed grading and a blank text renders an empty slot — the mapper
    // must reject these defensively, not just non-string elements.
    mockRpc.mockResolvedValue({
      data: [
        {
          id: 'q-ord-blank',
          question_text: 'Sequence the steps',
          question_image_url: null,
          question_number: '003',
          explanation_text: null,
          explanation_image_url: null,
          options: null,
          question_type: 'ordering',
          dialog_template: null,
          blanks_safe: null,
          ordering_items_shuffled: [
            { id: 'a', text: 'Alpha' },
            { id: '  ', text: 'Whitespace id' },
          ],
        },
      ],
      error: null,
    })

    const result = await loadSessionQuestions(['q-ord-blank'])
    expect(result.success).toBe(true)
    if (!result.success) return
    // Single-question fixture → exactly one mapped question; pins index 0 as populated.
    expect(result.questions).toHaveLength(1)
    expect(result.questions[0]!.ordering_items).toBeNull()
  })

  it('discards ordering items when an element has a whitespace-only text field', async () => {
    // Symmetric with the whitespace-id case above: the DB CHECK guards both
    // btrim(id) != '' AND btrim(text) != ''. A whitespace text renders an empty
    // draggable slot, so the mapper must reject it independently of the id check.
    mockRpc.mockResolvedValue({
      data: [
        {
          id: 'q-ord-blank-text',
          question_text: 'Sequence the steps',
          question_image_url: null,
          question_number: '004',
          explanation_text: null,
          explanation_image_url: null,
          options: null,
          question_type: 'ordering',
          dialog_template: null,
          blanks_safe: null,
          ordering_items_shuffled: [
            { id: 'a', text: 'Alpha' },
            { id: 'b', text: '   ' },
          ],
        },
      ],
      error: null,
    })

    const result = await loadSessionQuestions(['q-ord-blank-text'])
    expect(result.success).toBe(true)
    if (!result.success) return
    // Single-question fixture → exactly one mapped question; pins index 0 as populated.
    expect(result.questions).toHaveLength(1)
    expect(result.questions[0]!.ordering_items).toBeNull()
  })

  it('yields null blanks_safe and null dialog_template for a multiple_choice row', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: 'q-mc',
          question_text: 'What is the MTOW limit?',
          question_image_url: null,
          question_number: '001',
          explanation_text: null,
          explanation_image_url: null,
          options: [{ id: 'a', text: '5700 kg' }],
          question_type: 'multiple_choice',
          dialog_template: null,
          blanks_safe: null,
        },
      ],
      error: null,
    })

    const result = await loadSessionQuestions(['q-mc'])
    expect(result.success).toBe(true)
    if (!result.success) return
    const q = result.questions[0]!
    expect(q.question_type).toBe('multiple_choice')
    expect(q.dialog_template).toBeNull()
    expect(q.blanks_safe).toBeNull()
    expect(q.options).toEqual([{ id: 'a', text: '5700 kg' }])
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
