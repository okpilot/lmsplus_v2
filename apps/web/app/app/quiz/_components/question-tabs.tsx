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
    <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as QuestionTab)}>
      <TabsList>
        {TABS.map((tab) => (
          <TabsTab key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTab>
        ))}
      </TabsList>
    </Tabs>
  )
}
