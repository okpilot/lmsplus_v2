'use client'

import { Keyboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

const NAV_SHORTCUTS: { keys: string; action: string }[] = [
  { keys: '← / →', action: 'Previous / next question' },
  { keys: '↑ / ↓', action: 'Move answer highlight' },
  { keys: 'Enter', action: 'Submit highlighted answer' },
]

// Tab shortcuts only work in study mode (exam sessions have no tabs), so the
// legend hides them in exam mode to match the actual enforced behavior.
const TAB_SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'Q', action: 'Question tab' },
  { keys: 'E', action: 'Explanation tab' },
  { keys: 'C', action: 'Comments tab' },
  { keys: 'S', action: 'Stats tab' },
]

/**
 * A `?`-style help affordance listing the quiz/exam keyboard shortcuts. Shown
 * only on pointer-with-keyboard layouts (desktop) by the caller. Click-to-toggle Popover.
 */
export function KeyboardLegend({ isExam = false }: Readonly<{ isExam?: boolean }>) {
  const shortcuts = isExam ? NAV_SHORTCUTS : [...NAV_SHORTCUTS, ...TAB_SHORTCUTS]

  return (
    <Popover>
      <PopoverTrigger
        render={<Button type="button" variant="ghost" size="icon-sm" />}
        aria-label="Keyboard shortcuts"
        className="text-muted-foreground"
      >
        <Keyboard className="size-icon" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="Keyboard shortcuts">
        <p className="mb-2 text-caption-strong">Keyboard shortcuts</p>
        <ul className="space-y-1.5">
          {shortcuts.map((s) => (
            <li key={s.action} className="flex items-center justify-between gap-3 text-caption">
              <span className="text-muted-foreground">{s.action}</span>
              <kbd className="rounded-inner border-b-2 border-border bg-muted px-1.5 py-0.5 text-chip">
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
