import { type RefObject, useCallback, useRef, useState } from 'react'
import type { DraftAnswer } from '../../types'

type Answers = Record<string, DraftAnswer>

/**
 * Holds the one-time outcome of the local-answer upload: the server answers plus the local-only
 * answers the server accepted. First settle wins; later calls are ignored.
 */
export function useUploadSettle(seedRef: RefObject<{ serverAnswers: Answers }>) {
  const [settled, setSettled] = useState<Answers | null>(null)
  const settledRef = useRef(false)
  const localRef = useRef<Answers>({})

  const settle = useCallback(
    (savedIds: readonly string[]) => {
      if (settledRef.current) return
      settledRef.current = true
      const local = Object.fromEntries(
        Object.entries(localRef.current).filter(([id]) => savedIds.includes(id)),
      )
      setSettled({ ...local, ...seedRef.current.serverAnswers })
    },
    [seedRef],
  )

  return { settled, settle, localRef }
}
