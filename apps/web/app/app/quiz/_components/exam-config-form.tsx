'use client'

import { useState } from 'react'
import type { ExamSubjectOption } from '@/lib/queries/exam-subjects'
import { useExamStart } from '../_hooks/use-exam-start'
import { SubjectSelect } from './subject-select'

type ExamConfigFormProps = {
  userId: string
  examSubjects: ExamSubjectOption[]
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return m > 0 ? `${h}h ${m}min` : `${h}h`
  return `${m} min`
}

export function ExamConfigForm({ userId, examSubjects }: ExamConfigFormProps) {
  const [subjectId, setSubjectId] = useState('')
  const selected = examSubjects.find((s) => s.id === subjectId)

  const subjectOptions = examSubjects.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    short: s.short,
    questionCount: s.totalQuestions,
  }))

  const { loading, error, handleStart } = useExamStart({
    userId,
    subjectId,
    examSubjects,
  })

  return (
    <div className="space-y-4">
      <SubjectSelect subjects={subjectOptions} value={subjectId} onValueChange={setSubjectId} />

      {selected && (
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
          <h3 className="text-sm font-semibold">Exam Parameters</h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-2xl font-bold">{selected.totalQuestions}</div>
              <div className="text-xs text-muted-foreground">Questions</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{formatTime(selected.timeLimitSeconds)}</div>
              <div className="text-xs text-muted-foreground">Time Limit</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{selected.passMark}%</div>
              <div className="text-xs text-muted-foreground">Pass Mark</div>
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button
        type="button"
        disabled={!subjectId || loading}
        onClick={handleStart}
        className="w-full rounded-[10px] bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? 'Starting...' : 'Start Exam'}
      </button>
    </div>
  )
}
