import { useState } from 'react'
import type { QuestionType } from '@/app/app/_types/session'
import type { CalcMode, ImageMode, QuestionFilterValue, QuizMode } from '../types'
import { createConfigHandlers } from './quiz-config-handlers'
import type { useFilteredCount } from './use-filtered-count'
import type { useTopicTree } from './use-topic-tree'

/**
 * Owns the quiz-builder selection state (subject, mode, filters, calc/image/
 * question-type mode, count) and the change handlers that decide reset-vs-keep.
 * Extracted from useQuizConfig so the orchestration hook stays within the hook
 * line budget. Returns the policy-applying handlers (`handleSubjectChange`,
 * `handleFiltersChange`, `handleCalcModeChange`, `handleImageModeChange`,
 * `handleQuestionTypeChange`) alongside the raw setters it still exposes
 * directly (`setMode`, `setCount`).
 */
export function useQuizConfigState(deps: {
  fc: ReturnType<typeof useFilteredCount>
  topicTree: ReturnType<typeof useTopicTree>
  initialSubjectId?: string
  initialMode?: QuizMode
}) {
  const [subjectId, setSubjectId] = useState(deps.initialSubjectId ?? '')
  const [mode, setMode] = useState<QuizMode>(deps.initialMode ?? 'discovery')
  const [filters, setFilters] = useState<QuestionFilterValue[]>(['all'])
  const [calcMode, setCalcMode] = useState<CalcMode>('all')
  const [imageMode, setImageMode] = useState<ImageMode>('all')
  // RT setup's single-select type filter (Slice 3) — undefined = no restriction
  // (identical shape to calcMode/imageMode, mirrored end-to-end).
  const [questionType, setQuestionType] = useState<QuestionType | undefined>(undefined)
  const [count, setCount] = useState(10)

  const hasActiveFilters =
    filters.some((f) => f !== 'all') ||
    calcMode !== 'all' ||
    imageMode !== 'all' ||
    questionType !== undefined

  const {
    handleSubjectChange,
    handleFiltersChange,
    handleCalcModeChange,
    handleImageModeChange,
    handleQuestionTypeChange,
  } = createConfigHandlers({
    setSubjectId,
    setFilters,
    setCount,
    setCalcMode,
    setImageMode,
    setQuestionType,
    fc: deps.fc,
    topicTree: deps.topicTree,
    filters,
    calcMode,
    imageMode,
    questionType,
  })

  return {
    subjectId,
    mode,
    setMode,
    filters,
    calcMode,
    imageMode,
    questionType,
    count,
    setCount,
    hasActiveFilters,
    handleSubjectChange,
    handleFiltersChange,
    handleCalcModeChange,
    handleImageModeChange,
    handleQuestionTypeChange,
  }
}
