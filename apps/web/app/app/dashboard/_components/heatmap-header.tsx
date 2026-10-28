import { Button } from '@/components/ui/button'
import { Heading } from '@/components/ui/heading'
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
}: Readonly<HeaderProps>) {
  return (
    <div className="mb-2 flex items-center justify-between md:mb-3">
      <div className="flex items-center gap-1.5">
        <Heading level={3}>Daily Progress</Heading>
        <HeatmapInfo />
      </div>
      <div className="flex items-center gap-1.5 md:gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          className="text-muted-foreground"
          onClick={onBack}
          disabled={atMinOffset}
          aria-label="Previous month"
        >
          ‹
        </Button>
        <span className="min-w-[70px] text-center text-xs font-medium md:hidden">
          {monthNameShort} {year}
        </span>
        <span className="hidden min-w-[120px] text-center text-sm font-medium md:inline">
          {monthName} {year}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          type="button"
          className="text-muted-foreground"
          onClick={onForward}
          disabled={isCurrentMonth}
          aria-label="Next month"
        >
          ›
        </Button>
      </div>
    </div>
  )
}
