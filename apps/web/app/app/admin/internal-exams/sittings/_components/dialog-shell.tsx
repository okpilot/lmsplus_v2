'use client'

import type { ReactNode } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useSittingUi } from '../_hooks/sitting-ui-context'

type Props = { children: ReactNode; className?: string }

/** URL-driven popup: the parent mounts it while `?dlg=` names it; dismissing goes through `close`. */
export function DialogShell({ children, className }: Readonly<Props>) {
  const { close, locked, openerRef } = useSittingUi()
  return (
    <Dialog
      open
      disablePointerDismissal={locked}
      onOpenChange={(next) => {
        if (!next && !locked) close()
      }}
    >
      <DialogContent
        finalFocus={openerRef}
        className={cn(
          'flex max-h-(--dialog-max-h) flex-col gap-0 overflow-hidden p-0 sm:max-w-dialog-wide',
          className,
        )}
        showCloseButton={!locked}
      >
        {children}
      </DialogContent>
    </Dialog>
  )
}
