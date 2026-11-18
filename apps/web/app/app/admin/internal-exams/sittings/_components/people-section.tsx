'use client'

import { useState } from 'react'
import { PaginationBar } from '@/app/app/_components/pagination-bar'
import { ListCard } from '@/components/admin/list-card'
import { Section } from '@/components/admin/section'
import { useSittingUi } from '../_hooks/sitting-ui-context'
import { personNeedsCode } from '../_utils/person-rollup'
import { plural } from '../_utils/plural'
import {
  ROSTER_PAGE_SIZE,
  type RosterRow,
  type ShowValue,
  type SittingStatus,
  type SittingSummary,
} from '../types'
import { AddPeopleButton } from './add-people-button'
import { IssueAllButton } from './issue-all-button'
import { RemovePeopleDialog } from './remove-people-dialog'
import { RosterSearch } from './roster-search'
import { RosterTable } from './roster-table'
import { ShowFilter } from './show-filter'
import { SittingBulkActions } from './sitting-bulk-actions'

type Props = {
  sittingId: string
  status: SittingStatus
  editable: boolean
  summary: SittingSummary
  rows: readonly RosterRow[]
  /** People matching the search and Show filter, all pages. */
  total: number
  q: string
  show: ShowValue
  page: number
}

/** Section header actions: Add people, and Issue all codes while some exam needs one. */
function PeopleActions({ issuable }: Readonly<{ issuable: number }>) {
  return (
    <>
      <AddPeopleButton />
      {issuable > 0 && <IssueAllButton count={issuable} />}
    </>
  )
}

function needsCodeIds(rows: readonly RosterRow[]) {
  return new Set(
    rows.filter((r) => personNeedsCode(r.entries) && !r.deactivated).map((r) => r.userId),
  )
}

/** The sitting's people as a related list: section header, toolbar or bulk bar, table, pagination. */
export function PeopleSection(p: Readonly<Props>) {
  const { rosterIds, selectAll } = useSittingUi()
  const [removeIds, setRemoveIds] = useState<readonly string[] | null>(null)
  const bulk = p.editable && (selectAll || rosterIds.length > 0)
  const tickable = p.rows.filter((r) => !r.hasAttempt)
  return (
    <Section
      title="People"
      count={p.summary.candidates}
      actions={p.editable && <PeopleActions issuable={p.summary.entriesIssuable} />}
    >
      <ListCard
        filters={
          <>
            <div className={bulk ? 'hidden' : 'contents'}>
              <RosterSearch value={p.q} />
              <ShowFilter value={p.show} q={p.q} />
            </div>
            {bulk && (
              <SittingBulkActions
                onRemove={setRemoveIds}
                pageIds={tickable.map((r) => r.userId)}
                needsCodeIds={needsCodeIds(tickable)}
                filtered={Boolean(p.q) || p.show !== 'all'}
                candidates={p.summary.candidates}
                shown={p.rows.length}
              />
            )}
          </>
        }
        summary={plural(p.total, 'person', 'people')}
        footer={
          p.total > ROSTER_PAGE_SIZE && (
            <PaginationBar
              page={p.page}
              pageSize={ROSTER_PAGE_SIZE}
              totalCount={p.total}
              entityLabel="people"
            />
          )
        }
      >
        <RosterTable
          key={p.page}
          sittingId={p.sittingId}
          sittingStatus={p.status}
          rows={p.rows}
          editable={p.editable}
          q={p.q}
          show={p.show}
          onRemove={setRemoveIds}
        />
      </ListCard>
      <RemovePeopleDialog
        sittingId={p.sittingId}
        userIds={removeIds}
        onClose={() => setRemoveIds(null)}
      />
    </Section>
  )
}
