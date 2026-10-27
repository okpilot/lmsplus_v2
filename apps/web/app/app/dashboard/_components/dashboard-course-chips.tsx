'use client'

import { useState, useTransition } from 'react'
import { ChoicePills } from '@/components/kit/choice-pills'
import type { DashboardCourse } from '@/lib/dashboard/resolve-course'
import { selectDashboardCourse } from '../actions/select-course'

type Props = { courses: readonly DashboardCourse[]; selectedCode: string | null }

export function DashboardCourseChips({ courses, selectedCode }: Readonly<Props>) {
  const [, startTransition] = useTransition()
  const [value, setValue] = useState(selectedCode ?? '')
  if (courses.length <= 1) return null

  const onChange = (code: string) =>
    startTransition(async () => {
      const previous = value
      setValue(code)
      const result = await selectDashboardCourse({ code })
      if (!result.success) setValue(previous)
    })

  return (
    <ChoicePills
      label="Course"
      options={courses.map((c) => ({ value: c.code, label: c.short }))}
      value={value}
      onChange={onChange}
    />
  )
}
