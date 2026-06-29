'use client'

import { Check } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { LoadingButton } from '@/components/ui/loading-button'
import { sendInternalExamCodeEmail } from '../actions/send-code-email'

type Props = Readonly<{ codeId: string; emailedAt: string | null; disabled?: boolean }>

export function SendCodeEmailButton({ codeId, emailedAt, disabled = false }: Props) {
  // Optimistic-only: the server-stamped `emailedAt` prop wins once revalidation
  // refreshes the row, so a re-render replaces the client clock with the real
  // emailed_at (copying the prop into state once would freeze it — props-to-state).
  const [optimisticSentAt, setOptimisticSentAt] = useState<string | null>(null)
  const [isSending, startSending] = useTransition()
  const sentAt = emailedAt ?? optimisticSentAt

  function handleSend() {
    startSending(async () => {
      try {
        const result = await sendInternalExamCodeEmail({ codeId })
        if (result.success) {
          setOptimisticSentAt(new Date().toISOString())
          toast.success('Code emailed to student')
        } else {
          toast.error(result.error)
        }
      } catch {
        toast.error('Failed to send email')
      }
    })
  }

  const formatted = sentAt
    ? new Date(sentAt).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })
    : null

  return (
    <div className="flex flex-col gap-1">
      <LoadingButton
        variant="outline"
        size="sm"
        loading={isSending}
        disabled={disabled}
        loadingText="Sending…"
        onClick={handleSend}
      >
        {sentAt ? 'Resend' : 'Send email'}
      </LoadingButton>
      {sentAt && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Check aria-hidden="true" className="size-3" />
          Sent {formatted}
        </span>
      )}
    </div>
  )
}
