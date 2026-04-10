'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { toggleExamConfig } from '../actions/toggle-exam-config'
import type { SubjectWithConfig } from '../types'

type Props = {
  subject: SubjectWithConfig
  onEdit: () => void
}

export function SubjectConfigCard({ subject, onEdit }: Props) {
  const [isPending, startTransition] = useTransition()
  const config = subject.config

  function handleToggle() {
    if (!config) {
      onEdit()
      return
    }

    startTransition(async () => {
      const result = await toggleExamConfig({
        subjectId: subject.id,
        enabled: !config.enabled,
      })
      if (!result.success) {
        toast.error(result.error)
      } else {
        toast.success(config.enabled ? 'Exam mode disabled' : 'Exam mode enabled')
      }
    })
  }

  return (
    <button
      type="button"
      onClick={onEdit}
      className="flex w-full items-center justify-between rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-muted/50"
    >
      <div className="flex items-center gap-3">
        <span className="rounded bg-muted px-2 py-1 font-mono text-xs font-medium text-muted-foreground">
          {subject.code}
        </span>
        <span className="font-medium">{subject.name}</span>
      </div>

      <div className="flex items-center gap-4">
        {config ? (
          <>
            <span className="text-sm text-muted-foreground">
              {config.totalQuestions} Q &middot; {Math.floor(config.timeLimitSeconds / 60)} min
              &middot; {config.passMark}%
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                handleToggle()
              }}
              disabled={isPending}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                config.enabled
                  ? 'bg-green-500/15 text-green-500 hover:bg-green-500/25'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {isPending ? '...' : config.enabled ? 'Enabled' : 'Disabled'}
            </button>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">Not configured</span>
        )}
      </div>
    </button>
  )
}
