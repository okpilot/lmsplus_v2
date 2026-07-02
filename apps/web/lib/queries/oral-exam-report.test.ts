import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockRpc } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({}),
}))

vi.mock('@/lib/supabase-rpc', () => ({
  rpc: (...args: unknown[]) => mockRpc(...args),
}))

// ---- Subject under test ---------------------------------------------------

import { getOralExamReport } from './oral-exam-report'

// ---- Fixtures -------------------------------------------------------------

const SESSION_ID = '00000000-0000-4000-a000-000000000001'

const RPC_RESULT = {
  session_id: SESSION_ID,
  status: 'graded',
  total_final_level: 4,
  started_at: '2026-07-02T10:00:00Z',
  ended_at: '2026-07-02T10:30:00Z',
  descriptors: [
    { descriptor: 'Pronunciation', level: 4, rationale: 'Clear speech' },
    { descriptor: 'Vocabulary', level: 3, rationale: null },
  ],
  sections: [
    {
      section_no: 1,
      status: 'graded',
      transcript_text: 'Hello world',
      scores: [{ descriptor: 'Pronunciation', level: 4, rationale: 'Good' }],
    },
  ],
}

// ---- Setup ----------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
})

// ---- Tests ----------------------------------------------------------------

describe('getOralExamReport', () => {
  it('returns null when the RPC returns an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'session_not_found' } })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await getOralExamReport(SESSION_ID)
    consoleSpy.mockRestore()
    expect(result).toBeNull()
  })

  it('returns null when the RPC returns no data', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null })
    const result = await getOralExamReport(SESSION_ID)
    expect(result).toBeNull()
  })

  it('maps top-level fields from snake_case to camelCase', async () => {
    mockRpc.mockResolvedValue({ data: RPC_RESULT, error: null })
    const result = await getOralExamReport(SESSION_ID)
    expect(result?.sessionId).toBe(SESSION_ID)
    expect(result?.status).toBe('graded')
    expect(result?.startedAt).toBe('2026-07-02T10:00:00Z')
    expect(result?.endedAt).toBe('2026-07-02T10:30:00Z')
  })

  it('coerces total_final_level to a number', async () => {
    mockRpc.mockResolvedValue({ data: { ...RPC_RESULT, total_final_level: '4' }, error: null })
    const result = await getOralExamReport(SESSION_ID)
    expect(result?.totalFinalLevel).toBe(4)
    expect(typeof result?.totalFinalLevel).toBe('number')
  })

  it('preserves null for total_final_level when grading has not yet completed', async () => {
    mockRpc.mockResolvedValue({ data: { ...RPC_RESULT, total_final_level: null }, error: null })
    const result = await getOralExamReport(SESSION_ID)
    expect(result?.totalFinalLevel).toBeNull()
  })

  it('maps descriptor scores with the correct field names and types', async () => {
    mockRpc.mockResolvedValue({ data: RPC_RESULT, error: null })
    const result = await getOralExamReport(SESSION_ID)
    expect(result?.descriptors).toEqual([
      { descriptor: 'Pronunciation', level: 4, rationale: 'Clear speech' },
      { descriptor: 'Vocabulary', level: 3, rationale: null },
    ])
  })

  it('maps section fields from snake_case to camelCase', async () => {
    mockRpc.mockResolvedValue({ data: RPC_RESULT, error: null })
    const result = await getOralExamReport(SESSION_ID)
    expect(result?.sections).toHaveLength(1)
    const section = result?.sections[0]
    expect(section?.sectionNo).toBe(1)
    expect(section?.status).toBe('graded')
    expect(section?.transcriptText).toBe('Hello world')
    expect(section?.scores).toHaveLength(1)
  })

  it('returns an empty descriptors array when the RPC returns a non-array value for descriptors', async () => {
    mockRpc.mockResolvedValue({ data: { ...RPC_RESULT, descriptors: null }, error: null })
    const result = await getOralExamReport(SESSION_ID)
    expect(result?.descriptors).toEqual([])
  })

  it('returns an empty sections array when the RPC returns a non-array value for sections', async () => {
    mockRpc.mockResolvedValue({ data: { ...RPC_RESULT, sections: null }, error: null })
    const result = await getOralExamReport(SESSION_ID)
    expect(result?.sections).toEqual([])
  })

  it('returns null rationale for a descriptor with a null rationale field', async () => {
    const rawData = {
      ...RPC_RESULT,
      descriptors: [{ descriptor: 'Fluency', level: 3, rationale: null }],
    }
    mockRpc.mockResolvedValue({ data: rawData, error: null })
    const result = await getOralExamReport(SESSION_ID)
    expect(result?.descriptors[0]?.rationale).toBeNull()
  })

  it('returns null transcript_text for a section where no transcription is available', async () => {
    const rawData = {
      ...RPC_RESULT,
      sections: [{ section_no: 2, status: 'pending', transcript_text: null, scores: [] }],
    }
    mockRpc.mockResolvedValue({ data: rawData, error: null })
    const result = await getOralExamReport(SESSION_ID)
    expect(result?.sections[0]?.transcriptText).toBeNull()
  })

  it('coerces section_no to a number and uses zero as the fallback when it is absent', async () => {
    const rawData = {
      ...RPC_RESULT,
      sections: [{ section_no: '3', status: 'graded', transcript_text: null, scores: [] }],
    }
    mockRpc.mockResolvedValue({ data: rawData, error: null })
    const result = await getOralExamReport(SESSION_ID)
    expect(result?.sections[0]?.sectionNo).toBe(3)
    expect(typeof result?.sections[0]?.sectionNo).toBe('number')
  })

  it('coerces nested descriptor level to a number', async () => {
    const rawData = {
      ...RPC_RESULT,
      sections: [
        {
          section_no: 1,
          status: 'graded',
          transcript_text: null,
          scores: [{ descriptor: 'Fluency', level: '5', rationale: null }],
        },
      ],
    }
    mockRpc.mockResolvedValue({ data: rawData, error: null })
    const result = await getOralExamReport(SESSION_ID)
    expect(result?.sections[0]?.scores[0]?.level).toBe(5)
    expect(typeof result?.sections[0]?.scores[0]?.level).toBe('number')
  })

  it('does not expose the RPC error message to the caller', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'secret internal detail' } })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await getOralExamReport(SESSION_ID)
    consoleSpy.mockRestore()
    // Returns null, not a string containing the error message
    expect(result).toBeNull()
  })
})
