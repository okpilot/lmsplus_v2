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
  const ring = isToday ? ' ring-select ring-ring' : ''
  const hasActivity = !isFuture && total > 0

  const cellBg = isFuture ? 'bg-data-future' : hasActivity ? 'bg-muted' : 'border border-border'

  const dayTextClass = isFuture
    ? 'text-data-empty'
    : isToday
      ? 'text-foreground font-semibold'
      : 'text-muted-foreground'

  return (
    <div
      data-testid={`heatmap-cell-${day}`}
      className="flex min-w-heatmap-cell flex-col items-center gap-0.5 sm:min-w-heatmap-cell-md sm:flex-1"
    >
      <div
        className={`flex h-heatmap-row w-full flex-col items-center justify-center gap-0.5 rounded-small sm:h-heatmap-row-md ${cellBg}${ring} p-1`}
      >
        {hasActivity ? (
          <>
            <span className="text-chart font-semibold leading-none text-foreground sm:text-micro">
              {total}
            </span>
            <span className="text-chart leading-none text-success sm:text-micro">{correct}</span>
            <span className="text-chart leading-none text-danger sm:text-micro">{incorrect}</span>
          </>
        ) : !isFuture ? (
          <span className="text-chart font-normal text-muted-foreground sm:text-chip">—</span>
        ) : null}
      </div>
      <span className={`text-chart sm:text-micro ${dayTextClass}`}>{day}</span>
    </div>
  )
}
