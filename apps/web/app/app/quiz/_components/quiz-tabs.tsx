'use client'

import { type KeyboardEvent, useEffect, useRef, useState } from 'react'

type QuizTabsProps = {
  draftCount?: number | null
  newQuizContent: React.ReactNode
  savedDraftContent: React.ReactNode
}

type TabButtonProps = {
  id: string
  isActive: boolean
  label: string
  testId: string
  panelId: string | undefined
  onClick: () => void
  badge?: number
}

function TabButton({ id, isActive, label, testId, panelId, onClick, badge }: TabButtonProps) {
  return (
    <button
      type="button"
      id={id}
      role="tab"
      aria-selected={isActive}
      aria-controls={panelId}
      tabIndex={isActive ? 0 : -1}
      data-testid={testId}
      onClick={onClick}
      className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        isActive
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
      {badge != null && badge > 0 && (
        <span
          data-testid="draft-count-badge"
          className="ml-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground"
        >
          {badge}
        </span>
      )}
    </button>
  )
}

const TAB_NAMES: Record<number, 'new' | 'saved'> = { 0: 'new', 1: 'saved' }

export function QuizTabs({ draftCount = null, newQuizContent, savedDraftContent }: QuizTabsProps) {
  const [tab, setTab] = useState<'new' | 'saved'>('new')
  const tabListRef = useRef<HTMLDivElement>(null)
  const pendingFocusRef = useRef<string | null>(null)

  // Focus the tab button after React commits the state update.
  // `tab` triggers the effect; pendingFocusRef gates execution to keyboard nav only.
  useEffect(() => {
    if (pendingFocusRef.current) {
      tabListRef.current?.querySelector<HTMLElement>(`#tab-${tab}`)?.focus()
      pendingFocusRef.current = null
    }
  }, [tab])

  function handleKeyDown(e: KeyboardEvent) {
    const currentIndex = tab === 'new' ? 0 : 1
    let nextIndex = currentIndex

    if (e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % 2
    else if (e.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + 2) % 2
    else if (e.key === 'Home') nextIndex = 0
    else if (e.key === 'End') nextIndex = 1
    else return

    e.preventDefault()
    const nextTab = TAB_NAMES[nextIndex] ?? 'new'
    pendingFocusRef.current = nextTab
    setTab(nextTab)
  }

  return (
    <div className="space-y-4">
      <div
        ref={tabListRef}
        role="tablist"
        aria-label="Quiz options"
        onKeyDown={handleKeyDown}
        className="flex gap-1 rounded-lg bg-muted p-1"
      >
        <TabButton
          id="tab-new"
          isActive={tab === 'new'}
          label="New Quiz"
          testId="tab-new"
          panelId={tab === 'new' ? 'tabpanel-new' : undefined}
          onClick={() => setTab('new')}
        />
        <TabButton
          id="tab-saved"
          isActive={tab === 'saved'}
          label="Saved Quizzes"
          testId="tab-saved"
          panelId={tab === 'saved' ? 'tabpanel-saved' : undefined}
          onClick={() => setTab('saved')}
          badge={draftCount ?? undefined}
        />
      </div>
      <div id={`tabpanel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'new' ? newQuizContent : savedDraftContent}
      </div>
    </div>
  )
}
