import { MarkdownText } from '../../_components/markdown-text'
import { ZoomableImage } from '../../_components/zoomable-image'

type ExplanationTabProps = {
  explanationText: string | null
  explanationImageUrl: string | null
  isCorrect: boolean
  correctOptionId: string
}

export function ExplanationTab({
  explanationText,
  explanationImageUrl,
  isCorrect,
}: ExplanationTabProps) {
  return (
    <div className="space-y-3 py-4">
      <p className={`text-sm font-semibold ${isCorrect ? 'text-green-600' : 'text-destructive'}`}>
        {isCorrect ? 'You answered correctly.' : 'You answered incorrectly.'}
      </p>

      {explanationText ? (
        <MarkdownText className="text-sm text-muted-foreground">{explanationText}</MarkdownText>
      ) : (
        <p className="text-sm text-muted-foreground">No explanation available for this question.</p>
      )}

      {explanationImageUrl && (
        <ZoomableImage
          src={explanationImageUrl}
          alt="Explanation illustration"
          className="max-h-48"
        />
      )}
    </div>
  )
}
