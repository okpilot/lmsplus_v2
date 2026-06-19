type Props = {
  label: string
  pct: number
  passed: boolean
}

const PASS_THRESHOLD = 75

export function VfrRtPartBar({ label, pct, passed }: Props) {
  const clampedPct = Math.min(100, Math.max(0, pct))

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{clampedPct.toFixed(1)}%</span>
          <span
            className={
              passed
                ? 'rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-xs font-semibold text-green-600 dark:text-green-400'
                : 'rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-600 dark:text-red-400'
            }
          >
            {passed ? 'PASS' : 'FAIL'}
          </span>
        </div>
      </div>

      {/* Progress bar with 75% threshold marker */}
      <div className="relative h-4 w-full overflow-hidden rounded-full bg-muted">
        <div
          role="progressbar"
          aria-label={label}
          aria-valuenow={clampedPct}
          aria-valuemin={0}
          aria-valuemax={100}
          className={passed ? 'h-full rounded-full bg-green-500' : 'h-full rounded-full bg-red-500'}
          style={{ width: `${clampedPct}%` }}
        />
        {/* 75% threshold marker */}
        <div
          data-testid="threshold-marker"
          aria-hidden
          className="absolute top-0 h-full w-0.5 bg-foreground/40"
          style={{ left: `${PASS_THRESHOLD}%` }}
        />
      </div>

      <p className="text-xs text-muted-foreground">Pass threshold: {PASS_THRESHOLD}%</p>
    </div>
  )
}
