'use client'

import { useSearchParams } from 'next/navigation'
import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import type {
  ExamSubjectOption,
  InternalExamAttemptRow,
  InternalExamCodeRow,
  ListCodesFilters,
  OrgStudentOption,
} from '../types'
import { AttemptsTable } from './attempts-table'
import { CodesTab } from './codes-tab'

type Props = {
  students: OrgStudentOption[]
  subjects: ExamSubjectOption[]
  status?: ListCodesFilters['status']
  codes: InternalExamCodeRow[]
  codesTotalCount: number
  attempts: InternalExamAttemptRow[]
  attemptsTotalCount: number
  pageSize: number
}

type TabKey = 'codes' | 'attempts'

const TAB_ORDER: TabKey[] = ['codes', 'attempts']

function readTabParam(value: string | null): TabKey {
  return value === 'attempts' ? 'attempts' : 'codes'
}

export function InternalExamsTabs({
  students,
  subjects,
  status,
  codes,
  codesTotalCount,
  attempts,
  attemptsTotalCount,
  pageSize,
}: Readonly<Props>) {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const [tab, setTab] = useState<TabKey>(readTabParam(tabParam))
  // Re-sync when ?tab= changes via soft navigation (e.g., "Back" CTA from report page).
  useEffect(() => {
    setTab(readTabParam(tabParam))
  }, [tabParam])
  const tablistRef = useRef<HTMLDivElement | null>(null)

  function focusTab(key: TabKey) {
    setTab(key)
    const el = tablistRef.current?.querySelector<HTMLButtonElement>(`[data-tabkey="${key}"]`)
    el?.focus()
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const idx = TAB_ORDER.indexOf(tab)
    if (idx < 0) return
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      focusTab(TAB_ORDER[(idx + 1) % TAB_ORDER.length] as TabKey)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      focusTab(TAB_ORDER[(idx - 1 + TAB_ORDER.length) % TAB_ORDER.length] as TabKey)
    } else if (e.key === 'Home') {
      e.preventDefault()
      focusTab(TAB_ORDER[0] as TabKey)
    } else if (e.key === 'End') {
      e.preventDefault()
      focusTab(TAB_ORDER[TAB_ORDER.length - 1] as TabKey)
    }
  }

  return (
    <div className="space-y-4">
      <div
        ref={tablistRef}
        role="tablist"
        aria-label="Internal exam sections"
        className="flex border-b border-border"
        onKeyDown={onKeyDown}
      >
        {TAB_ORDER.map((key) => (
          <TabButton
            key={key}
            id={key}
            active={tab === key}
            label={key === 'codes' ? 'Codes' : 'Attempts'}
            onClick={() => setTab(key)}
          />
        ))}
      </div>
      <div
        role="tabpanel"
        id={`tabpanel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        data-testid={`tabpanel-${tab}`}
      >
        {tab === 'codes' ? (
          <CodesTab
            students={students}
            subjects={subjects}
            status={status}
            codes={codes}
            totalCount={codesTotalCount}
            pageSize={pageSize}
          />
        ) : (
          <AttemptsTable rows={attempts} totalCount={attemptsTotalCount} pageSize={pageSize} />
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
}: Readonly<{
  id: string
  active: boolean
  label: string
  onClick: () => void
}>) {
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
      data-tabkey={id}
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
