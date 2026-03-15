'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronRight } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { upsertSubject } from '../actions/upsert-subject'
import { upsertTopic } from '../actions/upsert-topic'
import type { SyllabusSubject } from '../types'
import { DeleteButton } from './delete-button'
import { InlineForm } from './inline-form'
import { TopicRow } from './topic-row'

type Props = {
  subject: SyllabusSubject
}

export function SubjectRow({ subject }: Props) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleEdit(data: Record<string, string>) {
    startTransition(async () => {
      const result = await upsertSubject({
        id: subject.id,
        code: data.code,
        name: data.name,
        short: data.short,
        sort_order: subject.sort_order,
      })
      if (result.success) {
        toast.success(`Subject "${data.code}" updated`)
        setEditing(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleAddTopic(data: Record<string, string>) {
    startTransition(async () => {
      const result = await upsertTopic({
        subject_id: subject.id,
        code: data.code,
        name: data.name,
      })
      if (result.success) {
        toast.success(`Topic "${data.code}" added`)
      } else {
        toast.error(result.error)
      }
    })
  }

  if (editing) {
    return (
      <div className="rounded-lg border bg-muted/50 p-3">
        <InlineForm
          fields={[
            { name: 'code', placeholder: 'Code', width: 'w-20', defaultValue: subject.code },
            { name: 'name', placeholder: 'Name', width: 'flex-1', defaultValue: subject.name },
            { name: 'short', placeholder: 'Short', width: 'w-32', defaultValue: subject.short },
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
      <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
        <CollapsibleTrigger render={<Button variant="ghost" size="icon-xs" />}>
          <ChevronRight className={`size-4 transition-transform ${open ? 'rotate-90' : ''}`} />
        </CollapsibleTrigger>

        <span className="w-12 font-mono text-sm font-semibold">{subject.code}</span>
        <span className="flex-1 text-sm">{subject.name}</span>
        <span className="text-xs text-muted-foreground">{subject.short}</span>
        <Badge variant="secondary" className="text-xs">
          {subject.questionCount} Q
        </Badge>
        <Button variant="ghost" size="icon-xs" onClick={() => setEditing(true)}>
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
          id={subject.id}
          table="easa_subjects"
          label={`${subject.code} - ${subject.name}`}
          questionCount={subject.questionCount}
        />
      </div>

      <CollapsibleContent>
        <div className="ml-8 space-y-1 border-l py-2 pl-4">
          {subject.topics.map((topic) => (
            <TopicRow key={topic.id} topic={topic} subjectId={subject.id} />
          ))}

          <div className="pt-2">
            <InlineForm
              fields={[
                { name: 'code', placeholder: 'Topic code', width: 'w-24' },
                { name: 'name', placeholder: 'Topic name', width: 'flex-1' },
              ]}
              onSubmit={handleAddTopic}
              isPending={isPending}
            />
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
