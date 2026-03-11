type QuestionCardProps = {
  questionText: string
  questionImageUrl: string | null
  questionNumber: number
  totalQuestions: number
}

export function QuestionCard({
  questionText,
  questionImageUrl,
  questionNumber,
  totalQuestions,
}: QuestionCardProps) {
  return (
    <div className="space-y-4">
      <p className="text-xs font-medium text-muted-foreground">
        Question {questionNumber} of {totalQuestions}
      </p>
      {questionImageUrl && (
        <img
          src={questionImageUrl}
          alt="Question illustration"
          className="max-h-64 rounded-md border border-border object-contain"
        />
      )}
      <p className="text-base font-medium leading-relaxed">{questionText}</p>
    </div>
  )
}
