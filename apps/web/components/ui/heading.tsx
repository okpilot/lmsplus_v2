import type * as React from 'react'

import { cn } from '@/lib/utils'
import { isEmptyNode } from '@/lib/utils/is-empty-node'

type EyebrowProps = Readonly<{
  className?: string
  children: React.ReactNode
}>

function Eyebrow({ className, children }: EyebrowProps) {
  return (
    <p className={cn('text-overline uppercase text-muted-foreground', className)}>{children}</p>
  )
}

type HeadingProps = Readonly<{
  level: 2 | 3
  className?: string
  id?: string
  children: React.ReactNode
}>

function Heading({ level, className, id, children }: HeadingProps) {
  if (level === 2) {
    return (
      <h2 id={id} className={cn('text-heading font-semibold', className)}>
        {children}
      </h2>
    )
  }
  return (
    <h3 id={id} className={cn('text-label font-semibold', className)}>
      {children}
    </h3>
  )
}

type PageHeaderProps = Readonly<{
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}>

function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-stack sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-title font-semibold tracking-tight">{title}</h1>
        {isEmptyNode(description) ? null : (
          <p className="text-body text-muted-foreground">{description}</p>
        )}
      </div>
      {isEmptyNode(actions) ? null : (
        <div className="flex shrink-0 items-center gap-inline">{actions}</div>
      )}
    </div>
  )
}

export { Eyebrow, Heading, PageHeader }
