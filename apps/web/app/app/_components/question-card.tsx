import { MarkdownText } from './markdown-text'
import { ZoomableImage } from './zoomable-image'

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
        <ZoomableImage src={questionImageUrl} alt="Question illustration" className="max-h-64" />
      )}
      <MarkdownText className="text-base font-medium leading-relaxed">{questionText}</MarkdownText>
    </div>
  )
}
