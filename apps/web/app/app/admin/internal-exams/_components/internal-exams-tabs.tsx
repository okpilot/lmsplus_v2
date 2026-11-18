'use client'

import { useSearchParams } from 'next/navigation'
import { useRef } from 'react'
import { useUpdateSearchParams } from '@/app/app/_hooks/use-update-search-params'
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui/tabs'
import type { TabKey } from '../_search-params'
import { SittingsTab } from '../sittings/_components/sittings-tab'
import type { SittingRow, SittingScope } from '../sittings/types'
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
  sittings?: { rows: SittingRow[]; totalCount: number; scope: SittingScope; page: number } | null
}

function readTabParam(value: string | null): TabKey {
  return value === 'attempts' || value === 'sittings' ? value : 'codes'
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
  sittings,
}: Readonly<Props>) {
  const update = useUpdateSearchParams()
  const tab = readTabParam(useSearchParams().get('tab'))
  // Tabs activate on focus and on click: one request per (current, next) pair.
  const requested = useRef<{ from: TabKey; to: TabKey } | null>(null)
  const select = (value: string | null) => {
    const to = readTabParam(value)
    if (requested.current?.from === tab && requested.current.to === to) return
    requested.current = { from: tab, to }
    update({ tab: to, page: null, dlg: null })
  }

  return (
    <Tabs value={tab} onValueChange={(v) => select(v as string)} className="space-y-section">
      <TabsList aria-label="Internal exam sections">
        <TabsTab value="codes" id="tab-codes" data-testid="tab-codes">
          Codes
        </TabsTab>
        <TabsTab value="attempts" id="tab-attempts" data-testid="tab-attempts">
          Attempts
        </TabsTab>
        <TabsTab value="sittings" id="tab-sittings" data-testid="tab-sittings">
          Sittings
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
      <TabsPanel value="sittings" data-testid="tabpanel-sittings">
        {sittings && <SittingsTab {...sittings} />}
      </TabsPanel>
    </Tabs>
  )
}
