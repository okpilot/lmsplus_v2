import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button-variants'

export function ReportFooter() {
  return (
    <div className="flex justify-center">
      <Link href="/app/internal-exam?tab=reports" className={buttonVariants()}>
        Back to Internal Exam Reports
      </Link>
    </div>
  )
}
