import { cva } from 'class-variance-authority'
import type * as React from 'react'

import { cn } from '@/lib/utils'
import { isEmptyNode } from '@/lib/utils/is-empty-node'
import { Card, CardContent } from './card'

const statValue = cva('tabular-nums', {
  variants: {
    size: {
      default: 'text-stat',
      compact: 'text-heading sm:text-stat',
      text: 'text-body font-semibold break-words',
    },
    tone: {
      default: 'text-foreground',
      success: 'text-success',
      danger: 'text-danger',
      caution: 'text-caution',
      info: 'text-info',
    },
  },
  defaultVariants: { tone: 'default', size: 'default' },
})

const COLUMN_CLASS = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
} as const

type StatProps = Readonly<{
  label: React.ReactNode
  value: React.ReactNode
  tone?: 'success' | 'danger' | 'caution' | 'info'
  /** `compact` shrinks the value below `sm`, for three-column rows at phone width; `text` is for free-text values: body-size bold, wraps whole words. */
  size?: 'default' | 'compact' | 'text'
  hint?: React.ReactNode
  hintClassName?: string
  /** `plain` drops the card, for a stat that already sits inside another surface. */
  variant?: 'card' | 'plain'
  className?: string
  /** Extra classes for the card content, `card` variant only. */
  contentClassName?: string
}>

function StatBody({ label, value, tone, size, hint, hintClassName }: Readonly<StatProps>) {
  return (
    <div data-slot="stat" className="flex flex-col gap-1">
      <div className="text-label text-muted-foreground">{label}</div>
      <span className={statValue({ tone, size })}>{value}</span>
      {isEmptyNode(hint) ? null : (
        <span className={cn('text-caption text-muted-foreground', hintClassName)}>{hint}</span>
      )}
    </div>
  )
}

function Stat({ variant = 'card', className, contentClassName, ...props }: Readonly<StatProps>) {
  if (variant === 'plain') {
    return (
      <div className={cn('min-w-0', className)}>
        <StatBody {...props} />
      </div>
    )
  }
  return (
    <Card className={cn('min-w-0', className)}>
      <CardContent className={contentClassName}>
        <StatBody {...props} />
      </CardContent>
    </Card>
  )
}

function StatGroup({
  columns = 2,
  className,
  ...props
}: Readonly<React.ComponentProps<'div'> & { columns?: 1 | 2 | 3 | 4 }>) {
  return <div className={cn('grid gap-cards', COLUMN_CLASS[columns], className)} {...props} />
}

export { Stat, StatGroup }
