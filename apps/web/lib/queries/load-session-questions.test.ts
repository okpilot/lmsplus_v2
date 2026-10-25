import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockRpc, mockClient, mockCreateClient } = vi.hoisted(() => {
  const mockRpc = vi.fn()
  const mockClient = { marker: 'server-client', rpc: mockRpc }
  return { mockRpc, mockClient, mockCreateClient: vi.fn(async () => mockClient) }
})

const mockVerifySessionUser = vi.fn().mockResolvedValue({ id: 'user-1' })

vi.mock('@/lib/auth/verify-session-user', () => ({
  verifySessionUser: (client: unknown) => mockVerifySessionUser(client),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: () => mockCreateClient(),
}))

// ---- Subject under test ---------------------------------------------------

import { loadSessionQuestions } from './load-session-questions'

const Q1 = '00000000-0000-4000-a000-000000000001'
const Q2 = '00000000-0000-4000-a000-000000000002'
const Q3 = '00000000-0000-4000-a000-000000000003'
const QID = Q1
const KNOWN_TYPES = ['multiple_choice', 'short_answer', 'dialog_fill', 'ordering', 'diagram_label']
const FAILURE = { success: false, error: 'Failed to load questions. Please try again.' }

const row = (id: string, question_type: string) => ({
  id,
  question_text: `Q ${id}`,
  question_image_url: null,
  question_number: null,
  options: null,
  question_type,
  dialog_template: null,
  blanks_safe: null,
  ordering_items_shuffled: null,
  diagram_config_public: null,
})

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockCreateClient.mockImplementation(async () => mockClient)
})

describe('loadSessionQuestions', () => {
  it('reports no questions found for the verified session user when the RPC returns none', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    const result = await loadSessionQuestions([QID])
    expect(result).toEqual({ success: false, error: 'No questions found' })
    expect(mockVerifySessionUser).toHaveBeenCalledWith(mockClient)
    expect(mockCreateClient).toHaveBeenCalledTimes(1)
  })

  it('returns failure when user is not authenticated', async () => {
    mockVerifySessionUser.mockResolvedValueOnce(null)
    const result = await loadSessionQuestions([QID])
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Not authenticated')
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns questions mapped from RPC data in the requested order', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: Q2,
          question_text: 'What is VFR?',
          question_image_url: null,
          options: [{ id: 'a', text: 'Option A' }],
          question_type: 'multiple_choice',
          dialog_template: null,
          blanks_safe: null,
        },
        {
          id: Q1,
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
    const result = await loadSessionQuestions([Q1, Q2])
    expect(result.success).toBe(true)
    if (!result.success) return
    // Test setup guarantees two questions in result
    expect(result.questions[0]!.id).toBe(Q1)
    expect(result.questions[1]!.id).toBe(Q2)
  })

  it('returns all question fields mapped correctly', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: Q1,
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

    const result = await loadSessionQuestions([QID])
    expect(result.success).toBe(true)
    if (!result.success) return
    // Test setup guarantees one question in result
    expect(result.questions[0]!).toMatchObject({
      id: Q1,
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

    const result = await loadSessionQuestions([QID])
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

    const result = await loadSessionQuestions([QID])
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

    const result = await loadSessionQuestions([QID])
    expect(result.success).toBe(true)
    if (!result.success) return
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

    const result = await loadSessionQuestions([QID])
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.questions).toHaveLength(1)
    expect(result.questions[0]!.ordering_items).toBeNull()
  })

  it('discards an ordering payload with fewer than two items', async () => {
    // An ordering question is a permutation of ≥2 items; a single-item array can't be
    // reordered. The mapper yields null so the UI shows the fail-closed refresh prompt
    // rather than a nonsensical one-item drag area.
    mockRpc.mockResolvedValue({
      data: [
        {
          id: 'q-ord-short',
          question_text: 'Sequence the steps',
          question_image_url: null,
          question_number: '003',
          explanation_text: null,
          explanation_image_url: null,
          options: null,
          question_type: 'ordering',
          dialog_template: null,
          blanks_safe: null,
          ordering_items_shuffled: [{ id: 'a', text: 'Alpha' }],
        },
      ],
      error: null,
    })

    const result = await loadSessionQuestions([QID])
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.questions).toHaveLength(1)
    expect(result.questions[0]!.ordering_items).toBeNull()
  })

  it('discards an ordering payload whose ids are not all distinct', async () => {
    // An ordering answer is a permutation — a repeated id can't be rendered as a
    // stable drag key. The mapper yields null (fail-closed) rather than passing a
    // non-permutation to the UI.
    mockRpc.mockResolvedValue({
      data: [
        {
          id: 'q-ord-dup',
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
            { id: 'a', text: 'Alpha again' },
          ],
        },
      ],
      error: null,
    })

    const result = await loadSessionQuestions([QID])
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.questions).toHaveLength(1)
    expect(result.questions[0]!.ordering_items).toBeNull()
  })

  it('discards ordering items when an element has a blank or whitespace-only id or text', async () => {
    // Mirrors the DB CHECK (mig 143: btrim(id) != '' AND btrim(text) != ''). A blank
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

    const result = await loadSessionQuestions([QID])
    expect(result.success).toBe(true)
    if (!result.success) return
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

    const result = await loadSessionQuestions([QID])
    expect(result.success).toBe(true)
    if (!result.success) return
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

    const result = await loadSessionQuestions([QID])
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

    const result = await loadSessionQuestions([QID])
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('Failed to load questions. Please try again.')
  })

  it('returns failure when RPC returns empty data', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })

    const result = await loadSessionQuestions([QID])
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error).toBe('No questions found')
  })

  it('returns failure when RPC returns null data', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })

    const result = await loadSessionQuestions([QID])
    expect(result.success).toBe(false)
  })

  it('requests quiz questions for the provided IDs', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'not called' } })
    const ids = [Q1, Q2, Q3]
    await loadSessionQuestions(ids)
    expect(mockRpc).toHaveBeenCalledWith('get_quiz_questions', {
      p_question_ids: ids,
    })
  })
})

describe('loadSessionQuestions — input validation', () => {
  it.each([
    ['a non-array', 'not-an-array'],
    ['a non-uuid id', ['q1']],
    ['an empty array', []],
    [
      '501 ids',
      Array.from(
        { length: 501 },
        (_, i) => `00000000-0000-4000-a000-${String(i).padStart(12, '0')}`,
      ),
    ],
  ])('rejects %s without calling the RPC', async (_label, input) => {
    const result = await loadSessionQuestions(input as string[])
    expect(result).toEqual({ success: false, error: 'Invalid questions' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('accepts exactly 500 uuids and calls the RPC', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    const ids = Array.from(
      { length: 500 },
      (_, i) => `00000000-0000-4000-a000-${String(i).padStart(12, '0')}`,
    )
    await loadSessionQuestions(ids)
    expect(mockRpc).toHaveBeenCalledTimes(1)
  })
})

describe('loadSessionQuestions question_type fail-closed', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('returns the load-failure result and logs when any row has an unknown question_type', async () => {
    mockRpc.mockResolvedValue({
      data: [row(Q1, 'multiple_choice'), row(Q2, 'essay')],
      error: null,
    })
    const result = await loadSessionQuestions([Q1, Q2])
    expect(result).toEqual(FAILURE)
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Unknown question_type'), Q2)
  })

  it.each(KNOWN_TYPES)('passes a %s row through unchanged', async (type) => {
    mockRpc.mockResolvedValue({ data: [row(Q1, type)], error: null })
    const result = await loadSessionQuestions([Q1])
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.questions[0]?.question_type).toBe(type)
  })
})
