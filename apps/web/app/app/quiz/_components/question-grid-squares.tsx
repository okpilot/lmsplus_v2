import { cn } from '@/lib/utils'
import { getSquareClass } from './filter-pill'

export type GridFilter = 'all' | 'flagged' | 'pinned'

type BuildSquaresOpts = {
  totalQuestions: number
  currentIndex: number
  filter: GridFilter
  questionIds: string[]
  flaggedIds: Set<string>
  pinnedIds: Set<string>
  feedbackMap: Map<string, { isCorrect: boolean }>
  onNavigate: (index: number) => void
  isExamMode?: boolean
  answeredIds?: Set<string>
}

/**
 * Builds the full array of navigator square buttons (one per question), with
 * `null` entries for questions filtered out by the active flagged/pinned
 * filter. The caller slices this array to apply the two-row collapse window.
 */
export function buildSquares(opts: BuildSquaresOpts) {
  const {
    totalQuestions,
    currentIndex,
    filter,
    questionIds,
    flaggedIds,
    pinnedIds,
    feedbackMap,
    onNavigate,
    isExamMode,
    answeredIds,
  } = opts
  return Array.from({ length: totalQuestions }, (_, i) => {
    const qId = questionIds[i] ?? ''
    const isCurrent = i === currentIndex
    const feedback = feedbackMap.get(qId)
    const isCorrect = feedback ? feedback.isCorrect : null
    const isFlagged = flaggedIds.has(qId)
    const isPinned = pinnedIds.has(qId)
    const isAnsweredInExam = isExamMode && !isCurrent && (answeredIds?.has(qId) ?? false)
    if ((filter === 'flagged' && !isFlagged) || (filter === 'pinned' && !isPinned)) return null
    return (
      <button
        key={qId || i}
        type="button"
        data-testid={`grid-btn-${i}`}
        onClick={() => onNavigate(i)}
        className={cn(
          'flex aspect-square items-center justify-center rounded-lg text-xs font-medium transition-all',
          getSquareClass({ isCurrent, isCorrect, isAnsweredInExam }),
        )}
        aria-current={isCurrent ? 'step' : undefined}
        aria-label={`Question ${i + 1}${isFlagged ? ', flagged' : ''}${isPinned ? ', pinned' : ''}`}
      >
        {i + 1}
      </button>
    )
  })
}
