'use client'

import type * as React from 'react'

import { Button } from '@/components/ui/button'
import { OrbLoader } from './orb-loader'

type PendingButtonProps = React.ComponentProps<typeof Button> & {
  pending: boolean
  pendingLabel: string
}

export function PendingButton({
  pending,
  pendingLabel,
  children,
  variant,
  className,
  ...buttonProps
}: Readonly<PendingButtonProps>) {
  if (!pending) {
    return (
      <Button variant={variant} className={className} {...buttonProps}>
        {children}
      </Button>
    )
  }
  return (
    <Button
      {...buttonProps}
      variant="outline"
      disabled
      focusableWhenDisabled
      aria-busy="true"
      className={className}
    >
      <span aria-hidden="true" className="inline-flex">
        <OrbLoader size={20} label={pendingLabel} state="solving" />
      </span>
      <span>{pendingLabel}</span>
    </Button>
  )
}
