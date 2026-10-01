import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

export const MOON_PATHS = ['M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z']
export const SUN_PATHS = [
  'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  'M12 2v2',
  'M12 20v2',
  'M2 12h2',
  'M20 12h2',
  'm4.93 4.93 1.41 1.41',
  'm17.66 17.66 1.41 1.41',
  'm6.34 17.66-1.41 1.41',
  'm19.07 4.93-1.41 1.41',
]

/** Resolved light/dark state, hydration-guarded; `isDark` is false until mounted. */
export function useThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const isDark = mounted && resolvedTheme === 'dark'
  const toggle = () => setTheme(isDark ? 'light' : 'dark')

  return { mounted, isDark, toggle }
}
