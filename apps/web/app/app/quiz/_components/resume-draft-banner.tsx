'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { deleteDraft } from '../actions/draft-delete'
import type { DraftData } from '../types'

type ResumeDraftBannerProps = { draft: DraftData }

export function ResumeDraftBanner({ draft }: ResumeDraftBannerProps) {
  const router = useRouter()
  const [visible, setVisible] = useState(true)
  const [discarding, setDiscarding] = useState(false)
  const [discardError, setDiscardError] = useState<string | null>(null)

  if (!visible) return null

  const answeredCount = Object.keys(draft.answers).length
  const totalCount = draft.questionIds.length

  function handleResume() {
    sessionStorage.setItem(
      'quiz-session',
      JSON.stringify({
        sessionId: draft.sessionId,
        questionIds: draft.questionIds,
        draftAnswers: draft.answers,
        draftCurrentIndex: draft.currentIndex,
        draftId: draft.id,
        subjectName: draft.subjectName,
        subjectCode: draft.subjectCode,
      }),
    )
    router.push('/app/quiz/session')
  }

  async function handleDiscard() {
    setDiscarding(true)
    setDiscardError(null)
    try {
      const result = await deleteDraft({ draftId: draft.id })
      if (result.success) {
        setVisible(false)
      } else {
        setDiscardError('Failed to discard. Please try again.')
      }
    } catch {
      setDiscardError('Failed to discard. Please try again.')
    } finally {
      setDiscarding(false)
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-lg border border-primary/30 bg-primary/5 p-4">
      <p className="text-sm font-medium text-foreground">Resume unfinished quiz?</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {answeredCount} of {totalCount} questions answered
      </p>
      {discardError && <p className="mt-2 text-xs text-destructive">{discardError}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={handleResume}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Resume
        </button>
        <button
          type="button"
          onClick={handleDiscard}
          disabled={discarding}
          className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          {discarding ? 'Discarding...' : 'Discard'}
        </button>
      </div>
    </div>
  )
}
