'use client'

import type { SavedQuizSession } from '@/lib/queries/load-saved-quizzes'
import type { DraftData } from '../types'
import { DraftCard } from './draft-card'
import { SavedSessionCard } from './saved-session-card'

type SavedDraftCardProps = {
  drafts: DraftData[]
  savedSessions: SavedQuizSession[]
  savedLookupFailed?: boolean
}

export function SavedDraftCard({
  drafts,
  savedSessions,
  savedLookupFailed = false,
}: Readonly<SavedDraftCardProps>) {
  if (drafts.length === 0 && savedSessions.length === 0) {
    if (savedLookupFailed) return null
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center">
        <p className="text-sm text-muted-foreground">
          No saved quizzes. Start a new quiz and use "Save for Later" to save your progress.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {savedSessions.map((session) => (
        <SavedSessionCard key={session.sessionId} session={session} />
      ))}
      {drafts.map((draft) => (
        <DraftCard key={draft.id} draft={draft} />
      ))}
    </div>
  )
}
