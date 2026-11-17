'use client'

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs'
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
        'group inline-flex h-(--control-h) items-center gap-1.5 rounded-inner border border-transparent px-3 text-label whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-solid focus-visible:outline-focus focus-visible:outline-offset-focus focus-visible:outline-ring data-active:border-primary data-active:bg-card data-active:text-primary-text',
        className,
      )}
      {...props}
    />
  )
}

function TabsPanel({ className, ...props }: Readonly<TabsPrimitive.Panel.Props>) {
  return <TabsPrimitive.Panel data-slot="tabs-panel" className={className} {...props} />
}

export { Tabs, TabsList, TabsPanel, TabsTab }
