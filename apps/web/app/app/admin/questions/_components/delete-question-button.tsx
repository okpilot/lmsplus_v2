'use client'

import { Trash2 } from 'lucide-react'
import { useTransition } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { softDeleteQuestion } from '../actions/soft-delete-question'

type Props = {
  id: string
  label: string
}

export function DeleteQuestionButton({ id, label }: Readonly<Props>) {
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      try {
        const result = await softDeleteQuestion({ id })
        if (result.success) {
          toast.success(`Deleted "${label}"`)
        } else {
          toast.error(result.error)
        }
      } catch {
        toast.error('Service error. Please try again.')
      }
    })
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button variant="ghost" size="icon-xs" disabled={isPending} title="Delete question" />
        }
      >
        <Trash2 className="size-3.5 text-muted-foreground" />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete question?</AlertDialogTitle>
          <AlertDialogDescription>
            This will soft-delete &ldquo;{label}&rdquo;. The question will no longer appear in
            quizzes.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={isPending}>
            {isPending ? 'Deleting\u2026' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
