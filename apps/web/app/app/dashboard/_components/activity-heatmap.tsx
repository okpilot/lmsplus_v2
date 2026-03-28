'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DailyActivity } from '@/lib/queries/analytics'
import { HeatmapCell } from './heatmap-cell'
import { HeatmapInfo } from './heatmap-info'
import { useDragScroll } from './use-drag-scroll'

type ActivityHeatmapProps = {
  data: DailyActivity[]
}

type HeaderProps = {
  monthName: string
  monthNameShort: string
  year: number
  isCurrentMonth: boolean
  atMinOffset: boolean
  onBack: () => void
  onForward: () => void
}

function HeatmapHeader({
  monthName,
  monthNameShort,
  year,
  isCurrentMonth,
  atMinOffset,
  onBack,
  onForward,
}: HeaderProps) {
  const navBtnBase =
    'flex items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-30'
  return (
    <div className="mb-2 flex items-center justify-between md:mb-3">
      <div className="flex items-center gap-1.5">
        <h3 className="text-sm font-semibold">Daily Progress</h3>
        <HeatmapInfo />
      </div>
      <div className="flex items-center gap-1.5 md:gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={atMinOffset}
          aria-label="Previous month"
          className={`h-5 w-5 md:h-6 md:w-6 transition-colors hover:bg-muted disabled:pointer-events-none ${navBtnBase}`}
        >
          ‹
        </button>
        <span className="min-w-[70px] text-center text-xs font-medium md:hidden">
          {monthNameShort} {year}
        </span>
        <span className="hidden min-w-[120px] text-center text-sm font-medium md:inline">
          {monthName} {year}
        </span>
        <button
          type="button"
          onClick={onForward}
          disabled={isCurrentMonth}
          aria-label="Next month"
          className={`h-5 w-5 md:h-6 md:w-6 transition-colors hover:bg-muted disabled:pointer-events-none ${navBtnBase}`}
        >
          ›
        </button>
      </div>
    </div>
  )
}

const MIN_MONTH_OFFSET = -11
const MAX_MONTH_OFFSET = 0

export function ActivityHeatmap({ data }: ActivityHeatmapProps) {
  const now = useMemo(() => new Date(), [])
  const [offset, setOffset] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const viewDate = useMemo(
    () => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)),
    [now, offset],
  )

  const year = viewDate.getUTCFullYear()
  const month = viewDate.getUTCMonth() + 1
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const monthStr = String(month).padStart(2, '0')
  const monthName = viewDate.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })
  const monthNameShort = viewDate.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })

  const isCurrentMonth = offset === MAX_MONTH_OFFSET
  const todayDay = isCurrentMonth ? now.getUTCDate() : -1

  const activityByDay = useMemo(() => {
    const map = new Map<number, { total: number; correct: number; incorrect: number }>()
    const prefix = `${year}-${monthStr}-`
    for (const entry of data) {
      if (entry.day.startsWith(prefix)) {
        const day = Number.parseInt(entry.day.slice(8, 10), 10)
        map.set(day, { total: entry.total, correct: entry.correct, incorrect: entry.incorrect })
      }
    }
    return map
  }, [data, year, monthStr])

  const isFutureDay = useCallback(
    (day: number) => (offset < 0 ? false : day > now.getUTCDate()),
    [offset, now],
  )

  const goBack = useCallback(() => setOffset((o) => Math.max(o - 1, MIN_MONTH_OFFSET)), [])
  const goForward = useCallback(() => setOffset((o) => Math.min(o + 1, MAX_MONTH_OFFSET)), [])

  // Auto-scroll to today, or to start when month changes
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    if (todayDay >= 1) {
      const todayEl = container.children[todayDay - 1] as HTMLElement | undefined
      todayEl?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'instant' })
    } else {
      container.scrollLeft = 0
    }
  }, [todayDay])

  useDragScroll(scrollRef)

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  return (
    <div className="rounded-xl border border-border bg-card p-3 md:p-4">
      <HeatmapHeader
        monthName={monthName}
        monthNameShort={monthNameShort}
        year={year}
        isCurrentMonth={isCurrentMonth}
        atMinOffset={offset <= MIN_MONTH_OFFSET}
        onBack={goBack}
        onForward={goForward}
      />
      <div
        ref={scrollRef}
        className="flex cursor-grab select-none gap-1 overflow-x-auto overflow-y-hidden py-1 scrollbar-hide active:cursor-grabbing md:gap-1.5"
      >
        {days.map((day) => {
          const activity = activityByDay.get(day)
          return (
            <HeatmapCell
              key={day}
              day={day}
              total={activity?.total ?? 0}
              correct={activity?.correct ?? 0}
              incorrect={activity?.incorrect ?? 0}
              isFuture={isFutureDay(day)}
              isToday={day === todayDay}
            />
          )
        })}
      </div>
    </div>
  )
}
