type ProgressSegment = { label: string; answered: number; total: number }

type PartProgressProps = {
  segments: ProgressSegment[]
}

function ratioPercent(answered: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, Math.round((answered / total) * 100))
}

export function PartProgress({ segments }: PartProgressProps) {
  return (
    <ul className="flex list-none gap-2 p-0">
      {segments.map((segment) => {
        const percent = ratioPercent(segment.answered, segment.total)
        return (
          <li key={segment.label} className="flex-1 space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{segment.label}</span>
              <span>
                {segment.answered}/{segment.total}
              </span>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label={segment.label}
              aria-valuenow={segment.answered}
              aria-valuemin={0}
              aria-valuemax={segment.total}
            >
              <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
