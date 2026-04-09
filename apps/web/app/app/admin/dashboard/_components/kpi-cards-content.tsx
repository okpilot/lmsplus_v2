import { rethrowRedirect } from '@/lib/next/rethrow-redirect'
import { getDashboardKpis } from '../queries'
import type { TimeRange } from '../types'
import { ContentErrorFallback } from './content-error-fallback'
import { KpiCards } from './kpi-cards'

type Props = Readonly<{ range: TimeRange }>

export async function KpiCardsContent({ range }: Props) {
  try {
    const kpis = await getDashboardKpis(range)
    return <KpiCards data={kpis} range={range} />
  } catch (error) {
    rethrowRedirect(error)
    return <ContentErrorFallback message="Failed to load KPIs. Please refresh the page." />
  }
}
