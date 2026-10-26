/** True when both lists hold the same ids, ignoring order and duplicates. */
export function sameIdSet(a: readonly string[], b: readonly string[]): boolean {
  const setA = new Set(a)
  const setB = new Set(b)
  return setA.size === setB.size && [...setA].every((id) => setB.has(id))
}
