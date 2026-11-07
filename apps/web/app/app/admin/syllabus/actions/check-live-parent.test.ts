import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkLiveParent, writeFailure } from './check-live-parent'

type Result = { data: unknown; error: { message: string } | null }

function supabaseReturning(result: Result) {
  const calls: Array<{ op: string; args: unknown[] }> = []
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'maybeSingle') return () => Promise.resolve(result)
        return (...args: unknown[]) => {
          calls.push({ op: prop, args })
          return proxy
        }
      },
    },
  )
  return { supabase: { from: () => proxy } as never, calls }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('checkLiveParent', () => {
  it('returns null when a live parent row exists', async () => {
    const { supabase, calls } = supabaseReturning({ data: { id: 'p1' }, error: null })
    await expect(
      checkLiveParent(supabase, { table: 'easa_topics', id: 'p1', label: 'subtopic' }),
    ).resolves.toBeNull()
    expect(calls).toContainEqual({ op: 'is', args: ['deleted_at', null] })
  })

  it('returns Item not found when the parent is missing or deleted', async () => {
    const { supabase } = supabaseReturning({ data: null, error: null })
    await expect(
      checkLiveParent(supabase, { table: 'easa_subjects', id: 'p1', label: 'topic' }),
    ).resolves.toEqual({ success: false, error: 'Item not found' })
  })

  it('returns a create failure when the parent lookup errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { supabase } = supabaseReturning({ data: null, error: { message: 'boom' } })
    await expect(
      checkLiveParent(supabase, { table: 'easa_subjects', id: 'p1', label: 'topic' }),
    ).resolves.toEqual({ success: false, error: 'Failed to create topic' })
  })
})

describe('writeFailure', () => {
  const ctx = {
    fn: 'upsertTopic',
    op: 'insert',
    entity: 'topic',
    duplicate: 'A topic with this code already exists',
  } as const

  it.each(['parent_not_found', 'item_deleted'])(
    'maps %s trigger rejection to Item not found',
    (m) => {
      expect(writeFailure(ctx, `P0001: ${m}`)).toEqual({ success: false, error: 'Item not found' })
    },
  )

  it('maps an insert failure to a create message', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(writeFailure(ctx, 'other')).toEqual({ success: false, error: 'Failed to create topic' })
  })

  it('maps an update failure to an update message', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(writeFailure({ ...ctx, op: 'update' }, 'other')).toEqual({
      success: false,
      error: 'Failed to update topic',
    })
  })

  it('returns the duplicate message without logging on a unique violation', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(writeFailure(ctx, 'duplicate key', '23505')).toEqual({
      success: false,
      error: 'A topic with this code already exists',
    })
    expect(spy).not.toHaveBeenCalled()
  })

  it('maps a trigger rejection to Item not found when no error code is given', () => {
    expect(writeFailure(ctx, 'P0001: parent_not_found', undefined)).toEqual({
      success: false,
      error: 'Item not found',
    })
  })
})
