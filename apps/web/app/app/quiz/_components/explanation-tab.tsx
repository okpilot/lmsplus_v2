import { MarkdownText } from '../../_components/markdown-text'
import { ZoomableImage } from '../../_components/zoomable-image'

type ExplanationTabProps = {
  explanationText: string | null
  explanationImageUrl: string | null
  isCorrect: boolean | null
  learningObjective?: string | null
}

export function ExplanationTab({
  explanationText,
  explanationImageUrl,
  isCorrect,
  learningObjective,
}: ExplanationTabProps) {
  return (
    <div className="space-y-3 py-4">
      {isCorrect !== null && (
        <p className={`text-sm font-semibold ${isCorrect ? 'text-green-600' : 'text-destructive'}`}>
          {isCorrect ? 'You answered correctly.' : 'You answered incorrectly.'}
        </p>
      )}
      <ExplanationContent text={explanationText} imageUrl={explanationImageUrl} />
      {learningObjective && (
        <div className="rounded-lg bg-muted/50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Learning Objective
          </p>
          <p className="mt-1 text-sm">{learningObjective}</p>
        </div>
      )}
    </div>
  )
}

function ExplanationContent({ text, imageUrl }: { text: string | null; imageUrl: string | null }) {
  return (
    <>
      {imageUrl && (
        <ZoomableImage src={imageUrl} alt="Explanation illustration" className="max-h-48" />
      )}
      {text ? (
        <MarkdownText className="text-sm text-muted-foreground">{text}</MarkdownText>
      ) : (
        <p className="text-sm text-muted-foreground">No explanation available for this question.</p>
      )}
    </>
  )
}
