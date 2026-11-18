'use client'

import { Menu as MenuPrimitive } from '@base-ui/react/menu'
import { cn } from '@/lib/utils'
import { FLOATING_SURFACE } from './floating-surface'

function Menu({ ...props }: Readonly<MenuPrimitive.Root.Props>) {
  return <MenuPrimitive.Root data-slot="menu" {...props} />
}

function MenuTrigger({ ...props }: Readonly<MenuPrimitive.Trigger.Props>) {
  return <MenuPrimitive.Trigger data-slot="menu-trigger" {...props} />
}

function MenuContent({
  className,
  align = 'end',
  sideOffset = 4,
  children,
  ...props
}: Readonly<
  MenuPrimitive.Popup.Props & Pick<MenuPrimitive.Positioner.Props, 'align' | 'sideOffset'>
>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner align={align} sideOffset={sideOffset} className="z-dropdown">
        <MenuPrimitive.Popup
          data-slot="menu-content"
          className={cn(
            FLOATING_SURFACE,
            'min-w-menu-min rounded-control p-1 text-body outline-none duration-fast data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
            className,
          )}
          {...props}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

function MenuItem({
  className,
  tone = 'default',
  ...props
}: Readonly<MenuPrimitive.Item.Props & { tone?: 'default' | 'danger' }>) {
  return (
    <MenuPrimitive.Item
      data-slot="menu-item"
      className={cn(
        'flex min-h-control cursor-default items-center gap-2 rounded-control px-2 outline-none select-none data-highlighted:bg-accent data-disabled:opacity-disabled',
        tone === 'danger' && 'text-danger',
        className,
      )}
      {...props}
    />
  )
}

function MenuSeparator({ className, ...props }: Readonly<MenuPrimitive.Separator.Props>) {
  return (
    <MenuPrimitive.Separator
      data-slot="menu-separator"
      className={cn('my-1 h-px bg-border', className)}
      {...props}
    />
  )
}

export { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger }
