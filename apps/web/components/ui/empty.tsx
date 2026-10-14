import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'

import { cn } from '@/lib/utils'

function Empty({ className, ...props }: Readonly<React.ComponentProps<'div'>>) {
  return (
    <div
      data-slot="empty"
      className={cn(
        'flex flex-col items-center gap-stack rounded-card bg-card p-section text-center',
        className,
      )}
      {...props}
    />
  )
}

function EmptyHeader({ className, ...props }: Readonly<React.ComponentProps<'div'>>) {
  return (
    <div
      data-slot="empty-header"
      className={cn('flex flex-col items-center gap-1', className)}
      {...props}
    />
  )
}

const emptyMediaVariants = cva('flex shrink-0 items-center justify-center', {
  variants: {
    variant: {
      default: '',
      icon: 'size-12 rounded-full bg-muted text-muted-foreground [&_svg]:size-6',
    },
  },
  defaultVariants: { variant: 'default' },
})

function EmptyMedia({
  className,
  variant,
  ...props
}: Readonly<React.ComponentProps<'div'> & VariantProps<typeof emptyMediaVariants>>) {
  return (
    <div
      data-slot="empty-media"
      className={cn(emptyMediaVariants({ variant }), className)}
      {...props}
    />
  )
}

type EmptyTitleProps = Readonly<
  Omit<React.ComponentProps<'div'>, 'ref'> & { as?: 'div' | 'h1' | 'h2' | 'h3' | 'p' }
>

function EmptyTitle({ as: Tag = 'div', className, ...props }: EmptyTitleProps) {
  return (
    <Tag
      data-slot="empty-title"
      className={cn('text-heading font-semibold', className)}
      {...props}
    />
  )
}

function EmptyDescription({ className, ...props }: Readonly<React.ComponentProps<'div'>>) {
  return (
    <div
      data-slot="empty-description"
      className={cn('text-body text-muted-foreground', className)}
      {...props}
    />
  )
}

function EmptyContent({ className, ...props }: Readonly<React.ComponentProps<'div'>>) {
  return (
    <div
      data-slot="empty-content"
      className={cn('flex flex-col items-center gap-stack', className)}
      {...props}
    />
  )
}

type EmptyNoteProps = Readonly<{
  children: React.ReactNode
  /** `inline` is bare muted text for a note inside another surface; `card` is its own surface. */
  variant?: 'card' | 'inline'
  className?: string
}>

function EmptyNote({ children, variant = 'card', className }: EmptyNoteProps) {
  if (variant === 'inline') {
    return (
      <p data-slot="empty-note" className={cn('text-body text-muted-foreground', className)}>
        {children}
      </p>
    )
  }
  return (
    <Empty className={className}>
      <EmptyDescription>{children}</EmptyDescription>
    </Empty>
  )
}

export { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyNote, EmptyTitle }
