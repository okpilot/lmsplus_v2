import { FileQuestion } from 'lucide-react'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'

/**
 * Root 404 boundary.
 *
 * It serves UNMATCHED urls — including mistyped `/app/admin/*` paths, which are
 * unmatched and so resolve here rather than to the admin boundary. A `notFound()`
 * call inside a segment resolves to that segment's own `not-found.tsx` when one
 * exists (see `app/app/admin/not-found.tsx`).
 *
 * This file always renders in the ROOT layout, with no app shell, whichever way
 * it is reached — so it must stand on its own. The escape is `/` rather than a
 * dashboard because this page is reachable while logged out; `proxy.ts` forwards
 * an authenticated visitor from `/` on to `/app/dashboard`, so one link serves
 * both audiences.
 */
export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-gutter">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileQuestion aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle as="h2">Page not found</EmptyTitle>
          <EmptyDescription>
            The page you are looking for does not exist or has moved.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href="/" className={buttonVariants({ variant: 'outline' })}>
            Go to home
          </Link>
        </EmptyContent>
      </Empty>
    </div>
  )
}
