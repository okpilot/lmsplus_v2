'use client'

import { useState } from 'react'
import type { AvailableInternalExam, InternalExamHistoryEntry } from '../queries'
import { AvailableTab } from './available-tab'
import { MyReportsTab } from './my-reports-tab'

type Props = {
  available: AvailableInternalExam[]
  history: InternalExamHistoryEntry[]
  userId: string
}

type TabKey = 'available' | 'reports'

export function InternalExamTabs({ available, history, userId }: Readonly<Props>) {
  const [tab, setTab] = useState<TabKey>('available')

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Internal exam sections"
        className="flex border-b border-border"
      >
        <TabButton
          id="available"
          active={tab === 'available'}
          label="Available"
          badge={available.length || undefined}
          onClick={() => setTab('available')}
        />
        <TabButton
          id="reports"
          active={tab === 'reports'}
          label="My Reports"
          onClick={() => setTab('reports')}
        />
      </div>
      <div
        role="tabpanel"
        id={`tabpanel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        data-testid={`tabpanel-${tab}`}
      >
        {tab === 'available' ? (
          <AvailableTab rows={available} userId={userId} />
        ) : (
          <MyReportsTab rows={history} />
        )}
      </div>
    </div>
  )
}

function TabButton({
  id,
  active,
  label,
  badge,
  onClick,
}: {
  id: string
  active: boolean
  label: string
  badge?: number
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
      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
      {badge != null && badge > 0 && (
        <span
          data-testid={`tab-${id}-badge`}
          className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground"
        >
          {badge}
        </span>
      )}
    </button>
  )
}
