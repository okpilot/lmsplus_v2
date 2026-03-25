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
  const selectedSubject = tree.find((s) => s.id === subjectId)
  const topics = selectedSubject?.topics ?? []
  const selectedTopic = topics.find((t) => t.id === topicId)
  const subtopics = selectedTopic?.subtopics ?? []

  return (
    <div className="grid grid-cols-3 gap-3">
      <div>
        <span className="mb-1 block text-xs font-medium text-muted-foreground">Subject *</span>
        <Select
          value={subjectId ?? ''}
          onValueChange={(v) => v && onSubjectChange(v)}
          disabled={disabled}
        >
          <SelectTrigger>
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
        <span className="mb-1 block text-xs font-medium text-muted-foreground">Topic *</span>
        <Select
          value={topicId ?? ''}
          onValueChange={(v) => v && onTopicChange(v)}
          disabled={disabled || topics.length === 0}
        >
          <SelectTrigger>
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
        <span className="mb-1 block text-xs font-medium text-muted-foreground">Subtopic</span>
        <Select
          value={subtopicId ?? '__none__'}
          onValueChange={(v) => onSubtopicChange(v === '__none__' || v === null ? null : v)}
          disabled={disabled || subtopics.length === 0}
        >
          <SelectTrigger>
            <SelectValue placeholder="None" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__" label="None">
              None
            </SelectItem>
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
