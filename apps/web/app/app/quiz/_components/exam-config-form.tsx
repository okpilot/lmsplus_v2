'use client'

import { Heading } from '@/components/ui/heading'
import { Stat, StatGroup } from '@/components/ui/stat'
import type { ExamSubjectOption } from '@/lib/queries/exam-subjects'
import { SubjectSelect } from './subject-select'

type ExamConfigFormProps = {
  examSubjects: ExamSubjectOption[]
  subjectId: string
  onSubjectChange: (id: string) => void
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return m > 0 ? `${h}h ${m}min` : `${h}h`
  return `${m} min`
}

export function ExamConfigForm({
  examSubjects,
  subjectId,
  onSubjectChange,
}: Readonly<ExamConfigFormProps>) {
  const selected = examSubjects.find((s) => s.id === subjectId)

  const subjectOptions = examSubjects.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    short: s.short,
    questionCount: s.totalQuestions,
  }))

  return (
    <>
      <SubjectSelect subjects={subjectOptions} value={subjectId} onValueChange={onSubjectChange} />

      {selected && (
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
          <Heading level={3}>Practice Exam Parameters</Heading>
          <StatGroup columns={3}>
            <Stat
              variant="plain"
              size="compact"
              label="Questions"
              value={selected.totalQuestions}
            />
            <Stat
              variant="plain"
              size="compact"
              label="Time Limit"
              value={formatTime(selected.timeLimitSeconds)}
            />
            <Stat
              variant="plain"
              size="compact"
              label="Pass Mark"
              value={`${selected.passMark}%`}
            />
          </StatGroup>
        </div>
      )}
    </>
  )
}
