'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useState } from 'react'
import { Input } from '@/components/ui/input'
import type { SyllabusTree } from '../../syllabus/types'
import type { QuestionFilters } from '../types'
import { QuestionFilterSelects } from './question-filter-selects'

type Props = {
  tree: SyllabusTree
  filters: QuestionFilters
}

const ALL = '__all__'

export function QuestionFiltersBar({ tree, filters }: Readonly<Props>) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchText, setSearchText] = useState(filters.search ?? '')

  const updateFilter = useCallback(
    (key: string, value: string | null | undefined) => {
      const params = new URLSearchParams(searchParams.toString())
      if (!value || value === ALL) {
        params.delete(key)
      } else {
        params.set(key, value)
      }
      if (key === 'subjectId') {
        params.delete('topicId')
        params.delete('subtopicId')
      }
      if (key === 'topicId') {
        params.delete('subtopicId')
      }
      router.replace(`?${params.toString()}`)
    },
    [router, searchParams],
  )

  return (
    <div className="flex flex-wrap items-center gap-3">
      <QuestionFilterSelects
        tree={tree}
        subjectId={filters.subjectId ?? ALL}
        topicId={filters.topicId ?? ALL}
        subtopicId={filters.subtopicId ?? ALL}
        difficulty={filters.difficulty ?? ALL}
        status={filters.status ?? ALL}
        onFilterChange={updateFilter}
      />

      <Input
        type="search"
        placeholder="Search question text..."
        value={searchText}
        onChange={(e) => {
          const val = e.target.value
          setSearchText(val)
          if (val === '') updateFilter('search', undefined)
        }}
        className="w-56"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            updateFilter('search', searchText.trim() || undefined)
          }
        }}
      />
    </div>
  )
}
