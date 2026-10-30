'use client'

import { Popover as PopoverPrimitive } from '@base-ui/react/popover'
import { cn } from '@/lib/utils'

function Popover({ ...props }: Readonly<PopoverPrimitive.Root.Props>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({ ...props }: Readonly<PopoverPrimitive.Trigger.Props>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  side = 'bottom',
  align = 'center',
  sideOffset = 8,
  children,
  ...props
}: Readonly<
  PopoverPrimitive.Popup.Props &
    Pick<PopoverPrimitive.Positioner.Props, 'side' | 'align' | 'sideOffset'>
>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        className="z-dropdown"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            'w-60 rounded-control bg-popover p-3 text-caption text-popover-foreground ring-1 ring-border shadow-raised outline-none duration-fast data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
            className,
          )}
          {...props}
        >
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverContent, PopoverTrigger }
