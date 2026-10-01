'use client'

import { type ComponentProps, useSyncExternalStore } from 'react'
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

type OrbState = NonNullable<ComponentProps<typeof ThinkingOrb>['state']>

type OrbLoaderProps = {
  size?: 20 | 32 | 64
  label: string
  state?: OrbState
}

export function OrbLoader({ size = 20, label, state = 'solving' }: Readonly<OrbLoaderProps>) {
  const reducedMotion = usePrefersReducedMotion()
  return (
    <span role="status" aria-label={label} className="inline-flex items-center justify-center">
      <ThinkingOrb
        state={state}
        size={size}
        theme="auto"
        dotSize={1.5}
        paused={reducedMotion}
        aria-hidden
      />
    </span>
  )
}
