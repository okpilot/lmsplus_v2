import Link from 'next/link'

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
    <div className="flex min-h-dvh items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Page not found</h2>
        <p className="mt-2 text-muted-foreground">
          The page you are looking for does not exist or has moved.
        </p>
        <Link href="/" className="mt-4 inline-block rounded-md border px-4 py-2 hover:bg-muted">
          Go to home
        </Link>
      </div>
    </div>
  )
}
