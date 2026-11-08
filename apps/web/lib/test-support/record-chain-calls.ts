export type ChainCall = { table: string; method: string; args: unknown[] }

/**
 * Wraps a Supabase query-chain mock so every chained method call is appended to `log`
 * as `{ table, method, args }`. The chain's own behaviour (including thenable resolution)
 * is untouched, so a test can assert filters such as `.is('deleted_at', null)` per table.
 */
export function recordChainCalls<T>(table: string, chain: T, log: ChainCall[]): T {
  if (typeof chain !== 'object' || chain === null) return chain
  return new Proxy(chain, {
    get(target, prop, receiver) {
      const value: unknown = Reflect.get(target, prop, receiver)
      if (typeof value !== 'function') return value
      // Promises and thenables need their own receiver, not the Proxy.
      if (prop === 'then') return value.bind(target)
      return (...args: unknown[]) => {
        log.push({ table, method: String(prop), args })
        return recordChainCalls(table, value.apply(target, args), log)
      }
    },
  })
}

/** True when `log` holds `.is('deleted_at', null)` on `table`. */
export function hasDeletedAtFilter(log: readonly ChainCall[], table: string): boolean {
  return log.some(
    (c) =>
      c.table === table && c.method === 'is' && c.args[0] === 'deleted_at' && c.args[1] === null,
  )
}
