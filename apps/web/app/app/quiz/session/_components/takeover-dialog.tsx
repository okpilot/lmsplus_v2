'use client'

import { useRouter } from 'next/navigation'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useTakenOver } from '../_hooks/use-taken-over'
import { backToQuizzes, continueHere } from '../_utils/takeover-actions'

/** Blocks the quiz once another tab or device has taken this session over. */
export function TakeoverDialog({ sessionId }: Readonly<{ sessionId: string }>) {
  const router = useRouter()
  const takenOver = useTakenOver(sessionId)
  return (
    // Not dismissable: open is derived from the store; onOpenChange is deliberately ignored.
    <AlertDialog open={takenOver}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>This quiz was opened in another tab or device</AlertDialogTitle>
          <AlertDialogDescription>
            Continue here to take it back, or go back to your quizzes.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => backToQuizzes(sessionId, router.replace)}>
            Back to quizzes
          </Button>
          <Button autoFocus onClick={continueHere}>
            Continue here
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}
