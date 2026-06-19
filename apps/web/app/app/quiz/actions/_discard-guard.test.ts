import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanupDiscardedDraft, discardBlockedError } from './_discard-guard'

// ---- discardBlockedError ---------------------------------------------------

describe('discardBlockedError', () => {
  it('returns null for discardable modes (quick_quiz, mock_exam)', () => {
    expect(discardBlockedError('quick_quiz')).toBeNull()
    expect(discardBlockedError('mock_exam')).toBeNull()
  })

  it('returns the internal_exam error token for internal_exam sessions', () => {
    expect(discardBlockedError('internal_exam')).toBe('cannot_discard_internal_exam')
  })

  it('returns the vfr_rt_exam error token for vfr_rt_exam sessions', () => {
    expect(discardBlockedError('vfr_rt_exam')).toBe('cannot_discard_vfr_rt_exam')
  })

  it('returns null for an unknown mode (fail-open for new modes not yet guarded)', () => {
    expect(discardBlockedError('smart_review')).toBeNull()
  })

  it('returns null for an empty mode string', () => {
    expect(discardBlockedError('')).toBeNull()
  })
})

// ---- cleanupDiscardedDraft -------------------------------------------------

describe('cleanupDiscardedDraft', () => {
  const DRAFT_ID = '00000000-0000-4000-a000-000000000001'
  const USER_ID = 'user-abc'

  // Minimal Supabase client mock — only needs .from().delete().eq().eq()
  function buildDeleteChain(returnValue: { error: { message: string } | null }) {
    const awaitable = {
      // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
      then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
        Promise.resolve(returnValue).then(resolve, reject),
    }
    return new Proxy(awaitable as Record<string, unknown>, {
      get(target, prop) {
        if (prop === 'then') return target.then
        return (..._args: unknown[]) => buildDeleteChain(returnValue)
      },
    })
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('completes without throwing when the delete succeeds', async () => {
    const mockSupabase = {
      from: () => buildDeleteChain({ error: null }),
    } as unknown as Parameters<typeof cleanupDiscardedDraft>[0]

    await expect(cleanupDiscardedDraft(mockSupabase, DRAFT_ID, USER_ID)).resolves.toBeUndefined()
  })

  it('logs the error but does not throw when the delete fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockSupabase = {
      from: () => buildDeleteChain({ error: { message: 'draft not found' } }),
    } as unknown as Parameters<typeof cleanupDiscardedDraft>[0]

    await expect(cleanupDiscardedDraft(mockSupabase, DRAFT_ID, USER_ID)).resolves.toBeUndefined()

    expect(consoleSpy).toHaveBeenCalledWith('[discardQuiz] Draft cleanup error:', 'draft not found')
  })
})
