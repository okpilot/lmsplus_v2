'use client'

import { Button } from '@/components/ui/button'
import { sendNoticesBanner } from '../_utils/copy'
import { sendSittingNotices } from '../actions/send-sitting-notices'
import { useSittingAction } from './use-sitting-action'

/** Emails the sitting's pending removal and cancellation notices. */
export function SendNoticesButton({ sittingId }: Readonly<{ sittingId: string }>) {
  const { pending, run } = useSittingAction()
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        run(() => sendSittingNotices({ sittingId }), sendNoticesBanner, { errorAsBanner: true })
      }
    >
      Send notices
    </Button>
  )
}
