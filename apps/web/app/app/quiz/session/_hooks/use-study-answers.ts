import { useRef, useState } from 'react'
import type { DraftAnswer } from '../../types'

/** Practice-mode answers, seeded from the server's initial answers, with a ref mirroring the state. */
export function useStudyAnswers(initialAnswers: Record<string, DraftAnswer> | undefined) {
  const [studyAnswers, setStudyAnswers] = useState<Map<string, DraftAnswer>>(() =>
    initialAnswers ? new Map(Object.entries(initialAnswers)) : new Map(),
  )
  const studyAnswersRef = useRef(studyAnswers)
  studyAnswersRef.current = studyAnswers
  return { studyAnswers, setStudyAnswers, studyAnswersRef }
}
