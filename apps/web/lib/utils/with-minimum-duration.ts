/**
 * Resolves (or rejects) with `work`'s outcome, but never earlier than `ms`
 * after this is called — used to flatten a timing side-channel where a fast
 * path (e.g. an unknown account) would otherwise return sooner than a slow
 * one (e.g. a real account needing extra lookups) and let a caller infer
 * which branch ran from response time alone.
 *
 * `work` keeps running regardless of the floor; only the returned promise's
 * settlement is delayed. A `work` that is already slower than `ms` is not
 * delayed further.
 */
export async function withMinimumDuration<T>(work: Promise<T>, ms: number): Promise<T> {
  const floor = new Promise<void>((resolve) => setTimeout(resolve, ms))
  try {
    const value = await work
    await floor
    return value
  } catch (error) {
    await floor
    throw error
  }
}
