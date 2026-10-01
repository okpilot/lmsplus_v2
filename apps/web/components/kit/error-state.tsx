import { CircleX } from 'lucide-react'
import type * as React from 'react'

type ErrorStateProps = {
  title?: string
  children?: React.ReactNode
  action?: React.ReactNode
}

export function ErrorState({
  title = 'Something went wrong',
  children,
  action,
}: Readonly<ErrorStateProps>) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 py-12 text-center">
      <CircleX aria-hidden="true" className="size-12 text-bad" />
      <p className="text-base font-medium">{title}</p>
      {children ? <div className="max-w-sm text-sm text-muted-foreground">{children}</div> : null}
      {action}
    </div>
  )
}
