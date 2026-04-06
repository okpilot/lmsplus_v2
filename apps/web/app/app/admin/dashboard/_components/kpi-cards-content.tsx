import { getDashboardKpis } from '../queries'
import type { TimeRange } from '../types'
import { KpiCards } from './kpi-cards'

type Props = Readonly<{ range: TimeRange }>

export async function KpiCardsContent({ range }: Props) {
  try {
    const kpis = await getDashboardKpis(range)
    return <KpiCards data={kpis} range={range} />
  } catch {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Failed to load KPIs. Please refresh the page.
      </div>
    )
  }
}
