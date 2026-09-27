// Shared fixtures for the red-team matrix tests.

/** A row that satisfies every rule. */
export const VALID_ROW = [
  'ZZ',
  'probe-something',
  'HIGH',
  'rate-limiting.spec.ts',
  'FIXED',
  '',
  'rate-limit',
]

/** A Vector-to-Spec Mapping table holding just `row`. */
export function matrixWithRow(row: readonly string[]): string {
  return [
    '## Vector-to-Spec Mapping',
    '',
    '| ID | Vector | Priority | Spec File | Status | Notes | Technique |',
    '|----|--------|----------|-----------|--------|-------|---|',
    `| ${row.join(' | ')} |`,
  ].join('\n')
}
