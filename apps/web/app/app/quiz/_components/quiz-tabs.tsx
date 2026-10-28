'use client'

import { useState } from 'react'
import { TabCount, Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui/tabs'

type QuizTabsProps = {
  draftCount?: number | null
  newQuizContent: React.ReactNode
  savedDraftContent: React.ReactNode
  newLabel?: string
  savedLabel?: string
  ariaLabel?: string
}

type TabName = 'new' | 'saved'

export function QuizTabs({
  draftCount = null,
  newQuizContent,
  savedDraftContent,
  newLabel = 'New Quiz',
  savedLabel = 'Saved Quizzes',
  ariaLabel = 'Quiz options',
}: Readonly<QuizTabsProps>) {
  const [tab, setTab] = useState<TabName>('new')

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as TabName)} className="space-y-4">
      <TabsList aria-label={ariaLabel}>
        <TabsTab value="new" id="tab-new" aria-controls="tabpanel-new" data-testid="tab-new">
          {newLabel}
        </TabsTab>
        <TabsTab
          value="saved"
          id="tab-saved"
          aria-controls="tabpanel-saved"
          data-testid="tab-saved"
        >
          {savedLabel}
          {draftCount != null && draftCount > 0 && (
            <TabCount data-testid="draft-count-badge">{draftCount}</TabCount>
          )}
        </TabsTab>
      </TabsList>
      <TabsPanel value="new" id="tabpanel-new">
        {newQuizContent}
      </TabsPanel>
      <TabsPanel value="saved" id="tabpanel-saved">
        {savedDraftContent}
      </TabsPanel>
    </Tabs>
  )
}
