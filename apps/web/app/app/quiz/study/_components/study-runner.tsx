'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { StudyQuestion } from '@/lib/queries/study-queries'
import { useFlaggedQuestions } from '../../session/_hooks/use-flagged-questions'
import { StudyFlashcard } from './study-flashcard'

type StudyRunnerProps = {
  questions: StudyQuestion[]
  onExit: () => void
}

export function StudyRunner({ questions, onExit }: StudyRunnerProps) {
  // useFlaggedQuestions compares questionIds by reference, so memoize on `questions`.
  const questionIds = useMemo(() => questions.map((q) => q.id), [questions])
  const { isFlagged, toggleFlag, isToggling } = useFlaggedQuestions(questionIds)
  const [currentIndex, setCurrentIndex] = useState(0)

  const goPrev = useCallback(() => setCurrentIndex((i) => Math.max(i - 1, 0)), [])
  const goNext = useCallback(
    () => setCurrentIndex((i) => Math.min(i + 1, questions.length - 1)),
    [questions.length],
  )

  // Keyboard paging — arrow keys mirror the prev/next buttons. Not data fetching.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') goNext()
      else if (e.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goPrev, goNext])

  if (questions.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">No questions match these filters.</p>
        <button
          type="button"
          onClick={onExit}
          className="mt-4 rounded-lg border border-input px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          Choose different filters
        </button>
      </div>
    )
  }

  const current = questions[currentIndex]
  if (!current) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onExit}
          className="rounded-lg border border-input px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
        >
          &lsaquo; New set
        </button>
        <p className="text-sm font-medium text-muted-foreground" data-testid="study-progress">
          {currentIndex + 1} / {questions.length}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <StudyFlashcard
          question={current}
          isFlagged={isFlagged(current.id)}
          onToggleFlag={() => toggleFlag(current.id)}
          flagLoading={isToggling(current.id)}
        />
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="rounded-lg border border-input px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          &lsaquo; Previous
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={currentIndex === questions.length - 1}
          className="rounded-lg border border-input px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          Next &rsaquo;
        </button>
      </div>
    </div>
  )
}
