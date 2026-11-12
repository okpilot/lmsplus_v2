'use client'

import { Card, CardContent } from '@/components/ui/card'
import type { ExamSubjectOption } from '@/lib/queries/exam-subjects'
import type { SubjectOption } from '@/lib/queries/quiz-query-types'
import type { useQuizConfig } from '../_hooks/use-quiz-config'
import { ExamConfigForm } from './exam-config-form'
import { ModeToggle } from './mode-toggle'
import { QuestionFilters } from './question-filters'
import { SubjectSelect } from './subject-select'
import { SubjectsRetryAlert } from './subjects-retry-alert'

type QuizSetupCardProps = {
  config: ReturnType<typeof useQuizConfig>
  subjects: SubjectOption[]
  examSubjects: ExamSubjectOption[]
  examSubjectId: string
  onExamSubjectChange: (id: string) => void
  subjectsFailed?: boolean
}

function SubjectSetupFields({
  config,
  subjects,
}: Readonly<Pick<QuizSetupCardProps, 'config' | 'subjects'>>) {
  return (
    <>
      <SubjectSelect
        subjects={subjects}
        value={config.subjectId}
        onValueChange={config.handleSubjectChange}
      />
      {config.subjectId && (
        <QuestionFilters
          value={config.filters}
          onValueChange={config.setFilters}
          calcMode={config.calcMode}
          onCalcModeChange={config.setCalcMode}
          imageMode={config.imageMode}
          onImageModeChange={config.setImageMode}
          unseenLabel="Unanswered"
        />
      )}
    </>
  )
}

function SetupFields(props: Readonly<QuizSetupCardProps>) {
  const { config, subjects, examSubjects, examSubjectId, onExamSubjectChange, subjectsFailed } =
    props
  if (config.mode === 'exam')
    return (
      <ExamConfigForm
        examSubjects={examSubjects}
        subjectId={examSubjectId}
        onSubjectChange={onExamSubjectChange}
      />
    )
  if (subjectsFailed) return <SubjectsRetryAlert />
  return <SubjectSetupFields config={config} subjects={subjects} />
}

export function QuizSetupCard(props: Readonly<QuizSetupCardProps>) {
  const { config, subjects, examSubjects, examSubjectId, onExamSubjectChange, subjectsFailed } =
    props
  return (
    <Card>
      <CardContent className="space-y-stack-lg">
        <ModeToggle
          value={config.mode}
          onValueChange={config.setMode}
          examAvailable={examSubjects.length > 0}
        />
        <SetupFields
          config={config}
          subjects={subjects}
          examSubjects={examSubjects}
          examSubjectId={examSubjectId}
          onExamSubjectChange={onExamSubjectChange}
          subjectsFailed={subjectsFailed}
        />
      </CardContent>
    </Card>
  )
}
