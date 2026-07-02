'use client'

import { Keyboard } from 'lucide-react'
import { useEffect, useState } from 'react'

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
 * only on pointer-with-keyboard layouts (desktop) by the caller. Self-contained
 * popover (same click-to-toggle pattern as the filter hints) — no dependency.
 */
export function KeyboardLegend({ isExam = false }: Readonly<{ isExam?: boolean }>) {
  const [open, setOpen] = useState(false)
  const shortcuts = isExam ? NAV_SHORTCUTS : [...NAV_SHORTCUTS, ...TAB_SHORTCUTS]

  // Escape closes the popover — the standard dialog affordance for keyboard users
  // (the click-away backdrop is aria-hidden / not focusable).
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-label="Keyboard shortcuts"
        aria-expanded={open}
        className="inline-flex items-center justify-center rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Keyboard className="size-4" aria-hidden />
      </button>
      {open && (
        <>
          {/* Click-away backdrop. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="dialog"
            aria-label="Keyboard shortcuts"
            className="absolute right-0 top-full z-50 mt-2 w-60 rounded-lg border border-border bg-background p-3 shadow-md"
          >
            <p className="mb-2 text-xs font-medium">Keyboard shortcuts</p>
            <ul className="space-y-1.5">
              {shortcuts.map((s) => (
                <li key={s.action} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">{s.action}</span>
                  <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                    {s.keys}
                  </kbd>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
