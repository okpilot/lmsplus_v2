// Shared runtime guards for integration-test RPC / .select() results.
//
// code-style.md §5: an unguarded `data as unknown as T` on an RPC or
// `.select()` result throws an opaque `TypeError` ("Cannot read properties of
// null") on a null/shape regression instead of a clean assertion failure —
// masking the real cause. Checking `{ error }` alone does NOT satisfy this: a
// regression that returns null/[]/a wrong shape WITH `error === null` still
// produces the opaque throw. These helpers guard the RESULT's null-ness/shape
// before it is treated as the typed shape, turning a regression into a labelled
// failure (e.g. "get_vfr_rt_exam_results: RPC returned null").
//
// Sibling: `requireInsertedId` (rpc-get-quiz-questions.integration.test.ts)
// guards the narrower `.select('id').single()` insert-result shape.

/**
 * Assert an object-returning RPC / single-row `.select()` result is a non-null
 * object, then return it as `T`. Use for RPCs that return a JSONB object or a
 * single row (e.g. `get_vfr_rt_exam_results`, `submit_vfr_rt_exam_answers`).
 */
export function requireRpcResult<T>(data: unknown, label: string): T {
  if (data === null || data === undefined || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${label}: expected a non-null object result, got ${describe(data)}`)
  }
  return data as T
}

/**
 * Assert a TABLE-returning RPC / multi-row `.select()` result is an array, then
 * return it as `T[]`. Use for RPCs that return rows (e.g.
 * `get_vfr_rt_exam_questions`, `get_question_authoring_fields`).
 */
export function requireRpcRows<T>(data: unknown, label: string): T[] {
  if (!Array.isArray(data)) {
    throw new Error(`${label}: expected an array result, got ${describe(data)}`)
  }
  return data as T[]
}

function describe(data: unknown): string {
  if (data === null) return 'null'
  if (data === undefined) return 'undefined'
  if (Array.isArray(data)) return 'array'
  return typeof data
}
