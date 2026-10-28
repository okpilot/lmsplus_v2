'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { TabCount, Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui/tabs'
import type { AvailableInternalExam, InternalExamHistoryEntry } from '../queries'
import { AvailableTab } from './available-tab'
import { MyReportsTab } from './my-reports-tab'

type Props = {
  available: AvailableInternalExam[]
  history: InternalExamHistoryEntry[]
}

type TabKey = 'available' | 'reports'

function readTabParam(value: string | null): TabKey {
  return value === 'reports' ? 'reports' : 'available'
}

export function InternalExamTabs({ available, history }: Readonly<Props>) {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const [tab, setTab] = useState<TabKey>(readTabParam(tabParam))
  // Re-sync when ?tab= changes via soft navigation (e.g., "Back" CTA from report page).
  useEffect(() => {
    setTab(readTabParam(tabParam))
  }, [tabParam])

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(readTabParam(v as string))}
      className="space-y-4"
    >
      <TabsList aria-label="Internal exam sections">
        <TabsTab value="available" id="tab-available" data-testid="tab-available">
          Available
          {available.length > 0 && (
            <TabCount data-testid="tab-available-badge">{available.length}</TabCount>
          )}
        </TabsTab>
        <TabsTab value="reports" id="tab-reports" data-testid="tab-reports">
          My Reports
        </TabsTab>
      </TabsList>
      <TabsPanel value="available" id="tabpanel-available" data-testid="tabpanel-available">
        <AvailableTab rows={available} />
      </TabsPanel>
      <TabsPanel value="reports" id="tabpanel-reports" data-testid="tabpanel-reports">
        <MyReportsTab rows={history} />
      </TabsPanel>
    </Tabs>
  )
}
