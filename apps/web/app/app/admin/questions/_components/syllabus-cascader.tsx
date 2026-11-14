'use client'

import { useId } from 'react'
import { Label } from '@/components/ui/label'
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
  subjectId: string | undefined
  topicId: string | undefined
  subtopicId: string | null | undefined
  onSubjectChange: (id: string) => void
  onTopicChange: (id: string) => void
  onSubtopicChange: (id: string | null) => void
  disabled?: boolean
}

export function SyllabusCascader({
  tree,
  subjectId,
  topicId,
  subtopicId,
  onSubjectChange,
  onTopicChange,
  onSubtopicChange,
  disabled,
}: Readonly<Props>) {
  const subjectId_ = useId()
  const topicId_ = useId()
  const subtopicId_ = useId()
  const selectedSubject = tree.find((s) => s.id === subjectId)
  const topics = selectedSubject?.topics ?? []
  const selectedTopic = topics.find((t) => t.id === topicId)
  const subtopics = selectedTopic?.subtopics ?? []

  const subjectItems = tree.map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` }))
  const topicItems = topics.map((t) => ({ value: t.id, label: `${t.code} — ${t.name}` }))
  const subtopicRequired = subtopics.length > 0
  const subtopicItems = [
    ...(subtopicRequired ? [] : [{ value: '__none__', label: 'None' }]),
    ...subtopics.map((st) => ({ value: st.id, label: `${st.code} — ${st.name}` })),
  ]

  return (
    <div className="grid grid-cols-3 items-end gap-stack-lg [&>div]:min-w-0 [&_[data-slot=select-trigger]]:w-full">
      <div>
        <Label htmlFor={subjectId_} className="mb-1 block">
          Subject
        </Label>
        <Select
          value={subjectId ?? ''}
          onValueChange={(v) => v && onSubjectChange(v)}
          disabled={disabled}
          items={subjectItems}
        >
          <SelectTrigger id={subjectId_}>
            <SelectValue placeholder="Select subject" />
          </SelectTrigger>
          <SelectContent>
            {tree.map((s) => (
              <SelectItem key={s.id} value={s.id} label={`${s.code} — ${s.name}`}>
                {s.code} — {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor={topicId_} className="mb-1 block">
          Topic
        </Label>
        <Select
          value={topicId ?? ''}
          onValueChange={(v) => v && onTopicChange(v)}
          disabled={disabled || topics.length === 0}
          items={topicItems}
        >
          <SelectTrigger id={topicId_}>
            <SelectValue placeholder="Select topic" />
          </SelectTrigger>
          <SelectContent>
            {topics.map((t) => (
              <SelectItem key={t.id} value={t.id} label={`${t.code} — ${t.name}`}>
                {t.code} — {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor={subtopicId_} className="mb-1 block">
          {subtopicRequired ? 'Subtopic' : 'Subtopic (optional)'}
        </Label>
        <Select
          value={subtopicId ?? (subtopicRequired ? null : '__none__')}
          onValueChange={(v) => onSubtopicChange(v === '__none__' || v === null ? null : v)}
          disabled={disabled || subtopics.length === 0}
          items={subtopicItems}
        >
          <SelectTrigger id={subtopicId_}>
            <SelectValue placeholder={subtopicRequired ? 'Select subtopic' : 'None'} />
          </SelectTrigger>
          <SelectContent>
            {!subtopicRequired && (
              <SelectItem value="__none__" label="None">
                None
              </SelectItem>
            )}
            {subtopics.map((st) => (
              <SelectItem key={st.id} value={st.id} label={`${st.code} — ${st.name}`}>
                {st.code} — {st.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
