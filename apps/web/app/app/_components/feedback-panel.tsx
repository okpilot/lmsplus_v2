type FeedbackPanelProps = {
  isCorrect: boolean
  explanationText: string | null
  explanationImageUrl: string | null
  onNext: () => void
}

export function FeedbackPanel({
  isCorrect,
  explanationText,
  explanationImageUrl,
  onNext,
}: FeedbackPanelProps) {
  return (
    <div
      className={`space-y-3 rounded-lg border p-4 ${
        isCorrect ? 'border-green-500/30 bg-green-500/5' : 'border-destructive/30 bg-destructive/5'
      }`}
    >
      <p className="text-sm font-semibold">{isCorrect ? 'Correct!' : 'Incorrect'}</p>

      {explanationText && <p className="text-sm text-muted-foreground">{explanationText}</p>}

      {explanationImageUrl && (
        <img
          src={explanationImageUrl}
          alt="Explanation illustration"
          className="max-h-48 rounded-md border border-border object-contain"
        />
      )}

      <button
        type="button"
        onClick={onNext}
        className="mt-2 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/90"
      >
        Next Question →
      </button>
    </div>
  )
}
