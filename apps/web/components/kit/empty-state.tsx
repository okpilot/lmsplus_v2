import type * as React from 'react'

type EmptyStateProps = {
  icon?: React.ReactNode
  title: string
  children?: React.ReactNode
  action?: React.ReactNode
}

export function EmptyState({ icon, title, children, action }: Readonly<EmptyStateProps>) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      {icon ? (
        <div
          aria-hidden="true"
          className="grid size-12 place-items-center rounded-full bg-foreground/[0.05] text-muted-foreground"
        >
          {icon}
        </div>
      ) : null}
      <p className="text-base font-medium">{title}</p>
      {children ? <div className="max-w-sm text-sm text-muted-foreground">{children}</div> : null}
      {action}
    </div>
  )
}
