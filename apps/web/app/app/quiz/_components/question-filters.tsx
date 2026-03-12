'use client'

export type QuestionFilter = 'all' | 'unseen' | 'incorrect'

type QuestionFiltersProps = {
  value: QuestionFilter
  onChange: (filter: QuestionFilter) => void
}

const OPTIONS: { value: QuestionFilter; label: string }[] = [
  { value: 'all', label: 'All questions' },
  { value: 'unseen', label: 'Unseen only' },
  { value: 'incorrect', label: 'Incorrectly answered' },
]

export function QuestionFilters({ value, onChange }: QuestionFiltersProps) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">Question filter</legend>
      <div className="flex flex-wrap gap-4">
        {OPTIONS.map((opt) => (
          <label key={opt.value} className="flex items-center gap-1.5 text-sm">
            <input
              type="radio"
              name="question-filter"
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="accent-primary"
            />
            {opt.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
