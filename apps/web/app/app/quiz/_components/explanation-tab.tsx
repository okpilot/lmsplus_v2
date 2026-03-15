import { MarkdownText } from '../../_components/markdown-text'
import { ZoomableImage } from '../../_components/zoomable-image'

type ExplanationTabProps = {
  explanationText: string | null
  explanationImageUrl: string | null
  isCorrect: boolean | null
}

export function ExplanationTab({
  explanationText,
  explanationImageUrl,
  isCorrect,
}: ExplanationTabProps) {
  return (
    <div className="space-y-3 py-4">
      {isCorrect !== null && (
        <p className={`text-sm font-semibold ${isCorrect ? 'text-green-600' : 'text-destructive'}`}>
          {isCorrect ? 'You answered correctly.' : 'You answered incorrectly.'}
        </p>
      )}
      <ExplanationContent text={explanationText} imageUrl={explanationImageUrl} />
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
