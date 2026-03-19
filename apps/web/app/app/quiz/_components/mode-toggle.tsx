'use client'

type QuizMode = 'study' | 'exam'

type ModeToggleProps = {
  value: QuizMode
  onValueChange: (mode: QuizMode) => void
}

export function ModeToggle({ value, onValueChange }: ModeToggleProps) {
  return (
    <div className="space-y-1.5">
      <span className="text-[13px] font-medium">Mode</span>
      <div className="flex rounded-[10px] border border-border p-0.5">
        <button
          type="button"
          aria-pressed={value === 'study'}
          onClick={() => onValueChange('study')}
          className={`flex-1 rounded-[8px] px-4 py-2 text-sm font-medium transition-colors ${
            value === 'study'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Study
        </button>
        <button
          type="button"
          disabled
          aria-pressed={false}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-[8px] px-4 py-2 text-sm font-medium text-muted-foreground opacity-50"
        >
          Exam
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
            Coming soon
          </span>
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Study mode shows explanations after each answer. Exam mode is timed with no hints.
      </p>
    </div>
  )
}
