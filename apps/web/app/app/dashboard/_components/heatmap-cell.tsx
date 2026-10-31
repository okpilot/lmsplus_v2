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
}: Readonly<HeatmapCellProps>) {
  const ring = isToday ? ' ring-2 ring-ring' : ''
  const hasActivity = !isFuture && total > 0

  const cellBg = isFuture ? 'bg-muted/30' : hasActivity ? 'bg-muted' : 'border border-border'

  const dayTextClass = isFuture
    ? 'text-muted-foreground/30'
    : isToday
      ? 'text-foreground font-semibold'
      : 'text-muted-foreground'

  return (
    <div
      data-testid={`heatmap-cell-${day}`}
      className="flex min-w-7.5 flex-col items-center gap-0.5 md:min-w-9.5 md:flex-1"
    >
      <div
        className={`flex h-9.5 w-full flex-col items-center justify-center gap-0.5 rounded-small md:h-11.5 ${cellBg}${ring} p-1`}
      >
        {hasActivity ? (
          <>
            <span className="text-chart font-semibold text-foreground md:text-micro">{total}</span>
            <span className="text-chart text-success md:text-micro">{correct}</span>
            <span className="text-chart text-danger md:text-micro">{incorrect}</span>
          </>
        ) : !isFuture ? (
          <span className="text-chart text-muted-foreground md:text-chip">—</span>
        ) : null}
      </div>
      <span className={`text-chart md:text-micro ${dayTextClass}`}>{day}</span>
    </div>
  )
}
