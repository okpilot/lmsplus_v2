'use client'

import { useState } from 'react'

type QuizTabsProps = {
  hasDraft: boolean
  newQuizContent: React.ReactNode
  savedDraftContent: React.ReactNode
}

export function QuizTabs({ hasDraft, newQuizContent, savedDraftContent }: QuizTabsProps) {
  const [tab, setTab] = useState<'new' | 'saved'>('new')

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        <button
          type="button"
          data-testid="tab-new"
          onClick={() => setTab('new')}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === 'new'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          New Quiz
        </button>
        <button
          type="button"
          data-testid="tab-saved"
          onClick={() => setTab('saved')}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === 'saved'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Saved Quiz
          {hasDraft && (
            <span className="ml-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              1
            </span>
          )}
        </button>
      </div>
      {tab === 'new' ? newQuizContent : savedDraftContent}
    </div>
  )
}
