'use client'

import { CheckboxGroup } from '@base-ui/react/checkbox-group'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import type { CourseOption } from '../types'

type Props = {
  courses: CourseOption[]
  value: string[]
  disabled: boolean
  onChange: (value: string[]) => void
}

export function StudentCourseFields({ courses, value, disabled, onChange }: Readonly<Props>) {
  return (
    <CheckboxGroup
      aria-label="Courses"
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      className="grid gap-2"
    >
      <span className="text-sm font-medium">Courses</span>
      {courses.map((course) => (
        <Label key={course.id} className="flex items-center gap-2 font-normal">
          <Checkbox value={course.id} />
          {course.name}
        </Label>
      ))}
    </CheckboxGroup>
  )
}
