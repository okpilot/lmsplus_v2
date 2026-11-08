/**
 * True when a PostgREST read with `count: 'exact'` asked for a page at or past the end.
 * Two cases: offset > total errors with PGRST103; offset == total returns 200/206 with `[]`
 * and the real count. A genuinely empty set (`count` 0) is not past the end.
 */
export function isPastEndPage(result: {
  data: unknown
  count: number | null
  error: { code?: string } | null
}): boolean {
  const { data, count, error } = result
  if (error) return error.code === 'PGRST103'
  return Array.isArray(data) && data.length === 0 && typeof count === 'number' && count > 0
}
