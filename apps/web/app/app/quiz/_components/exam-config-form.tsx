'use client'

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

export function ExamConfigForm({ examSubjects, subjectId, onSubjectChange }: ExamConfigFormProps) {
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
          <h3 className="text-sm font-semibold">Exam Parameters</h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-lg font-semibold">{selected.totalQuestions}</div>
              <div className="text-xs text-muted-foreground">Questions</div>
            </div>
            <div>
              <div className="text-lg font-semibold">{formatTime(selected.timeLimitSeconds)}</div>
              <div className="text-xs text-muted-foreground">Time Limit</div>
            </div>
            <div>
              <div className="text-lg font-semibold">{selected.passMark}%</div>
              <div className="text-xs text-muted-foreground">Pass Mark</div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
