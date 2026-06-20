'use client'

import { useCallback, useEffect, useState } from 'react'
import { type AnswersMap, loadAnswers, storageKey } from './vfr-rt-answer-storage'

export type { AnswerState } from './vfr-rt-answer-storage'

export function useVfrRtAnswers(sessionId: string) {
  const [hydrated, setHydrated] = useState(false)
  const [answers, setAnswers] = useState<AnswersMap>({})

  // Approved hydration-guard useEffect (not data fetching): read persisted
  // answers from localStorage after mount so SSR and client agree.
  useEffect(() => {
    setAnswers(loadAnswers(sessionId))
    setHydrated(true)
  }, [sessionId])

  // Persist only after hydration so the empty initial state never overwrites
  // saved answers before they load.
  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(storageKey(sessionId), JSON.stringify(answers))
    } catch {
      // private-mode / quota — ignore
    }
  }, [answers, hydrated, sessionId])

  const setMc = useCallback((qId: string, optionId: string) => {
    setAnswers((prev) => ({ ...prev, [qId]: { ...prev[qId], mc: optionId } }))
  }, [])

  const setShort = useCallback((qId: string, text: string) => {
    setAnswers((prev) => ({ ...prev, [qId]: { ...prev[qId], short: text } }))
  }, [])

  const setBlank = useCallback((qId: string, blankIndex: number, text: string) => {
    setAnswers((prev) => {
      const blanks = { ...prev[qId]?.blanks, [blankIndex]: text }
      return { ...prev, [qId]: { ...prev[qId], blanks } }
    })
  }, [])

  return { hydrated, answers, setMc, setShort, setBlank }
}
