export type AnswerState = {
  mc?: string
  short?: string
  blanks?: Record<number, string>
}

export type AnswersMap = Record<string, AnswerState>

export function storageKey(sessionId: string): string {
  return `vfr-rt-answers:${sessionId}`
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// Validate each entry's shape so a hand-tampered/corrupt value can't enter state
// and crash downstream string ops (.trim()). typeof [] === 'object', so arrays
// must be excluded explicitly at every level.
export function loadAnswers(sessionId: string): AnswersMap {
  try {
    const raw = localStorage.getItem(storageKey(sessionId))
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!isPlainObject(parsed)) return {}
    const safe: AnswersMap = {}
    for (const [qId, v] of Object.entries(parsed)) {
      if (!isPlainObject(v)) continue
      const next: AnswerState = {}
      if (typeof v.mc === 'string') next.mc = v.mc
      if (typeof v.short === 'string') next.short = v.short
      if (isPlainObject(v.blanks)) {
        const b: Record<number, string> = {}
        for (const [k, val] of Object.entries(v.blanks)) {
          const idx = Number(k)
          // Reject NaN / negative / non-integer keys so a tampered store can't
          // leak an invalid blankIndex into the submission payload.
          if (Number.isInteger(idx) && idx >= 0 && typeof val === 'string') b[idx] = val
        }
        next.blanks = b
      }
      safe[qId] = next
    }
    return safe
  } catch {
    return {}
  }
}
