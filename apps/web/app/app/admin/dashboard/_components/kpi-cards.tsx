import { EmptyNote } from '@/components/ui/empty'
import { Stat, StatGroup } from '@/components/ui/stat'
import { atGoal, MASTERY_GOAL } from '@/lib/utils/mastery-tone'
import type { DashboardKpis, TimeRange } from '../types'

type Props = Readonly<{ data: DashboardKpis; range: TimeRange }>

function rangeLabel(range: TimeRange): string {
  const labels: Record<TimeRange, string> = {
    '7d': '7 days',
    '30d': '30 days',
    '90d': '90 days',
    all: 'all time',
  }
  return labels[range]
}

export function KpiCards({ data, range }: Readonly<Props>) {
  if (data.totalStudents === 0) {
    return <EmptyNote>No students enrolled yet</EmptyNote>
  }

  return (
    <StatGroup columns={1} className="md:grid-cols-3 2xl:grid-cols-5">
      <Stat
        label="Active Students"
        value={`${data.activeStudents} / ${data.totalStudents}`}
        hint={`in last ${rangeLabel(range)}`}
      />
      <Stat
        label="Avg Mastery"
        value={`${data.avgMastery}%`}
        hint="across all subjects"
        tone={atGoal(data.avgMastery) ? 'success' : undefined}
      />
      <Stat
        label="Sessions This Period"
        value={data.sessionsThisPeriod}
        hint={`last ${rangeLabel(range)}`}
      />
      <Stat
        label="Weakest Subject"
        size="text"
        value={data.weakestSubject === null ? '—' : data.weakestSubject.name}
        hint={
          data.weakestSubject === null
            ? undefined
            : `${data.weakestSubject.avgMastery}% avg mastery`
        }
        tone={
          data.weakestSubject !== null && atGoal(data.weakestSubject.avgMastery)
            ? 'success'
            : undefined
        }
      />
      <Stat
        label="Exam Readiness"
        value={`${data.examReadyStudents} / ${data.totalStudents}`}
        hint={`students at ${MASTERY_GOAL}%+`}
      />
    </StatGroup>
  )
}
