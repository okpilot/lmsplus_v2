'use client'

import { useSearchParams } from 'next/navigation'
import type { ReactNode } from 'react'
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui/tabs'
import { readTabParam, tabHref } from '../_utils/tab-url'

type Props = {
  students: ReactNode
  groups: ReactNode
}

export function StudentsTabs({ students, groups }: Readonly<Props>) {
  const searchParams = useSearchParams()
  const tab = readTabParam(searchParams.get('tab'))

  return (
    <Tabs
      value={tab}
      onValueChange={(v) =>
        window.history.replaceState(
          null,
          '',
          `${window.location.pathname}${tabHref(searchParams.toString(), readTabParam(v as string))}`,
        )
      }
      className="space-y-section"
    >
      <TabsList aria-label="Student sections">
        <TabsTab value="students" id="tab-students" data-testid="tab-students">
          Students
        </TabsTab>
        <TabsTab value="groups" id="tab-groups" data-testid="tab-groups">
          Groups
        </TabsTab>
      </TabsList>
      <TabsPanel value="students" keepMounted data-testid="tabpanel-students">
        {students}
      </TabsPanel>
      <TabsPanel value="groups" keepMounted data-testid="tabpanel-groups">
        {groups}
      </TabsPanel>
    </Tabs>
  )
}
