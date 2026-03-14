'use client'

export type QuestionTab = 'question' | 'explanation' | 'comments' | 'statistics'

type QuestionTabsProps = {
  activeTab: QuestionTab
  onTabChange: (tab: QuestionTab) => void
}

const TABS: { value: QuestionTab; label: string }[] = [
  { value: 'question', label: 'Question' },
  { value: 'explanation', label: 'Explanation' },
  { value: 'comments', label: 'Comments' },
  { value: 'statistics', label: 'Statistics' },
]

export function QuestionTabs({ activeTab, onTabChange }: QuestionTabsProps) {
  return (
    <div className="flex border-b border-border">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.value

        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(tab.value)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'border-b-2 border-primary text-foreground'
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
