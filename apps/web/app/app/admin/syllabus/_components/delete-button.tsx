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
import { deleteItem } from '../actions/delete-item'

type DeleteButtonProps = {
  id: string
  table: 'easa_subjects' | 'easa_topics' | 'easa_subtopics'
  label: string
  questionCount: number
}

export function DeleteButton({ id, table, label, questionCount }: DeleteButtonProps) {
  const [isPending, startTransition] = useTransition()
  const hasQuestions = questionCount > 0

  function handleDelete() {
    startTransition(async () => {
      try {
        const result = await deleteItem({ id, table })
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
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={hasQuestions || isPending}
            title={hasQuestions ? `${questionCount} questions reference this item` : 'Delete'}
          />
        }
      >
        <Trash2 className="size-3.5 text-muted-foreground" />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete this item from the syllabus.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={isPending}>
            {isPending ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
