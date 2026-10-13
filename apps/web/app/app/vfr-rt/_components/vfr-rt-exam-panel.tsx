'use client'

import { BlockedStartAlert } from '@/app/app/quiz/_components/blocked-start-alert'
import { StartButton } from '@/app/app/quiz/_components/start-button'
import { Heading } from '@/components/ui/heading'
import { Stat, StatGroup } from '@/components/ui/stat'
import type { SubjectOption } from '@/lib/queries/quiz-query-types'
import { useVfrRtExamStart } from '../_hooks/use-vfr-rt-exam-start'

type VfrRtExamPanelProps = {
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

function ExamParameters({ questionCount }: Readonly<{ questionCount: number | null }>) {
  const parameters =
    questionCount === null
      ? PARAMETERS
      : [{ value: String(questionCount), label: 'Questions' }, ...PARAMETERS]
  return (
    <div className="space-y-stack">
      <Heading level={3}>VFR RT Mock Exam Parameters</Heading>
      <StatGroup columns={parameters.length === 4 ? 4 : 3}>
        {parameters.map((p) => (
          <Stat variant="plain" key={p.label} label={p.label} value={p.value} />
        ))}
      </StatGroup>
    </div>
  )
}

export function VfrRtExamPanel({
  subjectId,
  subjects,
  questionCount,
}: Readonly<VfrRtExamPanelProps>) {
  const { loading, error, handleStart, blocked } = useVfrRtExamStart({
    subjectId,
    subjects,
  })
  return (
    <div className="space-y-4">
      <ExamParameters questionCount={questionCount} />
      <BlockedStartAlert message={error} blocked={blocked} startLabel="the exam" />
      <StartButton
        disabled={false}
        loading={loading}
        label="Start VFR RT Mock Exam"
        onClick={handleStart}
      />
    </div>
  )
}
