import { StatusNote } from '@/components/kit/status-note'
import { plural } from '../_utils/plural'

/** Students auto-removed because they passed; the notice goes out once email sending exists. */
export function PendingNoticesBanner({ count }: Readonly<{ count: number }>) {
  if (count === 0) return null
  return (
    <StatusNote tone="caution">
      {plural(count, 'student')} removed because they passed will be notified once email sending is
      available.
    </StatusNote>
  )
}
