import type * as React from 'react'

import { cn } from '@/lib/utils'
import { isEmptyNode } from '@/lib/utils/is-empty-node'

type EyebrowProps = Readonly<{
  className?: string
  children: React.ReactNode
}>

function Eyebrow({ className, children }: Readonly<EyebrowProps>) {
  return <p className={cn('text-overline text-muted-foreground', className)}>{children}</p>
}

type HeadingProps = Readonly<{
  level: 1 | 2 | 3
  className?: string
  id?: string
  'aria-label'?: string
  children: React.ReactNode
}>

function Heading({
  level,
  className,
  id,
  'aria-label': ariaLabel,
  children,
}: Readonly<HeadingProps>) {
  if (level === 1) {
    return (
      // biome-ignore lint/correctness/noRestrictedElements: Heading primitive
      <h1 id={id} aria-label={ariaLabel} className={cn('text-title', className)}>
        {children}
      </h1>
    )
  }
  if (level === 2) {
    return (
      // biome-ignore lint/correctness/noRestrictedElements: Heading primitive
      <h2 id={id} aria-label={ariaLabel} className={cn('text-heading', className)}>
        {children}
      </h2>
    )
  }
  return (
    // biome-ignore lint/correctness/noRestrictedElements: Heading primitive
    <h3 id={id} aria-label={ariaLabel} className={cn('text-label-strong', className)}>
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

function PageHeader({ title, description, actions, className }: Readonly<PageHeaderProps>) {
  return (
    <div
      className={cn(
        'flex flex-col gap-stack sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <Heading level={1}>{title}</Heading>
        {isEmptyNode(description) ? null : (
          <p className="text-body text-muted-foreground">{description}</p>
        )}
      </div>
      {isEmptyNode(actions) ? null : (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  )
}

export { Eyebrow, Heading, PageHeader }
