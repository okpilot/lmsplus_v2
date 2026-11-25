'use client'

import { Button } from '@/components/ui/button'
import { CardListRow } from '@/components/ui/card'
import { formatUtc } from '@/lib/utils/format-utc'
import { sittingModeLabel } from '@/lib/utils/sitting-mode-label'
import type { AvailableInternalExam } from '../queries'

function formatAbsolute(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return formatUtc(d, { dateStyle: 'medium', timeStyle: 'short' })
}

function formatRelative(iso: string, now: Date = new Date()): string {
  const target = new Date(iso)
  if (Number.isNaN(target.getTime())) return ''
  const diffMs = target.getTime() - now.getTime()
  if (diffMs <= 0) return 'expired'
  const minutes = Math.round(diffMs / 60_000)
  if (minutes < 60) return `in ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `in ${hours} h`
  const days = Math.round(hours / 24)
  return `in ${days} d`
}

type SittingInfo = NonNullable<AvailableInternalExam['sitting']>

function SittingCaption({ sitting }: Readonly<{ sitting: SittingInfo }>) {
  // `mapSitting` maps a non-string scheduled_at to '', which formatUtc renders "Invalid Date".
  const when = sitting.scheduledAt
    ? formatUtc(sitting.scheduledAt, { dateStyle: 'medium', timeStyle: 'short' })
    : null
  return (
    <p className="mt-1 text-caption text-muted-foreground">
      {when ? `${when} · ` : ''}
      {sittingModeLabel(sitting.mode)}
    </p>
  )
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

/** A closed or cancelled sitting never opens, so it must not promise that it will. */
function sittingHint(status: SittingInfo['status'] | undefined): string {
  if (status === 'open') return 'Works while the sitting is open.'
  // The row is server-rendered and nothing refreshes it, so the student has to reload.
  if (status === 'scheduled')
    return 'Opens when your invigilator starts the sitting — reload this page to check.'
  return 'This sitting has ended. Ask your invigilator.'
}

export function AvailableRow({
  row,
  onStart,
}: Readonly<{ row: AvailableInternalExam; onStart: (row: AvailableInternalExam) => void }>) {
  const { sitting } = row
  const open = sitting?.status === 'open'
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
