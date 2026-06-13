'use client'

import { useCallback, useEffect, useState } from 'react'
import type { QuestionRow } from '../types'
import {
  buildInitialFormState,
  buildSetterHandlers,
  type CorrectOptionId,
  type FormState,
} from './build-initial-form-state'

export type { CorrectOptionId }

export function useQuestionFormState(
  question: QuestionRow | undefined,
  open: boolean,
  initialCorrectOptionId: CorrectOptionId = '',
) {
  const [state, setState] = useState<FormState>(() =>
    buildInitialFormState(question, initialCorrectOptionId),
  )

  const setField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }))
  }, [])

  // Reset form when dialog closes (state-reset guard, not data-fetching)
  // biome-ignore lint/correctness/useExhaustiveDependencies: question prop read from closure on reset
  useEffect(() => {
    if (!open) setState(buildInitialFormState(question, initialCorrectOptionId))
  }, [open])

  function handleSubjectChange(id: string) {
    setState((prev) => ({ ...prev, subjectId: id, topicId: undefined, subtopicId: null }))
  }

  function handleTopicChange(id: string) {
    setState((prev) => ({ ...prev, topicId: id, subtopicId: null }))
  }

  const handlers = { handleSubjectChange, handleTopicChange, ...buildSetterHandlers(setField) }

  return { state, handlers }
}
