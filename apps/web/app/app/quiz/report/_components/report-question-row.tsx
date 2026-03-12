import type { QuizReportQuestion } from '@/lib/queries/quiz-report'

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}...`
}

function formatResponseTime(ms: number): string {
  const seconds = (ms / 1000).toFixed(1)
  return `${seconds}s`
}

export function ReportQuestionRow({
  question,
  index,
}: {
  question: QuizReportQuestion
  index: number
}) {
  const selectedOption = question.options.find((o) => o.id === question.selectedOptionId)
  const correctOption = question.options.find((o) => o.id === question.correctOptionId)
  const label = question.questionNumber ?? `Q${index + 1}`

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0">
          {question.isCorrect ? (
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30">
              <CheckIcon />
            </span>
          ) : (
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-destructive dark:bg-red-900/30">
              <XIcon />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            <span className="text-muted-foreground">{label}.</span>{' '}
            {truncate(question.questionText, 80)}
          </p>

          <div className="mt-2 space-y-1 text-xs">
            <p>
              <span className="text-muted-foreground">Your answer: </span>
              <span className={question.isCorrect ? 'text-green-600' : 'text-destructive'}>
                {selectedOption?.text ?? 'No answer'}
              </span>
            </p>
            {!question.isCorrect && correctOption && (
              <p>
                <span className="text-muted-foreground">Correct answer: </span>
                <span className="text-green-600">{correctOption.text}</span>
              </p>
            )}
            {question.explanationText && (
              <p className="text-muted-foreground">
                <span className="font-medium">Explanation: </span>
                {question.explanationText}
              </p>
            )}
          </div>
        </div>

        <span className="flex-shrink-0 text-xs text-muted-foreground">
          {formatResponseTime(question.responseTimeMs)}
        </span>
      </div>
    </div>
  )
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
