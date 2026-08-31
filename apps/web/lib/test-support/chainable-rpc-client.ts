// Shared chainable-RPC test mock (extracted from a near-verbatim duplicate in
// supabase-rpc.test.ts and admin-report-helpers.test.ts — both simulated the same
// Supabase `.rpc()` call shape independently and would have drifted apart on the
// next change to it).
import { vi } from 'vitest'

export type RpcChain = {
  then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => Promise<unknown>
  order: (col: string, opts: unknown) => RpcChain
  range: (from: number, to: number) => Promise<{ data: unknown; error: unknown }>
}

// Overloaded (not a single optional-arg signature) so the TWO real call shapes stay
// distinguishable at the type level: a 2-arg call resolves to a chain, a 3-arg call
// (with count/head opts) resolves to a count result. A single union-returning
// signature would make every call site's return type a union, forcing a cast before
// `.order()`/`.range()` could be used.
export type ChainableRpcMock = {
  (
    fn: string,
    args: Record<string, unknown>,
    opts: { count: 'exact'; head: true },
  ): Promise<{ count: number | null; error: { message: string } | null }>
  (fn: string, args: Record<string, unknown>): RpcChain
}

export type ChainableRpcClientFixture = {
  /** Resolved by the plain, unpaged `.rpc(fn, args)` call when it is awaited directly. */
  firstCall: { data: unknown; error?: { message: string } | null }
  /** Resolved by `.rpc(fn, args, { count: 'exact', head: true })`. Defaults to `{ count: 0, error: null }`. */
  count?: { count: number | null; error?: { message: string } | null }
  /** Consumed in call order — each `.range()` call takes the next entry. Defaults to `{ data: [], error: null }` once exhausted. */
  pages?: { data: unknown; error?: { message: string } | null }[]
}

export type ChainableRpcClient = {
  rpc: ChainableRpcMock
  /** Every `[column, opts]` pair passed to `.order()` on any chain, in call order. */
  orderCalls: [string, unknown][]
  /** Every `[from, to]` pair passed to `.range()` on any chain, in call order. */
  rangeCalls: [number, number][]
}

/**
 * A chainable RPC mock matching the real Supabase builder's shape: `.rpc(fn, args)`
 * must behave BOTH as an awaitable (the plain, unpaged first call) AND as a chain via
 * `.order()`/`.range()` (the paged calls) — the same two-arg call shape serves both,
 * distinguished only by whether the caller awaits it directly or chains off it.
 * `.rpc(fn, args, opts)` (three args, with `{ count, head }`) is the separate
 * count-only call used by the paginated fallback (`fetchAllRows` / `fetchAllRpcRows`).
 *
 * Tracks every `.order()`/`.range()` invocation so a test can assert exact page
 * boundaries (e.g. `[[0, 999], [1000, 1199]]`) rather than only that pagination
 * happened at all — see `code-style.md` §7 (non-vacuous assertions).
 */
export function createChainableRpcClient(fixture: ChainableRpcClientFixture): ChainableRpcClient {
  const orderCalls: [string, unknown][] = []
  const rangeCalls: [number, number][] = []
  let rangeCallIndex = 0

  function makeChain(): RpcChain {
    const chain: RpcChain = {
      // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
      then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
        Promise.resolve({
          data: fixture.firstCall.data,
          error: fixture.firstCall.error ?? null,
        }).then(resolve, reject),
      order: (col: string, o: unknown) => {
        orderCalls.push([col, o])
        return chain
      },
      range: async (from: number, to: number) => {
        rangeCalls.push([from, to])
        const page = fixture.pages?.[rangeCallIndex] ?? { data: [], error: null }
        rangeCallIndex++
        return { data: page.data, error: page.error ?? null }
      },
    }
    return chain
  }

  // The implementation function's inferred type (a single signature with an optional
  // third arg) is narrower than the exported ChainableRpcMock overload — vi.fn() still
  // wraps it with full mock-inspection support (toHaveBeenCalledWith, etc.), so the cast
  // below only widens the CALL-SHAPE typing seen by consumers, not the runtime behavior.
  const rpcFn = vi.fn(
    (_fn: string, _args: Record<string, unknown>, rpcOpts?: { count: 'exact'; head: true }) => {
      if (rpcOpts) return Promise.resolve(fixture.count ?? { count: 0, error: null })
      return makeChain()
    },
  )

  return { rpc: rpcFn as unknown as ChainableRpcMock, orderCalls, rangeCalls }
}
