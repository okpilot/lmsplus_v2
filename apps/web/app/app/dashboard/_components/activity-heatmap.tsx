import type { DailyActivity } from '@/lib/queries/analytics'

type ActivityHeatmapProps = {
  data: DailyActivity[]
}

const LABEL_DAYS = new Set([1, 5, 10, 15, 20, 25])

function getIntensity(total: number, isFuture: boolean): string {
  if (isFuture) return 'bg-muted/30'
  if (total === 0) return 'bg-muted'
  if (total <= 2) return 'bg-green-200 dark:bg-green-900'
  if (total <= 5) return 'bg-green-300 dark:bg-green-800'
  if (total <= 10) return 'bg-green-500 dark:bg-green-600'
  return 'bg-green-700 dark:bg-green-400'
}

export function ActivityHeatmap({ data }: ActivityHeatmapProps) {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const todayDay = now.getUTCDate()

  const monthStr = String(month).padStart(2, '0')
  const monthName = now.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })

  const activityByDay = new Map<number, number>()
  for (const entry of data) {
    if (entry.day.startsWith(`${year}-${monthStr}-`)) {
      const day = Number.parseInt(entry.day.slice(8, 10), 10)
      activityByDay.set(day, entry.total)
    }
  }

  const labelDays = new Set([...LABEL_DAYS, daysInMonth])

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-medium">
        {monthName} {year}
      </h3>
      <div className="flex gap-1">
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1
          const isFuture = day > todayDay
          const isToday = day === todayDay
          const total = activityByDay.get(day) ?? 0
          const intensity = getIntensity(total, isFuture)
          const ring = isToday ? ' ring-2 ring-primary' : ''

          return (
            <div
              key={day}
              title={`${day} ${monthName}: ${total} questions`}
              className={`h-6 w-6 flex-shrink-0 rounded-sm sm:h-4 sm:w-4 ${intensity}${ring}`}
            />
          )
        })}
      </div>
      <div className="mt-1 flex gap-1">
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1
          return (
            <div
              key={day}
              className="w-6 flex-shrink-0 text-center text-[9px] text-muted-foreground sm:w-4"
            >
              {labelDays.has(day) ? day : ''}
            </div>
          )
        })}
      </div>
    </div>
  )
}
