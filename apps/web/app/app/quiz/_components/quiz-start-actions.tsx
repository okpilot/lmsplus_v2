'use client'

import { Card, CardContent } from '@/components/ui/card'
import { FieldError } from '@/components/ui/field-error'
import type { useExamStart } from '../_hooks/use-exam-start'
import type { useQuizConfig } from '../_hooks/use-quiz-config'
import { BlockedStartAlert } from './blocked-start-alert'
import { QuestionCount } from './question-count'
import { StartButton } from './start-button'

type QuizStartActionsProps = {
  config: ReturnType<typeof useQuizConfig>
  exam: ReturnType<typeof useExamStart>
  examSubjectId: string
  subjectsFailed?: boolean
}

export function QuizStartActions(props: Readonly<QuizStartActionsProps>) {
  const { config, exam, examSubjectId, subjectsFailed } = props
  const isExam = config.mode === 'exam'
  return (
    <div className="space-y-stack lg:col-start-1 lg:row-start-2 lg:sticky lg:top-section">
      {!isExam && !subjectsFailed && config.subjectId && (
        <Card>
          <CardContent>
            <QuestionCount
              value={config.count}
              max={config.availableCount}
              onValueChange={config.setCount}
            />
          </CardContent>
        </Card>
      )}

      {/* Start failures and the blocked-start offer — both modes */}
      <BlockedStartAlert
        message={isExam ? exam.error : config.error}
        blocked={isExam ? exam.blocked : config.blocked}
        startLabel={isExam ? 'exam' : 'quiz'}
      />
      {!isExam && config.authError && (
        <FieldError role="alert">Session expired. Please refresh the page.</FieldError>
      )}

      {isExam && (
        <StartButton
          disabled={!examSubjectId || exam.loading}
          loading={exam.loading}
          label="Start Practice Exam"
          onClick={exam.handleStart}
        />
      )}
      {!isExam && !subjectsFailed && (
        <StartButton
          disabled={
            !config.subjectId ||
            config.availableCount === 0 ||
            config.loading ||
            config.isPending ||
            config.authError
          }
          loading={config.loading}
          label="Start Quiz"
          onClick={config.handleStart}
        />
      )}
    </div>
  )
}
