'use client'

import type { DailyActivity } from '@/lib/queries/analytics'

type ActivityHeatmapProps = {
  data: DailyActivity[]
}

function getIntensity(total: number): string {
  if (total === 0) return 'bg-muted'
  if (total <= 5) return 'bg-green-200 dark:bg-green-900'
  if (total <= 15) return 'bg-green-300 dark:bg-green-700'
  if (total <= 30) return 'bg-green-400 dark:bg-green-600'
  if (total <= 50) return 'bg-green-500 dark:bg-green-500'
  return 'bg-green-600 dark:bg-green-400'
}

export function ActivityHeatmap({ data }: ActivityHeatmapProps) {
  if (data.length === 0) {
    return null
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="mb-3 text-sm font-medium">Study Streak</h3>
      <div className="flex flex-wrap gap-1">
        {data.map((d) => {
          const date = new Date(d.day)
          const label = date.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
          })
          return (
            <div
              key={d.day}
              className={`h-4 w-4 rounded-sm ${getIntensity(d.total)}`}
              title={`${label}: ${d.total} questions`}
            />
          )
        })}
      </div>
      <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
        <span>Less</span>
        <div className="h-3 w-3 rounded-sm bg-muted" />
        <div className="h-3 w-3 rounded-sm bg-green-200 dark:bg-green-900" />
        <div className="h-3 w-3 rounded-sm bg-green-300 dark:bg-green-700" />
        <div className="h-3 w-3 rounded-sm bg-green-400 dark:bg-green-600" />
        <div className="h-3 w-3 rounded-sm bg-green-500 dark:bg-green-500" />
        <span>More</span>
      </div>
    </div>
  )
}
