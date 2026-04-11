'use client'

import { useState } from 'react'
import type { SubjectWithConfig } from '../types'
import { ConfigFormDialog } from './config-form-dialog'
import { SubjectConfigCard } from './subject-config-card'

type Props = { subjects: SubjectWithConfig[] }

export function ExamConfigPageShell({ subjects }: Props) {
  const [editingSubject, setEditingSubject] = useState<SubjectWithConfig | null>(null)

  return (
    <>
      <div className="grid gap-4">
        {subjects.map((subject) => (
          <SubjectConfigCard
            key={subject.id}
            subject={subject}
            onEdit={() => setEditingSubject(subject)}
          />
        ))}
      </div>

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
