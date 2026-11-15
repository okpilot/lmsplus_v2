import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CourseOption } from '../types'
import { StudentFormDialog } from './student-form-dialog'

type Props = {
  totalCount: number
  courses: CourseOption[]
}

export function StudentsToolbar({ totalCount, courses }: Readonly<Props>) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-caption text-muted-foreground">
        {totalCount} user{totalCount === 1 ? '' : 's'}
      </p>
      <div className="flex items-center gap-2">
        <StudentFormDialog
          courses={courses}
          trigger={
            <Button size="sm">
              <Plus className="mr-1.5 size-icon" />
              New Student
            </Button>
          }
        />
      </div>
    </div>
  )
}
