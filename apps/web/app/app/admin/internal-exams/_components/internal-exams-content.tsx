import { listInternalExamAttempts } from '../attempts-queries'
import { PAGE_SIZE } from '../pagination'
import { listExamSubjects, listInternalExamCodes } from '../queries'
import { listOrgStudents } from '../students-queries'
import type { ListCodesFilters } from '../types'
import { InternalExamsTabs } from './internal-exams-tabs'

type Props = {
  status?: ListCodesFilters['status']
  codesPage: number
  attemptsPage: number
}

export async function InternalExamsContent({ status, codesPage, attemptsPage }: Readonly<Props>) {
  const [students, subjects, codesResult, attemptsResult] = await Promise.all([
    listOrgStudents(),
    listExamSubjects(),
    listInternalExamCodes({ status, page: codesPage }),
    listInternalExamAttempts({ page: attemptsPage }),
  ])

  return (
    <InternalExamsTabs
      students={students}
      subjects={subjects}
      status={status}
      codes={codesResult.rows}
      codesTotalCount={codesResult.totalCount}
      attempts={attemptsResult.rows}
      attemptsTotalCount={attemptsResult.totalCount}
      pageSize={PAGE_SIZE}
    />
  )
}
