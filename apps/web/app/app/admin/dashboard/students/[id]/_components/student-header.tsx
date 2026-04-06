import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
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

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {student.fullName ?? 'Unnamed Student'}
          </h1>
          <p className="text-sm text-muted-foreground">{student.email}</p>
        </div>
        <Badge variant="outline" className="capitalize">
          {student.role}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground">
        Last active: {formatRelativeTime(student.lastActiveAt)}
      </p>
    </div>
  )
}
