'use client'

import { useEffect, useRef, useState } from 'react'

export function SessionTimer({
  className,
  startedAtMs,
}: Readonly<{ className?: string; startedAtMs?: number }>) {
  const startRef = useRef(startedAtMs ?? Date.now())
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const elapsed = Math.floor(Math.max(0, now - startRef.current) / 1000)
  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60

  return (
    <span className={`tabular-nums text-caption text-muted-foreground ${className ?? ''}`}>
      {mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}
    </span>
  )
}
