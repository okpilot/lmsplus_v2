import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button-variants'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'

/**
 * 404 boundary for the admin segment.
 *
 * Unlike the root boundary this renders INSIDE the app shell, and it is what
 * `notFound()` resolves to for any route segment under `/app/admin` that calls it
 * (derive the current set with `grep -rn "notFound()" apps/web/app/app/admin`). Without this
 * file those calls fall back to the root boundary, which carries no shell and whose
 * escape link sends an admin to the STUDENT dashboard.
 *
 * It does NOT cover mistyped admin urls: an unmatched path always resolves to the
 * root boundary, never to a nested one.
 */
export default function AdminNotFound() {
  return (
    <div className="grid min-h-[50vh] place-items-center px-gutter">
      <Empty>
        <EmptyHeader>
          <EmptyTitle as="h2">Not found</EmptyTitle>
          <EmptyDescription>
            That admin record does not exist, or it has been removed.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href="/app/admin/dashboard" className={buttonVariants({ variant: 'outline' })}>
            Back to admin dashboard
          </Link>
        </EmptyContent>
      </Empty>
    </div>
  )
}
