import { MarkdownText } from '../../_components/markdown-text'
import { ZoomableImage } from '../../_components/zoomable-image'

type ExplanationTabProps =
  | { hasAnswered: false }
  | {
      hasAnswered: true
      isCorrect: boolean
      explanationText: string | null
      explanationImageUrl: string | null
    }

export function ExplanationTab(props: ExplanationTabProps) {
  if (!props.hasAnswered) {
    return (
      <div className="py-4">
        <p className="text-sm text-muted-foreground">
          Answer this question to see the explanation.
        </p>
      </div>
    )
  }

  const { isCorrect, explanationText, explanationImageUrl } = props

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
