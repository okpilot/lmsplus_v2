import { useState } from 'react'
import type { CalcMode, ImageMode, QuestionFilterValue, QuizMode } from '../types'
import { createConfigHandlers } from './quiz-config-handlers'
import type { useFilteredCount } from './use-filtered-count'
import type { useTopicTree } from './use-topic-tree'

/**
 * Owns the quiz-builder selection state (subject, mode, filters, calc/image
 * mode, count) and the change handlers that decide reset-vs-keep. Extracted from
 * useQuizConfig so the orchestration hook stays within the hook line budget.
 * Returns the policy-applying handlers (`handleFiltersChange`,
 * `handleCalcModeChange`, `handleImageModeChange`) alongside the raw setters it
 * still exposes directly (`setMode`, `setCount`).
 */
export function useQuizConfigState(deps: {
  fc: ReturnType<typeof useFilteredCount>
  topicTree: ReturnType<typeof useTopicTree>
}) {
  const [subjectId, setSubjectId] = useState('')
  const [mode, setMode] = useState<QuizMode>('study')
  const [filters, setFilters] = useState<QuestionFilterValue[]>(['all'])
  const [calcMode, setCalcMode] = useState<CalcMode>('all')
  const [imageMode, setImageMode] = useState<ImageMode>('all')
  const [count, setCount] = useState(10)

  const hasActiveFilters =
    filters.some((f) => f !== 'all') || calcMode !== 'all' || imageMode !== 'all'

  const { handleSubjectChange, handleFiltersChange, handleCalcModeChange, handleImageModeChange } =
    createConfigHandlers({
      setSubjectId,
      setFilters,
      setCount,
      setCalcMode,
      setImageMode,
      fc: deps.fc,
      topicTree: deps.topicTree,
      filters,
      calcMode,
      imageMode,
    })

  return {
    subjectId,
    mode,
    setMode,
    filters,
    calcMode,
    imageMode,
    count,
    setCount,
    hasActiveFilters,
    handleSubjectChange,
    handleFiltersChange,
    handleCalcModeChange,
    handleImageModeChange,
  }
}
