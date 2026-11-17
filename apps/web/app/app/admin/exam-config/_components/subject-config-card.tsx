'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
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
    <div className="flex items-center transition-colors hover:bg-muted">
      <Button
        variant="bare"
        onClick={onEdit}
        className="flex min-w-0 flex-1 items-center justify-between p-4 text-left focus-visible:outline-solid focus-visible:outline-focus focus-visible:-outline-offset-focus focus-visible:outline-ring"
      >
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground tabular-nums">{subject.code}</span>
          <span className="font-medium">{subject.name}</span>
        </div>

        {config ? (
          <span className="text-body text-muted-foreground">
            {config.totalQuestions} Q &middot; {Math.floor(config.timeLimitSeconds / 60)} min
            &middot; {config.passMark}%
          </span>
        ) : (
          <span className="text-body text-muted-foreground">Not configured</span>
        )}
      </Button>

      {config && (
        <div className="mr-4 flex shrink-0 items-center gap-2">
          <span aria-hidden="true" className="text-body text-muted-foreground">
            {config.enabled ? 'Enabled' : 'Disabled'}
          </span>
          <Switch
            aria-label={`Exam mode for ${subject.name}`}
            checked={config.enabled}
            onCheckedChange={handleToggle}
            disabled={isPending}
          />
        </div>
      )}
    </div>
  )
}
