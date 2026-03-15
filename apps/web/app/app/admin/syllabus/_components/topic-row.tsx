'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronRight } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { upsertSubtopic } from '../actions/upsert-subtopic'
import { upsertTopic } from '../actions/upsert-topic'
import type { SyllabusTopic } from '../types'
import { DeleteButton } from './delete-button'
import { InlineForm } from './inline-form'
import { SubtopicRow } from './subtopic-row'

type Props = {
  topic: SyllabusTopic
  subjectId: string
}

export function TopicRow({ topic, subjectId }: Props) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleEdit(data: Record<string, string>) {
    startTransition(async () => {
      try {
        const result = await upsertTopic({
          id: topic.id,
          subject_id: subjectId,
          code: data.code,
          name: data.name,
          sort_order: topic.sort_order,
        })
        if (result.success) {
          toast.success(`Topic "${data.code}" updated`)
          setEditing(false)
        } else {
          toast.error(result.error)
        }
      } catch {
        toast.error('Service error. Please try again.')
      }
    })
  }

  function handleAddSubtopic(data: Record<string, string>) {
    startTransition(async () => {
      try {
        const result = await upsertSubtopic({
          topic_id: topic.id,
          code: data.code,
          name: data.name,
        })
        if (result.success) {
          toast.success(`Subtopic "${data.code}" added`)
        } else {
          toast.error(result.error)
        }
      } catch {
        toast.error('Service error. Please try again.')
      }
    })
  }

  if (editing) {
    return (
      <div className="rounded-md bg-muted/50 p-2">
        <InlineForm
          fields={[
            { name: 'code', placeholder: 'Code', width: 'w-24', defaultValue: topic.code },
            { name: 'name', placeholder: 'Name', width: 'flex-1', defaultValue: topic.name },
          ]}
          onSubmit={handleEdit}
          onCancel={() => setEditing(false)}
          isPending={isPending}
          submitLabel="Save"
        />
      </div>
    )
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
        <CollapsibleTrigger
          render={<Button variant="ghost" size="icon-xs" aria-label="Toggle topic" />}
        >
          <ChevronRight className={`size-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
        </CollapsibleTrigger>

        <span className="w-16 font-mono text-sm">{topic.code}</span>
        <span className="flex-1 text-sm">{topic.name}</span>
        <Badge variant="secondary" className="text-xs">
          {topic.questionCount} Q
        </Badge>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Edit topic"
          onClick={() => setEditing(true)}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-muted-foreground"
          >
            <title>Edit</title>
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          </svg>
        </Button>
        <DeleteButton
          id={topic.id}
          table="easa_topics"
          label={`${topic.code} - ${topic.name}`}
          questionCount={topic.questionCount}
        />
      </div>

      <CollapsibleContent>
        <div className="ml-6 space-y-1 border-l py-1 pl-3">
          {topic.subtopics.map((subtopic) => (
            <SubtopicRow key={subtopic.id} subtopic={subtopic} topicId={topic.id} />
          ))}

          <div className="pt-1">
            <InlineForm
              fields={[
                { name: 'code', placeholder: 'Subtopic code', width: 'w-28' },
                { name: 'name', placeholder: 'Subtopic name', width: 'flex-1' },
              ]}
              onSubmit={handleAddSubtopic}
              isPending={isPending}
            />
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
