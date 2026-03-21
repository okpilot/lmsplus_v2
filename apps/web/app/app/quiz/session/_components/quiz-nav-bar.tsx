type QuizNavBarProps = {
  currentIndex: number
  totalQuestions: number
  onPrev: () => void
  onNext: () => void
}

export function QuizNavBar({ currentIndex, totalQuestions, onPrev, onNext }: QuizNavBarProps) {
  return (
    <>
      <button
        type="button"
        onClick={onPrev}
        disabled={currentIndex === 0}
        className="rounded-lg border border-input px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
      >
        &lt; Previous
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={currentIndex === totalQuestions - 1}
        className="rounded-lg border border-input px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
      >
        Next &gt;
      </button>
    </>
  )
}
