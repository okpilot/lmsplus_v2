'use client'

import { Button } from '@/components/ui/button'
import { CardListRow } from '@/components/ui/card'
import { sittingModeLabel } from '@/lib/utils/sitting-mode-label'
import type { AvailableInternalExam } from '../queries'
import {
  canStart,
  formatAbsolute,
  formatRelative,
  sittingHint,
  sittingWhen,
} from './sitting-captions'

type SittingInfo = NonNullable<AvailableInternalExam['sitting']>

function SittingCaption({ sitting }: Readonly<{ sitting: SittingInfo }>) {
  const when = sitting.scheduledAt ? sittingWhen(sitting.scheduledAt) : null
  const mode = sitting.mode ? sittingModeLabel(sitting.mode) : null
  const caption = [when, mode].filter(Boolean).join(' · ')
  if (!caption) return null
  return <p className="mt-1 text-caption text-muted-foreground">{caption}</p>
}

function ExpiryCaption({ expiresAt }: Readonly<{ expiresAt: string }>) {
  const relative = formatRelative(expiresAt)
  return (
    <p className="mt-1 text-caption text-muted-foreground">
      Expires {formatAbsolute(expiresAt)}
      {relative && (
        <>
          {' '}
          <span className="text-muted-foreground">({relative})</span>
        </>
      )}
    </p>
  )
}

export function AvailableRow({
  row,
  onStart,
}: Readonly<{ row: AvailableInternalExam; onStart: (row: AvailableInternalExam) => void }>) {
  const { sitting } = row
  const open = canStart(sitting?.status)
  const hint = sittingHint(sitting?.status)
  const hintId = `available-hint-${row.id}`
  return (
    <CardListRow
      role="listitem"
      data-testid={`available-row-${row.id}`}
      className="flex items-center justify-between gap-4"
    >
      <div className="min-w-0">
        <p className="text-label-strong text-foreground">
          {row.subjectShort ? `${row.subjectShort} — ` : ''}
          {row.subjectName}
        </p>
        {sitting ? (
          <SittingCaption sitting={sitting} />
        ) : (
          <ExpiryCaption expiresAt={row.expiresAt} />
        )}
        {sitting && (
          <p id={hintId} className="mt-1 text-caption text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
      <Button
        type="button"
        onClick={() => onStart(row)}
        disabled={sitting !== null && !open}
        aria-describedby={sitting ? hintId : undefined}
        data-testid="start-button"
      >
        Start
      </Button>
    </CardListRow>
  )
}
