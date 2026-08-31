import { describe, expect, it, vi } from 'vitest'
import { createChainableRpcClient } from '@/lib/test-support/chainable-rpc-client'
import { fetchAllRpcRows, rpc, upsert } from './supabase-rpc'

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
    _upsertMethod: upsertMethod,
  }
}

describe('rpc', () => {
  it('calls the RPC function with the supplied name and args and returns data', async () => {
    const client = makeClient({ rpcData: [{ id: 'abc' }] })
    const result = await rpc(client as unknown as never, 'my_rpc', { p_arg: 'val' })
    expect(client.rpc).toHaveBeenCalledWith('my_rpc', { p_arg: 'val' })
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
    await upsert(client as unknown as never, 'some_table', { student_id: 'u1', reps: 3 })
    expect(client.from).toHaveBeenCalledWith('some_table')
    expect(client._upsertMethod).toHaveBeenCalledWith({ student_id: 'u1', reps: 3 }, undefined)
  })

  it('passes onConflict option through to upsert()', async () => {
    const client = makeClient({})
    await upsert(
      client as unknown as never,
      'some_table',
      { student_id: 'u1' },
      { onConflict: 'student_id,question_id' },
    )
    expect(client._upsertMethod).toHaveBeenCalledWith(
      { student_id: 'u1' },
      { onConflict: 'student_id,question_id' },
    )
  })

  it('throws when the upsert returns a DB error', async () => {
    const upsertFn = vi.fn().mockResolvedValue({ data: null, error: { message: 'RLS denied' } })
    const client = makeClient({ upsertFn })
    await expect(
      upsert(client as unknown as never, 'some_table', { student_id: 'u1' }),
    ).rejects.toThrow('[upsert:some_table] RLS denied')
  })
})

describe('fetchAllRpcRows', () => {
  const FN = 'get_paged_answer_keys'
  const ARGS = { p_session_id: 'sess-1' }
  const ORDER_COLUMNS = ['question_id', 'blank_index']

  function fixture(prefix: string, count: number) {
    return Array.from({ length: count }, (_, i) => ({ id: `${prefix}-${i}` }))
  }

  it('returns the rows from a single call when the result is under the row cap', async () => {
    const client = createChainableRpcClient({ firstCall: { data: fixture('row', 3), error: null } })
    const result = await fetchAllRpcRows<{ id: string }>({
      supabase: client as unknown as never,
      fn: FN,
      args: ARGS,
      orderColumns: ORDER_COLUMNS,
    })
    expect(client.rpc).toHaveBeenCalledTimes(1)
    expect(client.rpc).toHaveBeenCalledWith(FN, ARGS)
    expect(result).toEqual({ data: fixture('row', 3), error: null })
  })

  it('discards an at-cap first result and returns the paginated rows instead', async () => {
    // The first (unpaged) call returns exactly 1000 rows — indistinguishable from a
    // truncated result — so it must be DISCARDED, never spliced into the final data.
    const staleFirstCall = fixture('stale', 1000)
    const page1 = fixture('page1', 1000)
    const page2 = fixture('page2', 200)
    const client = createChainableRpcClient({
      firstCall: { data: staleFirstCall, error: null },
      count: { count: 1200, error: null },
      pages: [
        { data: page1, error: null },
        { data: page2, error: null },
      ],
    })
    const result = await fetchAllRpcRows<{ id: string }>({
      supabase: client as unknown as never,
      fn: FN,
      args: ARGS,
      orderColumns: ORDER_COLUMNS,
    })

    expect(result.error).toBeNull()
    // Distinguishable from the stale first-call fixture: proves the discard happened.
    expect(result.data).toEqual([...page1, ...page2])
    expect(result.data.some((r) => r.id.startsWith('stale'))).toBe(false)

    // First call, plus one count call, plus one bare .rpc() per page.
    expect(client.rpc).toHaveBeenCalledTimes(4)
    expect(client.rpc).toHaveBeenNthCalledWith(1, FN, ARGS)
    expect(client.rpc).toHaveBeenNthCalledWith(2, FN, ARGS, { count: 'exact', head: true })

    expect(client.orderCalls).toEqual([
      ['question_id', { ascending: true, nullsFirst: true }],
      ['blank_index', { ascending: true, nullsFirst: true }],
      ['question_id', { ascending: true, nullsFirst: true }],
      ['blank_index', { ascending: true, nullsFirst: true }],
    ])
    expect(client.rangeCalls).toEqual([
      [0, 999],
      [1000, 1199],
    ])
  })

  it('returns an error and no rows when the first call fails', async () => {
    const client = createChainableRpcClient({
      firstCall: { data: null, error: { message: 'first call failed' } },
    })
    const result = await fetchAllRpcRows<{ id: string }>({
      supabase: client as unknown as never,
      fn: FN,
      args: ARGS,
      orderColumns: ORDER_COLUMNS,
    })
    expect(result).toEqual({ data: [], error: { message: 'first call failed' } })
    expect(client.rpc).toHaveBeenCalledTimes(1)
  })

  it('returns an error and no rows when a page fetch fails after an at-cap first call', async () => {
    const client = createChainableRpcClient({
      firstCall: { data: fixture('stale', 1000), error: null },
      count: { count: 1200, error: null },
      pages: [{ data: null, error: { message: 'page fetch failed' } }],
    })
    const result = await fetchAllRpcRows<{ id: string }>({
      supabase: client as unknown as never,
      fn: FN,
      args: ARGS,
      orderColumns: ORDER_COLUMNS,
    })
    expect(result).toEqual({ data: [], error: { message: 'page fetch failed' } })
  })

  it('returns an error naming the RPC and no rows when a page payload after an at-cap first call is not an array', async () => {
    const staleFirstCall = fixture('stale', 1000)
    const client = createChainableRpcClient({
      firstCall: { data: staleFirstCall, error: null },
      count: { count: 1200, error: null },
      pages: [{ data: { unexpected: 'shape' }, error: null }],
    })
    const result = await fetchAllRpcRows<{ id: string }>({
      supabase: client as unknown as never,
      fn: FN,
      args: ARGS,
      orderColumns: ORDER_COLUMNS,
    })
    expect(result).toEqual({
      data: [],
      error: { message: `${FN}: expected an array page, got object` },
    })
  })

  it('returns no rows without erroring when the first call yields a non-array payload', async () => {
    const client = createChainableRpcClient({
      firstCall: { data: { unexpected: 'shape' }, error: null },
    })
    const result = await fetchAllRpcRows<{ id: string }>({
      supabase: client as unknown as never,
      fn: FN,
      args: ARGS,
      orderColumns: ORDER_COLUMNS,
    })
    expect(result).toEqual({ data: [], error: null })
  })
})
