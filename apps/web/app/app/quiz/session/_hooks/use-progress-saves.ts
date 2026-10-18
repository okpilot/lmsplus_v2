import { useEffect, useRef, useState } from 'react'
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
  const savedRef = useRef(false)
  // The device claim settles after the first render; its error joins the save error unless a save
  // already succeeded. A takeover the claim did not report is caught when a later write is
  // refused: withTakeoverCheck marks the session taken over and useTakeoverExit leaves the runner.
  useEffect(() => {
    if (opts.initialSaveError && !savedRef.current && !isTakenOver(opts.sessionId)) {
      setSaveError(opts.initialSaveError)
    }
  }, [opts.initialSaveError, opts.sessionId])
  const saves = buildRunnerSaves({
    sessionId: opts.sessionId,
    enabled: opts.mode !== 'discovery',
    currentQuestion: () => opts.questions[currentIndexRef.current],
    visitStartedAt: () => answerStartTime.current,
    onSuccess: () => {
      savedRef.current = true
      setSaveError(null)
    },
    // The takeover exit follows; the copy would only flash.
    onMappedError: (message: string) => {
      if (!isTakenOver(opts.sessionId)) setSaveError(message)
    },
  })
  return { saveError, ...saves }
}
