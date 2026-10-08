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
import { useDiscoveryExit } from '../_hooks/use-discovery-exit'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Stay / Leave confirm for Discovery, opened by Back/Forward and by the header Exit button. */
export function DiscoveryLeaveDialog({ open, onOpenChange }: Readonly<Props>) {
  const exit = useDiscoveryExit()
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave discovery?</AlertDialogTitle>
          <AlertDialogDescription>
            Nothing is scored. You'll return to quiz setup.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Stay</AlertDialogCancel>
          <AlertDialogAction onClick={exit}>Leave</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
