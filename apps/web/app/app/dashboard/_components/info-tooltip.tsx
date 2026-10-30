'use client'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

type InfoTooltipProps = {
  label: string
  title: string
  description: string
  align?: 'left' | 'center' | 'right'
}

const ALIGN = { left: 'start', center: 'center', right: 'end' } as const

export function InfoTooltip({
  label,
  title,
  description,
  align = 'right',
}: Readonly<InfoTooltipProps>) {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        aria-label={label}
        className="flex size-icon-lg items-center justify-center rounded-pill border border-border text-overline text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        ?
      </PopoverTrigger>
      <PopoverContent align={ALIGN[align]} aria-label={title} className="w-48 md:w-56">
        <p className="font-medium text-foreground">{title}</p>
        <p className="mt-1 text-muted-foreground">{description}</p>
      </PopoverContent>
    </Popover>
  )
}
