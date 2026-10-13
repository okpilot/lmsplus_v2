import { Empty, EmptyDescription } from '@/components/ui/empty'
import { Stat, StatGroup } from '@/components/ui/stat'
import { getMasteryTone } from '../_lib/constants'
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

export function KpiCards({ data, range }: Props) {
  if (data.totalStudents === 0) {
    return (
      <Empty>
        <EmptyDescription>No students enrolled yet</EmptyDescription>
      </Empty>
    )
  }

  return (
    <StatGroup columns={1} className="md:grid-cols-3 xl:grid-cols-5">
      <Stat
        label="Active Students"
        value={`${data.activeStudents} / ${data.totalStudents}`}
        hint={`in last ${rangeLabel(range)}`}
      />
      <Stat
        label="Avg Mastery"
        value={`${data.avgMastery}%`}
        hint="across all subjects"
        tone={getMasteryTone(data.avgMastery)}
      />
      <Stat
        label="Sessions This Period"
        value={data.sessionsThisPeriod}
        hint={`last ${rangeLabel(range)}`}
      />
      <Stat
        label="Weakest Subject"
        value={data.weakestSubject === null ? '—' : data.weakestSubject.name}
        hint={
          data.weakestSubject === null
            ? undefined
            : `${data.weakestSubject.avgMastery}% avg mastery`
        }
        tone={
          data.weakestSubject === null ? undefined : getMasteryTone(data.weakestSubject.avgMastery)
        }
      />
      <Stat
        label="Exam Readiness"
        value={`${data.examReadyStudents} / ${data.totalStudents}`}
        hint="students at 90%+"
      />
    </StatGroup>
  )
}
