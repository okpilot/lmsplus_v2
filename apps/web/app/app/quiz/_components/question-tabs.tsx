'use client'

import { Tabs, TabsList, TabsTab } from '@/components/ui/tabs'

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

export function QuestionTabs({ activeTab, onTabChange }: Readonly<QuestionTabsProps>) {
  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => onTabChange(v as QuestionTab)}
      className="flex justify-center"
    >
      <TabsList>
        {TABS.map((tab) => (
          <TabsTab
            key={tab.value}
            value={tab.value}
            className="h-8 px-2 text-xs md:px-3 md:text-sm"
          >
            {tab.label}
          </TabsTab>
        ))}
      </TabsList>
    </Tabs>
  )
}
