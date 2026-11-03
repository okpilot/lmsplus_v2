import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button-variants'

export function AdminInternalExamReportFooter() {
  return (
    <div className="flex justify-center">
      <Link href="/app/admin/internal-exams?tab=attempts" className={buttonVariants()}>
        Back to Internal Exams
      </Link>
    </div>
  )
}
