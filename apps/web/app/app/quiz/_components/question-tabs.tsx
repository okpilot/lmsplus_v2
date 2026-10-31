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
      {/* biome-ignore lint/a11y/useSemanticElements: a <fieldset> brings default border/legend layout; a flex pill row needs a plain group */}
      <div
        role="group"
        aria-label="Question view"
        className="inline-flex items-center gap-1 rounded-control bg-muted p-1 max-[374.98px]:gap-0"
      >
        {TABS.map((tab) => (
          <Button
            key={tab.value}
            type="button"
            variant="segment"
            size="segment"
            className="max-[374.98px]:text-caption-strong"
            aria-pressed={activeTab === tab.value}
            onClick={() => onTabChange(tab.value)}
          >
            {tab.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
