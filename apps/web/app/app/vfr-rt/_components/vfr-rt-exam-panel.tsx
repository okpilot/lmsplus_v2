'use client'

import { StartButton } from '@/app/app/quiz/_components/start-button'
import type { SubjectOption } from '@/lib/queries/quiz-query-types'
import { useVfrRtExamStart } from '../_hooks/use-vfr-rt-exam-start'

type VfrRtExamPanelProps = {
  userId: string
  subjectId: string
  subjects: SubjectOption[]
  // Total questions the exam draws (server-derived); null hides the cell.
  questionCount: number | null
}

const PARAMETERS = [
  // start_vfr_rt_exam_session fixes the timer at 1800 s.
  { value: '30 min', label: 'Time Limit' },
  { value: '3', label: 'Parts' },
  { value: '75%', label: 'Needed per Part' },
]

// Static class names so Tailwind can see them.
const GRID_COLS = { 3: 'grid-cols-3', 4: 'grid-cols-4' } as const

export function VfrRtExamPanel({
  userId,
  subjectId,
  subjects,
  questionCount,
}: Readonly<VfrRtExamPanelProps>) {
  const { loading, error, handleStart } = useVfrRtExamStart({ userId, subjectId, subjects })
  const parameters =
    questionCount === null
      ? PARAMETERS
      : [{ value: String(questionCount), label: 'Questions' }, ...PARAMETERS]
  const gridCols = parameters.length === 4 ? GRID_COLS[4] : GRID_COLS[3]

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
        <h3 className="text-sm font-semibold">VFR RT Mock Exam Parameters</h3>
        <div className={`grid ${gridCols} gap-3 text-center`}>
          {parameters.map((p) => (
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
