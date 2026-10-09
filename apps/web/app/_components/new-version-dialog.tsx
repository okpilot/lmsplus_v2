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

type Props = {
  open: boolean
  onReload: () => void
  onLater: () => void
}

export function NewVersionDialog({ open, onReload, onLater }: Readonly<Props>) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onLater()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>A new version is available</AlertDialogTitle>
          <AlertDialogDescription>
            We've made some improvements to the app. Reload the page to get the new version.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Later</AlertDialogCancel>
          <AlertDialogAction onClick={onReload}>Reload now</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
