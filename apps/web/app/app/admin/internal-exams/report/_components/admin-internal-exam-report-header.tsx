import Link from 'next/link'

type Props = Readonly<{ studentName: string | null }>

export function AdminInternalExamReportHeader({ studentName }: Props) {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Link
        href="/app/admin/internal-exams?tab=attempts"
        className="transition-colors hover:text-foreground"
      >
        Internal Exams
      </Link>
      <span>/</span>
      <span className="text-foreground">{studentName ?? 'Student'}</span>
    </nav>
  )
}
