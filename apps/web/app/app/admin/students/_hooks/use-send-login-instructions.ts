import { useRef, useTransition } from 'react'
import { toast } from 'sonner'
import { sendLoginInstructions } from '../actions/send-login-instructions'

type UseSendLoginInstructionsOpts = {
  studentId: string
  email: string
  /** Called after a successful send. */
  onSent?: () => void
  /** Called once the send settles, success or failure. */
  onSettled?: () => void
}

/**
 * Drives the Send/Resend login-instructions action from a confirmed click.
 * `inFlight` is a synchronous one-shot lock (code-style §6): `isSending` is
 * async `useTransition` state, so two clicks in the same tick (a fast
 * double-click before React commits) would both pass an `isSending` check.
 * The lock is cleared once the transition settles either way — unlike a
 * terminal navigation, Resend is expected to fire again later.
 */
export function useSendLoginInstructions({
  studentId,
  email,
  onSent,
  onSettled,
}: UseSendLoginInstructionsOpts) {
  const [isSending, startSending] = useTransition()
  const inFlight = useRef(false)

  function handleSend() {
    if (inFlight.current) return
    inFlight.current = true
    startSending(async () => {
      try {
        const result = await sendLoginInstructions({ id: studentId })
        if (result.success) {
          toast.success(`Login instructions sent to ${email}`)
          onSent?.()
        } else {
          toast.error(result.error)
        }
      } catch {
        toast.error('Failed to send login instructions')
      } finally {
        inFlight.current = false
        onSettled?.()
      }
    })
  }

  return { isSending, handleSend }
}
