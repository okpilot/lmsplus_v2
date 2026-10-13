import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/heading'
import { formatRelativeTime } from '../../../_components/student-table-helpers'
import type { StudentDetail } from '../../../types'

type Props = Readonly<{ student: StudentDetail }>

export function StudentHeader({ student }: Props) {
  return (
    <div className="space-y-3">
      <nav className="text-sm text-muted-foreground">
        <Link href="/app/admin/dashboard" className="hover:text-foreground hover:underline">
          Dashboard
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{student.fullName ?? 'Student'}</span>
      </nav>

      <PageHeader
        title={student.fullName ?? 'Unnamed Student'}
        description={student.email}
        actions={
          <>
            {student.deletedAt && <Badge variant="destructive">Inactive</Badge>}
            <Badge variant="outline" className="capitalize">
              {student.role}
            </Badge>
          </>
        }
      />

      <p className="text-xs text-muted-foreground">
        Last active: {formatRelativeTime(student.lastActiveAt)}
      </p>
    </div>
  )
}
