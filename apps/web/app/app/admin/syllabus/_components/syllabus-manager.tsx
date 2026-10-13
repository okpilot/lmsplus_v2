'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Empty, EmptyDescription } from '@/components/ui/empty'
import { Heading } from '@/components/ui/heading'
import { upsertSubject } from '../actions/upsert-subject'
import type { SyllabusTree } from '../types'
import { InlineForm } from './inline-form'
import { SubjectRow } from './subject-row'

type Props = {
  initialTree: SyllabusTree
}

function EmptyNote() {
  return (
    <Empty>
      <EmptyDescription>No subjects yet. Add your first subject below.</EmptyDescription>
    </Empty>
  )
}

export function SyllabusManager({ initialTree }: Readonly<Props>) {
  const [isPending, startTransition] = useTransition()

  function handleAddSubject(data: Record<string, string>) {
    startTransition(async () => {
      try {
        const result = await upsertSubject({
          code: data.code,
          name: data.name,
          short: data.short,
        })
        if (result.success) {
          toast.success(`Subject "${data.code}" added`)
        } else {
          toast.error(result.error)
        }
      } catch {
        toast.error('Service error. Please try again.')
      }
    })
  }

  return (
    <div className="space-y-2">
      {initialTree.length === 0 && !isPending && <EmptyNote />}

      {initialTree.map((subject) => (
        <SubjectRow key={subject.id} subject={subject} />
      ))}

      <div className="border-t pt-4">
        <Heading level={3} className="mb-2">
          Add Subject
        </Heading>
        <InlineForm
          fields={[
            { name: 'code', placeholder: 'e.g. 010', width: 'w-20' },
            { name: 'name', placeholder: 'Subject name', width: 'flex-1' },
            { name: 'short', placeholder: 'Short name', width: 'w-32' },
          ]}
          onSubmit={handleAddSubject}
          isPending={isPending}
        />
      </div>
    </div>
  )
}
