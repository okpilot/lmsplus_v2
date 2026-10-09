'use client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { BusyLabel } from '@/components/ui/busy-label'
import { useDiscoveryExit } from '../_hooks/use-discovery-exit'

type Props = {
  open: boolean
  onOpenChange: (open: boolean, details?: unknown) => void
}

/** Stay / Leave confirm for Discovery, opened by Back/Forward and by the header Exit button. */
export function DiscoveryLeaveDialog({ open, onOpenChange }: Readonly<Props>) {
  const { exit, leaving } = useDiscoveryExit()
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next, details) => {
        // Keep the dialog open while the exit is in flight so Stay/Escape can't dismiss it.
        if (leaving) return
        onOpenChange(next, details)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave discovery?</AlertDialogTitle>
          <AlertDialogDescription>
            Nothing is scored. You'll return to quiz setup.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={leaving}>Stay</AlertDialogCancel>
          <AlertDialogAction disabled={leaving} onClick={exit}>
            <BusyLabel busy={leaving}>Leave</BusyLabel>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
