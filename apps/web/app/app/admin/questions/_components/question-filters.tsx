'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useState } from 'react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { SyllabusTree } from '../../syllabus/types'
import type { QuestionFilters } from '../types'

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

  const selectedSubject = tree.find((s) => s.id === filters.subjectId)
  const topics = selectedSubject?.topics ?? []
  const selectedTopic = topics.find((t) => t.id === filters.topicId)
  const subtopics = selectedTopic?.subtopics ?? []

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={filters.subjectId ?? ALL} onValueChange={(v) => updateFilter('subjectId', v)}>
        <SelectTrigger className="w-44" aria-label="Subject">
          <SelectValue placeholder="All subjects" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL} label="All subjects">
            All subjects
          </SelectItem>
          {tree.map((s) => (
            <SelectItem key={s.id} value={s.id} label={`${s.code} — ${s.name}`}>
              {s.code} — {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.topicId ?? ALL}
        onValueChange={(v) => updateFilter('topicId', v)}
        disabled={topics.length === 0}
      >
        <SelectTrigger className="w-44" aria-label="Topic">
          <SelectValue placeholder="All topics" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL} label="All topics">
            All topics
          </SelectItem>
          {topics.map((t) => (
            <SelectItem key={t.id} value={t.id} label={t.code}>
              {t.code}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.subtopicId ?? ALL}
        onValueChange={(v) => updateFilter('subtopicId', v)}
        disabled={subtopics.length === 0}
      >
        <SelectTrigger className="w-44" aria-label="Subtopic">
          <SelectValue placeholder="All subtopics" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL} label="All subtopics">
            All subtopics
          </SelectItem>
          {subtopics.map((st) => (
            <SelectItem key={st.id} value={st.id} label={st.code}>
              {st.code}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.difficulty ?? ALL}
        onValueChange={(v) => updateFilter('difficulty', v)}
      >
        <SelectTrigger className="w-32" aria-label="Difficulty">
          <SelectValue placeholder="Difficulty" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL} label="All difficulties">
            All difficulties
          </SelectItem>
          <SelectItem value="easy" label="Easy">
            Easy
          </SelectItem>
          <SelectItem value="medium" label="Medium">
            Medium
          </SelectItem>
          <SelectItem value="hard" label="Hard">
            Hard
          </SelectItem>
        </SelectContent>
      </Select>

      <Select value={filters.status ?? ALL} onValueChange={(v) => updateFilter('status', v)}>
        <SelectTrigger className="w-28" aria-label="Status">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL} label="All statuses">
            All statuses
          </SelectItem>
          <SelectItem value="active" label="Active">
            Active
          </SelectItem>
          <SelectItem value="draft" label="Draft">
            Draft
          </SelectItem>
        </SelectContent>
      </Select>

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
