'use client'

import { Dialog } from '@base-ui/react/dialog'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRef, useState } from 'react'

const NAV_ITEMS = [
  { href: '/app/dashboard', label: 'Dashboard' },
  { href: '/app/review', label: 'Smart Review' },
  { href: '/app/quiz', label: 'Quiz' },
  { href: '/app/progress', label: 'Progress' },
  { href: '/app/reports', label: 'Reports' },
]

export function MobileNav() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Close drawer on route change
  const prevPathname = useRef(pathname)
  if (prevPathname.current !== pathname) {
    prevPathname.current = pathname
    if (open) setOpen(false)
  }

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="Open menu"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <title>Menu</title>
          <path d="M3 12h18M3 6h18M3 18h18" />
        </svg>
      </button>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50 transition-opacity" />
          <Dialog.Popup className="fixed inset-y-0 left-0 z-50 w-64 bg-background p-6 shadow-lg">
            <div className="mb-6 flex items-center justify-between">
              <span className="text-sm font-semibold">LMS Plus</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>
            <nav className="flex flex-col gap-1">
              {NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    }`}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </nav>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
