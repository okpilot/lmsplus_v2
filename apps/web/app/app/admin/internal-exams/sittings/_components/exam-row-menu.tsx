'use client'

import Link from 'next/link'
import { useState } from 'react'
import { RowMenu } from '@/components/admin/row-menu'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { MenuItem, MenuSeparator } from '@/components/ui/menu'
import { type NextStep, nextStep } from '../_utils/next-step'
import { LIVE_ENTRY_STATUSES, type RosterEntry } from '../types'
import { useExamActions } from './use-exam-actions'
import { VoidCodeDialog } from './void-code-dialog'

type Props = {
  sittingId: string
  personName: string
  deactivated: boolean
  entry: RosterEntry
  editable: boolean
}

/** An exam with an attempt, or whose attempt was discarded, stays in the sitting. */
const KEEPS_RECORD: ReadonlySet<string> = new Set([
  'running',
  'finished',
  'voided_attempt',
  'absent',
  'discarded',
])

type Confirm = 'remove' | 'void' | null

function StepItem({
  step,
  busy,
  onIssue,
}: Readonly<{ step: NextStep; busy: boolean; onIssue: () => void }>) {
  if (step.kind === 'view') {
    return <MenuItem render={<Link href={step.href} prefetch={false} />}>{step.label}</MenuItem>
  }
  return (
    <MenuItem disabled={busy} onClick={onIssue}>
      {step.label}
    </MenuItem>
  )
}

/** Exam ⋯: next step, then Void code and Remove exam. Items that do not apply are hidden. */
export function ExamRowMenu({
  sittingId,
  personName,
  deactivated,
  entry,
  editable,
}: Readonly<Props>) {
  const [confirm, setConfirm] = useState<Confirm>(null)
  const who = `${entry.subjectShort}, ${personName}`
  const a = useExamActions({ sittingId, entry, personName, who, onDone: () => setConfirm(null) })
  const live = LIVE_ENTRY_STATUSES.has(entry.status)
  const codeId = editable && live ? entry.codeId : null
  const canRemove = editable && !KEEPS_RECORD.has(entry.status)
  const step = nextStep(entry, { editable, deactivated })
  if (!step && !codeId && !canRemove) return null
  const dismiss = () => {
    setConfirm(null)
    a.clearError()
  }
  return (
    <>
      <RowMenu label={`Actions for ${who}`}>
        {step && <StepItem step={step} busy={a.pending} onIssue={a.issue} />}
        {step && (codeId || canRemove) && <MenuSeparator />}
        {codeId && (
          <MenuItem tone="danger" onClick={() => setConfirm('void')}>
            Void code
          </MenuItem>
        )}
        {canRemove && (
          <MenuItem tone="danger" onClick={() => setConfirm('remove')}>
            Remove exam
          </MenuItem>
        )}
      </RowMenu>
      {codeId && (
        <VoidCodeDialog
          open={confirm === 'void'}
          onOpenChange={(o) => (o ? setConfirm('void') : dismiss())}
          title={`Void code for ${who}?`}
          emailed={entry.codeEmailedAt !== null}
          pending={a.pending}
          error={a.error}
          onConfirm={(reason) => a.voidCode(codeId, reason)}
        />
      )}
      {canRemove && (
        <ConfirmDialog
          open={confirm === 'remove'}
          onOpenChange={(o) => (o ? setConfirm('remove') : dismiss())}
          title={`Remove ${entry.subjectName || entry.subjectShort} for ${personName}?`}
          description="Its unused code is voided."
          confirmLabel="Remove exam"
          pending={a.pending}
          error={a.error}
          onConfirm={a.remove}
        />
      )}
    </>
  )
}
