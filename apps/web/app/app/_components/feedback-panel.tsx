import { InsetPanel } from '@/components/kit/inset-panel'
import { Button } from '@/components/ui/button'
import { MarkdownText } from './markdown-text'
import { ZoomableImage } from './zoomable-image'

type FeedbackPanelProps = {
  isCorrect: boolean
  explanationText: string | null
  explanationImageUrl: string | null
  onNext: () => void
}

export function FeedbackPanel({
  isCorrect,
  explanationText,
  explanationImageUrl,
  onNext,
}: Readonly<FeedbackPanelProps>) {
  return (
    <InsetPanel className="space-y-3">
      <p className={`text-sm font-semibold ${isCorrect ? 'text-success' : 'text-danger'}`}>
        {isCorrect ? 'Correct!' : 'Incorrect'}
      </p>

      {explanationText && (
        <MarkdownText className="text-sm text-muted-foreground">{explanationText}</MarkdownText>
      )}

      {explanationImageUrl && (
        <ZoomableImage
          src={explanationImageUrl}
          alt="Explanation illustration"
          className="max-h-48"
        />
      )}

      <Button variant="secondary" type="button" onClick={onNext} className="mt-2">
        Next Question →
      </Button>
    </InsetPanel>
  )
}
