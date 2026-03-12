type QuizNavBarProps = {
  currentIndex: number
  totalQuestions: number
  onPrev: () => void
  onNext: () => void
  onFinish: () => void
}

export function QuizNavBar({
  currentIndex,
  totalQuestions,
  onPrev,
  onNext,
  onFinish,
}: QuizNavBarProps) {
  return (
    <div className="flex items-center justify-between pt-2">
      <button
        type="button"
        onClick={onPrev}
        disabled={currentIndex === 0}
        className="rounded-lg border border-input px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
      >
        Previous
      </button>
      <button
        type="button"
        onClick={onFinish}
        className="rounded-lg border border-destructive/50 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
      >
        Finish Test
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={currentIndex === totalQuestions - 1}
        className="rounded-lg border border-input px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
      >
        Next
      </button>
    </div>
  )
}
