import { describe, expect, it, vi } from 'vitest'
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

  /**
   * A chainable RPC mock. The client's `.rpc(fn, args)` must behave like the real
   * Supabase builder: awaitable directly (the plain first call) AND chainable via
   * `.order()`/`.range()` (the paged calls) — the same two-arg call shape serves both,
   * distinguished only by whether the caller awaits it or chains off it. `.rpc(fn, args, opts)`
   * (three args) is the separate count-only call.
   */
  function makeChainableClient(opts: {
    firstCall: { data: unknown; error?: { message: string } | null }
    count?: { count: number | null; error?: { message: string } | null }
    pages?: { data: unknown; error?: { message: string } | null }[]
  }) {
    const orderCalls: [string, unknown][] = []
    const rangeCalls: [number, number][] = []
    let rangeCallIndex = 0

    function makeChain(): {
      then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => Promise<unknown>
      order: (col: string, o: unknown) => unknown
      range: (from: number, to: number) => Promise<{ data: unknown; error: unknown }>
    } {
      const chain = {
        // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
        then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
          Promise.resolve({ data: opts.firstCall.data, error: opts.firstCall.error ?? null }).then(
            resolve,
            reject,
          ),
        order: (col: string, o: unknown) => {
          orderCalls.push([col, o])
          return chain
        },
        range: async (from: number, to: number) => {
          rangeCalls.push([from, to])
          const page = opts.pages?.[rangeCallIndex] ?? { data: [], error: null }
          rangeCallIndex++
          return { data: page.data, error: page.error ?? null }
        },
      }
      return chain
    }

    const rpcFn = vi.fn(
      (_fn: string, _args: Record<string, unknown>, rpcOpts?: { count: 'exact'; head: true }) => {
        if (rpcOpts) return Promise.resolve(opts.count ?? { count: 0, error: null })
        return makeChain()
      },
    )

    return { rpc: rpcFn, _rpcFn: rpcFn, orderCalls, rangeCalls }
  }

  function fixture(prefix: string, count: number) {
    return Array.from({ length: count }, (_, i) => ({ id: `${prefix}-${i}` }))
  }

  it('returns the rows from a single call when the result is under the row cap', async () => {
    const client = makeChainableClient({ firstCall: { data: fixture('row', 3), error: null } })
    const result = await fetchAllRpcRows<{ id: string }>({
      supabase: client as unknown as never,
      fn: FN,
      args: ARGS,
      orderColumns: ORDER_COLUMNS,
    })
    expect(client._rpcFn).toHaveBeenCalledTimes(1)
    expect(client._rpcFn).toHaveBeenCalledWith(FN, ARGS)
    expect(result).toEqual({ data: fixture('row', 3), error: null })
  })

  it('discards an at-cap first result and returns the paginated rows instead', async () => {
    // The first (unpaged) call returns exactly 1000 rows — indistinguishable from a
    // truncated result — so it must be DISCARDED, never spliced into the final data.
    const staleFirstCall = fixture('stale', 1000)
    const page1 = fixture('page1', 1000)
    const page2 = fixture('page2', 200)
    const client = makeChainableClient({
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
    expect(client._rpcFn).toHaveBeenCalledTimes(4)
    expect(client._rpcFn).toHaveBeenNthCalledWith(1, FN, ARGS)
    expect(client._rpcFn).toHaveBeenNthCalledWith(2, FN, ARGS, { count: 'exact', head: true })

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
    const client = makeChainableClient({
      firstCall: { data: null, error: { message: 'first call failed' } },
    })
    const result = await fetchAllRpcRows<{ id: string }>({
      supabase: client as unknown as never,
      fn: FN,
      args: ARGS,
      orderColumns: ORDER_COLUMNS,
    })
    expect(result).toEqual({ data: [], error: { message: 'first call failed' } })
    expect(client._rpcFn).toHaveBeenCalledTimes(1)
  })

  it('returns an error and no rows when a page fetch fails after an at-cap first call', async () => {
    const client = makeChainableClient({
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

  it('returns no rows without erroring when the first call yields a non-array payload', async () => {
    const client = makeChainableClient({
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
