import Link from 'next/link'

export function AdminInternalExamReportFooter() {
  return (
    <div className="flex justify-center">
      <Link
        href="/app/admin/internal-exams?tab=attempts"
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Back to Internal Exams
      </Link>
    </div>
  )
}
