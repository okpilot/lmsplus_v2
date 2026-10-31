'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui/tabs'
import type {
  ExamSubjectOption,
  InternalExamAttemptRow,
  InternalExamCodeRow,
  ListCodesFilters,
  OrgStudentOption,
} from '../types'
import { AttemptsTable } from './attempts-table'
import { CodesTab } from './codes-tab'

type Props = {
  students: OrgStudentOption[]
  subjects: ExamSubjectOption[]
  status?: ListCodesFilters['status']
  codes: InternalExamCodeRow[]
  codesTotalCount: number
  attempts: InternalExamAttemptRow[]
  attemptsTotalCount: number
  pageSize: number
}

type TabKey = 'codes' | 'attempts'

function readTabParam(value: string | null): TabKey {
  return value === 'attempts' ? 'attempts' : 'codes'
}

export function InternalExamsTabs({
  students,
  subjects,
  status,
  codes,
  codesTotalCount,
  attempts,
  attemptsTotalCount,
  pageSize,
}: Readonly<Props>) {
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
        <TabsTab value="codes" id="tab-codes" data-testid="tab-codes">
          Codes
        </TabsTab>
        <TabsTab value="attempts" id="tab-attempts" data-testid="tab-attempts">
          Attempts
        </TabsTab>
      </TabsList>
      <TabsPanel value="codes" data-testid="tabpanel-codes">
        <CodesTab
          students={students}
          subjects={subjects}
          status={status}
          codes={codes}
          totalCount={codesTotalCount}
          pageSize={pageSize}
        />
      </TabsPanel>
      <TabsPanel value="attempts" data-testid="tabpanel-attempts">
        <AttemptsTable rows={attempts} totalCount={attemptsTotalCount} pageSize={pageSize} />
      </TabsPanel>
    </Tabs>
  )
}
