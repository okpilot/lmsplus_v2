type HeatmapCellProps = {
  day: number
  total: number
  correct: number
  incorrect: number
  isFuture: boolean
  isToday: boolean
}

export function HeatmapCell({
  day,
  total,
  correct,
  incorrect,
  isFuture,
  isToday,
}: HeatmapCellProps) {
  const ring = isToday ? ' ring-2 ring-primary' : ''
  const hasActivity = !isFuture && total > 0

  const cellBg = isFuture
    ? 'bg-muted/30'
    : hasActivity
      ? 'bg-slate-200/80 dark:bg-slate-800'
      : 'bg-muted'

  const dayTextClass = isFuture
    ? 'text-muted-foreground/30'
    : isToday
      ? 'text-foreground font-semibold'
      : 'text-muted-foreground'

  return (
    <div
      data-testid={`heatmap-cell-${day}`}
      className="flex min-w-[30px] flex-col items-center gap-0.5 md:min-w-[38px] md:flex-1"
    >
      <div
        className={`flex h-[38px] w-full flex-col items-center justify-center gap-0.5 rounded-md md:h-[46px] ${cellBg}${ring} p-1`}
      >
        {hasActivity ? (
          <>
            <span className="text-[9px] font-bold leading-none text-blue-500 md:text-[11px]">
              {total}
            </span>
            <span className="text-[8px] leading-none text-green-500 md:text-[10px]">{correct}</span>
            <span className="text-[8px] leading-none text-red-500 md:text-[10px]">{incorrect}</span>
          </>
        ) : !isFuture ? (
          <span className="text-[9px] text-muted-foreground/40 md:text-xs">—</span>
        ) : null}
      </div>
      <span className={`text-[9px] leading-none md:text-[10px] ${dayTextClass}`}>{day}</span>
    </div>
  )
}
