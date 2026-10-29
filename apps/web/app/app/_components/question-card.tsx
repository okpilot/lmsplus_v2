import { MarkdownText } from './markdown-text'
import { ZoomableImage } from './zoomable-image'

type QuestionCardProps = {
  questionText: string
  questionImageUrl: string | null
  questionNumber?: number
  totalQuestions?: number
  dbQuestionNumber?: string | null
}

export function QuestionCard({
  questionText,
  questionImageUrl,
  questionNumber,
  totalQuestions,
  dbQuestionNumber,
}: Readonly<QuestionCardProps>) {
  return (
    <div className="space-y-4">
      {questionNumber != null && totalQuestions != null && (
        <div className="flex items-center justify-between">
          <p className="text-caption font-medium text-muted-foreground">
            Question {questionNumber} of {totalQuestions}
          </p>
          {dbQuestionNumber && (
            <span className="tabular-nums text-caption text-muted-foreground">
              {dbQuestionNumber}
            </span>
          )}
        </div>
      )}
      {questionImageUrl && (
        <ZoomableImage src={questionImageUrl} alt="Question illustration" className="max-h-64" />
      )}
      <MarkdownText className="text-body font-medium leading-relaxed">{questionText}</MarkdownText>
    </div>
  )
}
