import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkLiveParent, updateLiveRow, writeFailure } from './check-live-parent'

type Result = { data: unknown; error: { message: string; code?: string } | null }

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

describe('updateLiveRow', () => {
  const ctx = {
    fn: 'upsertTopic',
    entity: 'topic',
    duplicate: 'A topic with this code already exists',
  } as const

  function updateSupabase(result: Result) {
    const calls: Array<{ op: string; args: unknown[] }> = []
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === 'then') return (res: (v: Result) => unknown) => res(result)
          return (...args: unknown[]) => {
            calls.push({ op: prop, args })
            return proxy
          }
        },
      },
    )
    return { supabase: { from: () => proxy } as never, calls }
  }

  it('returns null and filters on deleted_at when a live row was updated', async () => {
    const { supabase, calls } = updateSupabase({ data: [{ id: 'r1' }], error: null })
    await expect(
      updateLiveRow(supabase, { table: 'easa_topics', id: 'r1', data: { name: 'N' } }, ctx),
    ).resolves.toBeNull()
    expect(calls).toContainEqual({ op: 'is', args: ['deleted_at', null] })
  })

  it('returns Item not found when no live row matched', async () => {
    const { supabase } = updateSupabase({ data: [], error: null })
    await expect(
      updateLiveRow(supabase, { table: 'easa_topics', id: 'r1', data: {} }, ctx),
    ).resolves.toEqual({
      success: false,
      error: 'Item not found',
    })
  })

  it('logs and returns a generic update failure on a database error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { supabase } = updateSupabase({ data: null, error: { message: 'boom' } })
    await expect(
      updateLiveRow(supabase, { table: 'easa_topics', id: 'r1', data: {} }, ctx),
    ).resolves.toEqual({
      success: false,
      error: 'Failed to update topic',
    })
    expect(spy).toHaveBeenCalledWith('[upsertTopic] update error:', 'boom')
  })

  it('returns the duplicate message on a unique violation', async () => {
    const { supabase } = updateSupabase({
      data: null,
      error: { message: 'duplicate key', code: '23505' },
    })
    await expect(
      updateLiveRow(supabase, { table: 'easa_topics', id: 'r1', data: {} }, ctx),
    ).resolves.toEqual({
      success: false,
      error: ctx.duplicate,
    })
  })
})
