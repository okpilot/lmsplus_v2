'use client'

import { useCallback, useMemo, useState } from 'react'
import type { DailyActivity } from '@/lib/queries/analytics'
import { HeatmapInfo } from './heatmap-info'

type ActivityHeatmapProps = {
  data: DailyActivity[]
}

const MIN_MONTH_OFFSET = -12
const MAX_MONTH_OFFSET = 0
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const LEGEND_TIERS = [
  { label: '0', className: 'bg-muted' },
  { label: '1-2', className: 'bg-green-200 dark:bg-green-900' },
  { label: '3-5', className: 'bg-green-300 dark:bg-green-800' },
  { label: '6-10', className: 'bg-green-500 dark:bg-green-600' },
  { label: '11+', className: 'bg-green-700 dark:bg-green-400' },
]

function getIntensity(total: number, isFuture: boolean): string {
  if (isFuture) return 'bg-muted/30'
  if (total === 0) return 'bg-muted'
  if (total <= 2) return 'bg-green-200 dark:bg-green-900'
  if (total <= 5) return 'bg-green-300 dark:bg-green-800'
  if (total <= 10) return 'bg-green-500 dark:bg-green-600'
  return 'bg-green-700 dark:bg-green-400'
}

export function ActivityHeatmap({ data }: ActivityHeatmapProps) {
  const now = useMemo(() => new Date(), [])
  const [offset, setOffset] = useState(0)

  const viewDate = useMemo(() => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
    return d
  }, [now, offset])

  const year = viewDate.getUTCFullYear()
  const month = viewDate.getUTCMonth() + 1
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const monthStr = String(month).padStart(2, '0')
  const monthName = viewDate.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })

  const isCurrentMonth = offset === MAX_MONTH_OFFSET
  const todayDay = isCurrentMonth ? now.getUTCDate() : -1

  const activityByDay = useMemo(() => {
    const map = new Map<number, number>()
    const prefix = `${year}-${monthStr}-`
    for (const entry of data) {
      if (entry.day.startsWith(prefix)) {
        const day = Number.parseInt(entry.day.slice(8, 10), 10)
        map.set(day, entry.total)
      }
    }
    return map
  }, [data, year, monthStr])

  // Monday = 0 ... Sunday = 6 (ISO weekday)
  const firstDayOfWeek = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7
  const totalCells = firstDayOfWeek + daysInMonth
  const rows = Math.ceil(totalCells / 7)

  const isFutureDay = useCallback(
    (day: number) => {
      if (offset > 0) return true
      if (offset < 0) return false
      return day > now.getUTCDate()
    },
    [offset, now],
  )

  const goBack = useCallback(() => setOffset((o) => Math.max(o - 1, MIN_MONTH_OFFSET)), [])
  const goForward = useCallback(() => setOffset((o) => Math.min(o + 1, MAX_MONTH_OFFSET)), [])

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goBack}
            disabled={offset <= MIN_MONTH_OFFSET}
            aria-label="Previous month"
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
          >
            &lsaquo;
          </button>
          <h3 className="min-w-[120px] text-center text-sm font-medium">
            {monthName} {year}
          </h3>
          <button
            type="button"
            onClick={goForward}
            disabled={isCurrentMonth}
            aria-label="Next month"
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
          >
            &rsaquo;
          </button>
        </div>
        <HeatmapInfo />
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="text-center text-[10px] font-medium text-muted-foreground">
            {label}
          </div>
        ))}

        {Array.from({ length: rows * 7 }, (_, i) => {
          const day = i - firstDayOfWeek + 1
          const isValid = day >= 1 && day <= daysInMonth

          if (!isValid) return <div key={`pad-${day}`} />

          const future = isFutureDay(day)
          const isToday = day === todayDay
          const total = activityByDay.get(day) ?? 0
          const intensity = getIntensity(total, future)
          const ring = isToday ? ' ring-2 ring-primary' : ''

          return (
            <div
              key={day}
              title={`${day} ${monthName}: ${total} questions`}
              className={`aspect-square rounded-sm ${intensity}${ring} flex items-center justify-center text-[10px] text-muted-foreground`}
            >
              {day}
            </div>
          )
        })}
      </div>

      <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
        <span>Less</span>
        {LEGEND_TIERS.map((tier) => (
          <div
            key={tier.label}
            title={`${tier.label} questions`}
            className={`h-3.5 w-3.5 rounded-sm ${tier.className}`}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  )
}
