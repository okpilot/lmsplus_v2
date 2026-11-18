'use client'

import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

type Props = { code: string; label: string }

/** Copies the access code and announces "Code copied" through a live region. */
export function CopyCodeButton({ code, label }: Readonly<Props>) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <>
      <Button size="icon-sm" variant="ghost" aria-label={label} onClick={copy}>
        {copied ? <Check className="size-icon" /> : <Copy className="size-icon" />}
      </Button>
      <span role="status" className="sr-only">
        {copied ? 'Code copied' : ''}
      </span>
    </>
  )
}
