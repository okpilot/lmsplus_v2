'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { SyllabusTree } from '../../syllabus/types'

type Props = {
  tree: SyllabusTree
  subjectId: string
  topicId: string
  subtopicId: string
  difficulty: string
  status: string
  onFilterChange: (key: string, value: string | null | undefined) => void
}

const ALL = '__all__'

const DIFFICULTY_ITEMS = [
  { value: ALL, label: 'All difficulties' },
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
]

const STATUS_ITEMS = [
  { value: ALL, label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
]

export function QuestionFilterSelects({
  tree,
  subjectId,
  topicId,
  subtopicId,
  difficulty,
  status,
  onFilterChange,
}: Readonly<Props>) {
  const selectedSubject = tree.find((s) => s.id === subjectId)
  const topics = selectedSubject?.topics ?? []
  const selectedTopic = topics.find((t) => t.id === topicId)
  const subtopics = selectedTopic?.subtopics ?? []

  const subjectItems = [
    { value: ALL, label: 'All subjects' },
    ...tree.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` })),
  ]
  const topicItems = [
    { value: ALL, label: 'All topics' },
    ...topics.map((t) => ({ value: t.id, label: t.code })),
  ]
  const subtopicItems = [
    { value: ALL, label: 'All subtopics' },
    ...subtopics.map((st) => ({ value: st.id, label: st.code })),
  ]

  return (
    <>
      <Select
        value={subjectId}
        onValueChange={(v) => onFilterChange('subjectId', v)}
        items={subjectItems}
      >
        <SelectTrigger className="w-44" aria-label="Subject">
          <SelectValue placeholder="All subjects" />
        </SelectTrigger>
        <SelectContent>
          {subjectItems.map((item) => (
            <SelectItem key={item.value} value={item.value} label={item.label}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={topicId}
        onValueChange={(v) => onFilterChange('topicId', v)}
        disabled={topics.length === 0}
        items={topicItems}
      >
        <SelectTrigger className="w-44" aria-label="Topic">
          <SelectValue placeholder="All topics" />
        </SelectTrigger>
        <SelectContent>
          {topicItems.map((item) => (
            <SelectItem key={item.value} value={item.value} label={item.label}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={subtopicId}
        onValueChange={(v) => onFilterChange('subtopicId', v)}
        disabled={subtopics.length === 0}
        items={subtopicItems}
      >
        <SelectTrigger className="w-44" aria-label="Subtopic">
          <SelectValue placeholder="All subtopics" />
        </SelectTrigger>
        <SelectContent>
          {subtopicItems.map((item) => (
            <SelectItem key={item.value} value={item.value} label={item.label}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={difficulty}
        onValueChange={(v) => onFilterChange('difficulty', v)}
        items={DIFFICULTY_ITEMS}
      >
        <SelectTrigger className="w-32" aria-label="Difficulty">
          <SelectValue placeholder="Difficulty" />
        </SelectTrigger>
        <SelectContent>
          {DIFFICULTY_ITEMS.map((item) => (
            <SelectItem key={item.value} value={item.value} label={item.label}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={status}
        onValueChange={(v) => onFilterChange('status', v)}
        items={STATUS_ITEMS}
      >
        <SelectTrigger className="w-28" aria-label="Status">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          {STATUS_ITEMS.map((item) => (
            <SelectItem key={item.value} value={item.value} label={item.label}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  )
}
