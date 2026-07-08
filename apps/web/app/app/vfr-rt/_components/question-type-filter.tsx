'use client'

import { QUESTION_TYPE_LABELS, QUESTION_TYPES, type QuestionType } from '@/app/app/_types/session'

type QuestionTypeFilterProps = {
  value: QuestionType | undefined
  onValueChange: (type: QuestionType | undefined) => void
}

// "All types" first, then one option per QUESTION_TYPES entry — a single list so
// the buttons below render from one map instead of a duplicated "All types" button
// plus a separate QUESTION_TYPES.map.
const OPTIONS: ReadonlyArray<{ value: QuestionType | undefined; label: string }> = [
  { value: undefined, label: 'All types' },
  ...QUESTION_TYPES.map((type) => ({ value: type, label: QUESTION_TYPE_LABELS[type] })),
]

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
        {OPTIONS.map((option) => (
          <button
            key={option.value ?? 'all'}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onValueChange(option.value)}
            className={`rounded-[8px] px-3 py-1.5 text-sm font-medium transition-colors ${
              value === option.value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
