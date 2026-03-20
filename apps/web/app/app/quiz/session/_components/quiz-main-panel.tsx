import { AnswerOptions } from '@/app/app/_components/answer-options'
import { QuestionCard } from '@/app/app/_components/question-card'
import { SessionTimer } from '@/app/app/_components/session-timer'
import type { QuestionTab } from '../../_components/question-tabs'
import { QuestionTabs } from '../../_components/question-tabs'
import type { QuizState } from '../_hooks/use-quiz-state'
import { QuizControls } from './quiz-controls'
import { QuizTabContent } from './quiz-tab-content'

type QuizProgressBarProps = {
  answeredCount: number
  totalQuestions: number
}

function QuizProgressBar({ answeredCount, totalQuestions }: QuizProgressBarProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 flex-1 rounded-full bg-muted">
        <div
          data-testid="progress-bar"
          className="h-1.5 rounded-full bg-primary transition-all"
          style={{ width: `${(answeredCount / totalQuestions) * 100}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground">
        {answeredCount}/{totalQuestions}
      </span>
    </div>
  )
}

type QuizMainPanelProps = {
  s: QuizState
  totalQuestions: number
  activeTab: QuestionTab
  onTabChange: (tab: QuestionTab) => void
  userId: string
}

export function QuizMainPanel({
  s,
  totalQuestions,
  activeTab,
  onTabChange,
  userId,
}: QuizMainPanelProps) {
  if (!s.question) return null
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <QuizProgressBar answeredCount={s.answeredCount} totalQuestions={totalQuestions} />
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">
          Question {s.currentIndex + 1} of {totalQuestions}
        </span>
        <SessionTimer className="text-sm" />
        <span className="text-muted-foreground">
          {s.question.question_number ? `No. ${s.question.question_number}` : '\u00A0'}
        </span>
      </div>
      <QuestionCard
        questionText={s.question.question_text}
        questionImageUrl={s.question.question_image_url}
      />
      {s.error && (
        <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {s.error}
        </div>
      )}
      <AnswerOptions
        key={s.question.id}
        options={s.question.options}
        onSubmit={s.handleSelectAnswer}
        disabled={s.submitting}
        selectedOptionId={s.existingAnswer?.selectedOptionId ?? null}
        correctOptionId={s.currentFeedback?.correctOptionId ?? null}
      />
      <QuestionTabs activeTab={activeTab} onTabChange={onTabChange} />
      <QuizTabContent
        activeTab={activeTab}
        questionId={s.questionId}
        existingAnswer={s.existingAnswer}
        currentFeedback={s.currentFeedback}
        explanationText={s.question.explanation_text}
        explanationImageUrl={s.question.explanation_image_url}
        userId={userId}
      />
      <QuizControls
        isPinned={s.isPinned}
        currentIndex={s.currentIndex}
        totalQuestions={totalQuestions}
        answeredCount={s.answeredCount}
        submitting={s.submitting}
        showFinishDialog={s.showFinishDialog}
        onTogglePin={s.togglePin}
        onPrev={() => s.navigate(-1)}
        onNext={() => s.navigate(1)}
        onFinish={() => s.setShowFinishDialog(true)}
        onSubmit={s.handleSubmit}
        onCancel={() => s.setShowFinishDialog(false)}
        onSave={s.handleSave}
        onDiscard={s.handleDiscard}
      />
    </div>
  )
}
