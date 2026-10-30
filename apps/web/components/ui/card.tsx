import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import type * as React from 'react'

import { cn } from '@/lib/utils'

function Card({
  className,
  size = 'default',
  ...props
}: Readonly<React.ComponentProps<'div'> & { size?: 'default' | 'sm' }>) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        'group/card flex flex-col gap-4 overflow-visible rounded-card bg-card py-card text-body text-card-foreground ring-1 ring-border has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:gap-3 data-[size=sm]:py-3 data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-card *:[img:last-child]:rounded-b-card',
        className,
      )}
      {...props}
    />
  )
}

function CardList({
  className,
  ...props
}: Readonly<Omit<React.ComponentProps<typeof Card>, 'size'>>) {
  return (
    <Card
      {...props}
      data-slot="card-list"
      className={cn('gap-0 overflow-hidden py-0 divide-y divide-border', className)}
    />
  )
}

/** A row of a `CardList`; only direct children of one. */
function CardListRow({ className, render, ...props }: Readonly<useRender.ComponentProps<'div'>>) {
  return useRender({
    defaultTagName: 'div',
    props: mergeProps<'div'>({ className: cn('px-card py-row', className) }, props),
    render,
    state: { slot: 'card-list-row' },
  })
}

function CardHeader({ className, ...props }: Readonly<React.ComponentProps<'div'>>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        'group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-card px-card group-data-[size=sm]/card:px-3 has-data-[slot=card-action]:grid-cols-(--layout-cols-fill-auto) has-data-[slot=card-description]:grid-rows-(--layout-rows-pair) [.border-b]:pb-card group-data-[size=sm]/card:[.border-b]:pb-3',
        className,
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: Readonly<React.ComponentProps<'div'>>) {
  return (
    <div
      data-slot="card-title"
      className={cn('text-label leading-snug font-semibold', className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: Readonly<React.ComponentProps<'div'>>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-caption text-muted-foreground', className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: Readonly<React.ComponentProps<'div'>>) {
  return (
    <div
      data-slot="card-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: Readonly<React.ComponentProps<'div'>>) {
  return (
    <div
      data-slot="card-content"
      className={cn('px-card group-data-[size=sm]/card:px-3', className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: Readonly<React.ComponentProps<'div'>>) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        'flex items-center rounded-b-card border-t bg-muted p-card group-data-[size=sm]/card:p-3',
        className,
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardList,
  CardListRow,
  CardTitle,
}
