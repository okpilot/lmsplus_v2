'use client'

type QuestionFilterValue = 'all' | 'unseen' | 'incorrect' | 'flagged'

type QuestionFiltersProps = {
  value: QuestionFilterValue[]
  onValueChange: (filters: QuestionFilterValue[]) => void
}

const OPTIONS: { value: QuestionFilterValue; label: string }[] = [
  { value: 'all', label: 'All questions' },
  { value: 'unseen', label: 'Unseen only' },
  { value: 'incorrect', label: 'Incorrectly answered' },
  { value: 'flagged', label: 'Flagged' },
]

export function QuestionFilters({ value, onValueChange }: QuestionFiltersProps) {
  function handleToggle(filter: QuestionFilterValue) {
    if (filter === 'all') {
      onValueChange(['all'])
      return
    }
    // Remove 'all' if present, toggle the specific filter
    const withoutAll = value.filter((f) => f !== 'all')
    const isActive = withoutAll.includes(filter)
    const next = isActive ? withoutAll.filter((f) => f !== filter) : [...withoutAll, filter]
    // If nothing selected, revert to 'all'
    onValueChange(next.length === 0 ? ['all'] : next)
  }

  return (
    <div className="space-y-1.5">
      <span className="text-[13px] font-medium">Question Filter</span>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((opt) => {
          const isActive = value.includes(opt.value)
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleToggle(opt.value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
