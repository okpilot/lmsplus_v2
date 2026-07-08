'use client'

import type { QuestionType } from '@/app/app/_types/session'
import { QUESTION_TYPE_LABELS, QUESTION_TYPES } from '@/app/app/quiz/types'

type QuestionTypeFilterProps = {
  value: QuestionType | undefined
  onValueChange: (type: QuestionType | undefined) => void
}

/**
 * RT-only single-select question-type filter (Slice 3). Mirrors ModeToggle's
 * segmented-pill styling, wrapped to a flex-wrap row since the option count (6,
 * including "All types") is longer than ModeToggle's fixed 3. Selecting "All
 * types" clears the filter (undefined = no restriction, identical to
 * calcMode/imageMode's 'all' default).
 */
export function QuestionTypeFilter({ value, onValueChange }: Readonly<QuestionTypeFilterProps>) {
  return (
    <div className="space-y-1.5">
      <span className="text-[13px] font-medium">Question Type</span>
      <div className="flex flex-wrap gap-1.5 rounded-[10px] border border-border p-1">
        <button
          type="button"
          aria-pressed={value === undefined}
          onClick={() => onValueChange(undefined)}
          className={`rounded-[8px] px-3 py-1.5 text-sm font-medium transition-colors ${
            value === undefined
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          All types
        </button>
        {QUESTION_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            aria-pressed={value === type}
            onClick={() => onValueChange(type)}
            className={`rounded-[8px] px-3 py-1.5 text-sm font-medium transition-colors ${
              value === type
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {QUESTION_TYPE_LABELS[type]}
          </button>
        ))}
      </div>
    </div>
  )
}
