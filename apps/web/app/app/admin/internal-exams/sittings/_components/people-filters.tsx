'use client'

import { useEffect, useState } from 'react'
import type { CourseOption, GroupOption } from '@/app/app/admin/students/types'
import { Input } from '@/components/ui/input'
import { useSittingUi } from '../_hooks/sitting-ui-context'
import { OptionSelect } from './option-select'

type Props = {
  groups: GroupOption[]
  courses: CourseOption[]
  q: string
  group: string
  course: string
  status: 'active' | 'inactive'
}

const ALL = 'all'
const SEARCH_DEBOUNCE_MS = 300
const ALL_GROUPS = { value: ALL, label: 'All groups' }
const ALL_COURSES = { value: ALL, label: 'All courses' }
const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Deactivated' },
]

/** Search, Group, Course and Status of the Add people popup. Every change rewrites the URL and resets the page. */
export function PeopleFilters({ groups, courses, q, group, course, status }: Readonly<Props>) {
  const { replaceParams } = useSittingUi()
  const [text, setText] = useState(q)
  useEffect(() => {
    if (text.trim() === q) return
    const t = setTimeout(
      () => replaceParams({ pq: text.trim() || null, ppage: null }),
      SEARCH_DEBOUNCE_MS,
    )
    return () => clearTimeout(t)
  }, [text, q, replaceParams])
  const set = (key: string, value: string) =>
    replaceParams({ [key]: value === ALL ? null : value, ppage: null })
  return (
    <div className="grid min-w-0 gap-2 sm:grid-cols-2">
      <div className="min-w-0 space-y-1 sm:col-span-2">
        <span className="block text-label text-muted-foreground">Search name or email</span>
        <Input
          aria-label="Search name or email"
          value={text}
          maxLength={100}
          placeholder="Search"
          className="min-w-0"
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <OptionSelect
        label="Group"
        value={group || ALL}
        options={[ALL_GROUPS, ...groups.map((g) => ({ value: g.id, label: g.name }))]}
        onChange={(v) => set('pgroup', v)}
      />
      <OptionSelect
        label="Course"
        value={course || ALL}
        options={[ALL_COURSES, ...courses.map((c) => ({ value: c.id, label: c.name }))]}
        onChange={(v) => set('pcourse', v)}
      />
      <OptionSelect
        label="Status"
        value={status}
        options={STATUS_OPTIONS}
        onChange={(v) => set('pstatus', v === 'inactive' ? 'inactive' : ALL)}
      />
    </div>
  )
}
