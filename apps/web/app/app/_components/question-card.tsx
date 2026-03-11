import { MarkdownText } from './markdown-text'
import { ZoomableImage } from './zoomable-image'

type QuestionCardProps = {
  questionText: string
  questionImageUrl: string | null
  questionNumber: number
  totalQuestions: number
  dbQuestionNumber?: string | null
}

export function QuestionCard({
  questionText,
  questionImageUrl,
  questionNumber,
  totalQuestions,
  dbQuestionNumber,
}: QuestionCardProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          Question {questionNumber} of {totalQuestions}
        </p>
        {dbQuestionNumber && (
          <span className="font-mono text-xs text-muted-foreground/70">{dbQuestionNumber}</span>
        )}
      </div>
      {questionImageUrl && (
        <ZoomableImage src={questionImageUrl} alt="Question illustration" className="max-h-64" />
      )}
      <MarkdownText className="text-base font-medium leading-relaxed">{questionText}</MarkdownText>
    </div>
  )
}
