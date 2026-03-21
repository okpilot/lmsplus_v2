import type { QuizReportQuestion } from '@/lib/queries/quiz-report'

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}...`
}

function formatResponseTime(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

function optionLetter(options: { id: string; text: string }[], optionId: string): string {
  const idx = options.findIndex((o) => o.id === optionId)
  if (idx === -1) return ''
  return String.fromCodePoint(65 + idx)
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
  const selectedLetter = question.selectedOptionId
    ? optionLetter(question.options, question.selectedOptionId)
    : ''
  const correctLetter = question.correctOptionId
    ? optionLetter(question.options, question.correctOptionId)
    : ''

  return (
    <div className={`px-4 py-3 ${question.isCorrect ? '' : 'bg-red-50 dark:bg-red-950/20'}`}>
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
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
            <span className="text-sm">{truncate(question.questionText, 80)}</span>
            <span className="ml-auto flex-shrink-0 text-xs text-muted-foreground">
              {formatResponseTime(question.responseTimeMs)}
            </span>
          </div>

          <div className="mt-1 space-y-0.5 text-xs">
            <p className={question.isCorrect ? 'text-green-600' : 'text-destructive'}>
              Your answer:{' '}
              {selectedLetter ? `${selectedLetter} — ${selectedOption?.text ?? ''}` : 'No answer'}
            </p>
            {!question.isCorrect && correctOption && (
              <p className="text-green-600">
                Correct answer: {correctLetter} — {correctOption.text}
              </p>
            )}
            {question.explanationText && (
              <p className="mt-1 text-muted-foreground">{question.explanationText}</p>
            )}
          </div>
        </div>
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
