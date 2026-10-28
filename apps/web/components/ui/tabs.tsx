'use client'

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs'
import type * as React from 'react'
import { cn } from '@/lib/utils'

function Tabs({ className, ...props }: Readonly<TabsPrimitive.Root.Props>) {
  return <TabsPrimitive.Root data-slot="tabs" className={className} {...props} />
}

function TabsList({ className, ...props }: Readonly<TabsPrimitive.List.Props>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      activateOnFocus
      className={cn('inline-flex items-center gap-1 rounded-control bg-muted p-1', className)}
      {...props}
    />
  )
}

function TabsTab({ className, ...props }: Readonly<TabsPrimitive.Tab.Props>) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-tab"
      className={cn(
        'group inline-flex h-(--control-h) items-center gap-1.5 rounded-[calc(var(--radius-control)-2px)] border border-transparent px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring data-active:border-primary data-active:bg-card data-active:text-primary-text',
        className,
      )}
      {...props}
    />
  )
}

function TabsPanel({ className, ...props }: Readonly<TabsPrimitive.Panel.Props>) {
  return <TabsPrimitive.Panel data-slot="tabs-panel" className={className} {...props} />
}

function TabCount({ className, ...props }: Readonly<React.ComponentProps<'span'>>) {
  return (
    <span
      data-slot="tab-count"
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted-foreground/15 px-1 text-caption font-medium text-muted-foreground tabular-nums group-data-active:bg-info-soft group-data-active:text-primary-text',
        className,
      )}
      {...props}
    />
  )
}

export { TabCount, Tabs, TabsList, TabsPanel, TabsTab }
