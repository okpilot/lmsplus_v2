'use client'

import { useSyncExternalStore } from 'react'
import { ThinkingOrb } from 'thinking-orbs'

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches
}

function getServerSnapshot() {
  return false
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

type OrbLoaderProps = {
  size?: 20 | 32 | 64
  label: string
  state?:
    | 'working'
    | 'searching'
    | 'solving'
    | 'listening'
    | 'connecting'
    | 'weaving'
    | 'composing'
    | 'breathing'
    | 'shaping'
}

export function OrbLoader({ size = 20, label, state = 'working' }: Readonly<OrbLoaderProps>) {
  const reducedMotion = usePrefersReducedMotion()
  return (
    <span role="status" aria-label={label} className="inline-flex items-center justify-center">
      <ThinkingOrb
        state={state}
        size={size}
        theme="auto"
        color="#3b4250"
        paused={reducedMotion}
        aria-hidden
      />
    </span>
  )
}
