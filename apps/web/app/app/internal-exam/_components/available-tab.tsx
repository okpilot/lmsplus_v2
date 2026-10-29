'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Empty, EmptyDescription } from '@/components/ui/empty'
import type { AvailableInternalExam } from '../queries'
import { CodeEntryModal } from './code-entry-modal'

type Props = { rows: AvailableInternalExam[] }

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

export function AvailableTab({ rows }: Readonly<Props>) {
  const [selected, setSelected] = useState<AvailableInternalExam | null>(null)

  if (rows.length === 0) {
    return (
      <Empty data-testid="available-empty">
        <EmptyDescription>
          No internal exams available — your administrator will issue you a code when one is ready.
        </EmptyDescription>
      </Empty>
    )
  }

  return (
    <div className="space-y-3">
      <Card className="gap-0 py-0">
        <ul className="divide-y divide-border" data-testid="available-list">
          {rows.map((row) => (
            <li
              key={row.id}
              data-testid={`available-row-${row.id}`}
              className="flex items-center justify-between gap-4 p-4"
            >
              <div className="min-w-0">
                <p className="text-label font-semibold text-foreground">
                  {row.subjectShort ? `${row.subjectShort} — ` : ''}
                  {row.subjectName}
                </p>
                <p className="mt-1 text-caption text-muted-foreground">
                  Expires {formatAbsolute(row.expiresAt)}
                  {formatRelative(row.expiresAt) && (
                    <>
                      {' '}
                      <span className="text-muted-foreground">
                        ({formatRelative(row.expiresAt)})
                      </span>
                    </>
                  )}
                </p>
              </div>
              <Button type="button" onClick={() => setSelected(row)} data-testid="start-button">
                Start
              </Button>
            </li>
          ))}
        </ul>
      </Card>
      <CodeEntryModal
        open={selected !== null}
        onOpenChange={(next) => {
          if (!next) setSelected(null)
        }}
        subjectName={selected?.subjectName ?? ''}
        subjectShort={selected?.subjectShort ?? ''}
      />
    </div>
  )
}
