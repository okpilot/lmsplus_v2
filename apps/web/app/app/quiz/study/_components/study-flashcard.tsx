'use client'

import { Flag } from 'lucide-react'
import { AnswerOptions } from '@/app/app/_components/answer-options'
import { QuestionCard } from '@/app/app/_components/question-card'
import { ExplanationTab } from '@/app/app/quiz/_components/explanation-tab'
import type { StudyQuestion } from '@/lib/queries/study-queries'

type StudyFlashcardProps = {
  question: StudyQuestion
  isFlagged: boolean
  onToggleFlag: () => void
  flagLoading: boolean
}

export function StudyFlashcard({
  question,
  isFlagged,
  onToggleFlag,
  flagLoading,
}: StudyFlashcardProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {question.subjectCode && (
            <span className="rounded bg-primary/15 px-1.5 py-0.5 font-mono font-semibold text-primary">
              {question.subjectCode}
            </span>
          )}
          {question.topicName && <span>{question.topicName}</span>}
          {question.subtopicName && <span>· {question.subtopicName}</span>}
          {question.questionNumber && (
            <span className="font-mono text-muted-foreground/70">#{question.questionNumber}</span>
          )}
        </div>
        <FlagButton isFlagged={isFlagged} onToggleFlag={onToggleFlag} flagLoading={flagLoading} />
      </div>

      <QuestionCard
        questionText={question.questionText}
        questionImageUrl={question.questionImageUrl}
      />

      {/* Answer locked to the correct option so AnswerOptions paints the green
          highlight immediately. disabled + onSubmit no-op: this is reveal-only. */}
      <AnswerOptions
        options={question.options}
        correctOptionId={question.correctOptionId}
        selectedOptionId={question.correctOptionId}
        disabled
        isExam={false}
        onSubmit={() => {}}
      />

      <div className="rounded-xl border border-border bg-card px-6">
        <ExplanationTab
          explanationText={question.explanationText}
          explanationImageUrl={question.explanationImageUrl}
        />
      </div>
    </div>
  )
}

function FlagButton({
  isFlagged,
  onToggleFlag,
  flagLoading,
}: {
  isFlagged: boolean
  onToggleFlag: () => void
  flagLoading: boolean
}) {
  return (
    <button
      type="button"
      data-testid="flag-button"
      onClick={onToggleFlag}
      aria-pressed={isFlagged}
      disabled={flagLoading}
      className={
        isFlagged
          ? 'flex shrink-0 items-center gap-1.5 rounded-lg border border-transparent bg-orange-500/10 px-3 py-2 text-sm font-medium text-orange-600 transition-colors disabled:opacity-50 disabled:pointer-events-none dark:bg-orange-500/15 dark:text-orange-400'
          : 'flex shrink-0 items-center gap-1.5 rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:pointer-events-none'
      }
    >
      <Flag className="h-4 w-4" />
      {isFlagged ? 'Unflag' : 'Flag'}
    </button>
  )
}
