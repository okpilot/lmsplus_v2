'use client'

type QuizMode = 'study' | 'exam'

type ModeToggleProps = {
  value: QuizMode
  onValueChange: (mode: QuizMode) => void
  examAvailable?: boolean
}

export function ModeToggle({ value, onValueChange, examAvailable = false }: ModeToggleProps) {
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
          aria-pressed={value === 'exam'}
          disabled={!examAvailable}
          onClick={() => examAvailable && onValueChange('exam')}
          className={`flex-1 rounded-[8px] px-4 py-2 text-sm font-medium transition-colors ${
            value === 'exam'
              ? 'bg-primary text-primary-foreground'
              : examAvailable
                ? 'text-muted-foreground hover:text-foreground'
                : 'text-muted-foreground opacity-50 cursor-not-allowed'
          }`}
        >
          Practice Exam
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        {value === 'exam'
          ? 'Exam mode is timed with no hints or feedback until submission.'
          : 'Study mode shows explanations after each answer.'}
      </p>
    </div>
  )
}
