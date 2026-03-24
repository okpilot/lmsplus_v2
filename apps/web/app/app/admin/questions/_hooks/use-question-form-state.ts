'use client'

import { useEffect, useState } from 'react'
import type { QuestionOption, QuestionRow } from '../types'

const EMPTY_OPTIONS: QuestionOption[] = [
  { id: 'a', text: '', correct: false },
  { id: 'b', text: '', correct: false },
  { id: 'c', text: '', correct: false },
  { id: 'd', text: '', correct: false },
]

export function useQuestionFormState(question: QuestionRow | undefined, open: boolean) {
  const [subjectId, setSubjectId] = useState(question?.subject_id)
  const [topicId, setTopicId] = useState(question?.topic_id)
  const [subtopicId, setSubtopicId] = useState(question?.subtopic_id ?? null)
  const [questionNumber, setQuestionNumber] = useState(question?.question_number ?? '')
  const [loReference, setLoReference] = useState(question?.lo_reference ?? '')
  const [questionText, setQuestionText] = useState(question?.question_text ?? '')
  const [options, setOptions] = useState<QuestionOption[]>(question?.options ?? EMPTY_OPTIONS)
  const [explanationText, setExplanationText] = useState(question?.explanation_text ?? '')
  const [questionImageUrl, setQuestionImageUrl] = useState(question?.question_image_url ?? null)
  const [explanationImageUrl, setExplanationImageUrl] = useState(
    question?.explanation_image_url ?? null,
  )
  const [difficulty, setDifficulty] = useState(question?.difficulty ?? 'medium')
  const [status, setStatus] = useState(question?.status ?? 'draft')

  // Reset form when dialog closes
  // biome-ignore lint/correctness/useExhaustiveDependencies: question prop read from closure on reset
  useEffect(() => {
    if (!open) {
      setSubjectId(question?.subject_id)
      setTopicId(question?.topic_id)
      setSubtopicId(question?.subtopic_id ?? null)
      setQuestionNumber(question?.question_number ?? '')
      setLoReference(question?.lo_reference ?? '')
      setQuestionText(question?.question_text ?? '')
      setOptions(question?.options ?? EMPTY_OPTIONS)
      setExplanationText(question?.explanation_text ?? '')
      setQuestionImageUrl(question?.question_image_url ?? null)
      setExplanationImageUrl(question?.explanation_image_url ?? null)
      setDifficulty(question?.difficulty ?? 'medium')
      setStatus(question?.status ?? 'draft')
    }
  }, [open])

  function handleSubjectChange(id: string) {
    setSubjectId(id)
    setTopicId(undefined)
    setSubtopicId(null)
  }

  function handleTopicChange(id: string) {
    setTopicId(id)
    setSubtopicId(null)
  }

  return {
    state: {
      subjectId,
      topicId,
      subtopicId,
      questionNumber,
      loReference,
      questionText,
      options,
      explanationText,
      questionImageUrl,
      explanationImageUrl,
      difficulty,
      status,
    },
    handlers: {
      handleSubjectChange,
      handleTopicChange,
      setSubtopicId,
      setQuestionNumber,
      setLoReference,
      setQuestionText,
      setOptions,
      setExplanationText,
      setQuestionImageUrl,
      setExplanationImageUrl,
      setDifficulty,
      setStatus,
    },
  }
}
