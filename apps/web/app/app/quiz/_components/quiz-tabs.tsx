'use client'

import { type KeyboardEvent, useRef, useState } from 'react'

type QuizTabsProps = {
  draftCount: number
  newQuizContent: React.ReactNode
  savedDraftContent: React.ReactNode
}

type TabButtonProps = {
  id: string
  isActive: boolean
  label: string
  testId: string
  panelId: string
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

const TABS = ['new', 'saved'] as const

export function QuizTabs({ draftCount, newQuizContent, savedDraftContent }: QuizTabsProps) {
  const [tab, setTab] = useState<'new' | 'saved'>('new')
  const tabListRef = useRef<HTMLDivElement>(null)

  function handleKeyDown(e: KeyboardEvent) {
    const currentIndex = TABS.indexOf(tab)
    let nextIndex = currentIndex

    if (e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % TABS.length
    else if (e.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home') nextIndex = 0
    else if (e.key === 'End') nextIndex = TABS.length - 1
    else return

    e.preventDefault()
    const nextTab = nextIndex === 0 ? 'new' : 'saved'
    setTab(nextTab)
    const button = tabListRef.current?.querySelector<HTMLElement>(`#tab-${nextTab}`)
    button?.focus()
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
          panelId="tabpanel-new"
          onClick={() => setTab('new')}
        />
        <TabButton
          id="tab-saved"
          isActive={tab === 'saved'}
          label="Saved Quizzes"
          testId="tab-saved"
          panelId="tabpanel-saved"
          onClick={() => setTab('saved')}
          badge={draftCount}
        />
      </div>
      <div id={`tabpanel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'new' ? newQuizContent : savedDraftContent}
      </div>
    </div>
  )
}
