import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'

import { cn } from '@/lib/utils'

const alertVariants = cva(
  'group/alert relative grid w-full gap-x-inline gap-y-1 text-left text-foreground has-[>svg]:grid-cols-[auto_1fr] *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg:not([class*=size-])]:size-4 sm:has-data-[slot=alert-action]:grid-cols-[1fr_auto] sm:has-data-[slot=alert-action]:has-[>svg]:grid-cols-[auto_1fr_auto]',
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

function Alert({
  className,
  tone,
  size,
  ...props
}: Readonly<React.ComponentProps<'div'> & VariantProps<typeof alertVariants>>) {
  return (
    <div data-slot="alert" className={cn(alertVariants({ tone, size }), className)} {...props} />
  )
}

function AlertTitle({ className, ...props }: Readonly<React.ComponentProps<'div'>>) {
  return (
    <div
      data-slot="alert-title"
      className={cn('text-label font-semibold group-has-[>svg]/alert:col-start-2', className)}
      {...props}
    />
  )
}

function AlertDescription({ className, ...props }: Readonly<React.ComponentProps<'div'>>) {
  return (
    <div
      data-slot="alert-description"
      className={cn('text-body group-has-[>svg]/alert:col-start-2', className)}
      {...props}
    />
  )
}

function AlertAction({ className, ...props }: Readonly<React.ComponentProps<'div'>>) {
  return (
    <div
      data-slot="alert-action"
      className={cn(
        'col-span-full mt-1 sm:col-span-1 sm:col-start-auto sm:row-span-2 sm:row-start-1 sm:mt-0 sm:self-center sm:justify-self-end',
        className,
      )}
      {...props}
    />
  )
}

export { Alert, AlertAction, AlertDescription, AlertTitle, alertVariants }
