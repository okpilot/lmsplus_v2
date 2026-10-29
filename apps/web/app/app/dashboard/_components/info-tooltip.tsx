'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'

type InfoTooltipProps = {
  label: string
  title: string
  description: string
  align?: 'left' | 'center' | 'right'
}

const ALIGN_CLASSES = {
  left: 'left-0',
  center: 'left-1/2 -translate-x-1/2',
  right: 'right-0',
} as const

export function InfoTooltip({
  label,
  title,
  description,
  align = 'right',
}: Readonly<InfoTooltipProps>) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const tooltipId = useId()

  const toggle = useCallback(() => setOpen((o) => !o), [])

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('click', onClickOutside, true)
    return () => document.removeEventListener('click', onClickOutside, true)
  }, [open])

  const alignClass = ALIGN_CLASSES[align]

  return (
    <div ref={ref} className="group relative inline-flex">
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-describedby={tooltipId}
        className="flex size-icon-lg items-center justify-center rounded-pill border border-border text-overline text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        ?
      </button>

      <div
        id={tooltipId}
        role="tooltip"
        className={`absolute top-6 z-sticky w-48 rounded-control bg-popover p-3 text-caption text-muted-foreground ring-1 ring-border shadow-raised md:top-7 md:w-56 ${alignClass} ${open ? 'block' : 'hidden group-hover:md:block'}`}
      >
        <p className="font-medium text-foreground">{title}</p>
        <p className="mt-1">{description}</p>
      </div>
    </div>
  )
}
