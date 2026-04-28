'use client'

import { useState } from 'react'
import type {
  ExamSubjectOption,
  InternalExamAttemptRow,
  InternalExamCodeRow,
  OrgStudentOption,
} from '../types'
import { AttemptsTable } from './attempts-table'
import { CodesTab } from './codes-tab'

type Props = {
  students: OrgStudentOption[]
  subjects: ExamSubjectOption[]
  codes: InternalExamCodeRow[]
  attempts: InternalExamAttemptRow[]
}

type TabKey = 'codes' | 'attempts'

export function InternalExamsTabs({ students, subjects, codes, attempts }: Readonly<Props>) {
  const [tab, setTab] = useState<TabKey>('codes')

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Internal exam sections"
        className="flex border-b border-border"
      >
        <TabButton
          id="codes"
          active={tab === 'codes'}
          label="Codes"
          onClick={() => setTab('codes')}
        />
        <TabButton
          id="attempts"
          active={tab === 'attempts'}
          label="Attempts"
          onClick={() => setTab('attempts')}
        />
      </div>
      <div
        role="tabpanel"
        id={`tabpanel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        data-testid={`tabpanel-${tab}`}
      >
        {tab === 'codes' ? (
          <CodesTab students={students} subjects={subjects} codes={codes} />
        ) : (
          <AttemptsTable rows={attempts} />
        )}
      </div>
    </div>
  )
}

function TabButton({
  id,
  active,
  label,
  onClick,
}: {
  id: string
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      id={`tab-${id}`}
      role="tab"
      aria-selected={active}
      aria-controls={`tabpanel-${id}`}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      data-testid={`tab-${id}`}
      className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  )
}
