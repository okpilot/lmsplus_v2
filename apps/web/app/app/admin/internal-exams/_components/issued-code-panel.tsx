'use client'

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { formatExpiry } from '../_utils/format-expiry'
import { sendInternalExamCodeEmail } from '../actions/send-code-email'

type Props = {
  codeId: string
  code: string
  expiresAt: string
  onDismiss: () => void
}

export function IssuedCodePanel({ codeId, code, expiresAt, onDismiss }: Props) {
  const [copied, setCopied] = useState(false)
  const [sent, setSent] = useState(false)
  const [isSending, startSending] = useTransition()

  // Reset the "Copied" / "Sent" indicators when the panel is reused for a
  // different code (e.g. admin issues a second code without unmounting the
  // panel). The effect body doesn't read `code`, but the dep is the
  // change-trigger — exactly the case useExhaustiveDependencies misclassifies.
  // biome-ignore lint/correctness/useExhaustiveDependencies: code is the change trigger, not a read
  useEffect(() => {
    setCopied(false)
    setSent(false)
  }, [code])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      toast.success('Code copied to clipboard')
    } catch {
      toast.error('Could not copy code')
    }
  }

  function handleSend() {
    startSending(async () => {
      try {
        const result = await sendInternalExamCodeEmail({ codeId })
        if (result.success) {
          setSent(true)
          toast.success('Code emailed to student')
        } else {
          toast.error(result.error)
        }
      } catch {
        toast.error('Failed to send email')
      }
    })
  }

  return (
    <section
      aria-label="Newly issued exam code"
      data-testid="issued-code-panel"
      className="rounded-lg border-2 border-primary bg-primary/5 p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            New code issued
          </p>
          <p
            className="font-mono text-3xl font-bold tracking-widest"
            data-testid="issued-code-value"
          >
            {code}
          </p>
          <p className="text-sm text-muted-foreground">Expires {formatExpiry(expiresAt)}</p>
        </div>
        <div className="flex flex-col gap-2">
          <Button type="button" onClick={handleCopy} variant="default">
            {copied ? 'Copied' : 'Copy code'}
          </Button>
          <LoadingButton
            type="button"
            onClick={handleSend}
            variant="outline"
            disabled={sent}
            loading={isSending}
            loadingText="Sending…"
          >
            {sent ? 'Sent' : 'Send via email'}
          </LoadingButton>
          <Button type="button" onClick={onDismiss} variant="outline">
            Dismiss
          </Button>
        </div>
      </div>
    </section>
  )
}
