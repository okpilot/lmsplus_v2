'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { StudentFilters } from '../types'

type Props = {
  filters: StudentFilters
}

const ALL = '__all__'

const STATUS_ITEMS = [
  { value: ALL, label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

const ROLE_ITEMS = [
  { value: ALL, label: 'All' },
  { value: 'admin', label: 'Admin' },
  { value: 'instructor', label: 'Instructor' },
  { value: 'student', label: 'Student' },
]

export function StudentFiltersBar({ filters }: Readonly<Props>) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchText, setSearchText] = useState(filters.search ?? '')
  const isInitialMount = useRef(true)

  const updateFilter = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      router.push(`/app/admin/students?${params.toString()}`)
    },
    [router, searchParams],
  )

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    const timer = setTimeout(() => {
      updateFilter('search', searchText.trim() || undefined)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchText, updateFilter])

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={filters.status ?? ALL}
        onValueChange={(v) => updateFilter('status', v === ALL || v === null ? undefined : v)}
        items={STATUS_ITEMS}
      >
        <SelectTrigger className="w-32" aria-label="Status">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL} label="All">
            All
          </SelectItem>
          <SelectItem value="active" label="Active">
            Active
          </SelectItem>
          <SelectItem value="inactive" label="Inactive">
            Inactive
          </SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.role ?? ALL}
        onValueChange={(v) => updateFilter('role', v === ALL || v === null ? undefined : v)}
        items={ROLE_ITEMS}
      >
        <SelectTrigger className="w-32" aria-label="Role">
          <SelectValue placeholder="All roles" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL} label="All">
            All
          </SelectItem>
          <SelectItem value="admin" label="Admin">
            Admin
          </SelectItem>
          <SelectItem value="instructor" label="Instructor">
            Instructor
          </SelectItem>
          <SelectItem value="student" label="Student">
            Student
          </SelectItem>
        </SelectContent>
      </Select>

      <Input
        type="search"
        placeholder="Search students..."
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        className="w-56"
      />

      <Button variant="ghost" size="sm" onClick={() => router.push('/app/admin/students')}>
        Clear
      </Button>
    </div>
  )
}
