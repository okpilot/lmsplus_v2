import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'

import { cn } from '@/lib/utils'

const alertVariants = cva(
  'group/alert relative grid w-full gap-x-inline gap-y-1 text-left text-foreground has-[>svg]:grid-cols-[auto_1fr] *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg:not([class*=size-])]:size-icon',
  {
    variants: {
      tone: {
        neutral: 'bg-muted [&>svg]:text-muted-foreground',
        info: 'bg-info-soft [&>svg]:text-info',
        success: 'bg-success-soft [&>svg]:text-success',
        caution: 'bg-caution-soft [&>svg]:text-caution',
        danger: 'bg-danger-soft [&>svg]:text-danger',
      },
      size: {
        default: 'rounded-card p-card',
        compact: 'rounded-card px-card py-stack',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'default' },
  },
)

const toneText =
  'group-data-[tone=info]/alert:text-info group-data-[tone=success]/alert:text-success group-data-[tone=caution]/alert:text-caution group-data-[tone=danger]/alert:text-danger'

function Alert({
  className,
  tone,
  size,
  ...props
}: Readonly<React.ComponentProps<'div'> & VariantProps<typeof alertVariants>>) {
  return (
    <div
      data-slot="alert"
      data-tone={tone ?? 'neutral'}
      className={cn(alertVariants({ tone, size }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: Readonly<React.ComponentProps<'div'>>) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        'text-label font-semibold group-has-[>svg]/alert:col-start-2',
        toneText,
        className,
      )}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  muted,
  ...props
}: Readonly<React.ComponentProps<'div'> & { muted?: boolean }>) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        'text-body group-has-[>svg]/alert:col-start-2',
        muted ? 'text-muted-foreground' : toneText,
        className,
      )}
      {...props}
    />
  )
}

function AlertAction({ className, ...props }: Readonly<React.ComponentProps<'div'>>) {
  return (
    <div
      data-slot="alert-action"
      className={cn('col-span-full mt-2 group-has-[>svg]/alert:col-start-2', className)}
      {...props}
    />
  )
}

export { Alert, AlertAction, AlertDescription, AlertTitle }
