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
      className="flex min-w-[30px] flex-col items-center gap-0.5 md:min-w-[38px] md:flex-1"
    >
      <div
        className={`flex h-[38px] w-full flex-col items-center justify-center gap-0.5 rounded-md md:h-[46px] ${cellBg}${ring} p-1`}
      >
        {hasActivity ? (
          <>
            <span className="text-chart font-bold leading-none text-foreground md:text-micro">
              {total}
            </span>
            <span className="text-chart font-normal leading-none text-success md:text-micro">
              {correct}
            </span>
            <span className="text-chart font-normal leading-none text-danger md:text-micro">
              {incorrect}
            </span>
          </>
        ) : !isFuture ? (
          <span className="text-chart font-normal tracking-normal text-muted-foreground md:text-overline">
            —
          </span>
        ) : null}
      </div>
      <span className={`text-chart font-normal leading-none md:text-micro ${dayTextClass}`}>
        {day}
      </span>
    </div>
  )
}
