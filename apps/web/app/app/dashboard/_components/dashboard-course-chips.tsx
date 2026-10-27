'use client'

import { useRef, useState, useTransition } from 'react'
import { ChoicePills } from '@/components/kit/choice-pills'
import type { DashboardCourse } from '@/lib/dashboard/resolve-course'
import { selectDashboardCourse } from '../actions/select-course'

type Props = { courses: readonly DashboardCourse[]; selectedCode: string | null }

export function DashboardCourseChips({ courses, selectedCode }: Readonly<Props>) {
  const [, startTransition] = useTransition()
  const [value, setValue] = useState(selectedCode ?? '')
  // One switch at a time: a second click before the first settles would race the cookie write.
  const pendingRef = useRef(false)
  if (courses.length <= 1) return null

  const onChange = (code: string) => {
    if (pendingRef.current || code === value) return
    pendingRef.current = true
    const previous = value
    setValue(code)
    startTransition(async () => {
      try {
        const result = await selectDashboardCourse({ code })
        if (!result.success) setValue(previous)
      } catch (error) {
        console.error('[DashboardCourseChips] switch failed:', error)
        setValue(previous)
      } finally {
        pendingRef.current = false
      }
    })
  }

  return (
    <ChoicePills
      label="Course"
      options={courses.map((c) => ({ value: c.code, label: c.short }))}
      value={value}
      onChange={onChange}
    />
  )
}
