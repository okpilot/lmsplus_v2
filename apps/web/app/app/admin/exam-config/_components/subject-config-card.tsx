'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { toggleExamConfig } from '../actions/toggle-exam-config'
import type { SubjectWithConfig } from '../types'

type Props = {
  subject: SubjectWithConfig
  onEdit: () => void
}

export function SubjectConfigCard({ subject, onEdit }: Readonly<Props>) {
  const [isPending, startTransition] = useTransition()
  const config = subject.config

  function handleToggle() {
    if (!config) {
      onEdit()
      return
    }

    startTransition(async () => {
      try {
        const result = await toggleExamConfig({
          subjectId: subject.id,
          enabled: !config.enabled,
        })
        if (!result.success) {
          toast.error(result.error)
        } else {
          toast.success(config.enabled ? 'Exam mode disabled' : 'Exam mode enabled')
        }
      } catch {
        toast.error('Failed to update exam status')
      }
    })
  }

  return (
    <div className="flex items-center rounded-lg border border-border bg-card transition-colors hover:bg-muted/50">
      <button
        type="button"
        onClick={onEdit}
        className="flex min-w-0 flex-1 items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="rounded bg-muted px-2 py-1 tabular-nums text-xs font-medium text-muted-foreground">
            {subject.code}
          </span>
          <span className="font-medium">{subject.name}</span>
        </div>

        {config ? (
          <span className="text-sm text-muted-foreground">
            {config.totalQuestions} Q &middot; {Math.floor(config.timeLimitSeconds / 60)} min
            &middot; {config.passMark}%
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">Not configured</span>
        )}
      </button>

      {config && (
        <button
          type="button"
          onClick={handleToggle}
          disabled={isPending}
          className="relative mr-4 shrink-0 rounded-full transition-opacity after:absolute after:-inset-x-1 after:-inset-y-3 lg:after:hidden enabled:hover:opacity-80 disabled:opacity-50"
        >
          <Badge tone={config.enabled ? 'success' : 'neutral'}>
            {isPending ? '...' : config.enabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </button>
      )}
    </div>
  )
}
