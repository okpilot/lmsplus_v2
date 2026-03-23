'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'

type InfoTooltipProps = {
  label: string
  title: string
  description: string
  align?: 'left' | 'center' | 'right'
}

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

  const ALIGN_CLASSES = {
    left: 'left-0',
    center: 'left-1/2 -translate-x-1/2',
    right: 'right-0',
  } as const
  const alignClass = ALIGN_CLASSES[align]

  return (
    <div ref={ref} className="group relative inline-flex">
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-describedby={tooltipId}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-border text-[9px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:h-5 md:w-5 md:text-[11px]"
      >
        ?
      </button>

      <div
        id={tooltipId}
        role="tooltip"
        className={`absolute top-6 z-10 w-48 rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground shadow-md md:top-7 md:w-56 ${alignClass} ${open ? 'block' : 'hidden group-hover:md:block'}`}
      >
        <p className="font-medium text-foreground">{title}</p>
        <p className="mt-1">{description}</p>
      </div>
    </div>
  )
}
