'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ROW_CLASS, RowIcon } from './sidebar-item'

const MOON = ['M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z']
const SUN = [
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

export function ThemeRow() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const dark = mounted && resolvedTheme === 'dark'

  return (
    <Button variant="ghost" className={ROW_CLASS} onClick={() => setTheme(dark ? 'light' : 'dark')}>
      <RowIcon paths={dark ? SUN : MOON} />
      {dark ? 'Light mode' : 'Dark mode'}
    </Button>
  )
}
