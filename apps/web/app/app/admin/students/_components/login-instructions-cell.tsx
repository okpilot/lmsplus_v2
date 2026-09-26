'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { useSendLoginInstructions } from '../_hooks/use-send-login-instructions'
import {
  computeLoginInstructionsState,
  formatLastSent,
  loginInstructionsConfirmText,
  loginInstructionsStateLabel,
} from '../_utils/login-instructions-state'
import type { StudentRow } from '../types'

type Props = { student: StudentRow }

export function LoginInstructionsCell({ student }: Readonly<Props>) {
  const [confirming, setConfirming] = useState(false)
  const state = computeLoginInstructionsState({
    sentAt: student.login_instructions_sent_at,
    expiresAt: student.temp_password_expires_at,
  })
  const { isSending, handleSend } = useSendLoginInstructions({
    studentId: student.id,
    email: student.email,
    onSettled: () => setConfirming(false),
  })
  const name = student.full_name ?? student.email
  const isDeactivated = student.deleted_at !== null

  if (confirming) {
    return (
      <div className="max-w-[220px] space-y-1.5 text-xs">
        <p className="text-muted-foreground">{loginInstructionsConfirmText(state, name)}</p>
        <div className="flex items-center gap-1">
          <LoadingButton size="xs" loading={isSending} onClick={handleSend}>
            Confirm
          </LoadingButton>
          <Button
            size="xs"
            variant="outline"
            disabled={isSending}
            onClick={() => setConfirming(false)}
          >
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-1 text-xs">
      <p className="text-muted-foreground">
        {loginInstructionsStateLabel(state, student.temp_password_expires_at)}
      </p>
      {student.login_instructions_sent_at && (
        <p className="text-muted-foreground">
          Sent {formatLastSent(student.login_instructions_sent_at)}
        </p>
      )}
      {!isDeactivated && (
        <Button size="xs" variant="outline" onClick={() => setConfirming(true)}>
          {state === 'not_sent' ? 'Send' : 'Resend'}
        </Button>
      )}
    </div>
  )
}
