'use client'

import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useSittingUi } from '../_hooks/sitting-ui-context'
import {
  CANCEL_CONFIRM_TEXT,
  cancelledBanner,
  closeConfirmText,
  START_CONFIRM_TEXT,
} from '../_utils/copy'
import { plural } from '../_utils/plural'
import { noCodeLine, startResultBanner } from '../_utils/start-result'
import { cancelSitting } from '../actions/cancel-sitting'
import { closeSitting } from '../actions/close-sitting'
import { startSitting } from '../actions/start-sitting'
import type { SittingRow, SittingSummary } from '../types'
import { useSittingAction } from './use-sitting-action'

export type Confirm = 'start' | 'close' | 'cancel' | null

type Props = {
  sitting: SittingRow
  summary: SittingSummary
  confirm: Confirm
  setConfirm: (c: Confirm) => void
  /** Opens the Issue popup; the Start confirm stays selected but hidden until the popup closes. */
  onIssueNow: () => void
}

export function LifecycleConfirms(props: Readonly<Props>) {
  return (
    <>
      <StartConfirm {...props} />
      <CloseConfirm {...props} />
      <CancelConfirm {...props} />
    </>
  )
}

function useConfirm(which: Exclude<Confirm, null>, { setConfirm }: Props) {
  const action = useSittingAction()
  const dismiss = () => {
    setConfirm(null)
    action.clearError()
  }
  const onOpenChange = (o: boolean) => (o ? setConfirm(which) : dismiss())
  return { ...action, dismiss, onOpenChange }
}

function StartConfirm(props: Readonly<Props>) {
  const { sitting, summary, confirm } = props
  const { pending, error, run, dismiss, onOpenChange } = useConfirm('start', props)
  const { dlg, isRefreshing } = useSittingUi()
  return (
    <ConfirmDialog
      open={confirm === 'start' && dlg !== 'issue'}
      onOpenChange={onOpenChange}
      title="Start sitting?"
      description={
        <>
          {START_CONFIRM_TEXT}
          {summary.entriesWithoutCode > 0 && (
            <strong className="mt-2 block">{noCodeLine(summary.entriesWithoutCode)}</strong>
          )}
          {summary.entriesIssuable > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              disabled={isRefreshing || pending}
              onClick={props.onIssueNow}
            >
              Issue now
            </Button>
          )}
          {!sitting.invigilatorActive && (
            <strong className="mt-2 block">
              The assigned invigilator {sitting.invigilatorName} is no longer an active admin or
              instructor.
            </strong>
          )}
        </>
      }
      confirmLabel="Start sitting"
      tone="default"
      pending={pending}
      error={error}
      onConfirm={() =>
        run(
          () => startSitting({ sittingId: sitting.id }),
          (d) => {
            dismiss()
            return startResultBanner(d, sitting.invigilatorName)
          },
        )
      }
    />
  )
}

function CloseConfirm(props: Readonly<Props>) {
  const { sitting, summary, confirm } = props
  const { pending, error, run, dismiss, onOpenChange } = useConfirm('close', props)
  return (
    <ConfirmDialog
      open={confirm === 'close'}
      onOpenChange={onOpenChange}
      title="Close sitting?"
      description={closeConfirmText(summary)}
      confirmLabel="Close sitting"
      cancelLabel="Keep open"
      pending={pending}
      error={error}
      onConfirm={() =>
        run(
          () => closeSitting({ sittingId: sitting.id }),
          (d) => {
            dismiss()
            return {
              tone: 'success',
              title: 'Sitting closed.',
              detail: `${plural(d.codesVoided, 'code')} voided, ${d.attemptsRunning} running, ${d.absentCount} absent.`,
            }
          },
        )
      }
    />
  )
}

function CancelConfirm(props: Readonly<Props>) {
  const { sitting, confirm } = props
  const { pending, error, run, dismiss, onOpenChange } = useConfirm('cancel', props)
  return (
    <ConfirmDialog
      open={confirm === 'cancel'}
      onOpenChange={onOpenChange}
      title="Cancel sitting?"
      description={CANCEL_CONFIRM_TEXT}
      confirmLabel="Cancel sitting"
      cancelLabel="Keep sitting"
      pending={pending}
      error={error}
      onConfirm={() =>
        run(
          () => cancelSitting({ sittingId: sitting.id }),
          (d) => {
            dismiss()
            return cancelledBanner(d.codesVoided, d.notices)
          },
        )
      }
    />
  )
}
