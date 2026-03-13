'use client'

import { useEffect, useState, useTransition } from 'react'
import { MarkdownText } from '../../_components/markdown-text'
import { ZoomableImage } from '../../_components/zoomable-image'
import { fetchExplanation } from '../actions/fetch-explanation'

type ExplanationTabProps =
  | { hasAnswered: false; questionId: string }
  | {
      hasAnswered: true
      isCorrect: boolean
      explanationText: string | null
      explanationImageUrl: string | null
    }

export function ExplanationTab(props: ExplanationTabProps) {
  if (props.hasAnswered) {
    return <AnsweredExplanation {...props} />
  }
  return <PreAnswerExplanation questionId={props.questionId} />
}

function AnsweredExplanation(props: {
  isCorrect: boolean
  explanationText: string | null
  explanationImageUrl: string | null
}) {
  const { isCorrect, explanationText, explanationImageUrl } = props
  return (
    <div className="space-y-3 py-4">
      <p className={`text-sm font-semibold ${isCorrect ? 'text-green-600' : 'text-destructive'}`}>
        {isCorrect ? 'You answered correctly.' : 'You answered incorrectly.'}
      </p>
      <ExplanationContent text={explanationText} imageUrl={explanationImageUrl} />
    </div>
  )
}

function PreAnswerExplanation({ questionId }: { questionId: string }) {
  const [explanation, setExplanation] = useState<{
    text: string | null
    imageUrl: string | null
  } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [, startTransition] = useTransition()

  // biome-ignore lint/correctness/useExhaustiveDependencies: fetch when questionId changes
  useEffect(() => {
    setIsLoading(true)
    setExplanation(null)
    startTransition(async () => {
      const result = await fetchExplanation({ questionId })
      if (result.success) {
        setExplanation({
          text: result.explanationText,
          imageUrl: result.explanationImageUrl,
        })
      }
      setIsLoading(false)
    })
  }, [questionId])

  if (isLoading) {
    return (
      <div className="space-y-3 py-4">
        <div className="h-4 w-48 animate-pulse rounded bg-muted" />
        <div className="h-4 w-64 animate-pulse rounded bg-muted" />
      </div>
    )
  }

  if (!explanation) {
    return (
      <div className="py-4">
        <p className="text-sm text-muted-foreground">No explanation available for this question.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3 py-4">
      <ExplanationContent text={explanation.text} imageUrl={explanation.imageUrl} />
    </div>
  )
}

function ExplanationContent(props: {
  text: string | null
  imageUrl: string | null
}) {
  const { text, imageUrl } = props
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
