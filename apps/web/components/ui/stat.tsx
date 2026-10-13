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
  trend?: React.ReactNode
  hint?: React.ReactNode
  hintClassName?: string
  /** `plain` drops the card, for a stat that already sits inside another surface. */
  variant?: 'card' | 'plain'
  className?: string
  /** Extra classes for the card content, `card` variant only. */
  contentClassName?: string
}>

function StatLabel({ label, trend }: Readonly<Pick<StatProps, 'label' | 'trend'>>) {
  const text = <span className="text-label text-muted-foreground">{label}</span>
  if (isEmptyNode(trend)) return text
  return (
    <div className="flex items-start justify-between gap-inline">
      {text}
      {trend}
    </div>
  )
}

function StatBody({ label, value, tone, size, trend, hint, hintClassName }: StatProps) {
  return (
    <div data-slot="stat" className="flex flex-col gap-1">
      <StatLabel label={label} trend={trend} />
      <span className={statValue({ tone, size })}>{value}</span>
      {isEmptyNode(hint) ? null : (
        <span className={cn('text-caption text-muted-foreground', hintClassName)}>{hint}</span>
      )}
    </div>
  )
}

function Stat({ variant = 'card', className, contentClassName, ...props }: StatProps) {
  if (variant === 'plain') {
    return (
      <div className={cn('min-w-0', className)}>
        <StatBody {...props} />
      </div>
    )
  }
  return (
    <Card className={cn('overflow-visible', className)}>
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
  return <div className={cn('grid gap-grid', COLUMN_CLASS[columns], className)} {...props} />
}

export { Stat, StatGroup }
