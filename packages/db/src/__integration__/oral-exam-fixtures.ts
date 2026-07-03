// Shared fixtures for the ELP oral-exam RPC integration suites
// (rpc-oral-exam-modes.integration.test.ts, rpc-oral-exam-grade.integration.test.ts).

export const DESCRIPTORS = [
  'pronunciation',
  'structure',
  'vocabulary',
  'fluency',
  'comprehension',
  'interaction',
] as const

// Six per-section descriptor scores, all `level` unless a descriptor is overridden.
export function sixScores(level: number, overrides: Record<string, number> = {}) {
  return DESCRIPTORS.map((descriptor) => ({
    descriptor,
    level: overrides[descriptor] ?? level,
    rationale: `evidence for ${descriptor}`,
  }))
}
