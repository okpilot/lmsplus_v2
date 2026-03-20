import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetComments, mockCreateComment, mockDeleteComment } = vi.hoisted(() => ({
  mockGetComments: vi.fn(),
  mockCreateComment: vi.fn(),
  mockDeleteComment: vi.fn(),
}))

vi.mock('../../actions/comments', () => ({
  getComments: (...args: unknown[]) => mockGetComments(...args),
  createComment: (...args: unknown[]) => mockCreateComment(...args),
  deleteComment: (...args: unknown[]) => mockDeleteComment(...args),
}))

import { useComments } from './use-comments'

const QUESTION_ID = '00000000-0000-0000-0000-000000000001'
const QUESTION_ID_2 = '00000000-0000-0000-0000-000000000002'

const makeComment = (id: string, body = 'Test comment') => ({
  id,
  question_id: QUESTION_ID,
  user_id: 'user-1',
  body,
  created_at: '2026-03-11T00:00:00Z',
  users: { full_name: 'Alice', role: 'student' },
})

describe('useComments', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('initial load', () => {
    it('fetches comments on mount and exposes them', async () => {
      const comments = [makeComment('c-1'), makeComment('c-2', 'Second comment')]
      mockGetComments.mockResolvedValue({ success: true, comments })

      const { result } = renderHook(() => useComments(QUESTION_ID))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.comments).toHaveLength(2)
      expect(result.current.comments[0]?.body).toBe('Test comment')
      expect(result.current.error).toBeNull()
    })

    it('sets error when getComments returns a failure', async () => {
      mockGetComments.mockResolvedValue({ success: false, error: 'Failed to load comments' })

      const { result } = renderHook(() => useComments(QUESTION_ID))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.error).toBe('Failed to load comments')
      expect(result.current.comments).toHaveLength(0)
    })

    it('sets a fallback error when getComments throws', async () => {
      mockGetComments.mockRejectedValue(new Error('network down'))

      const { result } = renderHook(() => useComments(QUESTION_ID))

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to load comments.')
      })

      expect(result.current.isLoading).toBe(false)
    })

    it('starts in loading state', () => {
      // Never resolves — keeps loading state
      mockGetComments.mockReturnValue(new Promise(() => {}))

      const { result } = renderHook(() => useComments(QUESTION_ID))

      expect(result.current.isLoading).toBe(true)
    })
  })

  describe('questionId changes', () => {
    it('clears comments and re-fetches when questionId changes', async () => {
      const firstComments = [makeComment('c-1')]
      mockGetComments.mockResolvedValue({ success: true, comments: firstComments })

      const { result, rerender } = renderHook(({ qid }) => useComments(qid), {
        initialProps: { qid: QUESTION_ID },
      })

      await waitFor(() => {
        expect(result.current.comments).toHaveLength(1)
      })

      const secondComments = [makeComment('c-2', 'Q2 comment')]
      mockGetComments.mockResolvedValue({ success: true, comments: secondComments })

      rerender({ qid: QUESTION_ID_2 })

      await waitFor(() => {
        expect(result.current.comments[0]?.body).toBe('Q2 comment')
      })

      expect(result.current.comments).toHaveLength(1)
    })

    it('discards stale fetch result when questionId changes before fetch resolves', async () => {
      let resolveFirst: (v: { success: true; comments: ReturnType<typeof makeComment>[] }) => void =
        () => {}
      const stalePromise = new Promise<{
        success: true
        comments: ReturnType<typeof makeComment>[]
      }>((res) => {
        resolveFirst = res
      })
      mockGetComments.mockReturnValueOnce(stalePromise)

      const { result, rerender } = renderHook(({ qid }) => useComments(qid), {
        initialProps: { qid: QUESTION_ID },
      })

      // Change questionId before first fetch resolves
      const secondComments = [makeComment('c-99', 'Fresh comment')]
      mockGetComments.mockResolvedValue({ success: true, comments: secondComments })
      rerender({ qid: QUESTION_ID_2 })

      // Resolve the stale fetch — generation guard must discard it
      resolveFirst({ success: true, comments: [makeComment('c-stale', 'Stale comment')] })

      await waitFor(() => {
        expect(result.current.comments[0]?.body).toBe('Fresh comment')
      })

      expect(result.current.comments).toHaveLength(1)
    })

    it('clears error state when questionId changes', async () => {
      mockGetComments.mockRejectedValue(new Error('net error'))

      const { result, rerender } = renderHook(({ qid }) => useComments(qid), {
        initialProps: { qid: QUESTION_ID },
      })

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to load comments.')
      })

      mockGetComments.mockResolvedValue({ success: true, comments: [] })
      rerender({ qid: QUESTION_ID_2 })

      await waitFor(() => {
        expect(result.current.error).toBeNull()
      })
    })
  })

  describe('addComment', () => {
    it('appends the new comment to the list and returns true on success', async () => {
      mockGetComments.mockResolvedValue({ success: true, comments: [] })
      const newComment = makeComment('c-new', 'My new comment')
      mockCreateComment.mockResolvedValue({ success: true, comment: newComment })

      const { result } = renderHook(() => useComments(QUESTION_ID))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      let ok: boolean | undefined
      await act(async () => {
        ok = await result.current.addComment('My new comment')
      })

      expect(ok).toBe(true)
      expect(result.current.comments).toHaveLength(1)
      expect(result.current.comments[0]?.body).toBe('My new comment')
    })

    it('sets error and returns false when createComment fails', async () => {
      mockGetComments.mockResolvedValue({ success: true, comments: [] })
      mockCreateComment.mockResolvedValue({ success: false, error: 'Failed to create comment' })

      const { result } = renderHook(() => useComments(QUESTION_ID))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      let ok: boolean | undefined
      await act(async () => {
        ok = await result.current.addComment('Bad comment')
      })

      expect(ok).toBe(false)
      expect(result.current.error).toBe('Failed to create comment')
      expect(result.current.comments).toHaveLength(0)
    })
  })

  describe('removeComment', () => {
    it('removes the comment optimistically and returns true on success', async () => {
      const comments = [makeComment('c-1'), makeComment('c-2', 'Keep me')]
      mockGetComments.mockResolvedValue({ success: true, comments })
      mockDeleteComment.mockResolvedValue({ success: true })

      const { result } = renderHook(() => useComments(QUESTION_ID))

      await waitFor(() => {
        expect(result.current.comments).toHaveLength(2)
      })

      let ok: boolean | undefined
      await act(async () => {
        ok = await result.current.removeComment('c-1')
      })

      expect(ok).toBe(true)
      expect(result.current.comments).toHaveLength(1)
      expect(result.current.comments[0]?.id).toBe('c-2')
    })

    it('returns false and sets error when deleteComment fails', async () => {
      const comments = [makeComment('c-1')]
      mockGetComments.mockResolvedValue({ success: true, comments })
      mockDeleteComment.mockResolvedValue({
        success: false,
        error: 'Comment not found or not owned',
      })

      const { result } = renderHook(() => useComments(QUESTION_ID))

      await waitFor(() => {
        expect(result.current.comments).toHaveLength(1)
      })

      let ok: boolean | undefined
      await act(async () => {
        ok = await result.current.removeComment('c-1')
      })

      expect(ok).toBe(false)
      // Pessimistic: comment stays in the list on failure
      expect(result.current.comments).toHaveLength(1)
    })

    it('removes comment from list only after server confirms success', async () => {
      const comments = [makeComment('c-1'), makeComment('c-2')]
      mockGetComments.mockResolvedValue({ success: true, comments })
      mockDeleteComment.mockResolvedValue({ success: true })

      const { result } = renderHook(() => useComments(QUESTION_ID))

      await waitFor(() => {
        expect(result.current.comments).toHaveLength(2)
      })

      await act(async () => {
        await result.current.removeComment('c-1')
      })

      expect(result.current.comments).toHaveLength(1)
      expect(result.current.comments[0]?.id).toBe('c-2')
    })
  })
})
