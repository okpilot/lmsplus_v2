'use client'

import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useSittingUi } from '../_hooks/sitting-ui-context'
import { plural } from '../_utils/plural'
import { removeCandidates } from '../actions/remove-candidates'
import { useSittingAction } from './use-sitting-action'

type Props = {
  sittingId: string
  /** People to remove; null closes the dialog. */
  userIds: readonly string[] | null
  onClose: () => void
}

export function RemovePeopleDialog({ sittingId, userIds, onClose }: Readonly<Props>) {
  const { clearRoster } = useSittingUi()
  const { pending, error, run, clearError } = useSittingAction()
  return (
    <ConfirmDialog
      open={userIds !== null}
      onOpenChange={(o) => {
        if (o) return
        clearError()
        onClose()
      }}
      title={`Remove ${plural(userIds?.length ?? 0, 'person', 'people')}?`}
      description="Their exams are removed and unused codes voided. Anyone who has taken an exam cannot be removed."
      confirmLabel="Remove"
      pending={pending}
      error={error}
      onConfirm={() =>
        run(
          () => removeCandidates({ sittingId, userIds: userIds ?? [] }),
          (d) => {
            onClose()
            clearRoster()
            return {
              tone: 'success',
              title: `Removed ${d.removed}.`,
              detail: `${plural(d.entriesRemoved, 'exam')} removed, ${plural(d.codesVoided, 'code')} voided.`,
            }
          },
        )
      }
    />
  )
}
