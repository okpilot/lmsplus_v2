import { useEffect, useRef, useState } from 'react'

/**
 * Countdown that auto-fires onSubmit after `seconds` ticks.
 * Returns the current countdown value. Fires once and stops.
 */
export function useAutoSubmitCountdown(opts: {
  active: boolean
  seconds: number
  submitting: boolean
  onSubmit: () => void
}) {
  const [countdown, setCountdown] = useState(opts.seconds)
  const firedRef = useRef(false)
  const onSubmitRef = useRef(opts.onSubmit)
  onSubmitRef.current = opts.onSubmit

  // Effect 1: run the interval while active and not already submitting.
  useEffect(() => {
    if (!opts.active || opts.submitting) return
    if (firedRef.current) return
    setCountdown(opts.seconds)
    const id = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(id)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [opts.active, opts.submitting, opts.seconds])

  // Effect 2: fire submit once when countdown reaches 0. Kept separate from the
  // interval effect so the call never happens inside a setState updater
  // (which would trigger the "setState in render" React warning).
  useEffect(() => {
    if (!opts.active || opts.submitting) return
    if (countdown === 0 && !firedRef.current) {
      firedRef.current = true
      onSubmitRef.current()
    }
  }, [countdown, opts.active, opts.submitting])

  // Effect 3: reset fire-guard and display when the countdown is deactivated
  // (dialog closed). Separate from Effect 1 so interval cleanup runs
  // independently of reset logic.
  useEffect(() => {
    if (!opts.active) {
      firedRef.current = false
      setCountdown(opts.seconds)
    }
  }, [opts.active, opts.seconds])

  return countdown
}
