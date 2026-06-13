'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { getCorrectOption } from '../actions/get-correct-option'
import type { CorrectOptionId } from './build-initial-form-state'

function toCorrectOptionId(value: string | null): CorrectOptionId {
  return value === 'a' || value === 'b' || value === 'c' || value === 'd' ? value : ''
}

type Args = {
  questionId: string | undefined
  isEdit: boolean
  /**
   * Seeds the form's correct-answer radio before the dialog opens. Read at
   * callback time (not render) so the form-state hook — which itself reads this
   * hook's `open` — can supply it without a render-order cycle.
   */
  getSetCorrectOptionId: () => (value: CorrectOptionId) => void
}

/**
 * Manages the edit dialog's open state plus the on-demand fetch of the
 * REVOKE-gated MC answer key (#823). The key is absent from the list query, so
 * it is fetched in the open transition (trigger click) — NOT useEffect — and
 * seeded BEFORE opening so the radio renders already-selected (no unselected
 * flash). New questions open instantly with no fetch.
 */
export function useCorrectOptionLoader({ questionId, isEdit, getSetCorrectOptionId }: Args) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleOpenChange(next: boolean) {
    if (isPending) return
    if (!next) {
      setOpen(false)
      return
    }
    if (!isEdit || !questionId) {
      setOpen(true)
      return
    }
    startTransition(async () => {
      const setCorrectOptionId = getSetCorrectOptionId()
      try {
        const { correctOptionId } = await getCorrectOption(questionId)
        setCorrectOptionId(toCorrectOptionId(correctOptionId))
      } catch (err) {
        // A network/infra failure reaching the Server Action can reject. Open the
        // dialog anyway (degraded) so editing isn't blocked — the admin re-selects
        // the correct answer, which the Zod schema requires before save.
        console.error('[QuestionFormDialog] getCorrectOption failed:', err)
        toast.error('Could not load the saved correct answer — please re-select it.')
        setCorrectOptionId('')
      }
      setOpen(true)
    })
  }

  return { open, setOpen, isPending, startTransition, handleOpenChange }
}
