'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { upsertSubtopic } from '../actions/upsert-subtopic'
import type { SyllabusSubtopic } from '../types'
import { DeleteButton } from './delete-button'
import { InlineForm } from './inline-form'

type Props = {
  subtopic: SyllabusSubtopic
  topicId: string
}

export function SubtopicRow({ subtopic, topicId }: Props) {
  const [editing, setEditing] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleEdit(data: Record<string, string>) {
    startTransition(async () => {
      try {
        const result = await upsertSubtopic({
          id: subtopic.id,
          topic_id: topicId,
          code: data.code,
          name: data.name,
          sort_order: subtopic.sort_order,
        })
        if (result.success) {
          toast.success(`Subtopic "${data.code}" updated`)
          setEditing(false)
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
            { name: 'code', placeholder: 'Code', width: 'w-28', defaultValue: subtopic.code },
            { name: 'name', placeholder: 'Name', width: 'flex-1', defaultValue: subtopic.name },
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
    <div className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/50">
      <span className="w-20 font-mono text-xs">{subtopic.code}</span>
      <span className="flex-1 text-sm">{subtopic.name}</span>
      <Badge variant="secondary" className="text-xs">
        {subtopic.questionCount} Q
      </Badge>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Edit subtopic"
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
        id={subtopic.id}
        table="easa_subtopics"
        label={`${subtopic.code} - ${subtopic.name}`}
        questionCount={subtopic.questionCount}
      />
    </div>
  )
}
