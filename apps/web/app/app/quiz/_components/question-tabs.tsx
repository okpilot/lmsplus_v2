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
  { value: 'statistics', label: 'Stats' },
]

export function QuestionTabs({ activeTab, onTabChange }: QuestionTabsProps) {
  return (
    <div className="flex justify-center border-b border-border">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.value

        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(tab.value)}
            className={`px-2 py-2 text-xs font-medium transition-colors md:px-4 md:text-sm ${
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
