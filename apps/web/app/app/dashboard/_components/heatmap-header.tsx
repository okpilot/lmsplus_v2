import { HeatmapInfo } from './heatmap-info'

type HeaderProps = {
  monthName: string
  monthNameShort: string
  year: number
  isCurrentMonth: boolean
  atMinOffset: boolean
  onBack: () => void
  onForward: () => void
}

export function HeatmapHeader({
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
