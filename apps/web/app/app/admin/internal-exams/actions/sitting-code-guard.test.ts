import type { Database } from '@repo/db/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkSittingCode } from './sitting-code-guard'

const mockMaybeSingle = vi.hoisted(() => vi.fn())

const supabase = {
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }),
} as unknown as SupabaseClient<Database>

describe('checkSittingCode', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('fails closed with "Code not found" when no row is visible', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })
    expect(await checkSittingCode(supabase, 'c1')).toEqual({ ok: false, error: 'Code not found' })
  })

  it('returns a generic error on lookup failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } })
    expect(await checkSittingCode(supabase, 'c1')).toEqual({
      ok: false,
      error: 'Failed to void internal exam code',
    })
  })

  it('allows a legacy code', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { sitting_entry_id: null, consumed_at: null, quiz_sessions: null },
      error: null,
    })
    expect(await checkSittingCode(supabase, 'c1')).toEqual({ ok: true })
  })

  it('says the code is already voided rather than naming the sitting', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        sitting_entry_id: 'e1',
        voided_at: '2026-11-25T09:00:00Z',
        consumed_at: null,
        quiz_sessions: null,
      },
      error: null,
    })
    expect(await checkSittingCode(supabase, 'c1')).toEqual({
      ok: false,
      error: 'Code is already voided',
    })
  })

  it('refuses a consumed sitting code whose session row is hidden from the caller', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        sitting_entry_id: 'e1',
        voided_at: null,
        consumed_at: '2026-11-25T10:00:00Z',
        quiz_sessions: null,
      },
      error: null,
    })
    expect(await checkSittingCode(supabase, 'c1')).toEqual({
      ok: false,
      error: 'Void sitting codes from their sitting',
    })
  })

  it('names the finished attempt rather than the sitting once the attempt has ended', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        sitting_entry_id: 'e1',
        voided_at: null,
        consumed_at: '2026-11-25T10:00:00Z',
        quiz_sessions: { ended_at: '2026-11-25T11:00:00Z' },
      },
      error: null,
    })
    expect(await checkSittingCode(supabase, 'c1')).toEqual({
      ok: false,
      error: 'Cannot void a finished attempt — record is final',
    })
  })

  it('allows a sitting code whose attempt is running', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        sitting_entry_id: 'e1',
        voided_at: null,
        consumed_at: '2026-11-25T10:00:00Z',
        quiz_sessions: { ended_at: null },
      },
      error: null,
    })
    expect(await checkSittingCode(supabase, 'c1')).toEqual({ ok: true })
  })
})
