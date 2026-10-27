import Link from 'next/link'
import { PageHeader } from '@/components/ui/heading'

type Props = Readonly<{
  studentId: string
  studentName: string | null
}>

export function AdminReportHeader({ studentId, studentName }: Readonly<Props>) {
  return (
    <div className="space-y-1">
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/app/admin/dashboard" className="hover:text-foreground transition-colors">
          Dashboard
        </Link>
        <span>/</span>
        <Link
          href={`/app/admin/dashboard/students/${studentId}`}
          className="hover:text-foreground transition-colors"
        >
          {studentName ?? 'Student'}
        </Link>
        <span>/</span>
        <span className="text-foreground">Session Report</span>
      </nav>
      <PageHeader title="Quiz Results" />
    </div>
  )
}
