import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetFlaggedIds, mockToggleFlag } = vi.hoisted(() => ({
  mockGetFlaggedIds: vi.fn(),
  mockToggleFlag: vi.fn(),
}))

vi.mock('../../actions/flag', () => ({
  getFlaggedIds: (...args: unknown[]) => mockGetFlaggedIds(...args),
  toggleFlag: (...args: unknown[]) => mockToggleFlag(...args),
}))

import { useFlaggedQuestions } from './use-flagged-questions'

const Q1 = '00000000-0000-0000-0000-000000000001'
const Q2 = '00000000-0000-0000-0000-000000000002'
const Q3 = '00000000-0000-0000-0000-000000000003'

// Stable array references — the hook skips re-fetch when the same reference
// is passed again, so tests must use stable arrays to avoid infinite re-fetches.
const IDS_Q1 = [Q1]
const IDS_Q1_Q2 = [Q1, Q2]
const IDS_Q1_Q2_Q3 = [Q1, Q2, Q3]

describe('useFlaggedQuestions', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('initial state', () => {
    it('starts with an empty flagged set when no questionIds are provided', () => {
      const { result } = renderHook(() => useFlaggedQuestions([]))
      expect(result.current.flaggedIds.size).toBe(0)
    })

    it('does not call getFlaggedIds when questionIds array is empty', () => {
      renderHook(() => useFlaggedQuestions([]))
      expect(mockGetFlaggedIds).not.toHaveBeenCalled()
    })
  })

  describe('fetching flagged status on mount', () => {
    it('populates flaggedIds with IDs returned by the server', async () => {
      mockGetFlaggedIds.mockResolvedValue({ success: true, flaggedIds: [Q1, Q3] })

      const { result } = renderHook(() => useFlaggedQuestions(IDS_Q1_Q2_Q3))

      await waitFor(() => {
        expect(result.current.flaggedIds.has(Q1)).toBe(true)
      })

      expect(result.current.flaggedIds.has(Q2)).toBe(false)
      expect(result.current.flaggedIds.has(Q3)).toBe(true)
    })

    it('leaves flaggedIds empty when getFlaggedIds returns failure', async () => {
      mockGetFlaggedIds.mockResolvedValue({ success: false, error: 'Failed to fetch flags' })

      const { result } = renderHook(() => useFlaggedQuestions(IDS_Q1_Q2))

      await waitFor(() => {
        expect(mockGetFlaggedIds).toHaveBeenCalledOnce()
      })

      expect(result.current.flaggedIds.size).toBe(0)
    })

    it('skips re-fetch when the same questionIds reference is passed again', async () => {
      mockGetFlaggedIds.mockResolvedValue({ success: true, flaggedIds: [] })

      const { rerender } = renderHook(() => useFlaggedQuestions(IDS_Q1_Q2))

      await waitFor(() => {
        expect(mockGetFlaggedIds).toHaveBeenCalledOnce()
      })

      rerender()

      // Still only one call — same reference skipped
      expect(mockGetFlaggedIds).toHaveBeenCalledOnce()
    })

    it('re-fetches when the questionIds array reference changes', async () => {
      mockGetFlaggedIds.mockResolvedValue({ success: true, flaggedIds: [] })

      const { rerender } = renderHook(({ ids }) => useFlaggedQuestions(ids), {
        initialProps: { ids: IDS_Q1 },
      })

      await waitFor(() => {
        expect(mockGetFlaggedIds).toHaveBeenCalledOnce()
      })

      rerender({ ids: IDS_Q1_Q2 })

      await waitFor(() => {
        expect(mockGetFlaggedIds).toHaveBeenCalledTimes(2)
      })
    })
  })

  describe('isFlagged', () => {
    it('returns true for a question in the flagged set', async () => {
      mockGetFlaggedIds.mockResolvedValue({ success: true, flaggedIds: [Q1] })

      const { result } = renderHook(() => useFlaggedQuestions(IDS_Q1_Q2))

      await waitFor(() => {
        expect(result.current.isFlagged(Q1)).toBe(true)
      })

      expect(result.current.isFlagged(Q2)).toBe(false)
    })

    it('returns false for a question not in the flagged set', () => {
      const { result } = renderHook(() => useFlaggedQuestions([]))
      expect(result.current.isFlagged(Q1)).toBe(false)
    })
  })

  describe('toggleFlag', () => {
    it('adds question to flagged set when server confirms it was flagged', async () => {
      mockGetFlaggedIds.mockResolvedValue({ success: true, flaggedIds: [] })
      mockToggleFlag.mockResolvedValue({ success: true, flagged: true })

      const { result } = renderHook(() => useFlaggedQuestions(IDS_Q1))

      // Wait for initial fetch to settle so the reference guard has fired
      await waitFor(() => {
        expect(mockGetFlaggedIds).toHaveBeenCalledOnce()
      })

      let ok: boolean | undefined
      await act(async () => {
        ok = await result.current.toggleFlag(Q1)
      })

      expect(ok).toBe(true)
      expect(result.current.isFlagged(Q1)).toBe(true)
    })

    it('removes question from flagged set when server confirms it was unflagged', async () => {
      mockGetFlaggedIds.mockResolvedValue({ success: true, flaggedIds: [Q1] })
      mockToggleFlag.mockResolvedValue({ success: true, flagged: false })

      const { result } = renderHook(() => useFlaggedQuestions(IDS_Q1))

      await waitFor(() => {
        expect(result.current.isFlagged(Q1)).toBe(true)
      })

      await act(async () => {
        await result.current.toggleFlag(Q1)
      })

      expect(result.current.isFlagged(Q1)).toBe(false)
    })

    it('returns false and leaves state unchanged when server returns failure', async () => {
      mockGetFlaggedIds.mockResolvedValue({ success: true, flaggedIds: [] })
      mockToggleFlag.mockResolvedValue({ success: false, error: 'Failed to toggle flag' })

      const { result } = renderHook(() => useFlaggedQuestions(IDS_Q1))

      await waitFor(() => {
        expect(mockGetFlaggedIds).toHaveBeenCalledOnce()
      })

      let ok: boolean | undefined
      await act(async () => {
        ok = await result.current.toggleFlag(Q1)
      })

      expect(ok).toBe(false)
      expect(result.current.isFlagged(Q1)).toBe(false)
    })

    it('tracks multiple questions flagged independently', async () => {
      mockGetFlaggedIds.mockResolvedValue({ success: true, flaggedIds: [] })
      mockToggleFlag.mockResolvedValue({ success: true, flagged: true })

      const { result } = renderHook(() => useFlaggedQuestions(IDS_Q1_Q2_Q3))

      await waitFor(() => {
        expect(mockGetFlaggedIds).toHaveBeenCalledOnce()
      })

      await act(async () => {
        await result.current.toggleFlag(Q1)
      })
      await act(async () => {
        await result.current.toggleFlag(Q3)
      })

      expect(result.current.isFlagged(Q1)).toBe(true)
      expect(result.current.isFlagged(Q2)).toBe(false)
      expect(result.current.isFlagged(Q3)).toBe(true)
    })
  })
})
