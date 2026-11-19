'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { useUpdateSearchParams } from '@/app/app/_hooks/use-update-search-params'
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui/tabs'
import { parseTab, readTabParam, type TabKey } from '../_search-params'
import { SittingsTab } from '../sittings/_components/sittings-tab'
import type { SittingRow, SittingScope } from '../sittings/types'
import type {
  AttemptFilterOptions,
  AttemptUrlFilters,
  InternalExamAttemptRow,
  InternalExamCodeRow,
  ListCodesFilters,
} from '../types'
import { AttemptsFilters } from './attempts-filters'
import { AttemptsTable } from './attempts-table'
import { CodesTable } from './codes-table'

const NO_FILTERS: AttemptUrlFilters = {}
const NO_OPTIONS: AttemptFilterOptions = { subjects: [], sittings: [], groups: [] }

type Props = {
  status?: ListCodesFilters['status']
  codes: InternalExamCodeRow[]
  codesTotalCount: number
  attempts: InternalExamAttemptRow[]
  attemptsTotalCount: number
  pageSize: number
  filters?: AttemptUrlFilters
  options?: AttemptFilterOptions
  sittings?: { rows: SittingRow[]; totalCount: number; scope: SittingScope; page: number } | null
}

export function InternalExamsTabs({
  status,
  codes,
  codesTotalCount,
  attempts,
  attemptsTotalCount,
  pageSize,
  filters = NO_FILTERS,
  options = NO_OPTIONS,
  sittings,
}: Readonly<Props>) {
  const update = useUpdateSearchParams()
  const sp = useSearchParams()
  const tab = readTabParam(sp)
  const search = sp.toString()
  // Tabs activate on focus and on click: one request per target until the URL changes.
  const pending = useRef<TabKey | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: any URL change ends the in-flight tab request
  useEffect(() => {
    pending.current = null
  }, [search])
  const select = (value: string | null) => {
    const to = parseTab(value)
    if (to === tab || pending.current === to) return
    pending.current = to
    update({ tab: to, page: null, dlg: null })
  }

  return (
    <Tabs value={tab} onValueChange={(v) => select(v as string)} className="space-y-section">
      <TabsList aria-label="Internal exam sections">
        <TabsTab value="sittings" id="tab-sittings" data-testid="tab-sittings">
          Sittings
        </TabsTab>
        <TabsTab value="codes" id="tab-codes" data-testid="tab-codes">
          Codes
        </TabsTab>
        <TabsTab value="attempts" id="tab-attempts" data-testid="tab-attempts">
          Attempts
        </TabsTab>
      </TabsList>
      <TabsPanel value="sittings" data-testid="tabpanel-sittings">
        {sittings && <SittingsTab {...sittings} />}
      </TabsPanel>
      <TabsPanel value="codes" data-testid="tabpanel-codes">
        <CodesTable rows={codes} status={status} totalCount={codesTotalCount} pageSize={pageSize} />
      </TabsPanel>
      <TabsPanel value="attempts" data-testid="tabpanel-attempts">
        <div className="space-y-stack">
          <AttemptsFilters filters={filters} options={options} />
          <AttemptsTable rows={attempts} totalCount={attemptsTotalCount} pageSize={pageSize} />
        </div>
      </TabsPanel>
    </Tabs>
  )
}
