'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { formatClock } from './format-clock'

export function SessionTimer({
  className,
  startedAtMs,
}: Readonly<{ className?: string; startedAtMs?: number }>) {
  const startRef = useRef(startedAtMs ?? Date.now())
  const [now, setNow] = useState<number | null>(null)

  useLayoutEffect(() => {
    setNow(Date.now())
  }, [])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const text =
    now === null ? '--:--' : formatClock(Math.floor(Math.max(0, now - startRef.current) / 1000))

  return (
    <span className={`tabular-nums text-caption text-muted-foreground ${className ?? ''}`}>
      {text}
    </span>
  )
}
