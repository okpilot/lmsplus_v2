'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type ExamCountdownTimerProps = {
  timeLimitSeconds: number
  startedAt: number
  onExpired: () => void
  className?: string
}

function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}

function getTimerClass(remaining: number): string {
  if (remaining <= 60) return 'text-destructive animate-pulse font-bold'
  if (remaining <= 300) return 'text-amber-600 dark:text-amber-400 font-semibold'
  return 'text-muted-foreground'
}

export function ExamCountdownTimer({
  timeLimitSeconds,
  startedAt,
  onExpired,
  className,
}: ExamCountdownTimerProps) {
  const expiredRef = useRef(false)
  const timeLimitRef = useRef(timeLimitSeconds)
  const startedAtRef = useRef(startedAt)
  const onExpiredRef = useRef(onExpired)
  timeLimitRef.current = timeLimitSeconds
  startedAtRef.current = startedAt
  onExpiredRef.current = onExpired

  const calcRemaining = useCallback(
    () =>
      Math.max(0, timeLimitRef.current - Math.floor((Date.now() - startedAtRef.current) / 1000)),
    [],
  )

  const [remaining, setRemaining] = useState(calcRemaining)

  useEffect(() => {
    const id = setInterval(() => {
      const r = calcRemaining()
      setRemaining(r)
      if (r <= 0 && !expiredRef.current) {
        expiredRef.current = true
        onExpiredRef.current()
      }
    }, 1000)
    return () => clearInterval(id)
  }, [calcRemaining])

  return (
    <span className={`tabular-nums ${getTimerClass(remaining)} ${className ?? ''}`}>
      {formatCountdown(remaining)}
    </span>
  )
}
