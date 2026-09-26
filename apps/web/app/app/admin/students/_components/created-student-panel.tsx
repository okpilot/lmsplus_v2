'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { LoadingButton } from '@/components/ui/loading-button'
import { useSendLoginInstructions } from '../_hooks/use-send-login-instructions'
import { loginInstructionsConfirmText } from '../_utils/login-instructions-state'

type Props = {
  studentId: string
  email: string
  fullName: string
  onClose: () => void
}

export function CreatedStudentPanel({ studentId, email, fullName, onClose }: Readonly<Props>) {
  const [confirming, setConfirming] = useState(false)
  const [sent, setSent] = useState(false)
  const { isSending, handleSend } = useSendLoginInstructions({
    studentId,
    email,
    onSent: () => setSent(true),
    onSettled: () => setConfirming(false),
  })
  const name = fullName || email

  return (
    <div className="space-y-4 py-2">
      <p className="text-sm">Student created.</p>

      {confirming ? (
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            {loginInstructionsConfirmText(sent ? 'waiting' : 'not_sent', name)}
          </p>
          <div className="flex items-center gap-2">
            <LoadingButton size="sm" loading={isSending} onClick={handleSend}>
              Confirm
            </LoadingButton>
            <Button
              size="sm"
              variant="outline"
              disabled={isSending}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
          Send login instructions
        </Button>
      )}

      <div className="flex justify-end">
        <Button variant="outline" disabled={isSending} onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  )
}
