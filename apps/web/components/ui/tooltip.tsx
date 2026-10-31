'use client'

import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip'
import { cn } from '@/lib/utils'
import { FLOATING_SURFACE } from './floating-surface'

function TooltipProvider({ delay = 600, ...props }: Readonly<TooltipPrimitive.Provider.Props>) {
  return <TooltipPrimitive.Provider delay={delay} {...props} />
}

function Tooltip({ ...props }: Readonly<TooltipPrimitive.Root.Props>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({ ...props }: Readonly<TooltipPrimitive.Trigger.Props>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  side = 'top',
  align = 'center',
  sideOffset = 6,
  children,
  ...props
}: Readonly<
  TooltipPrimitive.Popup.Props &
    Pick<TooltipPrimitive.Positioner.Props, 'side' | 'align' | 'sideOffset'>
>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        className="z-dropdown"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            FLOATING_SURFACE,
            'rounded-control px-2 py-1 text-caption outline-none duration-fast data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
            className,
          )}
          {...props}
        >
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
