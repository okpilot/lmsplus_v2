import type { InternalExamsSearchParams } from '../_search-params'
import { listInternalExamAttempts } from '../attempts-queries'
import { PAGE_SIZE } from '../pagination'
import { listExamSubjects, listInternalExamCodes } from '../queries'
import { SittingFormDialog } from '../sittings/_components/sitting-form-dialog'
import { SittingUiProvider } from '../sittings/_hooks/sitting-ui-context'
import { listInvigilatorOptions, listSittings } from '../sittings/queries'
import { listOrgStudents } from '../students-queries'
import { InternalExamsTabs } from './internal-exams-tabs'

const EMPTY = { rows: [], totalCount: 0 }

async function loadCodes({ status, codesPage }: Readonly<InternalExamsSearchParams>) {
  const [students, subjects, codes] = await Promise.all([
    listOrgStudents(),
    listExamSubjects(),
    listInternalExamCodes({ status, page: codesPage }),
  ])
  return { students, subjects, codes }
}

async function loadSittings({ scope, sittingsPage, dlg }: Readonly<InternalExamsSearchParams>) {
  const [list, invigilators] = await Promise.all([
    sittingsPage > 1 ? listSittings(scope, sittingsPage) : listSittings(scope),
    dlg === 'new' ? listInvigilatorOptions() : [],
  ])
  return { list, invigilators }
}

export async function InternalExamsContent(params: Readonly<InternalExamsSearchParams>) {
  const { tab, scope, sittingsPage, attemptsPage, dlg } = params
  const [codes, attempts, sittings] = await Promise.all([
    tab === 'codes' ? loadCodes(params) : { students: [], subjects: [], codes: EMPTY },
    tab === 'attempts' ? listInternalExamAttempts({ page: attemptsPage }) : EMPTY,
    tab === 'sittings' ? loadSittings(params) : null,
  ])
  return (
    <>
      <InternalExamsTabs
        students={codes.students}
        subjects={codes.subjects}
        status={params.status}
        codes={codes.codes.rows}
        codesTotalCount={codes.codes.totalCount}
        attempts={attempts.rows}
        attemptsTotalCount={attempts.totalCount}
        pageSize={PAGE_SIZE}
        sittings={
          sittings && {
            rows: sittings.list.rows,
            totalCount: sittings.list.totalCount,
            scope,
            page: sittingsPage,
          }
        }
      />
      {sittings && dlg === 'new' && (
        <SittingUiProvider>
          <SittingFormDialog mode="new" invigilators={sittings.invigilators} />
        </SittingUiProvider>
      )}
    </>
  )
}
