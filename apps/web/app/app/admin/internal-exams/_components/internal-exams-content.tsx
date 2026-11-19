import type { InternalExamsSearchParams } from '../_search-params'
import { getAttemptFilterOptions } from '../attempt-filter-options'
import { listInternalExamAttempts } from '../attempts-queries'
import { PAGE_SIZE } from '../pagination'
import { listInternalExamCodes } from '../queries'
import { SittingNewDialog } from '../sittings/_components/sitting-new-dialog'
import { listInvigilatorOptions, listSittings } from '../sittings/queries'
import { InternalExamsTabs } from './internal-exams-tabs'

const EMPTY = { rows: [], totalCount: 0 }

async function loadSittings({ scope, sittingsPage, dlg }: Readonly<InternalExamsSearchParams>) {
  const [list, invigilators] = await Promise.all([
    listSittings(scope, sittingsPage),
    dlg === 'new' ? listInvigilatorOptions() : [],
  ])
  return { list, invigilators }
}

export async function InternalExamsContent(params: Readonly<InternalExamsSearchParams>) {
  const { tab, scope, sittingsPage, attemptsPage, dlg } = params
  const [codes, attempts, options, sittings] = await Promise.all([
    tab === 'codes'
      ? listInternalExamCodes({ status: params.status, page: params.codesPage })
      : EMPTY,
    tab === 'attempts'
      ? listInternalExamAttempts({
          page: attemptsPage,
          search: params.q,
          subjectId: params.subject,
          sittingId: params.sitting,
          groupId: params.group,
        })
      : EMPTY,
    tab === 'attempts' ? getAttemptFilterOptions() : undefined,
    tab === 'sittings' ? loadSittings(params) : null,
  ])
  return (
    <>
      <InternalExamsTabs
        status={params.status}
        codes={codes.rows}
        codesTotalCount={codes.totalCount}
        attempts={attempts.rows}
        attemptsTotalCount={attempts.totalCount}
        pageSize={PAGE_SIZE}
        filters={{
          q: params.q,
          subject: params.subject,
          sitting: params.sitting,
          group: params.group,
        }}
        options={options}
        sittings={
          sittings && {
            rows: sittings.list.rows,
            totalCount: sittings.list.totalCount,
            scope,
            page: sittingsPage,
          }
        }
      />
      {sittings && dlg === 'new' && <SittingNewDialog invigilators={sittings.invigilators} />}
    </>
  )
}
