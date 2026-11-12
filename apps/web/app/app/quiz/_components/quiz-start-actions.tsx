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
  if (subjectsFailed && !isExam) return null
  return (
    <div className="space-y-stack lg:col-start-1 lg:row-start-2 lg:sticky lg:top-section">
      {!isExam && config.subjectId && (
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

      <StartAlerts config={config} exam={exam} />

      <ModeStartButton config={config} exam={exam} examSubjectId={examSubjectId} />
    </div>
  )
}

type ModeProps = Pick<QuizStartActionsProps, 'config' | 'exam'>

/** Start failures and the blocked-start offer — both modes. */
function StartAlerts({ config, exam }: Readonly<ModeProps>) {
  const isExam = config.mode === 'exam'
  return (
    <>
      <BlockedStartAlert
        message={isExam ? exam.error : config.error}
        blocked={isExam ? exam.blocked : config.blocked}
        startLabel={isExam ? 'exam' : 'quiz'}
      />
      {!isExam && config.authError && (
        <FieldError role="alert">Session expired. Please refresh the page.</FieldError>
      )}
    </>
  )
}

function ModeStartButton({
  config,
  exam,
  examSubjectId,
}: Readonly<ModeProps & { examSubjectId: string }>) {
  if (config.mode === 'exam') {
    return (
      <StartButton
        disabled={!examSubjectId || exam.loading}
        loading={exam.loading}
        label="Start Practice Exam"
        onClick={exam.handleStart}
      />
    )
  }
  return (
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
  )
}
