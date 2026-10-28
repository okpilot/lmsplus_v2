'use client'

import { Button } from '@/components/ui/button'

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

// Plain buttons, not ui/tabs: Base UI's TabsList stops ArrowLeft/ArrowRight propagation,
// and use-quiz-keyboard needs those keys to move between questions.
export function QuestionTabs({ activeTab, onTabChange }: Readonly<QuestionTabsProps>) {
  return (
    <div className="flex justify-center">
      <div
        role="tablist"
        aria-label="Question view"
        className="inline-flex items-center gap-1 rounded-control bg-muted p-1"
      >
        {TABS.map((tab) => (
          <Button
            key={tab.value}
            type="button"
            variant="ghost"
            role="tab"
            aria-selected={activeTab === tab.value}
            onClick={() => onTabChange(tab.value)}
            className="h-8 rounded-[calc(var(--radius-control)-2px)] border border-transparent px-2 text-xs font-medium text-muted-foreground hover:bg-transparent hover:text-foreground aria-selected:border-primary aria-selected:bg-card aria-selected:text-primary-text md:px-3 md:text-sm"
          >
            {tab.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
