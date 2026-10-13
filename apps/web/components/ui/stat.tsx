import { cva } from 'class-variance-authority'
import type * as React from 'react'

import { cn } from '@/lib/utils'
import { Card, CardContent } from './card'

const statValue = cva('text-stat tabular-nums', {
  variants: {
    tone: {
      default: 'text-foreground',
      success: 'text-success',
      danger: 'text-danger',
      caution: 'text-caution',
      info: 'text-info',
    },
  },
  defaultVariants: { tone: 'default' },
})

const COLUMN_CLASS = {
  2: '',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
} as const

type StatProps = Readonly<{
  label: React.ReactNode
  value: React.ReactNode
  tone?: 'success' | 'danger' | 'caution' | 'info'
  trend?: React.ReactNode
  hint?: React.ReactNode
  /** `plain` drops the card, for a stat that already sits inside another surface. */
  variant?: 'card' | 'plain'
  className?: string
}>

function StatBody({ label, value, tone, trend, hint }: StatProps) {
  return (
    <div data-slot="stat" className="flex flex-col gap-1">
      <div className="flex items-start justify-between gap-inline">
        <span className="text-label text-muted-foreground">{label}</span>
        {trend}
      </div>
      <span className={statValue({ tone })}>{value}</span>
      {hint ? <span className="text-caption text-muted-foreground">{hint}</span> : null}
    </div>
  )
}

function Stat({ variant = 'card', className, ...props }: StatProps) {
  if (variant === 'plain') {
    return (
      <div className={cn('min-w-0', className)}>
        <StatBody {...props} />
      </div>
    )
  }
  return (
    <Card className={className}>
      <CardContent>
        <StatBody {...props} />
      </CardContent>
    </Card>
  )
}

function StatGroup({
  columns = 2,
  className,
  ...props
}: Readonly<React.ComponentProps<'div'> & { columns?: 2 | 3 | 4 }>) {
  return (
    <div
      className={cn('grid gap-grid sm:grid-cols-2', COLUMN_CLASS[columns], className)}
      {...props}
    />
  )
}

export { Stat, StatGroup }
