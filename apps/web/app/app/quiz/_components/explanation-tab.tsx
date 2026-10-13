import { Empty, EmptyDescription } from '@/components/ui/empty'
import { Eyebrow } from '@/components/ui/heading'
import { MarkdownText } from '../../_components/markdown-text'
import { ZoomableImage } from '../../_components/zoomable-image'

type ExplanationTabProps = {
  explanationText: string | null
  explanationImageUrl: string | null
  learningObjective?: string | null
}

export function ExplanationTab({
  explanationText,
  explanationImageUrl,
  learningObjective,
}: Readonly<ExplanationTabProps>) {
  return (
    <div className="space-y-3 py-4">
      <ExplanationContent text={explanationText} imageUrl={explanationImageUrl} />
      {learningObjective && (
        <div className="rounded-lg bg-muted/50 p-4">
          <Eyebrow>Learning Objective</Eyebrow>
          <p className="mt-1 text-sm">{learningObjective}</p>
        </div>
      )}
    </div>
  )
}

function ExplanationContent({
  text,
  imageUrl,
}: Readonly<{ text: string | null; imageUrl: string | null }>) {
  return (
    <>
      {imageUrl && (
        <ZoomableImage src={imageUrl} alt="Explanation illustration" className="max-h-48" />
      )}
      {text ? (
        <MarkdownText className="text-sm text-muted-foreground">{text}</MarkdownText>
      ) : (
        <Empty className="bg-transparent p-0">
          <EmptyDescription>No explanation available for this question.</EmptyDescription>
        </Empty>
      )}
    </>
  )
}
