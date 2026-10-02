'use client'

import { Button } from '@/components/ui/button'
import { MOON_PATHS, SUN_PATHS, useThemeSwitch } from './use-theme-switch'

export function ThemeToggle() {
  const { mounted, isDark, toggle } = useThemeSwitch()

  if (!mounted) return <div className="size-8" />

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label="Toggle theme"
      className="text-muted-foreground"
    >
      <svg
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {(isDark ? SUN_PATHS : MOON_PATHS).map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </Button>
  )
}
