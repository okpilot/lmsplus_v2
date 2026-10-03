import { useState } from 'react'
import type { QuizStateOpts } from '../../session-types'
import { buildRunnerSaves } from '../_utils/progress-sync-saves'
import { isTakenOver } from '../_utils/session-takeover'

type SavesDeps = {
  opts: QuizStateOpts
  currentIndexRef: React.MutableRefObject<number>
  answerStartTime: React.MutableRefObject<number>
}

/** Background server saves plus the displayable save error they surface. Discovery saves nothing. */
export function useProgressSaves({ opts, currentIndexRef, answerStartTime }: Readonly<SavesDeps>) {
  const [saveError, setSaveError] = useState<string | null>(opts.initialSaveError ?? null)
  const saves = buildRunnerSaves({
    sessionId: opts.sessionId,
    enabled: opts.mode !== 'discovery',
    currentQuestion: () => opts.questions[currentIndexRef.current],
    visitStartedAt: () => answerStartTime.current,
    onSuccess: () => setSaveError(null),
    // The takeover exit follows; the copy would only flash.
    onMappedError: (message: string) => {
      if (!isTakenOver(opts.sessionId)) setSaveError(message)
    },
  })
  return { saveError, ...saves }
}
