'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { AvailableInternalExam } from '../queries'
import { CodeEntryModal } from './code-entry-modal'

type Props = { rows: AvailableInternalExam[]; userId: string }

function formatAbsolute(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
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

export function AvailableTab({ rows, userId }: Readonly<Props>) {
  const [selected, setSelected] = useState<AvailableInternalExam | null>(null)

  if (rows.length === 0) {
    return (
      <div
        className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground"
        data-testid="available-empty"
      >
        No internal exams available — your administrator will issue you a code when one is ready.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-3" data-testid="available-list">
        {rows.map((row) => (
          <li
            key={row.id}
            data-testid={`available-row-${row.id}`}
            className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {row.subjectShort ? `${row.subjectShort} — ` : ''}
                {row.subjectName}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Expires {formatAbsolute(row.expiresAt)}{' '}
                <span className="text-muted-foreground/80">({formatRelative(row.expiresAt)})</span>
              </p>
            </div>
            <Button type="button" onClick={() => setSelected(row)} data-testid="start-button">
              Start
            </Button>
          </li>
        ))}
      </ul>
      <CodeEntryModal
        open={selected !== null}
        onOpenChange={(next) => {
          if (!next) setSelected(null)
        }}
        userId={userId}
        subjectName={selected?.subjectName ?? ''}
        subjectShort={selected?.subjectShort ?? ''}
      />
    </div>
  )
}
