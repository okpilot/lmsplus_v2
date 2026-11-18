'use client'

import { Check, Copy } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

type Props = { code: string; label: string }

/** Copies the access code and announces "Code copied" through a live region. */
export function CopyCodeButton({ code, label }: Readonly<Props>) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])
  useEffect(() => clearTimer, [clearTimer])

  async function copy() {
    clearTimer()
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      timer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      clearTimer()
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
