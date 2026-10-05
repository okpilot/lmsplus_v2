type Entry = { input: unknown; failed: boolean }

const entries = new Map<string, Map<string, Entry>>()

/** @internal Test-only reset for the module-level state. */
export function _resetUnsavedAnswers() {
  entries.clear()
}

type SendKey = { sessionId: string; questionId: string; input: unknown }

/** Records `input` as the latest answer send for the question and clears its failed mark. */
export function trackAnswerSend(opts: SendKey): void {
  const forSession = entries.get(opts.sessionId) ?? new Map<string, Entry>()
  forSession.set(opts.questionId, { input: opts.input, failed: false })
  entries.set(opts.sessionId, forSession)
}

/** Records how a send ended; ignored unless it is still the latest send for the question. */
export function settleAnswerSend(opts: SendKey & { ok: boolean }): void {
  const forSession = entries.get(opts.sessionId)
  const entry = forSession?.get(opts.questionId)
  if (!forSession || !entry || entry.input !== opts.input) return
  if (opts.ok) forSession.delete(opts.questionId)
  else entry.failed = true
}

/** The session's answers whose latest save failed. */
export function failedAnswers(sessionId: string): Array<{ questionId: string; input: unknown }> {
  return [...(entries.get(sessionId) ?? [])]
    .filter(([, entry]) => entry.failed)
    .map(([questionId, entry]) => ({ questionId, input: entry.input }))
}
