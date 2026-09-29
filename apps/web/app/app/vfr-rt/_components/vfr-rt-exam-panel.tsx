'use client'

import { StartButton } from '@/app/app/quiz/_components/start-button'
import type { SubjectOption } from '@/lib/queries/quiz-query-types'
import { useVfrRtExamStart } from '../_hooks/use-vfr-rt-exam-start'

type VfrRtExamPanelProps = {
  userId: string
  subjectId: string
  subjects: SubjectOption[]
}

const PARAMETERS = [
  // start_vfr_rt_exam_session fixes the timer at 1800 s.
  { value: '30 min', label: 'Time Limit' },
  { value: '3', label: 'Parts' },
  { value: '75%', label: 'Needed per Part' },
]

export function VfrRtExamPanel({ userId, subjectId, subjects }: Readonly<VfrRtExamPanelProps>) {
  const { loading, error, handleStart } = useVfrRtExamStart({ userId, subjectId, subjects })

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
        <h3 className="text-sm font-semibold">VFR RT Mock Exam Parameters</h3>
        <div className="grid grid-cols-3 gap-3 text-center">
          {PARAMETERS.map((p) => (
            <div key={p.label}>
              <div className="text-lg font-semibold">{p.value}</div>
              <div className="text-xs text-muted-foreground">{p.label}</div>
            </div>
          ))}
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <StartButton
        disabled={false}
        loading={loading}
        label="Start VFR RT Mock Exam"
        onClick={handleStart}
      />
    </div>
  )
}
