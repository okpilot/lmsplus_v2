'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

type Props = {
  code: string
  expiresAt: string
  onDismiss: () => void
}

function formatExpiry(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

export function IssuedCodePanel({ code, expiresAt, onDismiss }: Readonly<Props>) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      toast.success('Code copied to clipboard')
    } catch {
      toast.error('Could not copy code')
    }
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
          <p className="text-sm font-medium text-destructive">Won't be shown again — copy now.</p>
        </div>
        <div className="flex flex-col gap-2">
          <Button type="button" onClick={handleCopy} variant="default">
            {copied ? 'Copied' : 'Copy code'}
          </Button>
          <Button type="button" onClick={onDismiss} variant="outline">
            Dismiss
          </Button>
        </div>
      </div>
    </section>
  )
}
