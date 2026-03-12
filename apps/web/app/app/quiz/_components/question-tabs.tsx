'use client'

import { useEffect } from 'react'

export type QuestionTab = 'question' | 'explanation' | 'comments' | 'statistics'

type QuestionTabsProps = {
  activeTab: QuestionTab
  onTabChange: (tab: QuestionTab) => void
  hasAnswered: boolean
  hiddenTabs?: QuestionTab[]
}

const TABS: { value: QuestionTab; label: string }[] = [
  { value: 'question', label: 'Question' },
  { value: 'explanation', label: 'Explanation' },
  { value: 'comments', label: 'Comments' },
  { value: 'statistics', label: 'Statistics' },
]

export function QuestionTabs({
  activeTab,
  onTabChange,
  hasAnswered,
  hiddenTabs,
}: QuestionTabsProps) {
  const visibleTabs = hiddenTabs ? TABS.filter((t) => !hiddenTabs.includes(t.value)) : TABS

  // Reset to first visible tab if active tab was hidden
  useEffect(() => {
    if (hiddenTabs?.includes(activeTab)) {
      const firstVisible = TABS.find((t) => !hiddenTabs.includes(t.value))
      if (firstVisible) onTabChange(firstVisible.value)
    }
  }, [hiddenTabs, activeTab, onTabChange])

  return (
    <div className="flex border-b border-border">
      {visibleTabs.map((tab) => {
        const isDisabled = tab.value === 'explanation' && !hasAnswered
        const isActive = activeTab === tab.value

        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-disabled={isDisabled}
            disabled={isDisabled}
            onClick={() => onTabChange(tab.value)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'border-b-2 border-primary text-foreground'
                : isDisabled
                  ? 'cursor-not-allowed text-muted-foreground/50'
                  : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
