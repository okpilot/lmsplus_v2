'use client'

import type { SyllabusTree } from '../../syllabus/types'
import { CalcFilterSelect } from './calc-filter-select'
import { FilterSelect } from './filter-select'

type Props = {
  tree: SyllabusTree
  subjectId: string
  topicId: string
  subtopicId: string
  difficulty: string
  status: string
  hasCalculations: string
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
  hasCalculations,
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
      <FilterSelect
        value={subjectId}
        items={subjectItems}
        ariaLabel="Subject"
        placeholder="All subjects"
        triggerClassName="w-44"
        onValueChange={(v) => onFilterChange('subjectId', v)}
      />
      <FilterSelect
        value={topicId}
        items={topicItems}
        ariaLabel="Topic"
        placeholder="All topics"
        triggerClassName="w-44"
        disabled={topics.length === 0}
        onValueChange={(v) => onFilterChange('topicId', v)}
      />
      <FilterSelect
        value={subtopicId}
        items={subtopicItems}
        ariaLabel="Subtopic"
        placeholder="All subtopics"
        triggerClassName="w-44"
        disabled={subtopics.length === 0}
        onValueChange={(v) => onFilterChange('subtopicId', v)}
      />
      <FilterSelect
        value={difficulty}
        items={DIFFICULTY_ITEMS}
        ariaLabel="Difficulty"
        placeholder="Difficulty"
        triggerClassName="w-32"
        onValueChange={(v) => onFilterChange('difficulty', v)}
      />
      <FilterSelect
        value={status}
        items={STATUS_ITEMS}
        ariaLabel="Status"
        placeholder="Status"
        triggerClassName="w-28"
        onValueChange={(v) => onFilterChange('status', v)}
      />
      <CalcFilterSelect
        value={hasCalculations}
        onValueChange={(v) => onFilterChange('hasCalculations', v)}
      />
    </>
  )
}
