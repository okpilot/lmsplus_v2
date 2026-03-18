'use client'

import type { DraftData } from '../types'
import { DraftCard } from './draft-card'

type SavedDraftCardProps = { drafts: DraftData[] }

export function SavedDraftCard({ drafts }: SavedDraftCardProps) {
  if (drafts.length === 0) {
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
      {drafts.map((draft) => (
        <DraftCard key={draft.id} draft={draft} />
      ))}
    </div>
  )
}
