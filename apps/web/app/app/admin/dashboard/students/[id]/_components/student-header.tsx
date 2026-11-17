import Link from 'next/link'
import { PageHeader } from '@/components/ui/heading'
import { formatRelativeTime } from '../../../_components/student-table-helpers'
import type { StudentDetail } from '../../../types'

type Props = Readonly<{ student: StudentDetail }>

export function StudentHeader({ student }: Readonly<Props>) {
  const attributes = [
    student.courses.join(', '),
    student.role === 'admin' ? 'Admin' : 'Student',
    student.deletedAt ? 'Inactive' : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="space-y-stack">
      <nav className="text-caption text-muted-foreground">
        <Link href="/app/admin/dashboard" className="hover:text-foreground hover:underline">
          Dashboard
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{student.fullName ?? 'Student'}</span>
      </nav>

      <PageHeader
        title={student.fullName ?? 'Unnamed Student'}
        description={
          <>
            {student.email}
            <span className="block text-caption">{attributes}</span>
          </>
        }
      />

      <p className="text-caption text-muted-foreground">
        Last active: {formatRelativeTime(student.lastActiveAt)}
      </p>
    </div>
  )
}
