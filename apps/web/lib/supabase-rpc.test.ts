import { describe, expect, it, vi } from 'vitest'
import { rpc, upsert } from './supabase-rpc'

// Build a minimal fake SupabaseClient with .rpc() and .from() methods
function makeClient(opts: {
  rpcData?: unknown
  rpcError?: { message: string } | null
  upsertFn?: ReturnType<typeof vi.fn>
}) {
  const rpcFn = vi.fn().mockResolvedValue({
    data: opts.rpcData ?? null,
    error: opts.rpcError ?? null,
  })

  const upsertMethod = opts.upsertFn ?? vi.fn().mockResolvedValue({})

  return {
    rpc: rpcFn,
    from: vi.fn().mockReturnValue({ upsert: upsertMethod }),
    _rpcFn: rpcFn,
    _upsertMethod: upsertMethod,
  }
}

describe('rpc', () => {
  it('calls the RPC function with the supplied name and args and returns data', async () => {
    const client = makeClient({ rpcData: [{ id: 'abc' }] })
    const result = await rpc(client as unknown as never, 'my_rpc', { p_arg: 'val' })
    expect(client._rpcFn).toHaveBeenCalledWith('my_rpc', { p_arg: 'val' })
    expect(result.data).toEqual([{ id: 'abc' }])
    expect(result.error).toBeNull()
  })

  it('returns error and null data when the RPC fails', async () => {
    const client = makeClient({ rpcData: null, rpcError: { message: 'DB error' } })
    const result = await rpc(client as unknown as never, 'failing_rpc', {})
    expect(result.data).toBeNull()
    expect(result.error?.message).toBe('DB error')
  })

  it('returns data typed as TResult', async () => {
    type MyResult = { count: number }
    const client = makeClient({ rpcData: { count: 42 } })
    const result = await rpc<MyResult>(client as unknown as never, 'count_rpc', {})
    expect(result.data?.count).toBe(42)
  })
})

describe('upsert', () => {
  it('calls from() with the table name then upsert() with the values', async () => {
    const client = makeClient({})
    await upsert(client as unknown as never, 'fsrs_cards', { student_id: 'u1', reps: 3 })
    expect(client.from).toHaveBeenCalledWith('fsrs_cards')
    expect(client._upsertMethod).toHaveBeenCalledWith({ student_id: 'u1', reps: 3 }, undefined)
  })

  it('passes onConflict option through to upsert()', async () => {
    const client = makeClient({})
    await upsert(
      client as unknown as never,
      'fsrs_cards',
      { student_id: 'u1' },
      { onConflict: 'student_id,question_id' },
    )
    expect(client._upsertMethod).toHaveBeenCalledWith(
      { student_id: 'u1' },
      { onConflict: 'student_id,question_id' },
    )
  })
})
