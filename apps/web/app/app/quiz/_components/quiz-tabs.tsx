'use client'

import { useState } from 'react'

type QuizTabsProps = {
  draftCount: number
  newQuizContent: React.ReactNode
  savedDraftContent: React.ReactNode
}

type TabButtonProps = {
  isActive: boolean
  label: string
  testId: string
  onClick: () => void
  badge?: number
}

function TabButton({ isActive, label, testId, onClick, badge }: TabButtonProps) {
  return (
    <button
      type="button"
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

export function QuizTabs({ draftCount, newQuizContent, savedDraftContent }: QuizTabsProps) {
  const [tab, setTab] = useState<'new' | 'saved'>('new')

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        <TabButton
          isActive={tab === 'new'}
          label="New Quiz"
          testId="tab-new"
          onClick={() => setTab('new')}
        />
        <TabButton
          isActive={tab === 'saved'}
          label="Saved Quizzes"
          testId="tab-saved"
          onClick={() => setTab('saved')}
          badge={draftCount}
        />
      </div>
      {tab === 'new' ? newQuizContent : savedDraftContent}
    </div>
  )
}
