/** An anchored pattern for a parameterised `RAISE EXCEPTION` text. */
export type RpcErrorPattern<T> = readonly [pattern: RegExp, value: T]

/**
 * Exact match of a PostgREST `error.message` (= the RAISE text) against `map`'s own keys,
 * then against anchored `patterns` for parameterised texts. A message that merely contains
 * a key does not match.
 */
export function matchRpcError<T>(
  message: string | undefined,
  map: Readonly<Record<string, T>>,
  patterns: ReadonlyArray<RpcErrorPattern<T>> = [],
): T | undefined {
  if (message === undefined) return undefined
  if (Object.hasOwn(map, message)) return map[message]
  for (const [pattern, value] of patterns) {
    if (pattern.test(message)) return value
  }
  return undefined
}
