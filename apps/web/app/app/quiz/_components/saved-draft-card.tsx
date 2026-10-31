'use client'

import { Button } from '@/components/ui/button'
import { CardList, CardListRow } from '@/components/ui/card'
import { Empty, EmptyDescription } from '@/components/ui/empty'
import { FieldError } from '@/components/ui/field-error'
import type { SavedQuizSession } from '@/lib/queries/load-saved-quizzes'
import type { DraftData } from '../types'
import { DraftCard } from './draft-card'
import { SavedSessionCard } from './saved-session-card'
import { SavedSessionProgress } from './saved-session-progress'

type SavedRowProps = {
  title: string
  subtitle?: string
  answered: number
  total: number
  error: string | null
  resumeTestId: string
  deleteTestId: string
  resuming: boolean
  resumeDisabled: boolean
  deleting: boolean
  deleteDisabled: boolean
  onResume: () => void
  onDelete: () => void
  rowTestId?: string
}

/** One saved quiz as a row of the list: subject and mode, progress, then Resume and Delete. */
export function SavedRow(props: Readonly<SavedRowProps>) {
  const { title, subtitle, answered, total, error, resuming, deleting } = props
  return (
    <CardListRow
      data-testid={props.rowTestId}
      className="flex flex-col gap-3 lg:grid lg:grid-cols-(--layout-saved-row) lg:items-center lg:gap-x-section"
    >
      <div className="min-w-0">
        <p className="truncate text-label">{title}</p>
        {subtitle && <p className="text-caption text-muted-foreground">{subtitle}</p>}
      </div>
      <SavedSessionProgress answered={answered} total={total} />
      <div className="flex shrink-0 gap-2">
        <Button
          type="button"
          variant="outline"
          data-testid={props.resumeTestId}
          onClick={props.onResume}
          disabled={props.resumeDisabled}
          aria-busy={resuming || undefined}
        >
          {resuming ? 'Resuming...' : 'Resume'}
        </Button>
        <Button
          type="button"
          variant="outline"
          data-testid={props.deleteTestId}
          onClick={props.onDelete}
          disabled={props.deleteDisabled}
        >
          {deleting ? 'Deleting...' : 'Delete'}
        </Button>
      </div>
      <FieldError role="alert" className="lg:col-span-full">
        {error}
      </FieldError>
    </CardListRow>
  )
}

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
      <Empty>
        <EmptyDescription>
          No saved quizzes. Start a new quiz and use "Save for Later" to save your progress.
        </EmptyDescription>
      </Empty>
    )
  }

  return (
    <CardList>
      {savedSessions.map((session) => (
        <SavedSessionCard key={session.sessionId} session={session} />
      ))}
      {drafts.map((draft) => (
        <DraftCard key={draft.id} draft={draft} />
      ))}
    </CardList>
  )
}
