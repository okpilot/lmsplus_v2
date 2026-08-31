import { describe, expect, it } from 'vitest'
import { createChainableRpcClient } from './chainable-rpc-client'

describe('createChainableRpcClient', () => {
  it('resolves the first-call fixture when the plain rpc call is awaited directly', async () => {
    const client = createChainableRpcClient({ firstCall: { data: [{ id: 'a' }], error: null } })
    const result = await client.rpc('some_fn', { p_arg: 1 })
    expect(result).toEqual({ data: [{ id: 'a' }], error: null })
  })

  it('resolves the count fixture when called with count/head options', async () => {
    const client = createChainableRpcClient({
      firstCall: { data: [], error: null },
      count: { count: 42, error: null },
    })
    const result = await client.rpc('some_fn', {}, { count: 'exact', head: true })
    expect(result).toEqual({ count: 42, error: null })
  })

  it('defaults the count to zero with no error when no count fixture is supplied', async () => {
    const client = createChainableRpcClient({ firstCall: { data: [], error: null } })
    const result = await client.rpc('some_fn', {}, { count: 'exact', head: true })
    expect(result).toEqual({ count: 0, error: null })
  })

  it('chains order() and range() and returns queued pages in call order', async () => {
    const client = createChainableRpcClient({
      firstCall: { data: [], error: null },
      pages: [
        { data: [{ id: 'p1-0' }], error: null },
        { data: [{ id: 'p2-0' }], error: null },
      ],
    })
    const page1 = await client
      .rpc('some_fn', {})
      .order('question_id', { ascending: true })
      .range(0, 999)
    const page2 = await client
      .rpc('some_fn', {})
      .order('question_id', { ascending: true })
      .range(1000, 1199)

    expect(page1).toEqual({ data: [{ id: 'p1-0' }], error: null })
    expect(page2).toEqual({ data: [{ id: 'p2-0' }], error: null })
  })

  it('records every order() and range() call, in call order, across separate chains', async () => {
    const client = createChainableRpcClient({
      firstCall: { data: [], error: null },
      pages: [
        { data: [], error: null },
        { data: [], error: null },
      ],
    })
    await client.rpc('fn', {}).order('question_id', { ascending: true }).range(0, 999)
    await client.rpc('fn', {}).order('question_id', { ascending: true }).range(1000, 1199)

    expect(client.orderCalls).toEqual([
      ['question_id', { ascending: true }],
      ['question_id', { ascending: true }],
    ])
    expect(client.rangeCalls).toEqual([
      [0, 999],
      [1000, 1199],
    ])
  })

  it('returns an empty page once the queued pages fixture is exhausted', async () => {
    const client = createChainableRpcClient({
      firstCall: { data: [], error: null },
      pages: [{ data: [{ id: 'p1' }], error: null }],
    })
    await client.rpc('fn', {}).range(0, 999)
    const result = await client.rpc('fn', {}).range(1000, 1999)

    expect(result).toEqual({ data: [], error: null })
  })

  it('surfaces a page-level error returned by range()', async () => {
    const client = createChainableRpcClient({
      firstCall: { data: [], error: null },
      pages: [{ data: null, error: { message: 'page failed' } }],
    })
    const result = await client.rpc('fn', {}).range(0, 999)

    expect(result).toEqual({ data: null, error: { message: 'page failed' } })
  })

  it('records every rpc() invocation on the returned mock for assertion', async () => {
    const client = createChainableRpcClient({ firstCall: { data: [], error: null } })
    await client.rpc('fn_name', { p_arg: 'x' })

    expect(client.rpc).toHaveBeenCalledWith('fn_name', { p_arg: 'x' })
  })

  it('tracks call state independently across separate client instances', async () => {
    const clientA = createChainableRpcClient({ firstCall: { data: [], error: null } })
    const clientB = createChainableRpcClient({ firstCall: { data: [], error: null } })

    await clientA.rpc('fn', {}).order('id', { ascending: true }).range(0, 9)

    expect(clientA.orderCalls).toHaveLength(1)
    expect(clientA.rangeCalls).toHaveLength(1)
    expect(clientB.orderCalls).toHaveLength(0)
    expect(clientB.rangeCalls).toHaveLength(0)
    expect(clientB.rpc).not.toHaveBeenCalled()
  })
})
