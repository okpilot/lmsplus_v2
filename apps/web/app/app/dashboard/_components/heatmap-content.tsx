import { getDailyActivity } from '@/lib/queries/analytics'
import { ActivityHeatmap } from './activity-heatmap'

export async function HeatmapContent() {
  let daily: Awaited<ReturnType<typeof getDailyActivity>> = []
  try {
    daily = await getDailyActivity(365)
  } catch {
    // degrade gracefully — heatmap renders empty rather than crashing the boundary
  }
  return <ActivityHeatmap data={daily} />
}
