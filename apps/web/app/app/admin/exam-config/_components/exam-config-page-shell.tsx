'use client'

import { useState } from 'react'
import { CardList } from '@/components/ui/card'
import type { SubjectWithConfig } from '../types'
import { ConfigFormDialog } from './config-form-dialog'
import { SubjectConfigCard } from './subject-config-card'

type Props = { subjects: SubjectWithConfig[] }

export function ExamConfigPageShell({ subjects }: Readonly<Props>) {
  const [editingSubject, setEditingSubject] = useState<SubjectWithConfig | null>(null)

  return (
    <>
      <CardList>
        {subjects.map((subject) => (
          <SubjectConfigCard
            key={subject.id}
            subject={subject}
            onEdit={() => setEditingSubject(subject)}
          />
        ))}
      </CardList>

      {editingSubject && (
        <ConfigFormDialog
          key={editingSubject.id}
          subject={editingSubject}
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditingSubject(null)
          }}
        />
      )}
    </>
  )
}
