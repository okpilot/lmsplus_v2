import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type SectionLabelProps = {
  children: ReactNode
  as?: 'p' | 'h2' | 'h3' | 'span'
  className?: string
}

export function SectionLabel({ children, as: Tag = 'p', className }: Readonly<SectionLabelProps>) {
  return (
    <Tag
      className={cn(
        'text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground',
        className,
      )}
    >
      {children}
    </Tag>
  )
}
