import { cn } from '@/lib/utils'
import { getSquareClassFor, getSquareStatus } from './filter-pill'

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
  // Discovery-only: indices the user has already visited. They read as answered
  // (grey); left undefined for study/exam so their colouring is unchanged.
  seenIds?: Set<number>
}

function squareFlags(i: number, opts: BuildSquaresOpts) {
  const { currentIndex, questionIds, flaggedIds, pinnedIds } = opts
  const { feedbackMap, isExamMode, answeredIds, seenIds } = opts
  const qId = questionIds[i] ?? ''
  const isCurrent = i === currentIndex
  const feedback = feedbackMap.get(qId)
  const isCorrect = feedback ? feedback.isCorrect : null
  const isFlagged = flaggedIds.has(qId)
  const isPinned = pinnedIds.has(qId)
  // Exam: answered squares stay neutral. Practice: an answer whose feedback has not arrived yet.
  const isAnswered = answeredIds?.has(qId) ?? false
  const isAnsweredInExam = isAnswered && (isExamMode === true || !feedback)
  // The square the student is on is not yet "seen" — it reads as answered once they move on.
  const isSeen = !isCurrent && (seenIds?.has(i) ?? false)
  return { qId, isCurrent, isCorrect, isFlagged, isPinned, isAnsweredInExam, isSeen }
}

/** Renders a single navigator square, or `null` when the active filter hides it. */
function renderSquare(i: number, opts: BuildSquaresOpts) {
  const { filter, onNavigate } = opts
  const { qId, isCurrent, isCorrect, isFlagged, isPinned, isAnsweredInExam, isSeen } = squareFlags(
    i,
    opts,
  )
  if ((filter === 'flagged' && !isFlagged) || (filter === 'pinned' && !isPinned)) return null
  const status = getSquareStatus({ isCurrent, isCorrect, isAnsweredInExam, isSeen })
  return (
    <button
      key={qId || i}
      type="button"
      data-testid={`grid-btn-${i}`}
      onClick={() => onNavigate(i)}
      className={cn(
        'flex aspect-square items-center justify-center rounded-control text-caption font-medium transition-all',
        getSquareClassFor(status, isCurrent),
      )}
      data-status={status}
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
