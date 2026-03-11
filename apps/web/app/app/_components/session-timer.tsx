'use client'

import { useEffect, useRef, useState } from 'react'

export function SessionTimer({ className }: { className?: string }) {
  const [seconds, setSeconds] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setSeconds((s) => s + 1)
    }, 1000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60

  return (
    <span className={`tabular-nums text-xs text-muted-foreground ${className ?? ''}`}>
      {mins}:{secs.toString().padStart(2, '0')}
    </span>
  )
}
