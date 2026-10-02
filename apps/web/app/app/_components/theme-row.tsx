'use client'

import { Button } from '@/components/ui/button'
import { ROW_CLASS, RowIcon } from './sidebar-item'
import { MOON_PATHS, SUN_PATHS, useThemeSwitch } from './use-theme-switch'

export function ThemeRow() {
  const { isDark, toggle } = useThemeSwitch()

  return (
    <Button variant="ghost" className={ROW_CLASS} onClick={toggle}>
      <RowIcon paths={isDark ? SUN_PATHS : MOON_PATHS} />
      {isDark ? 'Light mode' : 'Dark mode'}
    </Button>
  )
}
