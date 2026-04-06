import type { DashboardKpis, TimeRange } from '../types'

type Props = Readonly<{ data: DashboardKpis; range: TimeRange }>

function getMasteryColor(pct: number): string {
  if (pct < 50) return 'text-red-500'
  if (pct < 80) return 'text-amber-500'
  return 'text-green-500'
}

function rangeLabel(range: TimeRange): string {
  const labels: Record<TimeRange, string> = {
    '7d': '7 days',
    '30d': '30 days',
    '90d': '90 days',
    all: 'all time',
  }
  return labels[range]
}

type CardProps = Readonly<{
  title: string
  value: React.ReactNode
  sub?: string
  valueClass?: string
}>

function KpiCard({ title, value, sub, valueClass = '' }: CardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 md:p-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
      <p className={`mt-1 text-2xl font-bold ${valueClass}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  )
}

export function KpiCards({ data, range }: Props) {
  if (data.totalStudents === 0) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-card p-8">
        <p className="text-sm text-muted-foreground">No students enrolled yet</p>
      </div>
    )
  }

  const masteryColor = getMasteryColor(data.avgMastery)

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
      <KpiCard
        title="Active Students"
        value={`${data.activeStudents} / ${data.totalStudents}`}
        sub={`in last ${rangeLabel(range)}`}
      />
      <KpiCard
        title="Avg Mastery"
        value={`${data.avgMastery}%`}
        sub="across all subjects"
        valueClass={masteryColor}
      />
      <KpiCard
        title="Sessions This Period"
        value={data.sessionsThisPeriod}
        sub={`last ${rangeLabel(range)}`}
      />
      <KpiCard
        title="Weakest Subject"
        value={data.weakestSubject === null ? '—' : data.weakestSubject.name}
        sub={
          data.weakestSubject === null
            ? undefined
            : `${data.weakestSubject.avgMastery}% avg mastery`
        }
        valueClass={
          data.weakestSubject === null ? '' : getMasteryColor(data.weakestSubject.avgMastery)
        }
      />
      <KpiCard
        title="Exam Readiness"
        value={`${data.examReadyStudents} / ${data.totalStudents}`}
        sub="students at 90%+"
      />
    </div>
  )
}
