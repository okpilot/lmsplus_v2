import type { ReactNode } from 'react'
import { DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/** Header clear of the absolute close button. */
export function PopupHeader({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <DialogHeader className="px-dialog-pad pt-dialog-pad pr-field-end pb-stack">
      {children}
    </DialogHeader>
  )
}

/** The only scroller of a popup: header and footer stay on screen. */
export function PopupBody({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <div
      className={cn(
        'min-h-0 flex-1 space-y-stack overflow-x-hidden overflow-y-auto px-dialog-pad pb-stack',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function PopupFooter({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  return <DialogFooter className={cn('mx-0 mb-0', className)}>{children}</DialogFooter>
}
