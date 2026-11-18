import { StatusNote } from '@/components/kit/status-note'
import { plural } from '../_utils/plural'

/** Pending removal notices; they go out once email sending exists. */
export function PendingNoticesBanner({ count }: Readonly<{ count: number }>) {
  if (count === 0) return null
  return (
    <StatusNote tone="caution">
      {plural(count, 'notice')} waiting to be sent once email sending is available.
    </StatusNote>
  )
}
