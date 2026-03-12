'use client'

import { useEffect, useRef, useState } from 'react'

export function SessionTimer({ className }: { className?: string }) {
  const startedAtRef = useRef(Date.now())
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const elapsed = Math.floor((now - startedAtRef.current) / 1000)
  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60

  return (
    <span className={`tabular-nums text-xs text-muted-foreground ${className ?? ''}`}>
      {mins.toString().padStart(2, '0')}:{secs.toString().padStart(2, '0')}
    </span>
  )
}
