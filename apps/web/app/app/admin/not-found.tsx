import Link from 'next/link'

/**
 * 404 boundary for the admin segment.
 *
 * Unlike the root boundary this renders INSIDE the app shell, and it is what
 * `notFound()` resolves to for the admin pages that call it —
 * `dashboard/students/[id]` and `dashboard/sessions/[id]`. Without this file
 * those calls fall back to the root boundary, which carries no shell and whose
 * escape link sends an admin to the STUDENT dashboard.
 *
 * It does NOT cover mistyped admin urls: an unmatched path always resolves to the
 * root boundary, never to a nested one.
 */
export default function AdminNotFound() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Not found</h2>
        <p className="mt-2 text-muted-foreground">
          That admin record does not exist, or it has been removed.
        </p>
        <Link
          href="/app/admin/dashboard"
          className="mt-4 inline-block rounded-md border px-4 py-2 hover:bg-muted"
        >
          Back to admin dashboard
        </Link>
      </div>
    </div>
  )
}
