import type { VfrRtResults } from '@/lib/queries/vfr-rt-results'
import { VfrRtPartBar } from './vfr-rt-part-bar'
import { VfrRtReviewRow } from './vfr-rt-review-row'

function PassFailBadge({ passed }: { passed: boolean }) {
  return passed ? (
    <span className="rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-sm font-semibold text-green-600 dark:text-green-400">
      PASSED
    </span>
  ) : (
    <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-sm font-semibold text-red-600 dark:text-red-400">
      FAILED
    </span>
  )
}

type Props = { results: VfrRtResults }

export function VfrRtResultsBreakdown({ results }: Props) {
  const { summary, rows } = results

  return (
    <div className="space-y-6">
      {/* Overall pass/fail */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex justify-center">
          <PassFailBadge passed={summary.passedOverall} />
        </div>
        <p className="text-center text-sm text-muted-foreground">
          {summary.correctCount} / {summary.totalQuestions} answer rows correct
        </p>
      </div>

      {/* Per-part score bars */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 text-base font-semibold">Part Scores</h2>
        <div className="space-y-4">
          <VfrRtPartBar
            label="Part 1 — Short Answer"
            pct={summary.part1Pct}
            passed={summary.passedPerPart.part1}
          />
          <VfrRtPartBar
            label="Part 2 — Dialog Fill"
            pct={summary.part2Pct}
            passed={summary.passedPerPart.part2}
          />
          <VfrRtPartBar
            label="Part 3 — Multiple Choice"
            pct={summary.part3Pct}
            passed={summary.passedPerPart.part3}
          />
        </div>
      </div>

      {/* Per-question review */}
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold">Question Review</h2>
        </div>
        <div className="divide-y divide-border">
          {rows.map((row, i) => (
            <VfrRtReviewRow key={row.questionId} row={row} index={i} />
          ))}
        </div>
      </div>
    </div>
  )
}
