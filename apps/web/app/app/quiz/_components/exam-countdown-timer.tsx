'use client'

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'

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
  if (remaining <= 60) return 'text-danger font-semibold'
  if (remaining <= 300) return 'text-caution font-semibold'
  return 'text-muted-foreground'
}

function remainingClass(remaining: number | null): string {
  return remaining === null ? 'text-muted-foreground' : getTimerClass(remaining)
}

function useCountdownRemaining(
  timeLimitSeconds: number,
  startedAt: number,
  onExpired: () => void,
): number | null {
  const expiredRef = useRef(false)
  const calcRemaining = useEffectEvent(() =>
    Math.max(0, timeLimitSeconds - Math.floor((Date.now() - startedAt) / 1000)),
  )
  const expire = useEffectEvent(onExpired)
  const [remaining, setRemaining] = useState<number | null>(null)
  useLayoutEffect(() => {
    setRemaining(calcRemaining())
  }, [])
  useEffect(() => {
    const id = setInterval(() => {
      const r = calcRemaining()
      setRemaining(r)
      if (r <= 0 && !expiredRef.current) {
        expiredRef.current = true
        expire()
      }
    }, 1000)
    return () => clearInterval(id)
  }, [])
  return remaining
}

export function ExamCountdownTimer({
  timeLimitSeconds,
  startedAt,
  onExpired,
  className,
}: Readonly<ExamCountdownTimerProps>) {
  const remaining = useCountdownRemaining(timeLimitSeconds, startedAt, onExpired)

  return (
    <span className={`tabular-nums ${remainingClass(remaining)} ${className ?? ''}`}>
      {remaining === null ? '--:--' : formatCountdown(remaining)}
    </span>
  )
}
