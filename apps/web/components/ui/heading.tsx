import type * as React from 'react'

import { cn } from '@/lib/utils'

type EyebrowProps = Readonly<{
  as?: 'p' | 'span' | 'h2' | 'h3'
  className?: string
  children: React.ReactNode
}>

function Eyebrow({ as: Tag = 'p', className, children }: EyebrowProps) {
  return (
    <Tag className={cn('text-overline uppercase text-muted-foreground', className)}>{children}</Tag>
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
  eyebrow?: React.ReactNode
}>

function PageHeader({ title, description, actions, eyebrow }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-stack sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-1">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h1 className="text-title font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-body text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-inline">{actions}</div> : null}
    </div>
  )
}

export { Eyebrow, Heading, PageHeader }
