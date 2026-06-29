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
  // Discovery-only: indices the user has already visited. Drives the "seen"
  // (green) colour; left undefined for study/exam so their colouring is unchanged.
  seenIds?: Set<number>
}

/** Renders a single navigator square, or `null` when the active filter hides it. */
function renderSquare(i: number, opts: BuildSquaresOpts) {
  const { currentIndex, filter, questionIds, flaggedIds, pinnedIds } = opts
  const { feedbackMap, onNavigate, isExamMode, answeredIds, seenIds } = opts
  const qId = questionIds[i] ?? ''
  const isCurrent = i === currentIndex
  const feedback = feedbackMap.get(qId)
  const isCorrect = feedback ? feedback.isCorrect : null
  const isFlagged = flaggedIds.has(qId)
  const isPinned = pinnedIds.has(qId)
  const isAnsweredInExam = isExamMode && !isCurrent && (answeredIds?.has(qId) ?? false)
  const isSeen = !isCurrent && (seenIds?.has(i) ?? false)
  if ((filter === 'flagged' && !isFlagged) || (filter === 'pinned' && !isPinned)) return null
  return (
    <button
      key={qId || i}
      type="button"
      data-testid={`grid-btn-${i}`}
      onClick={() => onNavigate(i)}
      className={cn(
        'flex aspect-square items-center justify-center rounded-lg text-xs font-medium transition-all',
        getSquareClass({ isCurrent, isCorrect, isAnsweredInExam, isSeen }),
      )}
      aria-current={isCurrent ? 'step' : undefined}
      aria-label={`Question ${i + 1}${isFlagged ? ', flagged' : ''}${isPinned ? ', pinned' : ''}`}
    >
      {i + 1}
    </button>
  )
}

/**
 * Builds the full array of navigator square buttons (one per question), with
 * `null` entries for questions filtered out by the active flagged/pinned
 * filter. The caller slices this array to apply the two-row collapse window.
 */
export function buildSquares(opts: BuildSquaresOpts) {
  return Array.from({ length: opts.totalQuestions }, (_, i) => renderSquare(i, opts))
}
