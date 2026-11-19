import { StatusNote } from '@/components/kit/status-note'
import { plural } from '../_utils/plural'
import { SendNoticesButton } from './send-notices-button'

type Props = { count: number; sittingId: string }

/** Deliverable pending removal and cancellation notices, with the button that sends them. */
export function PendingNoticesBanner({ count, sittingId }: Readonly<Props>) {
  if (count === 0) return null
  return (
    <StatusNote tone="caution">
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span>{plural(count, 'notice')} waiting to be sent.</span>
        <SendNoticesButton sittingId={sittingId} />
      </span>
    </StatusNote>
  )
}
