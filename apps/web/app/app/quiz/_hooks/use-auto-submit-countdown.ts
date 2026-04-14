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

  useEffect(() => {
    if (!opts.active || opts.submitting) return
    if (firedRef.current) return
    setCountdown(opts.seconds)
    const id = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(id)
          if (!firedRef.current) {
            firedRef.current = true
            onSubmitRef.current()
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [opts.active, opts.submitting, opts.seconds])

  useEffect(() => {
    if (!opts.active) {
      firedRef.current = false
      setCountdown(opts.seconds)
    }
  }, [opts.active, opts.seconds])

  return countdown
}
