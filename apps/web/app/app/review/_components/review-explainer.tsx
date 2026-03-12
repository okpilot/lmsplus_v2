'use client'

import { useState } from 'react'

export function ReviewExplainer() {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between text-sm font-medium"
        aria-expanded={expanded}
      >
        <span>How Smart Review works</span>
        <span className="text-muted-foreground">{expanded ? '−' : '+'}</span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <p>
            Smart Review uses spaced repetition (FSRS algorithm) to schedule questions at optimal
            intervals. Questions you get wrong appear sooner; questions you know well are spaced
            further apart.
          </p>
          <p>
            <strong className="text-foreground">Recommended use:</strong> Review daily for 10–15
            minutes. Consistency matters more than session length.
          </p>
          <p>
            Only questions you have previously answered appear in review. New questions are
            introduced through Quiz mode.
          </p>
        </div>
      )}
    </div>
  )
}
